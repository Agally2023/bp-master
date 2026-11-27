// Statistics tab = a compact dashboard of the analyses (headline number, verdict, one line; tap a tile for its graph).
// The full report format (objective, graph, table, editable Hypothesis comment, tick to include in the PowerPoint) is statSection(), shown on the Reports tab.
import { h, clear, toast } from '../util.js?v=202611270853';
import { S, ensure, setWeek, currentWeek } from '../state.js?v=202611270853';
import { db } from '../db.js?v=202611270853';
import { card, kpi } from './common.js?v=202611270853';
import { lineChart, barChart } from '../charts.js?v=202611270853';
import { build } from '../statlist.js?v=202611270853';
import * as T from '../stats.js?v=202611270853';

export const STAT_KEYS = ['workstation_audits', 'parasitology_samples', 'ras_parasite_prevalence', 'ras_water_volume', 'stocking_audits', 'fry_transfers', 'fry_culling', 'egg_separation_ratings', 'egg_volumetric_jars', 'do_temp_drone', 'do_temp_mis_truck', 'egg_disinfection', 'egg_viability', 'day3_recounts', 'ibc_method_survival', 'biosecurity_audits', 'pond_flips', 'pond_prep_scoring', 'pond_feeding', 'hapa_wash_dispatch', 'bottom_rope_audits', 'hapa_exchanges', 'broodstock_density', 'hapa_cov_aerated', 'hapa_cov_unaerated', 'sr_efficiency', 'sex_reversal_feed', 'salt_bath', 'transfer_to_lake'];
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

export const verdictOf = a => /\. Rejected/.test(a.comment) ? 'sig' : /Not rejected/.test(a.comment) ? 'ns' : /Too few/.test(a.comment) ? 'na' : 'info';
const VERDICT = { sig: ['Significant finding', 'bad'], ns: ['No significant difference', 'good'], na: ['Too few records', 'muted'], info: ['Screen', 'muted'] };
const short = c => { const m = c.match(/^Hypothesis: (.*?\)\.)/); return m ? 'Hypothesis: ' + m[1] : c.split(/\. (?=[A-Z])/)[0] + '.'; };

export async function loadStats(y, w) { const raw = await ensure(STAT_KEYS, y, false); return build(raw, y, w); }

// ---- Statistics tab: dashboard
export async function render({ view, ctx }) {
  const cur = currentWeek(); if (!S.week) S.week = cur;
  const sel = h('select', { 'aria-label': 'Analyse up to week' }), body = h('div', {});
  for (let w = Math.max(S.week.w, cur.y === S.week.y ? cur.w : 52); w >= 1; w--) sel.append(h('option', { value: w, selected: w === S.week.w }, `Up to week ${w}`));
  sel.onchange = () => { setWeek(S.week.y, Number(sel.value)); draw(); };
  ctx.append(h('span', { class: 'muted' }, `Year ${S.week.y}`), sel);
  const draw = async () => {
    clear(body); body.append(h('div', { class: 'empty' }, 'Calculating statistics…'));
    const { y, w } = S.week, list = await loadStats(y, w); clear(body);
    const cnt = k => list.filter(a => verdictOf(a) === k).length;
    body.append(h('div', { class: 'kpis' }, kpi('Analyses run', list.length), kpi('Significant findings', cnt('sig'), { cls: cnt('sig') ? 'red' : '' }), kpi('No significant difference', cnt('ns'), { cls: 'green' })));
    body.append(h('p', { class: 'muted' }, `Year-to-date records up to week ${w}. "Significant" means the data reject the hypothesis (p < 0.05). Every analysis shows its graph; tap a tile for the full comment and objective. Full wording, editing and ticking analyses for the PowerPoint is on the `, h('a', { href: '#/reports' }, 'Reports tab'), ' (Statistical analyses section).'));
    if (!list.length) body.append(card('Not enough data yet', h('p', {}, 'No analysis has enough records for this period. Import or enter more data, then press Refresh.')));
    let grid = null, group = '';
    for (const a of list) {
      if (a.group !== group) { group = a.group; body.append(h('h2', { class: 'stat-group' }, group)); grid = h('div', { class: 'stat-grid' }); body.append(grid); }
      const v = verdictOf(a), det = h('div', { class: 'tile-more', hidden: true }, h('p', {}, a.comment.replace(/^Hypothesis: .*?\)\.\s*/, '')), h('p', { class: 'muted' }, 'Objective: ' + a.objective));
      const pic = a.chart ? h('div', { class: 'tile-chart' }, chartEl({ ...a.chart, title: '' })) : null;
      const tile = h('div', { class: 'stat-tile ' + v, role: 'button', tabindex: 0, onclick: e => { if (e.target.closest('.chart-dl')) return; det.hidden = !det.hidden; tile.classList.toggle('open', !det.hidden); } },
        h('div', { class: 'tt' }, a.title), h('div', { class: 'tv' }, a.stats[0] ? String(a.stats[0][1]) : '–'), h('div', { class: 'tl' }, a.stats[0] ? a.stats[0][0] : ''),
        h('span', { class: 'vpill ' + v }, VERDICT[v][0]), pic, h('div', { class: 'tc' }, short(a.comment)), det);
      grid.append(tile);
    }
  };
  view.append(body); await draw();
}

