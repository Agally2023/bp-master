import { h, clear, todayIso, fmtDate, toast, num } from '../util.js?v=202611271202';
import { S, ensure, invalidate, modByKey } from '../state.js?v=202611271202';
import { db } from '../db.js?v=202611271202';
import { coerce, normalizeRow, derive, withHashes, storedFields } from '../engine.js?v=202611271202';
import { importPanel, batchesPanel } from './import.js?v=202611271202';
import { table } from './common.js?v=202611271202';
import { zipLib } from '../xlsx.js?v=202611271202';
import * as FS from '../folder-sync.js?v=202611271202';
import * as GS from '../graph-sync.js?v=202611271202';
import { buildXlsx, moduleSheet } from '../xlsxwrite.js?v=202611271202';
import { download } from '../util.js?v=202611271202';

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
    if (current === 'ALL') { main.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0;flex:1' }, 'Import from Excel: all audit files'), (db.user.role === 'admin' ? syncBtn() : null), exportBtn(S.reg.modules, 'BP_Master_all_data', 'Export all data to Excel')), importPanel(null)), h('div', { class: 'card mt' }, h('h2', {}, 'Recent imports'), await batchesPanel())); return; }
    const m = modByKey(current);
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, [['form', 'Form'], ['records', 'Records'], ['import', 'Import from Excel']].map(([k, l]) => h('button', { role: 'tab', 'aria-selected': tab === k, onclick: () => { tab = k; drawMain(); } }, l)));
    const pane = h('div', {}); main.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0;flex:1' }, m.label), (db.user.role === 'admin' ? syncBtn() : null), exportBtn([m], m.label, 'Export to Excel')), tabs, pane));
    if (tab === 'form') { pane.append(formFor(m, () => { })); if (m.special === 'flip') pane.append(pondPhotos()); if (m.key === 'biosecurity_audits') pane.append(hygienePhotos()); } else if (tab === 'import') pane.append(importPanel(m.key)); else pane.append(await records(m));
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

