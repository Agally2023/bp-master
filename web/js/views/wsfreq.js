import { h, pct } from '../util.js?v=202611270845';
import { lineChart } from '../charts.js?v=202611270845';
import { table } from './common.js?v=202611270845';

const COLORS = ['#C0392B', '#CB8306', '#0E812E', '#00BDF0', '#7030A0'];
// Frequency of non-conformances by incubation (RAS), every week of the year to date: table + one curve per incubation.
export function wsFrequencyBlock(f) {
  if (!f.rows.length) return h('div', { class: 'note' }, 'No workstation audits recorded for this year yet.');
  const t = table(['Incubation', 'Audits', 'Non-conforming audits', '% of audits non-conforming', 'Weeks with a non-conformance', 'Non-compliant islands'],
    f.rows.map(r => [r.unit, r.audits, { v: r.nc, cls: r.nc ? 'redtxt' : '' }, pct(r.rate, 1), `${r.weeksNC} of ${r.weeksAudited}`, r.islands]));
  const chart = lineChart({ labels: f.labels, series: f.rows.map((r, i) => ({ name: r.unit, values: r.series, color: COLORS[i % COLORS.length] })), xTitle: 'ISO week', yTitle: 'Non-conforming audits per week', min: 0, joinGaps: true, fmt: v => String(Math.round(v)), w: 760, h: 220 });
  const fmt = l => l.map(([k, v]) => `${k} (${v})`).join(', ');
  const ppl = table(['Personnel', 'Non-conformances', '% of all', 'Reasons (count)'], f.people.map(p => [p.name, { v: p.n, cls: 'redtxt' }, pct(p.n / f.totalNC, 1), fmt(p.list)]));
  const rsn = table(['Reason', 'Non-conformances', '% of all', 'Personnel (count)'], f.reasons.map(r => [r.reason, { v: r.n, cls: 'redtxt' }, pct(r.n / f.totalNC, 1), fmt(r.list.slice(0, 6)) + (r.list.length > 6 ? ` +${r.list.length - 6} more` : '')]));
  return h('div', {}, chart, t, h('h3', {}, 'Personnel: non-conformances by person and reason'), ppl, h('h3', {}, 'Every reason and the personnel involved'), rsn, h('div', { class: 'note' }, `${f.totalNC} of ${f.total} audits this year were non-conforming; the incubation with the most is ${f.rows[0].unit} (${f.rows[0].nc}).`));
}
