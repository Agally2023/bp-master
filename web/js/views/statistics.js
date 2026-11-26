// Statistics: about 30 analyses on the year-to-date records up to the selected week. Every analysis has an objective and a "Hypothesis: ..." comment
// (editable). Tick "Include in report" to put the analysis, with its comment, in the weekly report preview and the PowerPoint.
import { h, clear, toast } from '../util.js?v=202611260455';
import { S, ensure, setWeek, currentWeek } from '../state.js?v=202611260455';
import { db } from '../db.js?v=202611260455';
import { card } from './common.js?v=202611260455';
import { lineChart, barChart } from '../charts.js?v=202611260455';
import { build } from '../statlist.js?v=202611260455';
import * as T from '../stats.js?v=202611260455';

const KEYS = ['workstation_audits', 'parasitology_samples', 'ras_parasite_prevalence', 'ras_water_volume', 'stocking_audits', 'fry_transfers', 'fry_culling', 'egg_separation_ratings', 'egg_volumetric_jars', 'do_temp_drone', 'do_temp_mis_truck', 'egg_disinfection', 'egg_viability', 'day3_recounts', 'ibc_method_survival', 'biosecurity_audits', 'pond_flips', 'pond_prep_scoring', 'pond_feeding', 'hapa_wash_dispatch', 'bottom_rope_audits', 'hapa_exchanges', 'broodstock_density', 'hapa_cov_aerated', 'hapa_cov_unaerated', 'sr_efficiency', 'sex_reversal_feed'];
export const statKey = id => 'stat_' + id;
const hex = c => '#' + c;

export function chartEl(c) {
  const o = { labels: c.cats, series: c.series.map(([name, values, col]) => ({ name, values, color: hex(col) })), xTitle: c.x, yTitle: c.y, min: c.min ?? (c.pct || c.kind === 'bar' ? 0 : undefined), max: c.max, joinGaps: true, maxLabels: 30, title: c.title };
  if (c.pct) o.fmt = v => (v * 100).toFixed(0) + '%';
  return c.kind === 'bar' ? barChart(o) : lineChart(o);
}
// the payload saved with the report: exactly the slide spec the PowerPoint engine draws
export function specOf(a, comment) {
  const lines = (comment || a.comment).split('\n').map(s => s.trim()).filter(Boolean);
  const stats = a.stats?.length ? ['Results: ' + a.stats.map(([k, v]) => `${k} ${v}`).join('; ')] : [];
  return { id: a.id, title: `${a.group}: ${a.title}`, objective: a.objective, n: a.n, lines: [...lines, ...stats],
    charts: a.chart ? [{ kind: a.chart.kind, cats: a.chart.cats, series: a.chart.series, x: a.chart.x, y: a.chart.y, fmt: a.chart.pct ? '0%' : '0.0', min: a.chart.min ?? 0, max: a.chart.max, h: 0.34 }] : [],
    tables: a.table ? [{ head: a.table.head, rows: a.table.rows.slice(0, 12).map(r => r.map(v => v == null ? '-' : String(v))), widths: a.table.head.map(() => 1 / a.table.head.length) }] : [] };
}

export async function render({ view, ctx }) {
  const cur = currentWeek(); if (!S.week) S.week = cur;
  const sel = h('select', { 'aria-label': 'Analyse up to week' }), body = h('div', {}), summary = h('span', { class: 'muted' });
  const canEdit = ['admin', 'reviewer', 'auditor'].includes(db.user.role);
  for (let w = Math.max(S.week.w, cur.y === S.week.y ? cur.w : 52); w >= 1; w--) sel.append(h('option', { value: w, selected: w === S.week.w }, `Up to week ${w}`));
  sel.onchange = () => { setWeek(S.week.y, Number(sel.value)); draw(); };
  ctx.append(h('span', { class: 'muted' }, `Year ${S.week.y}`), sel);
  const draw = async () => {
    clear(body); body.append(h('div', { class: 'empty' }, 'Calculating statistics…'));
    const raw = await ensure(KEYS, S.week.y, false); const { y, w } = S.week;
    const list = build(raw, y, w), R = await db.report(y, w, false).catch(() => null), saved = new Map((R?.sections || []).filter(s => s.section_key.startsWith('stat_')).map(s => [s.section_key, s]));
    let rid = R?.report?.id;
    const ensureReport = async () => rid || (rid = (await db.report(y, w, true)).report.id);
    clear(body);
    const incs = [];
    const saveInc = async (a, on, text) => { const r = await ensureReport(); await db.saveSection(r, statKey(a.id), { include: on, comment: text.value, payload: on ? specOf(a, text.value) : saved.get(statKey(a.id))?.payload ?? null }); saved.set(statKey(a.id), { include: on, comment: text.value }); count(); };
    const count = () => { summary.textContent = `${list.length} analyses with enough data · ${incs.filter(i => i.checked).length} ticked for the report`; };
    const head = h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, `Statistical analyses: Week ${w}, ${y}`), h('span', { class: 'sp' }), summary,
      canEdit ? h('button', { class: 'btn sec', onclick: () => incs.forEach(i => { if (!i.checked) { i.checked = true; i.onchange(); } }) }, 'Tick all') : null, canEdit ? h('button', { class: 'btn sec', onclick: () => incs.forEach(i => { if (i.checked) { i.checked = false; i.onchange(); } }) }, 'Clear all') : null),
      h('p', { class: 'muted' }, 'Each analysis uses all records of the year up to the selected week, states its objective, and ends with a "Hypothesis:" comment that says whether the data reject it. A p-value below 0.05 is treated as significant; small samples are flagged. Comments are editable. Tick an analysis to add it, with its comment, to the Reports tab and the PowerPoint (the report must still be approved by an administrator).'));
    body.append(head);
    if (!list.length) body.append(card('Not enough data yet', h('p', {}, 'No analysis has enough records for this period. Import or enter more data, then press Refresh.')));
    let group = '';
    for (const a of list) {
      if (a.group !== group) { group = a.group; body.append(h('h2', { class: 'stat-group' }, group)); }
      const sv = saved.get(statKey(a.id)), text = h('textarea', { rows: 3, 'aria-label': 'Comment: ' + a.title, disabled: !canEdit }); text.value = sv?.comment || a.comment;
      const inc = h('input', { type: 'checkbox', checked: !!sv && sv.include !== false, disabled: !canEdit, onchange: () => saveInc(a, inc.checked, text).catch(e => { toast('Could not save: ' + e.message, true); inc.checked = !inc.checked; }) }); incs.push(inc);
      let t; text.oninput = () => { clearTimeout(t); if (inc.checked) t = setTimeout(() => saveInc(a, true, text).catch(() => { }), 800); };
      body.append(card(a.title,
        h('div', { class: 'row' }, h('span', { class: 'muted', style: 'flex:1' }, 'Objective: ' + a.objective), h('label', { class: 'muted' }, inc, ' Include in report')),
        h('div', { class: 'statchips' }, h('span', { class: 'chip' }, 'n = ' + (a.n ?? '–')), ...a.stats.map(([k, v]) => h('span', { class: 'chip' }, h('b', {}, k + ': '), String(v)))),
        a.chart ? chartEl({ ...a.chart, title: a.title }) : null,
        a.table ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ...a.table.head.map(x => h('th', {}, x)))), h('tbody', {}, ...a.table.rows.slice(0, 15).map(r => h('tr', {}, ...r.map(v => h('td', {}, String(v ?? '–'))))))) : null,
        h('label', { class: 'f' }, 'Comment (editable)', text)));
    }
    count();
  };
  view.append(body); await draw();
}
