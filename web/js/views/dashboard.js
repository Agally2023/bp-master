import { h, clear, pct, num, fmtDate } from '../util.js';
import { S, ensure } from '../state.js';
import * as A from '../analytics.js';
import { lineChart, barChart, PAL } from '../charts.js';
const shortD = d => { const t = new Date(d + 'T00:00:00Z'); return t.getUTCDate() + '/' + (t.getUTCMonth() + 1); };
import { weekPicker, kpi, table, band, card, noData } from './common.js';

const KEYS = ['workstation_audits', 'biosecurity_audits', 'parasitology_samples', 'ras_water_volume', 'ras_parasite_prevalence', 'day3_recounts', 'stocking_audits', 'fry_transfers', 'egg_separation_ratings', 'egg_volumetric_jars', 'pond_flips', 'bottom_rope_audits', 'hapa_exchanges'];
const has = a => a.some(v => v != null);

export async function render({ view, ctx }) {
  const data = await ensure(KEYS, S.week.y - 1);
  const body = h('div', {}); let ras = 'RAS2', by = 'stage';
  const draw = async () => {
    await ensure(KEYS, S.week.y - 1);
    clear(body); const { y, w } = S.week;
    if (!KEYS.some(k => (data[k] || []).length)) { body.append(card('No data yet', h('p', {}, 'Open ', h('b', {}, 'Data Entry'), ' to type records or import your Excel audit files. The dashboard fills in automatically.'))); return; }
    const ws = A.workstation(data, y, w), bio = A.biosecurity(data, y, w), par = A.parasitology(data, y, w, ras, by), wat = A.water(data, y, w), d3 = A.day3(data, y, w), st = A.stocking(data, y, w), tf = A.transfers(data, y, w), eg = A.eggs(data, y, w), br = A.bottomRope(data, y, w), hx = A.hapaExchange(data, y, w), fl = A.flips(data, y, w);
    body.append(h('div', { class: 'kpis' },
      kpi('Workstation compliance', pct(ws.current, 1), { note: ws.nc.length + ' non-compliant audit(s)', good: ws.nc.length === 0 }),
      kpi('Biosecurity score', pct(bio.current, 1), { cls: 'gold' }),
      kpi('3-day survival (avg)', pct(d3.avg, 1), { cls: 'cyan', note: d3.total ? `${d3.failed}/${d3.total} below 97%` : '', good: d3.failed === 0 }),
      kpi('Parasite prevalence', pct(par.prevalence, 1), { note: par.intensity != null ? 'intensity ' + num(par.intensity, 1) : '', cls: 'red' }),
      kpi('Egg separation (ABP)', eg.current == null ? '–' : eg.current.toFixed(2), { note: eg.low.length + ' jar(s) at 0–2 stars' }),
      kpi('Hapa exchange', pct(hx.current, 0), { cls: 'gold' })));
    const g = (...k) => h('div', { class: 'grid g2 mt' }, ...k);
    // 1 workstation
    body.append(g(card('Incubation workstation compliance trend', has(ws.trend) ? lineChart({ labels: ws.labels, series: [{ name: 'Compliance', values: ws.trend }], xTitle: 'ISO week', yTitle: 'Compliance (%)', min: 0, max: 1, fmt: v => (v * 100).toFixed(0) + '%', target: 1, targetLabel: '100%', valueLabels: true }) : noData(),
      ws.reasons.length ? h('div', { class: 'note' }, h('b', {}, 'Main reasons: '), ws.reasons.map(r => `${r[0]} (${r[1]})`).join(' · ')) : null),
      card('Non-compliant workstations this week', table(['Date', 'RAS', 'Compliance', 'Island', 'Responsible', 'Reason'], ws.nc.map(r => [fmtDate(r.audit_date), r.ras, { v: pct(r.score), cls: band(r.score, 0.95, 0.8) }, r.noncompliant_island, r.employee_responsible, r.reason])))));
    // 2 biosecurity
    body.append(g(card('Biosecurity & hygiene: weekly trend', has(bio.overall) ? lineChart({ labels: bio.labels, series: [{ name: 'Overall score', values: bio.overall }], xTitle: 'ISO week', yTitle: 'Biosecurity score (%)', min: 0, max: 1, fmt: v => (v * 100).toFixed(0) + '%', target: 0.8, targetLabel: 'Good ≥80%' }) : noData()),
      card('Category scores this week', table(['Category', 'Checks', 'Score'], bio.cats.map(c => [c.category, c.n, { v: pct(c.score, 1), cls: band(c.score) }]), { num: [1, 2] }))));
    // 3 parasitology
    const pick = h('div', { class: 'row' }, h('select', { onchange: e => { ras = e.target.value; draw(); } }, (par.rasList.length ? par.rasList : [ras]).map(r => h('option', { selected: r === ras }, r))),
      h('select', { onchange: e => { by = e.target.value; draw(); } }, [['stage', 'By stage'], ['island', 'By island']].map(([v, l]) => h('option', { value: v, selected: v === by }, l))));
    body.append(g(card('Parasite prevalence', pick, par.series.length ? lineChart({ labels: par.labels, series: par.series.map((s, i) => ({ name: s.key, values: s.prev, color: PAL[i % 6] })), xTitle: 'ISO week', yTitle: 'Prevalence (%)', min: 0, fmt: v => (v * 100).toFixed(0) + '%' }) : noData()),
      card('Parasite intensity (parasites per infected sample)', par.series.length ? lineChart({ labels: par.labels, series: par.series.map((s, i) => ({ name: s.key, values: s.int, color: PAL[i % 6] })), xTitle: 'ISO week', yTitle: 'Parasites per infected sample', min: 0 }) : noData())));
    // 4 RAS water vs prevalence
    body.append(g(card('RAS water volume vs parasite prevalence', wat.days.length ? h('div', {}, barChart({ labels: wat.days.map(d => shortD(d)), series: [{ name: 'Water added (L)', values: wat.vol, color: PAL[2] }], xTitle: 'Date', yTitle: 'Water added (L)', fmt: v => v.toFixed(0) }),
      lineChart({ labels: wat.days.map(d => shortD(d)), series: [{ name: 'Prevalence', values: wat.prev }], xTitle: 'Date', yTitle: 'Parasite prevalence (%)', min: 0, fmt: v => (v * 100).toFixed(0) + '%' }),
      h('div', { class: 'note' }, wat.r == null ? 'Not enough paired days to correlate.' : `Correlation r = ${wat.r.toFixed(2)} across ${wat.n} days (${Math.abs(wat.r) < 0.4 ? 'weak' : Math.abs(wat.r) < 0.7 ? 'moderate' : 'strong'} ${wat.r < 0 ? 'negative' : 'positive'} relationship).`)) : noData()),
      card('3-day recount survival by hapa', d3.total ? barChart({ labels: d3.units, series: [{ name: 'Survival', values: d3.values }], xTitle: 'Pond-Hapa unit', yTitle: '3-day survival (%)', valueLabels: true, maxLabels: 30, min: 0, fmt: v => (v * 100).toFixed(0) + '%', target: 0.97, targetLabel: '97%' }) : noData())));
    // 5 stocking + transfers
    body.append(g(card('Stocking numbers audit', table(['Date', 'ABW (g)', 'Required (g)', 'Target fry', 'Actual (g)', 'Variance', 'Est. stocked', 'Diff.'], st.map(r => [fmtDate(r.date), num(r.abw, 4), num(r.req, 0), num(r.target, 0), num(r.actual, 1), { v: pct(r.variance, 1), cls: Math.abs(r.variance) <= 0.05 ? 'good' : 'poor' }, num(r.est, 0), num(r.diff, 0)]), { num: [1, 2, 3, 4, 5, 6, 7] })),
      card('Incubation to pond transfer audit (morning stocking)', table(['Date', 'Time', 'Tray °C', 'Bucket, no fish', 'Bucket, with fish', 'Pond °C', 'Variance (<2)'], tf.map(r => [fmtDate(r.date), r.time, `${num(r.tray[0])} – ${num(r.tray[1])}`, `${num(r.bwo[0])} – ${num(r.bwo[1])}`, `${num(r.bw[0])} – ${num(r.bw[1])}`, num(r.pond), { v: `${num(r.variance[0])} – ${num(r.variance[1])}`, cls: r.variance[1] < 2 && r.variance[0] > -2 ? 'good' : 'poor' }])))));
    // 6 eggs
    body.append(g(card('Egg stage separation rating', has(eg.trend) ? lineChart({ labels: eg.labels, series: [{ name: 'ABP rating (1–5)', values: eg.trend }], xTitle: 'ISO week', yTitle: 'ABP rating (1–5)', min: 0, max: 5, valueLabels: true }) : noData()),
      card(`Jars rated 0–2 stars (${eg.low.length} of ${eg.total})`, table(['Date', 'Pond', 'Incubator', 'Total egg ht (cm)', 'Mixed (cm)', '% Overall', 'Stars'], eg.low.slice(0, 40).map(r => [fmtDate(r.date), r.pond, r.incubator, num(r.total_h), num(r.mixed_h), pct(r.overall), { v: r.star, cls: 'poor' }])))));
    // 7 flips, bottom rope, exchange
    const flipRows = [...fl.nursery.map(r => ['Nursery', r]), ...fl.brood.map(r => ['Broodstock', r])];
    body.append(g(card('Pond flipping this week', table(['Type', 'Pond', 'Scheduled', 'Stage days'], flipRows.map(([k, r]) => [k, r.pond, fmtDate(r.scheduled), Object.entries(r.stage_days || {}).map(([s, d]) => `${s}: ${d}`).join(' · ')]), { empty: 'No ponds flipped this week' })),
      card('Hapa exchange compliance', has(hx.trend) ? lineChart({ labels: hx.labels, series: [{ name: 'Exchanged / scheduled', values: hx.trend }], xTitle: 'ISO week', yTitle: 'Exchanged / scheduled (%)', min: 0, max: 1, fmt: v => (v * 100).toFixed(0) + '%', valueLabels: true }) : noData())));
    body.append(g(...['Nursery', 'Broodstock'].map(k => card(`Bottom rope non-conformance: ${k}`, has(br[k].trend) ? barChart({ labels: br[k].labels, series: [{ name: '% hapas failed the audit', values: br[k].trend }], xTitle: 'ISO week', yTitle: 'Hapas failed the audit (%)', min: 0, fmt: v => (v * 100).toFixed(0) + '%', valueLabels: true, maxLabels: 30 }) : noData(),
      br[k].ponds.length ? table(['Pond', 'Audited', 'Failed'], br[k].ponds.map(p => [p.pond, p.audited, { v: p.failed, cls: p.failed ? 'poor' : 'good' }]), { num: [1, 2] }) : null))));
  };
  weekPicker(ctx, data, draw); view.append(body); draw();
}