// ---- Reports tab: the report format. Every analysis with its objective, graph, table and an editable Hypothesis comment; tick = on the PowerPoint.
export async function statSection({ R, y, w, canEdit, locked }) {
  const list = await loadStats(y, w), saved = new Map((R.sections || []).filter(s => s.section_key.startsWith('stat_')).map(s => [s.section_key, s])), incs = [], rid = R.report.id, editable = canEdit && !locked;
  const summary = h('span', { class: 'muted' }), count = () => { summary.textContent = `${list.length} analyses · ${incs.filter(i => i.checked).length} on the PowerPoint`; };
  const saveInc = async (a, on, text) => { await db.saveSection(rid, statKey(a.id), { include: on, comment: text.value, payload: on ? specOf(a, text.value) : saved.get(statKey(a.id))?.payload ?? null }); saved.set(statKey(a.id), { include: on, comment: text.value, payload: on ? specOf(a, text.value) : null }); count(); };
  const box = h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, 'Statistical analyses'), h('span', { class: 'sp' }), summary,
    editable ? h('button', { class: 'btn sec', onclick: () => incs.forEach(i => { if (!i.checked) { i.checked = true; i.onchange(); } }) }, 'Tick all') : null, editable ? h('button', { class: 'btn sec', onclick: () => incs.forEach(i => { if (i.checked) { i.checked = false; i.onchange(); } }) }, 'Clear all') : null),
    h('p', { class: 'muted' }, 'Each analysis has an objective and a comment that begins "Hypothesis:". Edit the comment, then tick the analyses that go on the PowerPoint as extra slides (chart, table and comment). Overview of results: Statistics tab.'));
  if (!list.length) box.append(h('p', { class: 'muted' }, 'No analysis has enough records for this period yet.'));
  let group = '';
  for (const a of list) {
    if (a.group !== group) { group = a.group; box.append(h('h3', { class: 'stat-group' }, group)); }
    const sv = saved.get(statKey(a.id)), text = h('textarea', { rows: 3, 'aria-label': 'Comment: ' + a.title, disabled: !editable }); text.value = sv?.comment || a.comment;
    const inc = h('input', { type: 'checkbox', checked: !!sv && sv.include !== false, disabled: !editable, onchange: () => saveInc(a, inc.checked, text).catch(e => { toast('Could not save: ' + e.message, true); inc.checked = !inc.checked; }) }); incs.push(inc);
    let t; text.oninput = () => { clearTimeout(t); if (inc.checked) t = setTimeout(() => saveInc(a, true, text).catch(() => { }), 800); };
    box.append(h('details', { class: 'sec' }, h('summary', {}, h('span', {}, `${a.title}`), h('span', { class: 'sp' }), h('label', { class: 'muted', onclick: e => e.stopPropagation() }, inc, ' on PowerPoint')),
      h('div', { class: 'inner' }, h('p', { class: 'muted' }, 'Objective: ' + a.objective), h('div', { class: 'statchips' }, h('span', { class: 'chip' }, 'n = ' + (a.n ?? '–')), ...a.stats.map(([k, v]) => h('span', { class: 'chip' }, h('b', {}, k + ': '), String(v)))),
        a.chart ? chartEl({ ...a.chart, title: a.title }) : null,
        a.table ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ...a.table.head.map(x => h('th', {}, x)))), h('tbody', {}, ...a.table.rows.slice(0, 15).map(r => h('tr', {}, ...r.map(v => h('td', {}, String(v ?? '–'))))))) : null,
        h('label', { class: 'f' }, 'Comment (editable)', text))));
  }
  count(); return box;
}
