import { h, clear, toast } from '../util.js?v=202611271202';
import { db } from '../db.js?v=202611271202';
import { S, ensure } from '../state.js?v=202611271202';
import { recountMonths, recountTerminal, monthLabel } from '../recount.js?v=202611271202';
import { chartEl, specOf, statKey } from './statistics.js?v=202611271202';
const KEYS = ['day3_recounts', 'transfer_to_lake', 'salt_bath'];
const ID = 'recount_terminal';
// One card: month picker, KPI chips, one graph (day-3 vs terminal survival per hapa) and an editable "Hypothesis:" comment.
// In the Reports tab (R given) the comment is saved with the report and the graph goes on the PowerPoint (ticked by default).
export async function recountCard({ y, R = null, canEdit = false, locked = false }) {
  const raw = await ensure(KEYS, y - 1, false), months = recountMonths(raw), box = h('div', { class: 'card' }), editable = R && canEdit && !locked;
  const sel = h('select', { 'aria-label': 'Month' }, ...months.map(m => h('option', { value: m }, monthLabel(m))));
  const key = statKey(ID), saved = () => (R?.sections || []).find(s => s.section_key === key);
  const stored = (S.recountMonth && months.includes(S.recountMonth)) ? S.recountMonth : (saved()?.payload?.ym && months.includes(saved().payload.ym) ? saved().payload.ym : months[0]);
  if (stored) sel.value = stored;
  const body = h('div', {});
  box.append(h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, 'Day-3 recount vs terminal survival'), h('span', { class: 'sp' }), months.length ? h('label', { class: 'muted' }, 'Month ', sel) : null), body);
  const draw = async () => {
    clear(body); if (!months.length) { body.append(h('p', { class: 'muted' }, 'No hapas can be matched yet. Import the 3-Day Pond Survival file and the VF Hatchery Masterfile (Fingerling Transfer Worksheet tab, saved as .xlsx).')); return; }
    const ym = sel.value; S.recountMonth = ym; const a = recountTerminal(raw, ym), sv = saved(), useSaved = sv && sv.payload?.ym === ym;
    const text = h('textarea', { rows: 4, disabled: !editable, 'aria-label': 'Comment' }); text.value = useSaved && sv.comment ? sv.comment : a.comment;
    const inc = R ? h('input', { type: 'checkbox', checked: sv ? sv.include !== false : true, disabled: !editable }) : null;
    const save = async () => { try { await db.saveSection(R.report.id, key, { include: inc.checked, comment: text.value, payload: inc.checked ? { ...specOf(a, text.value), ym } : { ym } }); const rec = { section_key: key, include: inc.checked, comment: text.value, payload: { ym } }; const i = R.sections.findIndex(s => s.section_key === key); i < 0 ? R.sections.push(rec) : R.sections[i] = rec; } catch (e) { toast('Could not save: ' + e.message, true); } };
    let t; if (editable) { inc.onchange = save; text.oninput = () => { clearTimeout(t); t = setTimeout(save, 800); }; if (!sv) save(); }   // reports include it automatically; untick to leave it out
    body.append(h('p', { class: 'muted' }, 'Objective: ' + a.objective), h('div', { class: 'statchips' }, h('span', { class: 'chip' }, 'n = ' + (a.n ?? '–')), ...a.stats.map(([k, v]) => h('span', { class: 'chip' }, h('b', {}, k + ': '), String(v)))),
      a.chart ? chartEl({ ...a.chart, title: a.title }) : null,
      a.table ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ...a.table.head.map(x => h('th', {}, x)))), h('tbody', {}, ...a.table.rows.map(r => h('tr', {}, ...r.map(v => h('td', {}, String(v ?? '–'))))))) : null,
      R ? h('label', { class: 'f' }, 'Comment (editable, begins with the hypothesis)', text) : h('div', { class: 'note' }, a.comment),
      inc ? h('label', { class: 'muted' }, inc, ' on the PowerPoint (graph, comment and table)') : null);
  };
  sel.onchange = draw; await draw(); return box;
}