// Times are automatic: the audit time is stamped when the record is saved (locked); other clock times start at the current time and can be corrected.
const nowHM = () => new Date().toTimeString().slice(0, 5);
const TIME_LOCKED = new Set(['audit_time']), TIME_AUTO = new Set(['audit_time', 'load_time', 'stock_time', 'start_feeding_time', 'end_feeding_time']);
const restamp = form => { for (const n of TIME_AUTO) { const el = form.elements[n]; if (el) el.value = nowHM(); } };
// Workstation audit islands: RAS drop-down, total islands automatic, non-compliant islands picked from a drop-down list, compliant islands automatic.
const WS_ISLANDS = { RAS1: ['FTT', 'TFT', 'Tray System', 'Incubators room'], RAS2: ['Kibuogi', 'Mbasa', 'Mfangano', 'Remba', 'Ringiti', 'Takawiri'] };
function inputFor(m, f) {
  if (m.key === 'workstation_audits') {
    if (f.name === 'ras') return h('select', { name: 'ras', required: true, 'aria-label': f.label }, h('option', { value: '' }, '— choose RAS —'), Object.keys(WS_ISLANDS).map(o => h('option', {}, o)));
    if (f.name === 'total_islands' || f.name === 'compliant_islands') return h('input', { name: f.name, type: 'number', readonly: true, 'aria-label': f.label, title: 'Filled in automatically', placeholder: 'automatic' });
    if (f.name === 'noncompliant_island') return h('input', { name: f.name, type: 'text', readonly: true, 'aria-label': f.label, placeholder: 'choose RAS first', hidden: true });
  }
  const common = { name: f.name, required: !!f.req, 'aria-label': f.label };
  if (f.type === 'select' && f.options) return h('select', common, h('option', { value: '' }, '—'), f.options.map(o => h('option', {}, o)));
  if (f.type === 'bool') return h('select', common, h('option', { value: '' }, '—'), h('option', { value: 'true' }, 'Yes'), h('option', { value: 'false' }, 'No'));
  if (f.type === 'date') return h('input', { ...common, type: 'date', max: todayIso(), min: m.minDate });
  if (f.type === 'int' || f.type === 'num') return h('input', { ...common, type: 'number', step: f.type === 'int' ? '1' : 'any', min: f.min, max: f.max, inputmode: 'decimal' });
  if (TIME_LOCKED.has(f.name)) return h('input', { ...common, type: 'text', value: nowHM(), readonly: true, title: 'Filled in automatically when the record is saved' });
  if (TIME_AUTO.has(f.name)) return h('input', { ...common, type: 'time', value: nowHM(), readonly: TIME_LOCKED.has(f.name), title: TIME_LOCKED.has(f.name) ? 'Filled in automatically when the record is saved' : 'Current time; correct it if the event happened earlier' });
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
  if (m.key === 'workstation_audits') {
    const ras = form.elements.ras, tot = form.elements.total_islands, comp = form.elements.compliant_islands, hid = form.elements.noncompliant_island, panel = h('div', { class: 'msel-list' }), sum = h('summary', {}, 'Choose RAS first');
    const dd = h('details', { class: 'msel' }, sum, panel); hid.after(dd);
    const upd = () => { const picked = [...panel.querySelectorAll('input:checked')].map(i => i.value), n = (WS_ISLANDS[ras.value] || []).length; hid.value = picked.join(', '); tot.value = n || ''; comp.value = n ? n - picked.length : ''; sum.textContent = !n ? 'Choose RAS first' : picked.length ? `${picked.length} non-compliant: ${picked.join(', ')}` : 'None (all islands compliant): tick any that are not'; try { showDerived(); } catch { } };
    const paint = () => { clear(panel); for (const i of WS_ISLANDS[ras.value] || []) panel.append(h('label', { class: 'msel-row' }, h('input', { type: 'checkbox', value: i, onchange: upd }), ' ' + i)); upd(); };
    ras.addEventListener('change', paint); form.addEventListener('reset', () => setTimeout(paint)); paint();
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
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Save record'); const clr = h('button', { class: 'btn sec', type: 'button', onclick: () => { form.reset(); restamp(form); showDerived(); msg.replaceChildren(); } }, 'Clear');
  form.append(derivedBox, msg, h('div', { class: 'row wide' }, btn, clr));
  form.addEventListener('submit', async e => {
    e.preventDefault(); msg.replaceChildren(); if (form.elements.audit_time) form.elements.audit_time.value = nowHM(); const row = build(), probs = [], t = todayIso();
    for (const f of fields) { if (f.type === 'stages') continue; const v = row[f.name]; if (f.req && (v == null || v === '')) probs.push(`${f.label} is required.`); if (f.type === 'date' && v && v > t) probs.push(`${f.label} is in the future.`); if (v != null && f.min != null && v < f.min) probs.push(`${f.label} must be ≥ ${f.min}.`); if (v != null && f.max != null && v > f.max) probs.push(`${f.label} must be ≤ ${f.max}.`); }
    if (m.key === 'workstation_audits' && row.compliant_islands > row.total_islands) probs.push('Compliant islands cannot exceed total islands.');
    if (m.key === 'hapa_exchanges' && row.exchanged > row.to_exchange) probs.push('Exchanged cannot exceed scheduled.');
    if (probs.length) { msg.append(h('div', { class: 'err-msg' }, probs.map(p => h('div', {}, p)))); return; }
    btn.disabled = true;
    try {
      const recs = await withHashes(m, [{ row }]); const r = await db.insert(m.key, recs);
      await db.audit('entry', m.key, recs[0].row_hash.slice(0, 12));
      invalidate(m.key); S.data[m.key] = undefined;
      if (r.inserted) { toast('Record saved'); form.reset(); restamp(form); if (m.special === 'flip') form.elements.kind.dispatchEvent(new Event('change')); showDerived(); } else msg.append(h('div', { class: 'note' }, 'An identical record already exists, so nothing was added.'));
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
    for (const r of rows.slice(0, 60)) {
      const img = h('img', { alt: r.pond }); db.pondPhotoUrl(r).then(u => { img.src = u; });
      const del = db.user.role === 'admin' ? h('button', { class: 'btn danger sm', onclick: async () => { if (confirm('Delete this photo?')) { await db.removePondPhoto(r); draw(); } } }, 'Delete') : null;
      list.append(h('div', { class: 'ppitem' }, h('div', { class: 'pwrap' }, img, h('div', { class: 'gcap' }, [r.pond, r.stage, fmtDate(r.photo_date)].filter(Boolean).join(', '))), del));
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

const QC_BASE = 'https://victoryfarmsltd.sharepoint.com/sites/AquaData/Shared%20Documents/Aqua%20Quality%20Control/BP%20Pond%20Files/';
const IT_REQUEST = `Hello IT,

Please register a read-only Microsoft Entra app for the BP Master data sync:
1. Entra admin centre > App registrations > New registration, name "BP Master Sync" (single tenant).
2. API permissions > Microsoft Graph > Application permissions > Sites.Selected, then grant admin consent and give it READ access to the AquaData SharePoint site (https://victoryfarmsltd.sharepoint.com/sites/AquaData). Files.Read.All is an acceptable alternative.
3. Certificates & secrets > New client secret (24 months).
4. Send me the Tenant ID, Application (client) ID and the secret value.
The app only reads the Aqua Quality Control workbooks (3-Day Pond Survival, Egg Collection Monitoring). It cannot change or delete anything.

Thank you.`;
async function setupDialog() {
  let srcs = []; try { srcs = await db.load('sync_sources') || []; } catch { }
  const d = h('dialog', { style: 'max-width:560px;border:1px solid #D6E3FF;border-radius:10px;padding:20px' },
    h('h2', { style: 'margin:0 0 8px' }, 'One-time setup needed for automatic sync'),
    h('p', {}, 'The Sync button is ready, but SharePoint will only open its files to the app once your IT admin registers a read-only Microsoft app (about 10 minutes). Until then, load new data like this:'),
    h('ol', {}, h('li', {}, 'Open the file below in SharePoint and download it.'), h('li', {}, 'Come back here and drop it on the import box (re-importing is safe: existing rows are skipped).')),
    ...[...new Map(srcs.map(x => [x.file_name, x])).values()].map(x => h('div', { class: 'row', style: 'margin:4px 0' }, h('span', { style: 'flex:1' }, x.file_name), h('a', { class: 'btn sec', href: QC_BASE + encodeURIComponent(x.file_name), target: '_blank', rel: 'noopener' }, 'Open in SharePoint'))),
    h('div', { class: 'row', style: 'margin-top:14px;gap:8px' },
      h('button', { class: 'btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(IT_REQUEST); toast('Request for IT copied: paste it into an email'); } catch { toast('Copy failed: the steps are in supabase/SYNC_SETUP.md', true); } } }, 'Copy the request for IT'),
      h('button', { class: 'btn sec', type: 'button', onclick: () => d.close() }, 'Close')));
  d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal();
}

// Fallback when the browser cannot open a folder (phones, Firefox, Safari) and Microsoft sign-in is not set up: choose the workbooks yourself.
// Every sheet is recognised from the module markers (same as the folder sync), so any audit workbook works, including "VF Hatchery Masterfile.xlsx",
// "VF 3-Day pond Survival.xlsx" and "VF Egg Collection Monitoring Data.xlsx". Re-choosing a file is safe: existing rows are skipped.
async function pickAndPush(onProgress = () => { }) {
  const inp = h('input', { type: 'file', accept: '.xlsx,.xlsm', multiple: true, style: 'display:none' }); document.body.append(inp);
  const files = await new Promise(res => { inp.onchange = () => res([...inp.files]); inp.addEventListener('cancel', () => res([])); inp.click(); }); inp.remove();
  if (!files.length) { toast('No file chosen. Pick the workbooks from your synced folder, e.g. "VF Hatchery Masterfile.xlsx".', true); return null; }
  const out = { files: 0, imported: [], problems: [], unchanged: 0 };
  for (const f of files) {
    if (f.size > 60e6) { out.problems.push(`${f.name}: over 60 MB`); continue; }
    try { onProgress(`Reading ${f.name}…`); const buf = await f.arrayBuffer(), hash = await FS.sha256Hex(buf); out.files++; const n = out.imported.length; await FS.ingest(f.name, buf, hash, out, onProgress); if (out.imported.length === n) out.problems.push(`${f.name}: no sheet in it matched a known audit format (or the file is protected by a sensitivity label: save a copy without the label)`); }
    catch (e) { out.problems.push(`${f.name}: ${e.message}`); }
  }
  return out;
}

// Sync: pick the OneDrive-synced SharePoint folder once; every Excel file in it is then read, each sheet is recognised from the module markers and the
// new rows are loaded (same importer as Data entry). Needs Chrome or Edge. Other browsers fall back to choosing the files.
function syncBtn() {   // shown to administrators only
  const label = async () => GS.configured() ? 'Sync files from SharePoint' : (await FS.folderName()) ? `Sync files (${await FS.folderName()})` : 'Sync files';
  const b = h('button', { class: 'btn sec', type: 'button', title: 'Load new rows from the audit workbooks in SharePoint' }, 'Sync files'); label().then(t => b.textContent = t);
  const msg = h('span', { class: 'muted', style: 'font-size:.85em' });
  const setup = h('button', { class: 'btn sec', type: 'button', title: 'Connect SharePoint (one time) or choose a local folder', onclick: () => syncSetup(async () => { b.textContent = await label(); }) }, 'Sync setup');
  const report = r => {
    const tot = r.imported.reduce((n, x) => n + x.rows, 0);
    toast(r.problems.length ? 'Sync problem: ' + r.problems[0] : tot ? `Synced ${tot.toLocaleString()} new rows: ` + [...new Set(r.imported.filter(x => x.rows).map(x => x.module))].join(', ') : `Up to date (${r.files + r.unchanged} file(s) checked, nothing new)`, !!r.problems.length);
    if (r.imported.length) drawAfterSync();
  };
  b.onclick = async () => {
    b.disabled = true; const old = b.textContent;
    try {
      if (GS.configured()) { b.textContent = 'Syncing…'; const r = await GS.syncSharePoint(t => { msg.textContent = t; }, true); msg.textContent = ''; report(r); return; }
      if (!FS.supported()) { const r = await pickAndPush(t => { msg.textContent = t; }); msg.textContent = ''; if (r) report(r); return; }
      if (!(await FS.folderName())) { await FS.chooseFolder(); }
      if ((await FS.permission(true)) !== 'granted') { toast('Allow access to the folder to sync', true); return; }
      b.textContent = 'Syncing…'; const r = await FS.syncFolder(t => { msg.textContent = t; }); msg.textContent = ''; report(r);
    } catch (e) { if (e.name !== 'AbortError') toast('Sync failed: ' + e.message, true); } finally { b.disabled = false; b.textContent = await label().catch(() => old); }
  };
  return h('span', { class: 'row', style: 'gap:.4rem;align-items:center' }, b, setup, msg);
}
// One-time connection of SharePoint (Microsoft sign-in with your own account, read-only), or a local-folder fallback.
function syncSetup(done) {
  const c = GS.cfg(), inp = (v, ph) => h('input', { value: v, placeholder: ph, style: 'width:100%' });
  const client = inp(c.client, 'Application (client) ID'), tenant = inp(c.tenant === 'organizations' ? '' : c.tenant, 'Directory (tenant) ID (optional)'), folder = inp(c.folder, 'SharePoint folder link');
  const d = h('dialog', { style: 'max-width:600px;border:1px solid #D6E3FF;border-radius:10px;padding:20px' },
    h('h2', { style: 'margin:0 0 8px' }, 'Automatic SharePoint sync'),
    h('p', {}, 'Register the app once in your own Microsoft account, then the app signs in once and syncs silently every 10 minutes while it is open.'),
    h('ol', {}, h('li', {}, 'entra.microsoft.com > App registrations > New registration. Name: BP Master. Supported accounts: this organisation only.'),
      h('li', {}, 'Redirect URI: platform "Single-page application", value: ', h('b', {}, GS.redirectUri())),
      h('li', {}, 'API permissions > Add > Microsoft Graph > Delegated > Files.Read.All. Press Grant consent if offered.'),
      h('li', {}, 'Copy the Application (client) ID and Directory (tenant) ID below.')),
    h('label', {}, 'Client ID'), client, h('label', {}, 'Tenant ID'), tenant, h('label', {}, 'SharePoint folder to read'), folder,
    h('div', { class: 'row', style: 'margin-top:14px;gap:8px' },
      h('button', { class: 'btn', type: 'button', onclick: () => { GS.saveCfg({ client: client.value, tenant: tenant.value, folder: folder.value }); toast(client.value.trim() ? 'Saved. Press Sync: a Microsoft sign-in opens once.' : 'Microsoft sync turned off'); d.close(); done?.(); } }, 'Save'),
      h('button', { class: 'btn sec', type: 'button', onclick: async () => { try { await FS.chooseFolder(); toast('Local folder saved'); d.close(); done?.(); } catch (e) { if (e.name !== 'AbortError') toast(e.message, true); } } }, 'Use a local folder instead'),
      GS.signedIn() ? h('button', { class: 'btn sec', type: 'button', onclick: () => { GS.signOut(); toast('Signed out of Microsoft'); d.close(); } }, 'Sign out') : null,
      h('button', { class: 'btn sec', type: 'button', onclick: () => d.close() }, 'Close')));
  d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal();
}
function drawAfterSync() { document.dispatchEvent(new CustomEvent('bpm-data-changed')); }

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

// Hygiene & biosecurity photos: area/item, status and date are printed in the bottom-right corner of the picture in the report's 4-photo grid.
function hygienePhotos() {
  const box = h('div', { class: 'card mt' }), list = h('div', { class: 'ppgrid' });
  const area = h('input', { placeholder: 'Area / location, e.g. Hatchery entrance', maxlength: 40, required: true, 'aria-label': 'Area' }), item = h('input', { placeholder: 'Item (optional), e.g. Footbath', maxlength: 40, 'aria-label': 'Item' }), status = h('input', { placeholder: 'Status, e.g. Compliant', maxlength: 40, 'aria-label': 'Status' });
  const date = h('input', { type: 'date', value: todayIso(), max: todayIso(), 'aria-label': 'Photo date' });
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, 'aria-label': 'Photos' });
  const msg = h('div', { class: 'muted' });
  const draw = async () => {
    clear(list); let rows = []; try { rows = await db.hygienePhotos(); } catch (e) { list.append(h('div', { class: 'muted' }, 'Could not load photos: ' + e.message)); return; }
    if (!rows.length) { list.append(h('div', { class: 'muted' }, 'No hygiene photos yet.')); return; }
    for (const r of rows.slice(0, 60)) {
      const img = h('img', { alt: r.area }); db.hygienePhotoUrl(r).then(u => { img.src = u; });
      const del = db.user.role === 'admin' ? h('button', { class: 'btn danger sm', onclick: async () => { if (confirm('Delete this photo?')) { await db.removeHygienePhoto(r); draw(); } } }, 'Delete') : null;
      list.append(h('div', { class: 'ppitem' }, h('div', { class: 'pwrap' }, img, h('div', { class: 'gcap' }, [r.area, r.item, r.status, fmtDate(r.photo_date)].filter(Boolean).join(', '))), del));
    }
  };
  const form = h('form', { class: 'row', onsubmit: async e => {
    e.preventDefault(); if (!area.value.trim() || !file.files.length) { msg.textContent = 'Enter the area and choose at least one photo.'; return; }
    msg.textContent = 'Uploading…';
    try { for (const f of file.files) { if (f.size > 8e6) { toast(f.name + ' is over 8 MB', true); continue; } await db.addHygienePhoto(f, area.value.trim(), item.value.trim(), status.value.trim(), date.value); } await db.audit('upload', 'hygiene_photo', area.value.trim()); file.value = ''; msg.textContent = 'Saved. The report picks it up automatically.'; draw(); }
    catch (x) { msg.textContent = 'Could not upload: ' + x.message; }
  } }, area, item, status, date, file, h('button', { class: 'btn', type: 'submit' }, 'Add photos'));
  box.append(h('h2', {}, 'Hygiene & biosecurity photos'), h('p', { class: 'muted' }, 'Add photos with the area, status and date. The weekly report shows the week\'s photos in a grid of four (extra photos go on further slides), with these details in the bottom-right corner of each picture.'), form, msg, list);
  draw(); return box;
}


// Automatic sync: while the app is open, every 10 minutes (and once shortly after opening), if the browser still has permission to read the chosen folder.
let autoBusy = false;
async function autoSync() {
  if (autoBusy || document.hidden || !db.tok && !db.demo || db.user?.role !== 'admin') return;   // sync is an administrator function
  try {
    let r;
    if (GS.configured()) { if (!GS.signedIn()) return; autoBusy = true; r = await GS.syncSharePoint(); }
    else { if (!FS.supported() || (await FS.permission(false)) !== 'granted') return; autoBusy = true; r = await FS.syncFolder(); } const tot = r.imported.reduce((n, x) => n + x.rows, 0);
    if (tot) toast(`Auto-sync loaded ${tot.toLocaleString()} new rows: ` + [...new Set(r.imported.filter(x => x.rows).map(x => x.module))].join(', '));
  } catch { } finally { autoBusy = false; }
}
setTimeout(autoSync, 20000); setInterval(autoSync, 600000);
