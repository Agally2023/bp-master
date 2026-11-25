#!/usr/bin/env node
// BP Master folder watcher (Node.js 18+, no packages needed).
// Watches a folder that OneDrive/SharePoint keeps in sync on this PC. When a Quality Control workbook is new or changed, it is sent to the
// Supabase function `qc-sync` (push mode), which loads the new rows. Safe to re-send: rows are de-duplicated by row_hash.
//   node sync.mjs           run forever (checks every POLL_SECONDS)
//   node sync.mjs --once    check once and exit (for Task Scheduler / cron)
//   node sync.mjs --force   re-send every matching file, even if unchanged
import { readFileSync, existsSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// tiny .env reader (KEY=value per line), so nothing has to be installed
const envFile = join(HERE, '.env');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split(/\r?\n/)) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }

const { SUPABASE_URL, SYNC_KEY, WATCH_DIR } = process.env;
const POLL = Math.max(15, Number(process.env.POLL_SECONDS) || 60);
const once = process.argv.includes('--once'), force = process.argv.includes('--force');
for (const [k, v] of Object.entries({ SUPABASE_URL, SYNC_KEY, WATCH_DIR })) if (!v) { console.error(`Missing ${k}. Copy .env.example to .env and fill it in.`); process.exit(1); }
if (!existsSync(WATCH_DIR)) { console.error('WATCH_DIR not found: ' + WATCH_DIR); process.exit(1); }

// workbook file name -> BP Master sources it feeds (matches bpm_sync_sources.file_name; spaces and underscores are treated the same)
const norm = s => s.toLowerCase().replace(/[\s_]+/g, ' ').trim();
const SOURCES = new Map(Object.entries({
  'VF 3-Day pond Survival.xlsx': ['day3_recounts'],
  'VF Egg Collection Monitoring Data.xlsx': ['egg_volumetric_jars', 'egg_separation_ratings'],
}).map(([f, k]) => [norm(f), k]));

const STATE = join(HERE, '.sync-state.json');
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const log = (...a) => console.log(new Date().toISOString().replace('T', ' ').slice(0, 19), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function listFiles(dir, depth = 0) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('~$') || e.name.startsWith('.')) continue;            // Excel lock files
    const p = join(dir, e.name);
    if (e.isDirectory() && depth < 3) out.push(...listFiles(p, depth + 1));
    else if (e.isFile() && SOURCES.has(norm(e.name))) out.push(p);
  }
  return out;
}

async function push(file) {
  const a = statSync(file); await sleep(3000); const b = statSync(file);          // still being written (OneDrive download / Excel save)? try again next round
  if (a.size !== b.size || a.mtimeMs !== b.mtimeMs) { log('busy, will retry:', basename(file)); return; }
  const buf = readFileSync(file), hash = createHash('sha256').update(buf).digest('hex');
  if (!force && state[file]?.hash === hash) return;
  for (const key of SOURCES.get(norm(basename(file)))) {
    const r = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/qc-sync?push=1&source=${key}`, {
      method: 'POST', headers: { 'x-sync-key': SYNC_KEY, 'x-modified': new Date(b.mtimeMs).toISOString(), 'Content-Type': 'application/octet-stream' }, body: buf });
    const j = await r.json().catch(() => ({}));
    const res = j.results?.[0];
    if (!r.ok || res?.status === 'error') throw new Error(`${key}: ${res?.message || j.error || r.status}`);
    log(`${basename(file)} -> ${key}: ${res.message}`);
  }
  state[file] = { hash, at: new Date().toISOString() }; writeFileSync(STATE, JSON.stringify(state, null, 2));
}

async function round() {
  for (const f of listFiles(WATCH_DIR)) { try { await push(f); } catch (e) { log('ERROR', basename(f), e.message); } }
}

log(`Watching ${WATCH_DIR} for: ${[...SOURCES.keys()].join(', ')}`);
await round();
if (!once) for (;;) { await sleep(POLL * 1000); await round(); }
