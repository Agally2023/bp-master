// Folder sync: the person picks the OneDrive-synced SharePoint folder once. Sync then reads every Excel workbook in it (sub-folders included),
// recognises each sheet by the markers in the module registry (sheet name + header row, the same detection as Data entry > Import) and loads the
// new rows with the app's own importer. A workbook is only re-read when its content changed; re-importing is safe because stored rows are skipped.
import { openWorkbook } from './xlsx.js?v=202611260532';
import { detectModules, parseSheet, validate, withHashes } from './engine.js?v=202611260532';
import { S, invalidate } from './state.js?v=202611260532';
import { db } from './db.js?v=202611260532';

export const supported = () => typeof window.showDirectoryPicker === 'function';
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('bpm-folder-sync', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function kv(mode, key, val) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('kv', mode === 'get' ? 'readonly' : 'readwrite'), s = t.objectStore('kv'); const q = mode === 'get' ? s.get(key) : s.put(val, key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
const sha = async buf => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('');

export async function folderName() { try { return (await kv('get', 'dir'))?.name || null; } catch { return null; } }
export async function chooseFolder() {
  const dir = await window.showDirectoryPicker({ id: 'bpm-qc', mode: 'read' });
  await kv('put', 'dir', dir); await kv('put', 'seen', {}); return dir;
}
// 'granted' needs no click (the browser remembered it); 'prompt' needs a click (a user gesture) to ask again.
export async function permission(ask) {
  const dir = await kv('get', 'dir').catch(() => null); if (!dir) return 'none';
  let p = await dir.queryPermission({ mode: 'read' }); if (p !== 'granted' && ask) p = await dir.requestPermission({ mode: 'read' });
  return p;
}
async function* walk(dir, depth = 0) {
  for await (const [name, h] of dir.entries()) {
    if (name.startsWith('~$') || name.startsWith('.')) continue;
    if (h.kind === 'directory') { if (depth < 3) yield* walk(h, depth + 1); }
    else if (/\.xlsx?m?$/i.test(name) && /\.xls[xm]$/i.test(name)) yield { name, h };
  }
}

// Reads one workbook: every sheet recognised by the registry markers is validated and its new rows stored (shared by the folder and SharePoint syncs).
export async function ingest(name, buf, hash, out, onProgress = () => { }) {
  const wb = await openWorkbook(buf), det = await detectModules(wb, S.reg);
  for (const { m, spec } of det) {
    onProgress(`${name} › ${spec.sheet}…`);
    const parsed = parseSheet(m, spec, await wb.rows(spec.sheet)), v = validate(m, spec, parsed);
    if (!v.valid.length) continue;
    const recs = await withHashes(m, v.valid), r = await db.insert(m.key, recs, { merge: !!m.natural });
    await db.recordBatch({ module: m.key, filename: `${name} › ${spec.sheet}`.slice(0, 200), file_sha256: hash + ':' + spec.sheet, rows_read: v.read, rows_loaded: r.inserted, rows_rejected: v.rejected, issues: v.issues.map(i => ({ s: i.severity, m: i.message })) });
    invalidate(m.key); out.imported.push({ module: m.label, rows: r.inserted, updated: r.updated || 0, file: name });
  }
}
export const sha256Hex = sha;

// Returns { files, imported:[{module,rows,file}], problems:[], skipped }
export async function syncFolder(onProgress = () => { }) {
  const dir = await kv('get', 'dir'); if (!dir) throw new Error('No folder chosen yet');
  if ((await dir.queryPermission({ mode: 'read' })) !== 'granted') throw new Error('Permission to read the folder expired: press Sync and allow access');
  const seen = (await kv('get', 'seen')) || {}; const out = { files: 0, imported: [], problems: [], unchanged: 0 };
  for await (const { name, h } of walk(dir)) {
    const f = await h.getFile(); if (f.size > 60e6) { out.problems.push(`${name}: over 60 MB, import it from Data entry`); continue; }
    if (Date.now() - f.lastModified < 15000) continue;                  // still being saved: next round
    const sig = f.size + ':' + f.lastModified; if (seen[name]?.sig === sig && !S.syncForce) { out.unchanged++; continue; }
    out.files++; onProgress(`Reading ${name}…`);
    try {
      const buf = await f.arrayBuffer(), hash = await sha(buf);
      if (seen[name]?.hash === hash) { seen[name] = { sig, hash }; out.unchanged++; continue; }   // touched but identical
      await ingest(name, buf, hash, out, onProgress);
      await db.audit('sync', 'folder', hash.slice(0, 12), { file: name });
      seen[name] = { sig, hash };
    } catch (e) { out.problems.push(`${name}: ${e.message}`); }
  }
  await kv('put', 'seen', seen); return out;
}
