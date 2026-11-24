import { h, clear, pct, num, fmtDate, weekRange } from '../util.js?v=202611240426';
import { S, ensure } from '../state.js?v=202611240426';
import { periodize, relabel } from '../period.js?v=202611240426';
import { wsFrequencyBlock } from './wsfreq.js?v=202611240426';
const sinceYear = () => S.week.y - (S.week.w <= (S.period === 'week' ? 12 : S.period === 'month' ? 3 : 30) ? 1 : 0);   // trends read the selected year; the previous year is only needed in the first weeks
import * as A from '../analytics.js?v=202611240426';
import { lineChart, barChart, PAL } from '../charts.js?v=202611240426';
const shortD = d => { const t = new Date(d + 'T00:00:00Z'); return t.getUTCDate() + '/' + (t.getUTCMonth() + 1); };
import { weekPicker, kpi, table, band, card, noData, bioTable } from './common.js?v=202611240426';

const sn = a => { const t = A.asOfNote(a, S.week.w); return t ? h('div', { class: 'note stale' }, t) : null; };
const KEYS = ['pond_prep_scoring', 'workstation_audits', 'biosecurity_audits', 'parasitology_samples', 'ras_water_volume', 'ras_parasite_prevalence', 'day3_recounts', 'stocking_audits', 'fry_transfers', 'egg_separation_ratings', 'egg_volumetric_jars', 'pond_flips', 'bottom_rope_audits', 'hapa_exchanges'];
const has = a => a.some(v => v != null);

