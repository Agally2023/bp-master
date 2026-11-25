import { h, pct } from '../util.js?v=202611250917';
import { lineChart, barChart } from '../charts.js?v=202611250917';
import { table, kpi } from './common.js?v=202611250917';
import * as A from '../analytics.js?v=202611250917';
// Blocks shared by the dashboard and the report preview.
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const has = a => (a || []).some(v => v != null);
const pc0 = v => (v * 100).toFixed(0) + '%';
export function sinkersBlock(sk, o = {}) {
  if (!has(sk.nursery.trend) && !has(sk.broodstock.trend)) return null;
  return lineChart({ labels: sk.labels, series: [{ name: 'Nursery (PNS), 4 sinkers', values: sk.nursery.trend, color: '#CB8306' }, { name: 'Broodstock (BS), 10 sinkers', values: sk.broodstock.trend, color: '#0E812E' }, { name: 'Standard (100%)', values: sk.labels.map(() => 1), color: '#C0392B' }], xTitle: 'ISO week', yTitle: 'Sinkers vs standard (%)', min: 0, max: 1.1, joinGaps: true, fmt: pc0, h: o.h });
}
export function srEffBlock(a, o = {}) {
  if (!has(a.trend)) return [null];
  return [lineChart({ labels: a.labels, series: [{ name: '% males', values: a.trend, color: '#0E812E' }, { name: `Target (${pc0(A.SR_TARGET)})`, values: a.labels.map(() => A.SR_TARGET), color: '#C0392B' }], xTitle: 'ISO week', yTitle: 'Males (% of sample)', min: 0.5, max: 1, joinGaps: true, fmt: pc0, h: o.h }),
    a.current.length ? table(['Cage', 'Batch', 'DOC', 'ABW (g)', 'Samples', 'Females', '% males'], a.current.slice(0, 10).map(r => [r.cage_no, r.batch_code, r.doc, r.abw_g, r.samples, r.females, { v: pct(r.pct_males, 1), cls: r.pct_males < A.SR_TARGET ? 'redtxt' : '' }]), { num: [2, 3, 4, 5, 6] }) : null];
}
export function srFeedBlock(a, o = {}) {
  if (!a.total) return [null];
  return [barChart({ labels: a.labels, series: [{ name: 'Feed prepared (kg)', values: a.prepared, color: '#0E812E' }], xTitle: 'ISO week', yTitle: 'Feed prepared (kg)', min: 0, fmt: v => String(Math.round(v)), h: o.h }),
    barChart({ labels: a.labels, series: [{ name: 'Hormone used (kg)', values: a.hormone, color: '#CB8306' }], xTitle: 'ISO week', yTitle: 'Hormone used (kg)', min: 0, fmt: v => v.toFixed(1), h: o.h }),
    table(['Date', 'Feed type', 'Prepared (kg)', 'Hormone (kg)', 'Hygiene', 'Feed quality', 'SOP followed'], a.rows.map(r => [r.date, r.feed_type, r.feed_prepared_kg, r.hormone_qty, r.hygiene, r.feed_quality, { v: r.sop_followed, cls: /^n/i.test(String(r.sop_followed || '')) ? 'redtxt' : '' }]), { num: [2, 3] })];
}
export function washBlock(a, o = {}) {
  if (!a.sizes.length) return [null];
  return [barChart({ labels: a.labels, series: [{ name: 'Washed', values: a.washed, color: '#0E812E' }, { name: 'Dispatched', values: a.dispatched, color: '#CB8306' }, { name: 'Exchanged', values: a.exchanged, color: '#00BDF0' }], xTitle: 'ISO week', yTitle: 'Hapas (no.)', min: 0, fmt: v => String(Math.round(v)), legend: true, h: o.h }),
    table(['Hapa size', 'Received', 'Washed', 'Dispatched', 'Exchanged', 'Wash cost'], a.sizes.map(r => [r.size, r.received, r.washed, r.dispatched, r.exchanged, Math.round(r.cost).toLocaleString()]), { num: [1, 2, 3, 4, 5] })];
}
// Days Late Summary table (stage x pond, days late = days taken minus expected) for ponds whose flip started in the latest 3 weeks.
export function flipMatrixBlocks(fl) {
  return [['broodstock', 'Broodstock'], ['nursery', 'Nursery']].map(([k, label]) => {
    const { st, all, total, windowText } = fl.matrix[k];
    if (!all.length) return h('div', { class: 'note' }, `${label}: no flips started in the ${windowText}.`);
    const parts = chunks(all, 8);
    return h('div', {}, ...parts.map((P, i) => h('div', { class: i ? 'mt' : '' }, h('h4', {}, `Days Late Summary: ${label} ponds` + (parts.length > 1 ? ` (${i + 1}/${parts.length})` : '')),
      table(['Stage', 'Expected (days)', ...P.map(r => r.pond)], st.map(x => [x.name, x.expected, ...P.map(r => { const v = r.stage_days?.[x.name]; return v == null || v < 0 ? '-' : { v: Math.max(0, v - x.expected), cls: v > x.expected ? 'late' : '' }; })]), { num: P.map((_, j) => j + 1) }))),
      h('div', { class: 'note' }, `Every flip started in the ${windowText}: ${total} pond${total === 1 ? '' : 's'}, most delayed first. Days late = days taken minus expected days (red = late).`));
  });
}
// Summary tiles (same figures as the dashboard) shown above the report slides.
export function summaryKpis(data, y, w, ras = 'RAS2', by = 'stage') {
  const ws = A.workstation(data, y, w), bio = A.biosecurity(data, y, w), par = A.parasitology(data, y, w, ras, by), d3 = A.day3(data, y, w), eg = A.eggs(data, y, w), hx = A.hapaExchange(data, y, w), sk = A.sinkers(data, y, w);
  const sink = (nm, u) => kpi('Sinkers: ' + nm, u.last ? pct(u.last.v, 1) : '–', { cls: 'cyan', note: u.last ? `avg ${u.last.avg.toFixed(1)} of ${u.std}/hapa` : 'no counts' });
  return h('div', { class: 'kpis' },
    kpi('Workstation compliance', pct(ws.current, 1), { note: ws.nc.length + ' non-compliant audit(s)', good: ws.nc.length === 0 }),
    kpi('Biosecurity score', pct(bio.current, 1), { cls: 'gold' }),
    kpi('3-day survival (avg)', pct(d3.avg, 1), { cls: 'cyan', note: d3.total ? `${d3.failed}/${d3.total} below 97%` : '', good: d3.failed === 0 }),
    kpi('Parasite prevalence', pct(par.prevalence, 1), { cls: 'red' }),
    kpi('Egg separation (ABP)', eg.current == null ? '–' : eg.current.toFixed(2), { note: eg.low.length + ' jar(s) at 0–2 stars' }),
    kpi('Hapa exchange: Nursery', pct(hx.nursery.current, 1), { cls: 'gold' }), kpi('Hapa exchange: Broodstock', pct(hx.broodstock.current, 1), { cls: 'gold' }),
    sink('Nursery (4)', sk.nursery), sink('Broodstock (10)', sk.broodstock));
}

// Days Late Summary charts: days taken per stage for ponds flipped in the latest 3 weeks, expected days as a line.
export function flipSummaryCharts(fl) {
  return [['broodstock', 'Broodstock'], ['nursery', 'Nursery']].map(([k, label]) => {
    const { st, all, windowText } = fl.matrix[k];
    if (!all.length) return h('div', { class: 'note' }, `${label}: no flips started in the ${windowText}.`);
    const parts = chunks(all, 8);
    return h('div', {}, ...parts.map((P, i) => barChart({ title: `${label} pond flipping & preparation compliance: ${windowText}` + (parts.length > 1 ? ` (${i + 1}/${parts.length})` : ''), labels: st.map(x => x.name), labelLen: 13, w: 760, h: 240, xTitle: 'Stage', yTitle: 'Days',
      series: P.map(r => ({ name: r.pond, values: st.map(x => r.stage_days?.[x.name] ?? null) })), line: { name: 'Expected days/stage', values: st.map(x => x.expected), color: '#FFC000' }, fmt: v => String(Math.round(v)), min: 0 })));
  });
}
