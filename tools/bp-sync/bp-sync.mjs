#!/usr/bin/env node
/* BP Master local folder sync: no Microsoft account or Azure app needed.
 * Watches the folders where your OneDrive / SharePoint client keeps the audit workbooks (or any folder), and imports every new or changed .xlsx with the SAME code as
 * the "Import from Excel" page (sheet detection, validation, de-duplication, import log), signed in as a normal BP Master user.
 *   node tools/bp-sync/bp-sync.mjs            watch (checks every `intervalSeconds`)
 *   node tools/bp-sync/bp-sync.mjs --once     one pass, then exit (for Task Scheduler / cron)
 *   node tools/bp-sync/bp-sync.mjs --dry-run  show what would be imported, write nothing
 * Config: bp-sync.config.json next to this file (see bp-sync.config.example.json). Password: config "password" or env BPM_PASSWORD. */
import fs from 'fs'; import path from 'path'; import crypto from 'crypto'; import { fileURLToPath, pathToFileURL } from 'url'; import { createRequire } from 'module';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '..', '..'), web = path.join(root, 'web');
const args = new Set(process.argv.slice(2)), once = args.has('--once'), dry = args.has('--dry-run'), demo = process.env.BPM_DEMO === '1';
const cfgPath = process.env.BPM_SYNC_CONFIG || path.join(here, 'bp-sync.config.json');
if (!fs.existsSync(cfgPath)) { console.error(`Missing ${cfgPath}. Copy bp-sync.config.example.json to bp-sync.config.json and fill it in.`); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); const folders = (cfg.folders || []).map(f => path.resolve(f)); const interval = Math.max(15, cfg.intervalSeconds || 120);
const statePath = path.join(here, '.bp-sync-state.json'); let state = {}; try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { }
const log = (...a) => console.log(new Date().toISOString().replace('T', ' ').slice(0, 19), ...a);

// ---- run the web app's own modules in Node
const site = {}; new Function('window', fs.readFileSync(path.join(web, 'config.js'), 'utf8'))({ set BPM_CONFIG(v) { Object.assign(site, v); } });   // the app's own public config
if (demo) site.SUPABASE_URL = '';
const mem = {}; globalThis.window = { BPM_CONFIG: site }; globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } }; globalThis.sessionStorage = globalThis.localStorage;
globalThis.document = { createElement: () => ({}), head: {}, addEventListener() { } }; globalThis.JSZip = createRequire(import.meta.url)(path.join(web, 'vendor', 'jszip.min.js'));
const imp = p => import(pathToFileURL(path.join(web, 'js', p)).href);
const { db } = await imp('db.js'); const { openWorkbook } = await imp('xlsx.js'); const E = await imp('engine.js');
const reg = JSON.parse(fs.readFileSync(path.join(web, 'modules.json'), 'utf8'));

async function login() {
  const email = cfg.email, password = process.env.BPM_PASSWORD || cfg.password;
  if (!demo && (!email || !password)) { console.error('Set "email" and "password" (or env BPM_PASSWORD) for the BP Master user the sync signs in as. Use an auditor/admin account.'); process.exit(2); }
  const r = await db.signIn(email || 'sync@local', password); if (r?.mfa) { console.error('This account asks for a two-step code. The sync needs an account without it (two-step verification is off for the app at the moment).'); process.exit(2); }
  const role = db.user?.role; if (!['admin', 'auditor'].includes(role)) { console.error(`Signed in as ${email} with role "${role}". The sync needs an admin or auditor account (can write data).`); process.exit(2); }
  log(`Signed in as ${email} (${role}).`);
}
function* walk(dir) { let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { log('Cannot read folder', dir, e.message); return; } for (const e of ents) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/^(\.|node_modules$)/.test(e.name)) yield* walk(p); } else if (/\.xlsx$/i.test(e.name) && !e.name.startsWith('~$')) yield p; } }

async function syncFile(file) {
  const st = fs.statSync(file); if (Date.now() - st.mtimeMs < 15000) return 'busy';          // still being written / synced
  const buf = fs.readFileSync(file), sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (state[file] === sha) return 'unchanged';
  let wb; try { wb = await openWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); } catch (e) { log(`SKIP ${path.basename(file)}: cannot be read (${e.message}). Encrypted by a sensitivity label, or open in Excel? Save an unlabelled copy.`); return 'unreadable'; }
  const det = await E.detectModules(wb, reg); const name = path.basename(file);
  if (!det.length) { log(`-    ${name}: no recognised audit sheets`); state[file] = sha; return 'none'; }
  let failed = false;
  for (const { m, spec } of det) {
    try {
      const v = E.validate(m, spec, E.parseSheet(m, spec, await wb.rows(spec.sheet)));
      if (dry) { log(`DRY  ${name} › ${spec.sheet} → ${m.label}: ${v.valid.length} valid, ${v.rejected} rejected`); continue; }
      const recs = await E.withHashes(m, v.valid), r = v.valid.length ? await db.insert(m.key, recs, { merge: !!m.natural }) : { inserted: 0, skipped: 0 };
      await db.recordBatch({ module: m.key, filename: `${name} › ${spec.sheet}`.slice(0, 200), file_sha256: sha + ':' + spec.sheet, rows_read: v.read, rows_loaded: r.inserted, rows_rejected: v.rejected, issues: v.issues.map(i => ({ s: i.severity, m: i.message })) });
      await db.audit('import', m.key, sha.slice(0, 12), { rows: r.inserted, skipped: r.skipped, file: name, via: 'bp-sync' });
      log(`OK   ${name} › ${spec.sheet} → ${m.label}: ${r.inserted} new, ${r.skipped} already present${v.rejected ? `, ${v.rejected} rejected` : ''}`);
    } catch (e) { failed = true; log(`FAIL ${name} › ${spec.sheet} → ${m.label}: ${e.message}`); }
  }
  if (!failed && !dry) state[file] = sha; return failed ? 'failed' : 'done';
}
async function pass() {
  let n = 0; for (const dir of folders) for (const f of walk(dir)) { try { const r = await syncFile(f); if (r === 'done') n++; } catch (e) { log('ERROR', f, e.message); } }
  if (!dry) fs.writeFileSync(statePath, JSON.stringify(state, null, 1)); return n;
}
if (!folders.length) { console.error('No "folders" in the config.'); process.exit(2); }
await login(); log(`Watching ${folders.length} folder(s)${dry ? ' (dry run)' : ''}${once ? '' : `, every ${interval}s. Ctrl+C to stop`}.`);
for (;;) { const n = await pass(); if (once || dry) { log(`Done: ${n} file(s) imported.`); break; } await new Promise(r => setTimeout(r, interval * 1000)); }