export async function render({ view, ctx }) {
  const raw = await ensure(KEYS, sinceYear(), true);
  const body = h('div', {}); let ras = 'RAS2', by = 'stage';
  const draw = async () => {
    await ensure(KEYS, sinceYear(), true);
    clear(body); const { y, w } = S.week; const data = periodize(raw, S.period);
    if (S.failed.size) body.append(h('div', { class: 'note stale' }, 'Some data could not be loaded (' + [...S.failed.keys()].join(', ') + '). Reload the page to try again.'));
    if (!KEYS.some(k => (data[k] || []).length)) { body.append(card('No data yet', h('p', {}, 'Open ', h('b', {}, 'Data Entry'), ' to type records or import your Excel audit files. The dashboard fills in automatically.'))); return; }
    const ws = A.workstation(data, y, w), bio = A.biosecurity(data, y, w), par = A.parasitology(data, y, w, ras, by), wat = A.water(data, y, w), d3 = A.day3(data, y, w), st = A.stocking(data, y, w), tf = A.transfers(data, y, w), eg = A.eggs(data, y, w), br = A.bottomRope(data, y, w), hx = A.hapaExchange(data, y, w), fl = A.flips(data, y, w);
    const sk = A.sinkers(data, y, w);
    const skKpi = (nm, u) => kpi('Sinkers: ' + nm, u.last ? pct(u.last.v, 1) : '–', { cls: 'cyan', note: u.last ? (u.last.w === w ? `avg ${u.last.avg.toFixed(1)} of ${u.std} sinkers/hapa` : `last: wk ${u.last.w}, avg ${u.last.avg.toFixed(1)} of ${u.std}`) : 'no counts recorded' });
    const kpiSR = kpi('Broodstock sex ratio', '…', { cls: 'cyan', note: 'loading' }), kpiSD = kpi('Broodstock stocking density', '…', { cls: 'gold', note: 'loading' });
    body.append(h('div', { class: 'kpis' },
      kpi('Workstation compliance', pct(ws.current, 1), { note: ws.nc.length + ' non-compliant audit(s)', good: ws.nc.length === 0 }),
      kpi('Biosecurity score', pct(bio.current, 1), { cls: 'gold' }),
      kpi('3-day survival (avg)', pct(d3.avg, 1), { cls: 'cyan', note: d3.total ? `${d3.failed}/${d3.total} below 97%` : '', good: d3.failed === 0 }),
      kpi('Parasite prevalence', pct(par.prevalence, 1), { note: par.intensity != null ? 'intensity ' + num(par.intensity, 1) : '', cls: 'red' }),
      kpi('Egg separation (ABP)', eg.current == null ? '–' : eg.current.toFixed(2), { note: eg.low.length + ' jar(s) at 0–2 stars' }),
      kpi('Hapa exchange: Nursery', pct(hx.nursery.current, 1), { note: hx.nursery.current == null && hx.nursery.last ? `last: wk ${hx.nursery.last.w}, ${pct(hx.nursery.last.v, 1)}` : '', cls: 'gold' }),
      kpi('Hapa exchange: Broodstock', pct(hx.broodstock.current, 1), { note: hx.broodstock.current == null && hx.broodstock.last ? `last: wk ${hx.broodstock.last.w}, ${pct(hx.broodstock.last.v, 1)}` : '', cls: 'gold' }),
      skKpi('Nursery (4)', sk.nursery),
      skKpi('Broodstock (10)', sk.broodstock),
      kpiSR, kpiSD));
    const g = (...k) => h('div', { class: 'grid g2 mt' }, ...k);
    // 1 workstation
    body.append(g(card('Incubation workstation compliance trend', has(ws.trend) ? lineChart({ labels: ws.labels, series: [{ name: 'Compliance', values: ws.trend }], xTitle: 'ISO week', yTitle: 'Compliance (%)', min: 0, max: 1, fmt: v => (v * 100).toFixed(0) + '%', target: 1, targetLabel: '100%', valueLabels: true }) : noData(),
      ws.reasons.length ? h('div', { class: 'note' }, h('b', {}, 'Main reasons: '), ws.reasons.map(r => `${r[0]} (${r[1]})`).join(' · ')) : null),
      card('Non-compliant workstations this week (compliance in %)', sn(ws.ncAsOf), table(['Date', 'RAS', 'Compliance (%)', 'Island', 'Responsible', 'Reason'], ws.nc.map(r => [fmtDate(r.audit_date), r.ras, { v: pct(r.score), cls: band(r.score, 0.95, 0.8) }, r.noncompliant_island, r.employee_responsible, r.reason])))));
    body.append(card('Which incubation led to non-conformances (all weeks this year)', wsFrequencyBlock(A.wsFrequency(data, y, w))));
    // 2 biosecurity
    body.append(g(card('Biosecurity and Hygiene', has(bio.overall) ? bioTable(bio, pct) : null, has(bio.overall) ? lineChart({ labels: bio.labels, series: [{ name: 'Overall rating', values: bio.overall }], xTitle: 'ISO week', yTitle: 'Biosecurity score (%)', min: 0, max: 1, fmt: v => (v * 100).toFixed(0) + '%', area: true, joinGaps: true, valueLabels: true, maxLabels: 30, w: 760 }) : noData())));
    // 3 parasitology
    const pick = h('div', { class: 'row' }, h('select', { onchange: e => { ras = e.target.value; draw(); } }, (par.rasList.length ? par.rasList : [ras]).map(r => h('option', { selected: r === ras }, r))),
      h('select', { onchange: e => { by = e.target.value; draw(); } }, [['stage', 'By stage'], ['island', 'By island']].map(([v, l]) => h('option', { value: v, selected: v === by }, l))));
    body.append(g(card('Parasite prevalence', pick, par.series.length ? lineChart({ labels: par.labels, series: par.series.map((s, i) => ({ name: s.key, values: s.prev, color: PAL[i % 6] })), xTitle: 'ISO week', yTitle: 'Prevalence (%)', min: 0, fmt: v => (v * 100).toFixed(0) + '%' }) : noData()),
      card('Parasite intensity (parasites per infected sample)', par.series.length ? lineChart({ labels: par.labels, series: par.series.map((s, i) => ({ name: s.key, values: s.int, color: PAL[i % 6] })), xTitle: 'ISO week', yTitle: 'Parasites per infected sample', min: 0 }) : noData())));
    // 4 RAS water vs prevalence
    body.append(g(card('RAS water volume vs parasite prevalence', wat.days.length ? h('div', {}, barChart({ labels: wat.days.map(d => shortD(d)), series: [{ name: 'Water added (L)', values: wat.vol, color: PAL[3] }], xTitle: 'Date', yTitle: 'Water added (L)', fmt: v => v.toFixed(0) }),
      lineChart({ labels: wat.days.map(d => shortD(d)), series: [{ name: 'Prevalence', values: wat.prev }], xTitle: 'Date', yTitle: 'Parasite prevalence (%)', min: 0, fmt: v => (v * 100).toFixed(0) + '%' }),
      h('div', { class: 'note' }, wat.r == null ? 'Not enough paired days to correlate.' : `Correlation r = ${wat.r.toFixed(2)} across ${wat.n} days (${Math.abs(wat.r) < 0.4 ? 'weak' : Math.abs(wat.r) < 0.7 ? 'moderate' : 'strong'} ${wat.r < 0 ? 'negative' : 'positive'} relationship).`)) : noData()),
      card('3-day recount survival by hapa', d3.total ? barChart({ labels: d3.units, series: [{ name: 'Survival', values: d3.values }], xTitle: 'Pond-Hapa unit', yTitle: '3-day survival (%)', valueLabels: true, maxLabels: 30, min: 0, fmt: v => (v * 100).toFixed(0) + '%', target: 0.97, targetLabel: '97%' }) : noData())));
    // 5 stocking + transfers
    body.append(g(card('Stocking numbers audit (weights in g, counts in pcs)', sn(st.asOf), table(['Date', 'ABW (g)', 'Required (g)', 'Target fry (pcs)', 'Actual (g)', 'Variance (%)', 'Est. stocked (pcs)', 'Diff. (pcs)'], st.map(r => [fmtDate(r.date), num(r.abw, 4), num(r.req, 0), num(r.target, 0), num(r.actual, 1), { v: pct(r.variance, 1), cls: Math.abs(r.variance) <= 0.05 ? 'good' : 'poor' }, num(r.est, 0), num(r.diff, 0)]), { num: [1, 2, 3, 4, 5, 6, 7] })),
      card('Incubation to pond transfer audit (morning stocking, temperatures in °C)', sn(tf.asOf), table(['Date', 'Time', 'Tray (°C)', 'Bucket, no fish (°C)', 'Bucket, with fish (°C)', 'Pond (°C)', 'Variance (°C, <2)'], tf.map(r => [fmtDate(r.date), r.time, `${num(r.tray[0])} – ${num(r.tray[1])}`, `${num(r.bwo[0])} – ${num(r.bwo[1])}`, `${num(r.bw[0])} – ${num(r.bw[1])}`, num(r.pond), { v: `${num(r.variance[0])} – ${num(r.variance[1])}`, cls: r.variance[1] < 2 && r.variance[0] > -2 ? 'good' : 'poor' }])))));
    // 6 eggs
    body.append(g(card('Egg stage separation rating', has(eg.trend) ? lineChart({ labels: eg.labels, series: [{ name: 'ABP rating (1–5)', values: eg.trend }], xTitle: 'ISO week', yTitle: 'ABP rating (1–5)', min: 0, max: 5, valueLabels: true }) : noData()),
      card(`Jars with mixed stages (${eg.low.filter(r => (r.mixed_h || 0) > 0).length} of the ${eg.low.length} jars rated 0–2 stars; ${eg.total} jars checked; heights in cm)`, sn(eg.jarsAsOf), table(['Date', 'Pond', 'Incubator', 'Total egg ht (cm)', 'Mixed (cm)', 'Overall (%)', 'Rating (stars)'], eg.low.filter(r => (r.mixed_h || 0) > 0).map(r => [fmtDate(r.date), r.pond, r.incubator, num(r.total_h), { v: num(r.mixed_h), cls: (r.mixed_h || 0) > 0 ? 'redtxt' : '' }, pct(r.overall), { v: r.star, cls: 'poor' }])))));
    // 7 flips, bottom rope, exchange
    {   // pond preparation scoring: latest record per pond, flipped in the selected week's month, lowest overall first
      const mon = weekRange(y, w).sun.toISOString().slice(0, 7), latest = new Map();
      for (const r of data.pond_prep_scoring || []) if (String(r.flipping_date).slice(0, 7) === mon) { const c = latest.get(r.pond); if (!c || String(r.flipping_date) > String(c.flipping_date)) latest.set(r.pond, r); }
      const pp = [...latest.values()].sort((a, b) => (a.overall_score ?? 9) - (b.overall_score ?? 9));
      const sb = v => v == null ? '–' : { v: pct(v, 0), cls: band(v, 0.91, 0.75) };
      body.append(h('div', { class: 'mt' }, card(`Pond preparation scoring (${pp.length} pond${pp.length === 1 ? '' : 's'} flipped this month)`,
        table(['Pond', 'Flipped', 'Stocked', 'Preparation (%)', 'Water quality (%)', 'Post-stocking (%)', 'Overall (%)', 'Rating (0–5)', 'Action points'],
          pp.map(r => [r.pond, fmtDate(r.flipping_date), r.stocking_date ? fmtDate(r.stocking_date) : '–', sb(r.prep_score), sb(r.wq_score), sb(r.post_score), sb(r.overall_score), r.rating ?? '–', r.action_points || '–']), { empty: 'No scored ponds this month' }),
        h('div', { class: 'note' }, 'Preparation = average of 9 stage scores (KPIs met ÷ 5). Overall = average of preparation and post-stocking. Rating bands: <75% = 1, 75–80% = 2, 81–90% = 3, 91–95% = 4, 96–99% = 4.5, 100% = 5.'))));
    }
    body.append(g(...[['broodstock', 'Broodstock ponds'], ['nursery', 'Nursery ponds']].map(([k, label]) => {
      const { st, ponds } = fl.matrix[k]; const P = ponds.slice(0, 14);
      if (!P.length) return card(`Pond flipping: ${label}`, noData('No ponds in progress'));
      const rows = st.map(x => [x.name, x.expected, ...P.map(r => { const v = r.stage_days?.[x.name]; return v == null || v < 0 ? '-' : { v, cls: v > x.expected ? 'late' : '' }; })]);
      return card(`Pond flipping: ${label}: days per stage`, table(['Stage', 'Expected (days)', ...P.map(r => r.pond)], rows, { num: P.map((_, i) => i + 1) }),
        h('div', { class: 'note' }, 'Red = more days than expected. A pond leaves this list automatically once its last stage has run its expected days.'));
    })));
    body.append(g(card('Pond flipping: ponds in progress (all weeks)', table(A.flipHead, fl.progress.map(r => A.flipRow(r, fmtDate)), { empty: 'No ponds in progress' })),
      card('Hapa exchange compliance (exchanged / scheduled, %)', has(hx.nursery.trend) || has(hx.broodstock.trend)
        ? h('div', {}, lineChart({ labels: hx.labels, series: [{ name: 'Nursery (PNS)', values: hx.nursery.trend, color: '#CB8306' }, { name: 'Broodstock (BS)', values: hx.broodstock.trend, color: '#0E812E' }], xTitle: 'ISO week', yTitle: 'Exchanged / scheduled (%)', min: 0.5, max: 1.1, joinGaps: true, fmt: v => (v * 100).toFixed(0) + '%', valueLabels: hx.labels.length <= 14 }),
          ...[['Nursery (PNS)', hx.nursery], ['Broodstock (BS)', hx.broodstock]].map(([nm, u]) => h('div', { class: 'note' }, u.current != null ? `${nm}: ${pct(u.current, 1)} this week` : u.last ? `${nm}: no exchanges scheduled this week; last recorded week ${u.last.w} at ${pct(u.last.v, 1)}` : `${nm}: no exchanges recorded`)))
        : noData())));
    const bdNote = (bd, nm, l, f) => h('div', { class: 'note' }, bd.thisWeek && l && l.w === w ? `${nm}: ${f(l.v)} this week (${bd.hapas} hapas recounted)` : l ? `${nm}: no recounts this week; last recorded week ${l.w} at ${f(l.v)}` : `${nm}: no data`);
    const bdCards = bd => { const P = a => a.map(v => v == null ? null : v / 1), top = a => Math.max(1.2, Math.ceil(Math.max(...a.filter(v => v != null)) * 10) / 10 + 0.1);
      const sr = bd.ratio.map(v => v == null ? null : v / A.SEX_TARGET), de = bd.density.map(v => v == null ? null : v / bd.target_density);
      return g(card('Broodstock sex ratio (% of the 3:1 standard)', has(sr)
        ? h('div', {}, lineChart({ labels: bd.labels, series: [{ name: 'Sex ratio (% of 3:1)', values: sr, color: '#0E812E' }, { name: 'Standard (3:1 = 100%)', values: bd.labels.map(() => 1), color: '#C0392B' }], xTitle: 'ISO week', yTitle: 'Sex ratio (% of standard)', min: 0.5, max: top(sr), joinGaps: true, fmt: v => (v * 100).toFixed(0) + '%', valueLabels: bd.labels.length <= 14 }), bdNote(bd, 'Sex ratio', bd.lastRatio, v => pct(v / A.SEX_TARGET, 1) + ' of standard (' + v.toFixed(2) + ':1)'))
        : noData()),
      card('Broodstock stocking density (% of target)', has(de)
        ? h('div', {}, lineChart({ labels: bd.labels, series: [{ name: 'Stocking density (% of target)', values: de, color: '#CB8306' }, { name: `Target (${bd.target_density} kg/m² = 100%)`, values: bd.labels.map(() => 1), color: '#C0392B' }], xTitle: 'ISO week', yTitle: 'Stocking density (% of target)', min: 0, max: top(de), joinGaps: true, fmt: v => (v * 100).toFixed(0) + '%', valueLabels: bd.labels.length <= 14 }), bdNote(bd, 'Stocking density', bd.lastDensity, v => pct(v / bd.target_density, 1) + ' of target (' + v.toFixed(2) + ' kg/m²)'))
        : noData())); };
    const skNote = (nm, u) => h('div', { class: 'note' }, u.last ? (u.last.w === w ? `${nm}: ${pct(u.last.v, 1)} of the ${u.std}-sinker standard this week (average ${u.last.avg.toFixed(1)} sinkers per hapa; ${u.short} of ${u.hapas} hapas below ${u.std})` : `${nm}: no sinker counts this week; last recorded week ${u.last.w} at ${pct(u.last.v, 1)} (average ${u.last.avg.toFixed(1)} per hapa)`) : `${nm}: no sinker counts recorded`);
    body.append(card('Sinkers per hapa (% of standard: broodstock 10, nursery 4)', has(sk.nursery.trend) || has(sk.broodstock.trend)
      ? h('div', {}, lineChart({ labels: sk.labels, series: [{ name: 'Nursery (PNS), 4 sinkers', values: sk.nursery.trend, color: '#CB8306' }, { name: 'Broodstock (BS), 10 sinkers', values: sk.broodstock.trend, color: '#0E812E' }, { name: 'Standard (100%)', values: sk.labels.map(() => 1), color: '#C0392B' }], xTitle: 'ISO week', yTitle: 'Sinkers vs standard (%)', min: 0, max: 1.1, joinGaps: true, fmt: v => (v * 100).toFixed(0) + '%', valueLabels: sk.labels.length <= 14 }), skNote('Nursery', sk.nursery), skNote('Broodstock', sk.broodstock))
      : noData()));
    body.append(h('div', { class: 'note', style: 'text-align:right;opacity:.6' }, 'App version: ' + (new URL(import.meta.url).searchParams.get('v') || 'dev')));
    const holder = h('div', {}, g(card('Broodstock sex ratio and stocking density', h('div', { class: 'note' }, 'Loading broodstock recounts…'))));   // loaded after the page appears so the dashboard opens fast
    body.append(holder); const tok = body._tok = (body._tok || 0) + 1;
    ensure(['broodstock_density'], S.week.y, true).then(() => { if (body._tok !== tok) return; const bd = A.broodDensity(data, y, w); holder.replaceChildren(bdCards(bd));
      const old = (l, f, hit) => l && !(bd.thisWeek && l.w === w) ? `last recount: wk ${l.w}` : l ? `${bd.hapas} hapas recounted` : 'no recounts';
      kpiSR.replaceWith(kpi('Broodstock sex ratio', bd.lastRatio ? bd.lastRatio.v.toFixed(2) + ':1' : '–', { cls: 'cyan', note: bd.lastRatio ? `${pct(bd.lastRatio.v / A.SEX_TARGET, 0)} of 3:1 · ${old(bd.lastRatio)}` : 'no recounts', good: bd.lastRatio ? Math.abs(bd.lastRatio.v / A.SEX_TARGET - 1) <= 0.1 : null }));
      kpiSD.replaceWith(kpi('Broodstock stocking density', bd.lastDensity ? bd.lastDensity.v.toFixed(2) + ' kg/m²' : '–', { cls: 'gold', note: bd.lastDensity ? `${pct(bd.lastDensity.v / bd.target_density, 0)} of target · ${old(bd.lastDensity)}` : 'no recounts', good: bd.lastDensity ? Math.abs(bd.lastDensity.v / bd.target_density - 1) <= 0.1 : null })); relabel(body, S.period); });
    body.append(g(...['Nursery', 'Broodstock'].map(k => card(`Bottom rope non-conformance: ${k}`, has(br[k].trend) ? barChart({ labels: br[k].labels, series: [{ name: '% hapas failed the audit', values: br[k].trend }], xTitle: 'ISO week', yTitle: 'Hapas failed the audit (%)', min: 0, fmt: v => (v * 100).toFixed(0) + '%', valueLabels: true, maxLabels: 30 }) : noData(),
      br[k].ponds.length ? sn(br[k].asOf) : null, br[k].ponds.length ? table(['Pond', 'Hapas audited (no.)', 'Hapas failed (no.)'], br[k].ponds.map(p => [p.pond, p.audited, { v: p.failed, cls: p.failed ? 'poor' : 'good' }]), { num: [1, 2] }) : null))));
    relabel(body, S.period);
  };
  weekPicker(ctx, raw, draw);
  view.append(body); draw();
}
