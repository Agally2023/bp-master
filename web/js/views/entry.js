import { h, clear, todayIso, fmtDate, toast, num } from '../util.js';
import { S, ensure, invalidate, modByKey } from '../state.js';
import { db } from '../db.js';
import { coerce, normalizeRow, derive, withHashes, storedFields } from '../engine.js';
import { importPanel, batchesPanel } from './import.js';
import { table } from './common.js';
import { zipLib } from '../xlsx.js';
import { buildXlsx, moduleSheet } from '../xlsxwrite.js';
import { download } from '../util.js';

const GROUPS = ['Incubation', 'Eggs', 'Fry', 'Nursery', 'Broodstock'];
let current = 'ALL', tab = 'form';

export async function render({ view }) {
  const side = h('div', { class: 'modlist', 'aria-label': 'Forms' }), main = h('div', {});
  view.append(h('div', { class: 'split' }, side, main));
  const open = (k, t) => { current = k; tab = t || (k === 'ALL' ? 'import' : tab === 'import' ? 'import' : 'form'); drawSide(); drawMain(); };
  function drawSide() {
    clear(side);
    side.append(h('button', { 'aria-current': current === 'ALL', onclick: () => open('ALL', 'import') }, h('span', {}, '⬆ Import all Excel files')));
    for (const g of GROUPS) {
      const ms = S.reg.modules.filter(m => m.group === g); if (!ms.length) continue;
      side.append(h('h4', {}, g)); for (const m of ms) side.append(h('button', { 'aria-current': current === m.key, onclick: () => open(m.key) }, h('span', {}, m.label)));
    }
  }
  async function drawMain() {
    clear(main);
    if (current === 'ALL') { main.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0;flex:1' }, 'Import from Excel: all audit files'), exportBtn(S.reg.modules, 'BP_Master_all_data', 'Export all data to Excel')), importPanel(null)), h('div', { class: 'card mt' }, h('h2', {}, 'Recent imports'), await batchesPanel())); return; }
    const m = modByKey(current);
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, [['form', 'Form'], ['records', 'Records'], ['import', 'Import from Excel']].map(([k, l]) => h('button', { role: 'tab', 'aria-selected': tab === k, onclick: () => { tab = k; drawMain(); } }, l)));
    const pane = h('div', {}); main.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0;flex:1' }, m.label), exportBtn([m], m.label, 'Export to Excel')), tabs, pane));
    if (tab === 'form') { pane.append(formFor(m, () => { })); if (m.special === 'flip') pane.append(pondPhotos()); } else if (tab === 'import') pane.append(importPanel(m.key)); else pane.append(await records(m));
  }
  drawSide(); drawMain();
}

async function records(m) {
  let rows, total;
  try { ({ rows, total } = await db.recent(m.key, m.dateField, 100)); }   // only the latest 100 rows, not the whole table
  catch { await ensure([m.key]); const all = S.data[m.key] || []; total = all.length; rows = all.slice().sort((a, b) => String(b[m.dateField] || '').localeCompare(String(a[m.dateField] || ''))).slice(0, 100); }
  const cols = m.fields.filter(f => !f.virtual && f.type !== 'stages').slice(0, 9);
  return h('div', {}, h('div', { class: 'row' }, h('span', { class: 'muted' }, `${total.toLocaleString()} records stored · showing latest ${rows.length}`), exportBtn([m], m.label, 'Export all to Excel')),
    table(cols.map(f => f.label), rows.map(r => cols.map(f => { const v = r[f.name]; return v == null ? '' : typeof v === 'number' ? num(v, 3) : String(v); })), { empty: 'No records yet. Use the form or import an Excel file.' }));
}

function inputFor(m, f) {
  const common = { name: f.name, required: !!f.req, 'aria-label': f.label };
  if (f.type === 'select' && f.options) return h('select', common, h('option', { value: '' }, '—'), f.options.map(o => h('option', {}, o)));
  if (f.type === 'bool') return h('select', common, h('option', { value: '' }, '—'), h('option', { value: 'true' }, 'Yes'), h('option', { value: 'false' }, 'No'));
  if (f.type === 'date') return h('input', { ...common, type: 'date', max: todayIso(), min: m.minDate });
  if (f.type === 'int' || f.type === 'num') return h('input', { ...common, type: 'number', step: f.type === 'int' ? '1' : 'any', min: f.min, max: f.max, inputmode: 'decimal' });
  return h('input', { ...common, type: 'text', maxlength: 300, autocomplete: 'off' });
}

