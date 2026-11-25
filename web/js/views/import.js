import { h, clear, num, download } from '../util.js?v=202611251222';
import { openWorkbook, zipLib } from '../xlsx.js?v=202611251222';
import { buildXlsx, moduleSheet } from '../xlsxwrite.js?v=202611251222';
import { modByKey } from '../state.js?v=202611251222';
import { toast } from '../util.js?v=202611251222';
import { detectModules, parseSheet, validate, withHashes } from '../engine.js?v=202611251222';
import { S, invalidate } from '../state.js?v=202611251222';
import { db } from '../db.js?v=202611251222';
import { sha256 } from '../util.js?v=202611251222';

const SEV = { error: 'err', warning: 'warn', info: 'info' };
// Excel import: drop any number of audit workbooks; every recognised sheet becomes a reviewable card.
export function importPanel(onlyKey) {
  const root = h('div', {}); const results = h('div', {}); const status = h('div', { class: 'muted mt' });
  const input = h('input', { type: 'file', accept: '.xlsx,.xlsm', multiple: true, hidden: true });
  const drop = h('div', { class: 'drop', tabindex: 0, role: 'button', onclick: () => input.click(), onkeydown: e => e.key === 'Enter' && input.click() },
    h('b', {}, 'Drop Excel files here, or click to choose'), h('div', { class: 'muted' }, onlyKey ? 'Sheets for this form are picked out automatically.' : 'All audit files at once: each sheet is recognised and routed to its form automatically.'),
    h('div', { class: 'muted' }, 'Files are read in your browser. Nothing is uploaded until you press “Import”. Re-importing the same data is safe: duplicates are skipped.'));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); handle([...e.dataTransfer.files]); });
  input.onchange = () => handle([...input.files]);
  async function handle(files) {
    files = files.filter(f => /\.xlsx?m?$/i.test(f.name)); if (!files.length) return toast('Only .xlsx files are supported. Save .xls files as .xlsx first.');
    for (const f of files) {
      status.textContent = `Reading ${f.name}…`;
      try {
        const buf = await f.arrayBuffer(); const sha = await sha256Buf(buf); const wb = await openWorkbook(buf);
        let det = await detectModules(wb, S.reg); if (onlyKey) det = det.filter(d => d.m.key === onlyKey);
        if (!det.length) { results.prepend(h('div', { class: 'imp' }, h('h3', {}, f.name), h('div', { class: 'muted' }, 'No recognised audit sheets' + (onlyKey ? ' for this form.' : '. Check the sheet names/headers match the standard audit files.')))); continue; }
        const cards = [];
        for (const { m, spec } of det) { const c = await card(f.name, sha, wb, m, spec); cards.push(c); results.prepend(c); }
        if (cards.length > 1) {   // one workbook, several sheets: offer a single button so no sheet is missed
          const all = h('button', { class: 'btn' }, `Import all ${cards.length} sheets from ${f.name}`);
          const note = h('span', { class: 'muted' }, 'Each sheet is also listed below with its own button.');
          const finished = b => new Promise(r => { const t = setInterval(() => { if (!/Importing/.test(b.textContent)) { clearInterval(t); r(); } }, 150); });
          all.onclick = async () => {
            all.disabled = true; all.textContent = 'Importing…';
            for (const c of cards) { const b = c.querySelector('button.btn'); if (b && !b.disabled && /^Import \d/.test(b.textContent)) { b.click(); await finished(b); } }
            const left = cards.filter(c => { const b = c.querySelector('button.btn'); return b && /^(Import \d|Retry)/.test(b.textContent); }).length;
            all.textContent = left ? `${left} sheet(s) need attention, see below` : 'All sheets imported ✓'; all.disabled = !!left ? false : true;
          };
          results.prepend(h('div', { class: 'imp row' }, all, note));
        }
      } catch (e) { console.error(e); results.prepend(h('div', { class: 'imp' }, h('h3', {}, f.name), h('div', { class: 'err-msg' }, 'Could not read this file: ' + e.message))); }
    }
    status.textContent = '';
  }
  const toast = m => status.textContent = m;
  root.append(drop, input, status, results); return root;
}
async function sha256Buf(buf) { const d = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }

async function card(fname, sha, wb, m, spec) {
  const rows = await wb.rows(spec.sheet); const parsed = parseSheet(m, spec, rows); const v = validate(m, spec, parsed);
  const body = h('div', {}); const btn = h('button', { class: 'btn', disabled: !v.valid.length }, `Import ${v.valid.length.toLocaleString()} rows`);
  const wrap = h('div', { class: 'imp' });
  const cols = m.fields.filter(f => !f.derived && !f.virtual && f.type !== 'stages').slice(0, 7);
  wrap.append(h('div', { class: 'row' }, h('h3', {}, m.label), h('span', { class: 'pill' }, `${fname} › ${spec.sheet}`), h('span', { class: 'sp' }),
    h('span', { class: 'pill ok' }, `${v.valid.length.toLocaleString()} valid`), v.rejected ? h('span', { class: 'pill err' }, `${v.rejected} rejected`) : null, v.pending ? h('span', { class: 'pill info' }, `${v.pending} incomplete (skipped)`) : null),
    h('ul', { class: 'issues' }, v.issues.map(i => h('li', {}, h('span', { class: 'pill ' + SEV[i.severity] }, i.severity), ' ', i.message))),
    v.valid.length ? h('details', {}, h('summary', { class: 'muted' }, 'Preview first rows'), h('div', { class: 'tw' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, cols.map(f => h('th', {}, f.label)))), h('tbody', {}, v.valid.slice(0, 8).map(r => h('tr', {}, cols.map(f => h('td', {}, r.row[f.name] ?? '')))))))) : null,
    h('div', { class: 'row mt' }, btn, h('span', { class: 'muted' }, 'Safe to re-run: rows already stored are skipped.')), body);
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = 'Importing…';
    try {
      const recs = await withHashes(m, v.valid); const r = await db.insert(m.key, recs, { merge: !!m.natural });
      const rejected = v.rejected;
      const fresh = await db.recordBatch({ module: m.key, filename: `${fname} › ${spec.sheet}`.slice(0, 200), file_sha256: sha + ':' + spec.sheet, rows_read: v.read, rows_loaded: r.inserted, rows_rejected: rejected, issues: v.issues.map(i => ({ s: i.severity, m: i.message })) });
      await db.audit('import', m.key, sha.slice(0, 12), { rows: r.inserted, skipped: r.skipped, file: fname });
      invalidate(m.key);
      btn.textContent = 'Imported ✓'; body.replaceChildren(h('div', { class: 'note' }, `${r.inserted.toLocaleString()} new rows stored${r.updated ? ` · ${r.updated.toLocaleString()} existing rows updated` : ''} · ${r.skipped.toLocaleString()} already present and skipped${fresh ? '' : ' · this exact file was imported before'}.`));
    } catch (e) { btn.disabled = false; btn.textContent = 'Retry import'; body.replaceChildren(h('div', { class: 'err-msg' }, 'Import failed: ' + e.message)); }
  };
  return wrap;
}
export async function batchesPanel() {
  const b = await db.batches();
  return h('div', { class: 'tw' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['When', 'Form', 'File', 'Read', 'Loaded', 'Rejected', 'Export'].map(x => h('th', {}, x)))),
    h('tbody', {}, b.length ? b.slice(0, 40).map(x => h('tr', {}, h('td', {}, (x.created_at || '').slice(0, 16).replace('T', ' ')), h('td', {}, x.module), h('td', {}, x.filename), h('td', { class: 'num' }, x.rows_read), h('td', { class: 'num' }, x.rows_loaded), h('td', { class: 'num' }, x.rows_rejected), h('td', {}, exportBatchBtn(x)))) : [h('tr', {}, h('td', { colspan: 7, class: 'empty' }, 'No imports yet'))])));
}

// Export the rows that one imported file loaded, in the Victory Farms template style.
function exportBatchBtn(x) {
  const m = modByKey(x.module); if (!m) return '';
  const b = h('button', { class: 'btn sec sm', type: 'button', onclick: async () => {
    b.disabled = true; const old = b.textContent; b.textContent = '…';
    try {
      const rows = (await db.load(m.key)).filter(r => r.batch_id === x.id);
      if (!rows.length) { toast('No stored rows for this import (nothing was loaded, or the data was removed)', true); return; }
      const logo = await fetch('assets/vf-icon.png').then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);
      download(`${String(x.filename || m.key).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, '_')}_${m.key}.xlsx`, await buildXlsx(await zipLib(), [moduleSheet(m, rows)], logo));
    } catch (e) { toast('Export failed: ' + e.message, true); } finally { b.disabled = false; b.textContent = old; }
  } }, 'Export');
  return b;
}