function formFor(m, saved) {
  const form = h('form', { class: 'form', novalidate: true }); const derivedBox = h('div', { class: 'derived wide' }); const msg = h('div', { class: 'wide' });
  const fields = m.fields.filter(f => !f.derived || f.virtual);
  let stageInputs = {};
  for (const f of fields) {
    if (f.type === 'stages') continue;
    form.append(h('label', { class: 'f' + (f.name === 'comment' || f.name === 'comments' ? ' wide' : '') }, h('span', {}, f.label, f.req ? h('span', { class: 'req' }, ' *') : null), inputFor(m, f)));
  }
  if (m.special === 'flip') {
    const kindSel = form.querySelector('[name=kind]'); const grid = h('div', { class: 'form wide' });
    const paint = () => {
      clear(grid); stageInputs = {}; const list = m.stages[kindSel.value === 'broodstock' ? 'broodstock' : 'nursery'] || [];
      for (const s of list) { const i = h('input', { type: 'number', min: 0, step: 1, 'aria-label': s.name }); stageInputs[s.name] = i; grid.append(h('label', { class: 'f' }, `${s.name} (days)`, h('span', { class: 'hint' }, `expected ${s.expected}`), i)); }
    };
    kindSel.onchange = paint; kindSel.value = 'nursery'; paint(); form.append(h('div', { class: 'wide' }, h('h3', {}, 'Days taken per stage')), grid);
  }
  const read = () => { const raw = {}; for (const f of fields) { if (f.type === 'stages') continue; const el = form.elements[f.name]; raw[f.name] = el ? el.value : ''; } return raw; };
  const build = () => {
    const raw = read(), row = {};
    for (const f of fields) { if (f.type === 'stages') continue; const v = raw[f.name]; row[f.name] = f.type === 'bool' ? (v === '' ? null : v === 'true') : coerce(f, v); }
    if (m.special === 'flip') { row.stage_days = {}; for (const [k, i] of Object.entries(stageInputs)) if (i.value !== '') row.stage_days[k] = Number(i.value); }
    normalizeRow(m, row); derive(m, row); return row;
  };
  const showDerived = () => {
    const row = build(), d = m.fields.filter(f => f.derived && !['iso_year', 'iso_week'].includes(f.name) && row[f.name] != null);
    clear(derivedBox); derivedBox.append(h('span', { class: 'muted' }, 'Calculated automatically: '), ...(d.length ? d.map(f => h('span', {}, h('b', {}, f.label + ' '), typeof row[f.name] === 'number' ? (Number.isInteger(row[f.name]) ? String(row[f.name]) : num(row[f.name], 4)) : String(row[f.name]), '   ')) : [h('span', { class: 'muted' }, '—')]), ...(row.iso_week ? [h('span', { class: 'muted' }, ` · Week ${row.iso_week}, ${row.iso_year}`)] : []));
  };
  form.addEventListener('input', showDerived);
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Save record'); const clr = h('button', { class: 'btn sec', type: 'button', onclick: () => { form.reset(); showDerived(); msg.replaceChildren(); } }, 'Clear');
  form.append(derivedBox, msg, h('div', { class: 'row wide' }, btn, clr));
  form.addEventListener('submit', async e => {
    e.preventDefault(); msg.replaceChildren(); const row = build(), probs = [], t = todayIso();
    for (const f of fields) { if (f.type === 'stages') continue; const v = row[f.name]; if (f.req && (v == null || v === '')) probs.push(`${f.label} is required.`); if (f.type === 'date' && v && v > t) probs.push(`${f.label} is in the future.`); if (v != null && f.min != null && v < f.min) probs.push(`${f.label} must be ≥ ${f.min}.`); if (v != null && f.max != null && v > f.max) probs.push(`${f.label} must be ≤ ${f.max}.`); }
    if (m.key === 'workstation_audits' && row.compliant_islands > row.total_islands) probs.push('Compliant islands cannot exceed total islands.');
    if (m.key === 'hapa_exchanges' && row.exchanged > row.to_exchange) probs.push('Exchanged cannot exceed scheduled.');
    if (probs.length) { msg.append(h('div', { class: 'err-msg' }, probs.map(p => h('div', {}, p)))); return; }
    btn.disabled = true;
    try {
      const recs = await withHashes(m, [{ row }]); const r = await db.insert(m.key, recs);
      await db.audit('entry', m.key, recs[0].row_hash.slice(0, 12));
      invalidate(m.key); S.data[m.key] = undefined;
      if (r.inserted) { toast('Record saved'); form.reset(); if (m.special === 'flip') form.elements.kind.dispatchEvent(new Event('change')); showDerived(); } else msg.append(h('div', { class: 'note' }, 'An identical record already exists, so nothing was added.'));
    } catch (x) { msg.append(h('div', { class: 'err-msg' }, 'Could not save: ' + x.message)); } finally { btn.disabled = false; }
  });
  showDerived(); return form;
}

// Pond photos: upload once while a pond is being prepared; the report shows the latest photo of every pond in progress in its picture grid.
function pondPhotos() {
  const box = h('div', { class: 'card mt' }), list = h('div', { class: 'ppgrid' });
  const pond = h('input', { placeholder: 'Pond, e.g. A12', maxlength: 20, required: true, 'aria-label': 'Pond' }), stage = h('input', { placeholder: 'Stage / status (optional)', maxlength: 40, 'aria-label': 'Stage or status' });
  const date = h('input', { type: 'date', value: todayIso(), max: todayIso(), 'aria-label': 'Photo date' });
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, 'aria-label': 'Photos' });
  const msg = h('div', { class: 'muted' });
  const draw = async () => {
    clear(list); let rows = []; try { rows = await db.pondPhotos(); } catch (e) { list.append(h('div', { class: 'muted' }, 'Could not load photos: ' + e.message)); return; }
    if (!rows.length) { list.append(h('div', { class: 'muted' }, 'No pond photos yet.')); return; }
    for (const r of rows.slice(0, 24)) {
      const img = h('img', { alt: r.pond }); db.pondPhotoUrl(r).then(u => { img.src = u; });
      const del = db.user.role === 'admin' ? h('button', { class: 'btn danger sm', onclick: async () => { if (confirm('Delete this photo?')) { await db.removePondPhoto(r); draw(); } } }, 'Delete') : null;
      list.append(h('div', { class: 'ppitem' }, img, h('div', { class: 'cap' }, [r.pond, r.stage, fmtDate(r.photo_date)].filter(Boolean).join(', ')), del));
    }
  };
  const form = h('form', { class: 'row', onsubmit: async e => {
    e.preventDefault(); if (!pond.value.trim() || !file.files.length) { msg.textContent = 'Enter the pond and choose at least one photo.'; return; }
    msg.textContent = 'Uploading…';
    try { for (const f of file.files) { if (f.size > 8e6) { toast(f.name + ' is over 8 MB', true); continue; } await db.addPondPhoto(f, pond.value.trim(), stage.value.trim(), date.value); } await db.audit('upload', 'pond_photo', pond.value.trim()); file.value = ''; msg.textContent = 'Saved. The report picks it up automatically.'; draw(); }
    catch (x) { msg.textContent = 'Could not upload: ' + x.message; }
  } }, pond, stage, date, file, h('button', { class: 'btn', type: 'submit' }, 'Add photos'));
  box.append(h('h2', {}, 'Pond photos'), h('p', { class: 'muted' }, 'Add photos while a pond is in progress. The weekly report shows the latest photo of every pond still in progress, in a picture grid, automatically. When the pond is complete it drops off by itself.'), form, msg, list);
  draw(); return box;
}

// Excel export of every stored record (not just the 100 shown), in the Victory Farms template style.
function exportBtn(mods, name, label) {
  const b = h('button', { class: 'btn sec', type: 'button', onclick: async () => {
    b.disabled = true; const old = b.textContent; b.textContent = 'Preparing…';
    try {
      const JSZip = await zipLib(); const logo = await fetch('assets/vf-xlsx-logo.jpg').then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);
      const sheets = []; for (const m of mods) { const rows = await db.load(m.key); if (mods.length === 1 || rows.length) sheets.push(moduleSheet(m, rows)); }
      if (!sheets.length) { toast('No records to export yet', true); return; }
      download(`${name.replace(/[^A-Za-z0-9]+/g, '_')}_${todayIso()}.xlsx`, await buildXlsx(JSZip, sheets, logo)); await db.audit('export', 'excel', name);
    } catch (e) { toast('Export failed: ' + e.message, true); } finally { b.disabled = false; b.textContent = old; }
  } }, label);
  return b;
}
