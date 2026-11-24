import { h, clear, pct, num, fmtDate, toast, download, weekRange } from '../util.js?v=202611241413';
import { S, ensure } from '../state.js?v=202611241413';
import { periodize, periodLabel, relabel } from '../period.js?v=202611241413';
import { wsFrequencyBlock } from './wsfreq.js?v=202611241413';
import { sinkersBlock, srEffBlock, srFeedBlock, washBlock, flipMatrixBlocks, flipSummaryCharts, summaryKpis } from './blocks.js?v=202611241413';
const sinceYear = () => S.week.y - (S.week.w <= (S.period === 'week' ? 12 : S.period === 'month' ? 3 : 30) ? 1 : 0);   // trends read the selected year; the previous year is only needed in the first weeks
import { db } from '../db.js?v=202611241413';
import * as A from '../analytics.js?v=202611241413';
import { lineChart, barChart, PAL } from '../charts.js?v=202611241413';
const shortD = d => { const t = new Date(d + 'T00:00:00Z'); return t.getUTCDate() + '/' + (t.getUTCMonth() + 1); };
import { weekPicker, table, band, bioTable } from './common.js?v=202611241413';

const KEYS = ['workstation_audits', 'biosecurity_audits', 'parasitology_samples', 'ras_water_volume', 'ras_parasite_prevalence', 'day3_recounts', 'stocking_audits', 'fry_transfers', 'egg_separation_ratings', 'egg_volumetric_jars', 'pond_flips', 'bottom_rope_audits', 'hapa_exchanges', 'broodstock_density', 'pond_prep_scoring', 'sr_efficiency', 'sex_reversal_feed', 'hapa_wash_dispatch'];
const CFG = window.BPM_CONFIG || {};
const has = a => a.some(v => v != null);
const pc0 = v => (v * 100).toFixed(0) + '%';
// Section list = slide order of the weekly deck.
const SECTIONS = [
  { key: 'workstation', title: 'Incubation Workstation Compliance', slide: 2, an: (d, y, w) => ({ ...A.workstation(d, y, w), freq: A.wsFrequency(d, y, w) }),
    body: a => [has(a.trend) ? lineChart({ labels: a.labels, series: [{ name: 'Compliance', values: a.trend }], xTitle: 'ISO week', yTitle: 'Compliance (%)', min: 0, max: 1, fmt: pc0, target: 1, targetLabel: '100%', h: 190 }) : null, sn(a.ncAsOf), table(['Date', 'RAS', 'Score', 'Island', 'Reason'], a.nc.slice(0, 6).map(r => [fmtDate(r.audit_date), r.ras, pct(r.score), r.noncompliant_island, r.reason])), h('h3', {}, 'Non-conformances by incubation (all weeks)'), wsFrequencyBlock(a.freq)] },
  { key: 'biosecurity', title: 'Biosecurity and Hygiene', slide: 3, an: (d, y, w) => A.biosecurity(d, y, w),
    body: a => [bioTable(a, pct), has(a.overall) ? lineChart({ labels: a.labels, series: [{ name: 'Overall rating', values: a.overall }], xTitle: 'ISO week', yTitle: 'Biosecurity score (%)', min: 0, max: 1, fmt: v => (v * 100).toFixed(0) + '%', area: true, joinGaps: true, valueLabels: true, maxLabels: 30, w: 760, h: 210 }) : null] },
  { key: 'bio_photos', title: 'Biosecurity: audit photos', slide: 4, photos: 4, an: () => ({}), body: () => [] },
  { key: 'parasitology', title: 'Incubation Parasitology', slide: 5, an: (d, y, w) => A.parasitology(d, y, w, 'RAS2', 'stage'),
    body: a => [a.series.length ? lineChart({ labels: a.labels, series: a.series.map((s, i) => ({ name: s.key, values: s.prev, color: PAL[i % 6] })), xTitle: 'ISO week', yTitle: 'Prevalence (%)', min: 0, fmt: pc0, h: 190, title: 'Prevalence (RAS2, by stage)' }) : null, a.series.length ? lineChart({ labels: a.labels, series: a.series.map((s, i) => ({ name: s.key, values: s.int, color: PAL[i % 6] })), xTitle: 'ISO week', yTitle: 'Parasites per infected sample', min: 0, h: 190, title: 'Intensity' }) : null] },
  { key: 'ras_water', title: 'RAS Water Volume vs Parasite Prevalence', slide: 6, an: (d, y, w) => A.water(d, y, w),
    body: a => [a.days.length ? barChart({ labels: a.days.map(x => shortD(x)), series: [{ name: 'Water (L)', values: a.vol, color: PAL[3] }], xTitle: 'Date', yTitle: 'Water added (L)', h: 190 }) : null, a.days.length ? lineChart({ labels: a.days.map(x => shortD(x)), series: [{ name: 'Prevalence', values: a.prev }], xTitle: 'Date', yTitle: 'Parasite prevalence (%)', min: 0, fmt: pc0, h: 190 }) : null] },
  { key: 'day3', title: '3-Day Recount Survival', slide: 7, an: (d, y, w) => A.day3(d, y, w),
    body: a => [S.period === 'month' ? (a.trend.some(v => v != null) ? lineChart({ labels: a.trendLabels, series: [{ name: 'Average survival', values: a.trend }], xTitle: 'ISO week', yTitle: 'Average 3-day survival (%)', min: 0.5, max: 1.1, fmt: pc0, target: 0.97, targetLabel: '97%', joinGaps: true, valueLabels: true, h: 200 }) : null) : a.total ? barChart({ labels: a.units, series: [{ name: 'Survival', values: a.values }], xTitle: 'Pond-Hapa unit', yTitle: '3-day survival (%)', valueLabels: true, maxLabels: 30, min: 0, fmt: pc0, target: 0.97, targetLabel: '97%', h: 200 }) : null] },
  { key: 'stocking', title: 'Stocking Numbers Audit', slide: 8, an: (d, y, w) => A.stocking(d, y, w),
    body: a => [sn(a.asOf), table(['Date', 'ABW (g)', 'Required (g)', 'Target (pcs)', 'Actual (g)', 'Var. (%)', 'Est. (pcs)', 'Diff. (pcs)'], a.map(r => [fmtDate(r.date), num(r.abw, 4), num(r.req, 0), num(r.target, 0), num(r.actual, 1), pct(r.variance, 1), num(r.est, 0), num(r.diff, 0)]))] },
  { key: 'transfers', title: 'Incubation to Pond Transfer Audit (Morning stocking)', slide: 8, an: (d, y, w) => A.transfers(d, y, w),
    body: a => [sn(a.asOf), table(['Date', 'Time', 'Tray (°C)', 'Bucket no fish (°C)', 'Bucket with fish (°C)', 'Pond (°C)', 'Variance (°C)'], a.map(r => [fmtDate(r.date), r.time, `${num(r.tray[0])}–${num(r.tray[1])}`, `${num(r.bwo[0])}–${num(r.bwo[1])}`, `${num(r.bw[0])}–${num(r.bw[1])}`, num(r.pond), `${num(r.variance[0])}–${num(r.variance[1])}`]))] },
  { key: 'eggs', title: 'Egg Stage Separation Rating', slide: 9, an: (d, y, w) => A.eggs(d, y, w),
    body: a => [has(a.trend) ? lineChart({ labels: a.labels, series: [{ name: 'ABP rating', values: a.trend }], xTitle: 'ISO week', yTitle: 'ABP rating (1–5)', min: 0, max: 5, h: 190 }) : null, sn(a.jarsAsOf), table(['Date', 'Pond', 'Incubator', 'Total egg ht (cm)', 'Mixed (cm)', 'Stars'], a.low.filter(r => (r.mixed_h || 0) > 0).map(r => [fmtDate(r.date), r.pond, r.incubator, num(r.total_h), { v: num(r.mixed_h), cls: 'redtxt' }, r.star]))] },
  { key: 'flipping', title: 'Pond Flipping (delayed ponds: days late)', slide: 10, an: (d, y, w) => A.flips(d, y, w),
    body: a => [table(A.flipHead, a.progress.filter(r => r.over.length).slice(0, 8).map(r => A.flipRow(r, fmtDate)), { empty: 'No delayed ponds' }), ...flipSummaryCharts(a), ...flipMatrixBlocks(a, fmtDate)] },
  { key: 'flip_photos', title: 'Pond Flipping: photos', slide: 11, photos: 4, an: () => ({}), body: () => [] },
  { key: 'prep_scoring', title: 'Pond Preparation Scoring', slide: 12, an: (d, y, w) => A.prepScoring(d, y, w, weekRange(y, w).sun.toISOString()),
    body: a => [table(['Pond', 'Flipped', 'Preparation (%)', 'Water quality (%)', 'Post-stocking (%)', 'Overall (%)', 'Rating (0-5)'], a.slice(0, 12).map(r => [r.pond, fmtDate(r.flipping_date), ...[r.prep_score, r.wq_score, r.post_score, r.overall_score].map(v => v == null ? '–' : pc0(v)), r.rating ?? '–']), { empty: 'No ponds scored this month' })] },
  { key: 'bottom_rope', title: 'Bottom Rope Non-Conformance (Nursery & Broodstock)', slide: 13, an: (d, y, w) => A.bottomRope(d, y, w),
    body: a => ['Nursery', 'Broodstock'].map(k => has(a[k].trend) ? barChart({ labels: a[k].labels, series: [{ name: '% hapas failed the audit', values: a[k].trend }], xTitle: 'ISO week', yTitle: 'Hapas failed the audit (%)', min: 0, fmt: pc0, maxLabels: 30, h: 190, title: 'Bottom rope non-conformance: ' + k }) : null) },
  { key: 'rope_analysis', title: 'Bottom Rope Conformance and Failure Analysis', slide: 13, an: (d, y, w) => A.ropeAnalysis(d, y, w),
    body: a => [Object.values(a.lines).some(has) ? lineChart({ labels: a.labels, series: [{ name: 'Nursery', values: a.lines.Nursery, color: '#CB8306' }, { name: 'Broodstock', values: a.lines.Broodstock, color: '#0E812E' }], xTitle: 'ISO week', yTitle: 'Hapas conforming (%)', min: 0, max: 1, joinGaps: true, fmt: pc0, h: 200 }) : null,
      table(['Unit', 'Pond', 'Hapa', 'Failed audit metrics (ropes)'], ['Nursery', 'Broodstock'].flatMap(k => a.kinds[k].hapas.slice(0, 8).map(x => [k, x.pond, x.hapa, x.metrics.map(m => `${m[0]} (${m[1]})`).join(', ')])), { empty: 'No failed hapas' })] },
  { key: 'hapa_exchange', title: 'Hapa Exchange Compliance', slide: 14, an: (d, y, w) => A.hapaExchange(d, y, w),
    body: a => [has(a.nursery.trend) || has(a.broodstock.trend) ? lineChart({ labels: a.labels, series: [{ name: 'Nursery (PNS)', values: a.nursery.trend, color: '#CB8306' }, { name: 'Broodstock (BS)', values: a.broodstock.trend, color: '#0E812E' }], xTitle: 'ISO week', yTitle: 'Exchanged / scheduled (%)', min: 0.5, max: 1.1, joinGaps: true, fmt: pc0, h: 200 }) : null,
      h('div', { class: 'note' }, [['Nursery (PNS)', a.nursery], ['Broodstock (BS)', a.broodstock]].map(([nm, u]) => u.current != null ? `${nm}: ${pc0(u.current)}` : u.last ? `${nm}: none this week (last: wk ${u.last.w}, ${pc0(u.last.v)})` : `${nm}: no data`).join('   ·   '))] },
  { key: 'brood_density', title: 'Broodstock Stocking Density and Sex Ratio', slide: 15, an: (d, y, w) => A.broodDensity(d, y, w),
    body: a => { const sr = a.ratio.map(v => v == null ? null : v / A.SEX_TARGET), de = a.density.map(v => v == null ? null : v / a.target_density), one = a.labels.map(() => 1);
      return [has(sr) ? lineChart({ labels: a.labels, series: [{ name: 'Sex ratio (% of 3:1)', values: sr, color: '#0E812E' }, { name: 'Standard', values: one, color: '#C0392B' }], xTitle: 'ISO week', yTitle: 'Sex ratio (% of standard)', min: 0, joinGaps: true, fmt: pc0, h: 190 }) : null,
        has(de) ? lineChart({ labels: a.labels, series: [{ name: 'Density (% of target)', values: de, color: '#CB8306' }, { name: 'Target', values: one, color: '#C0392B' }], xTitle: 'ISO week', yTitle: 'Stocking density (% of target)', min: 0, joinGaps: true, fmt: pc0, h: 190 }) : null]; } },
  { key: 'sinkers', title: 'Bottom Rope Sinkers (% of standard)', slide: 13, an: (d, y, w) => A.sinkers(d, y, w), body: a => [sinkersBlock(a, { h: 200 })] },
  { key: 'sr_efficiency', title: 'Sex Reversal (Male Conversion) Efficiency', slide: 16, an: (d, y, w) => A.srEfficiency(d, y, w), body: a => srEffBlock(a, { h: 190 }) },
  { key: 'sr_feed', title: 'Sex Reversal Feed Audit', slide: 17, an: (d, y, w) => A.srFeed(d, y, w), body: a => srFeedBlock(a, { h: 105 }) },
  { key: 'hapa_wash', title: 'Hapas Received, Washed and Dispatched', slide: 18, an: (d, y, w) => A.hapaWash(d, y, w), body: a => washBlock(a, { h: 190 }) },
];
const sn = a => { const t = A.asOfNote(a, S.week.w); return t ? h('div', { class: 'note stale' }, t) : null; };
const STATUS = { draft: 'Draft', in_review: 'In review', approved: 'Approved', exported: 'Exported' };

export async function render({ view, ctx }) {
  const raw = await ensure(KEYS, sinceYear(), true); const body = h('div', {});
  const draw = async () => {
    await ensure(KEYS, sinceYear(), true);
    clear(body); const { y, w } = S.week; const data = periodize(raw, S.period); const isAdmin = db.user.role === 'admin', canEdit = ['admin', 'reviewer', 'auditor'].includes(db.user.role);
    try { body.append(summaryKpis(data, y, w)); } catch (e) { console.error(e); }
    if (S.period !== 'week') {      // monthly / daily view: a read-only preview of the same slides for that month or day (nothing is saved; PowerPoint export and approval stay weekly)
      const lbl = periodLabel(S.period, y, w), kind = S.period === 'month' ? 'Monthly' : 'Daily';
      body.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, `${kind} report: ${lbl}`), h('span', { class: 'sp' }), h('button', { class: 'btn sec', onclick: () => window.print() }, 'Print / save as PDF')),
        h('p', { class: 'muted' }, `Every slide below is calculated from the records dated in ${lbl}; trend charts run across the ${S.period === 'month' ? 'months' : 'days'} of the year. Comments are drafted from the data. PowerPoint export and approval stay on the Weekly view.`)));
      for (const s of SECTIONS.filter(x => !x.photos)) { const a = s.an(data, y, w); body.append(h('div', { class: 'slide' }, h('h3', {}, s.title), h('div', { class: 'sbody' }, h('div', {}, ...s.body(a)), h('div', {}, h('div', { class: 'sbox' }, h('p', {}, A.draftComment(s.key, a))))))); }
      relabel(body, S.period); return;
    }
    let R = await db.report(y, w, false); const calc = Object.fromEntries(SECTIONS.map(s => [s.key, s.an(data, y, w)]));
    if (!R) { body.append(h('div', { class: 'card' }, h('h2', {}, `No report for Week ${w}, ${y} yet`), h('p', { class: 'muted' }, 'Creating a report drafts comments from the data. You can edit every comment, add photos and attach analysed graphs.'), canEdit ? h('button', { class: 'btn', onclick: async () => { await db.report(y, w, true); await db.audit('create', 'report', `${y}-${w}`); draw(); } }, `Create Week ${w} report`) : null)); return; }
    R.auto = await autoPhotos(data, y, w);
    const { report } = R, locked = ['approved', 'exported'].includes(report.status);
    const secState = key => R.sections.find(s => s.section_key === key) || { comment: null, include: true };
    // status bar
    const nextBtns = [];
    if (!locked && canEdit && report.status === 'draft') nextBtns.push(h('button', { class: 'btn sec', onclick: () => step('in_review') }, 'Send for review'));
    if (isAdmin && report.status === 'in_review') nextBtns.push(h('button', { class: 'btn', onclick: () => step('approved') }, 'Approve'));
    if (isAdmin && locked) nextBtns.push(h('button', { class: 'btn sec', onclick: () => step('draft') }, 'Re-open as draft'));
    async function step(st) { await db.setStatus(report.id, st); await db.audit(st === 'approved' ? 'approve' : 'status', 'report', `${y}-${w}`, { status: st }); draw(); }
    const gen = h('button', { class: 'btn', disabled: !isAdmin || report.status !== 'approved', title: isAdmin ? (report.status === 'approved' ? '' : 'Approve the report first') : 'Only an administrator can export', onclick: () => generate(report) }, 'Generate PPT');
    body.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, `Week ${w} report`), h('span', { class: 'pill ' + (report.status === 'approved' || report.status === 'exported' ? 'ok' : 'warn') }, STATUS[report.status]), h('span', { class: 'sp' }), nextBtns, h('button', { class: 'btn sec', onclick: () => pack(R, calc) }, 'Download data pack (JSON)'), gen),
      h('p', { class: 'muted' }, 'Slides follow the weekly deck order. Edit the comment under each slide, add photos or attach your analysed graph; use the tick to leave a slide out. Only an administrator can approve and export.')));
    const slides = h('div', {}); body.append(slides);
    for (const s of SECTIONS) {
      const st = secState(s.key), a = calc[s.key]; const draft = A.draftComment(s.key, a);
      const text = h('textarea', { disabled: locked || !canEdit, 'aria-label': `Comment for ${s.title}`, rows: 3 }); text.value = st.comment ?? draft;
      let t; text.oninput = () => { clearTimeout(t); t = setTimeout(() => db.saveSection(report.id, s.key, { comment: text.value }).then(() => { st.comment = text.value; }), 700); };
      const inc = h('input', { type: 'checkbox', checked: st.include !== false, disabled: locked || !canEdit, onchange: e => db.saveSection(report.id, s.key, { include: e.target.checked }) });
      const prev = h('div', { class: 'slide' }, h('h3', {}, s.title), h('div', { class: 'sbody' }, s.photos ? photoGrid(R, s, locked || !canEdit, draw) : h('div', {}, ...s.body(a)), ...(s.photos ? [] : [h('div', {}, h('div', { class: 'sbox' }, h('ul', {}, (st.comment ?? draft).split('\n').filter(Boolean).map(l => h('li', {}, l)))))])),
        h('img', { class: 'slogo', src: 'assets/victoryfarms-logo.png', alt: '' }), h('div', { class: 'sfoot' }, 'Victory Farms Confidential'), h('div', { class: 'sno' }, s.slide));
      const graph = R.images.find(i => i.section_key === s.key && i.kind === 'analysed_graph');
      slides.append(h('details', { class: 'sec', open: s.key === 'workstation' }, h('summary', {}, h('span', {}, `Slide ${s.slide}: ${s.title}`), h('span', { class: 'sp' }), h('label', { class: 'muted', onclick: e => e.stopPropagation() }, inc, ' include')),
        h('div', { class: 'inner' }, prev, s.photos ? null : h('div', {}, h('label', { class: 'f' }, 'Comment (editable, auto-drafted from the data)', text),
          h('div', { class: 'row mt' }, h('span', { class: 'muted' }, 'Analysed graph from PowerPoint/Excel (replaces the chart on the slide):'), uploadBtn(R, s.key, 1, 'analysed_graph', graph, locked || !canEdit, draw))))));
    }
  };
  weekPicker(ctx, raw, draw); view.append(body); await draw();
}

function uploadBtn(R, key, slot, kind, existing, disabled, redraw) {
  const f = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
  f.onchange = async () => { const file = f.files[0]; if (!file) return; if (file.size > 8e6) return toast('Image is over 8 MB', true); try { await db.putImage(R.report.id, key, slot, kind, file); await db.audit('upload', 'report_image', `${key}:${slot}`); redraw(); } catch (e) { toast(e.message, true); } };
  return h('span', { class: 'row' }, f, h('button', { class: 'btn sec sm', disabled, onclick: () => f.click() }, existing ? 'Replace graph' : 'Upload graph (PNG/JPG)'), existing ? h('span', { class: 'pill ok' }, existing.caption || 'attached') : null,
    existing && !disabled ? h('button', { class: 'btn sec sm', onclick: async () => { await db.removeImage(existing); redraw(); } }, 'Remove') : null);
}
// Photo label "Pond, Status, dd/mm/yyyy" printed under the photo in the exported slide.
function captionBar(im, disabled) {
  const parts = (im.caption || '').split(',').map(x => x.trim()); const m = parts.length && /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(parts[parts.length - 1]);
  let date = '', pond = '', status = '';
  if (m) { date = `${m[3]}-${m[2]}-${m[1]}`; parts.pop(); pond = parts.shift() || ''; status = parts.join(', '); }
  else if (/\.(jpe?g|png|webp)$/i.test(im.caption || '')) { /* old file-name caption: ignore */ } else { pond = parts.shift() || ''; status = parts.join(', '); }
  const P = h('input', { class: 'cap', placeholder: 'Pond', value: pond, disabled, maxlength: 20 }), S = h('input', { class: 'cap', placeholder: 'Status', value: status, disabled, maxlength: 40 }), D = h('input', { class: 'cap', type: 'date', value: date, disabled });
  let t; const save = () => { clearTimeout(t); t = setTimeout(async () => { const [y, mo, d] = D.value ? D.value.split('-') : []; const cap = [P.value.trim(), S.value.trim(), D.value ? `${d}/${mo}/${y}` : ''].filter(Boolean).join(', '); try { await db.setCaption(im, cap); im.caption = cap; } catch (e) { toast(e.message, true); } }, 500); };
  [P, S, D].forEach(i => i.addEventListener('input', save));
  return h('div', { class: 'capbar' }, P, S, D);
}
// Picture grids fill themselves: biosecurity = photos taken in the Biosecurity dashboard that week; flipping = latest photo of each pond in progress.
async function autoPhotos(data, y, w) {
  const out = { bio_photos: [], flip_photos: [] };
  const r = weekRange(y, w);
  try { out.bio_photos = (await db.hygienePhotos()).filter(p => String(p.photo_date).slice(0, 10) >= r.monIso && String(p.photo_date).slice(0, 10) <= r.sunIso).reverse().map(p => ({ caption: A.hygieneCaption(p), get: () => db.hygienePhotoUrl(p) })); } catch { }
  try { out.bio_photos.push(...A.pickBioPhotos(await db.bioPhotos(r.monIso, r.sunIso), 40).map(p => ({ ...p, get: () => db.bioPhotoUrl(p.path) }))); } catch { }
  try { out.flip_photos = A.pickPondPhotos(data, y, w, await db.pondPhotos()).map(p => ({ caption: p.caption, get: () => db.pondPhotoUrl(p.row) })); } catch { }
  return out;
}
function photoGrid(R, s, disabled, redraw) {
  const grid = h('div', { class: 'slots', style: 'grid-template-columns:repeat(2,1fr);flex:1' });
  for (let slot = 1; slot <= 4; slot++) {
    const im = R.images.find(i => i.section_key === s.key && i.slot === slot && i.kind === 'photo');
    const au = !im && (R.auto?.[s.key] || [])[slot - 1];
    const f = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
    const box = h('div', { class: 'slot', tabindex: 0, role: 'button', 'aria-label': `Photo ${slot}`, onclick: e => { if (!disabled && e.target.tagName !== 'BUTTON') f.click(); } }, f, h('span', {}, im ? '' : `+ Photo ${slot}`));
    f.onchange = async () => { const file = f.files[0]; if (!file) return; try { await db.putImage(R.report.id, s.key, slot, 'photo', file); await db.audit('upload', 'report_image', `${s.key}:${slot}`); redraw(); } catch (e) { toast(e.message, true); } };
    if (im) { const img = h('img', { alt: im.caption || `Photo ${slot}` }); db.imageUrl(im).then(u => { img.src = u; }); box.append(img); if (im.caption && !/\.(jpe?g|png|webp)$/i.test(im.caption)) box.append(h('span', { class: 'pcap' }, im.caption)); if (!disabled) box.append(h('button', { class: 'btn danger sm', style: 'position:absolute;right:4px;top:4px;z-index:2', onclick: async e => { e.stopPropagation(); await db.removeImage(im); redraw(); } }, '✕')); }
    if (au) { box.classList.add('auto'); box.querySelector('span').textContent = ''; const img = h('img', { alt: au.caption }); au.get().then(u => { img.src = u; }).catch(() => { box.querySelector('span').textContent = 'Photo unavailable'; }); box.append(img, h('span', { class: 'autotag' }, 'Auto'), h('span', { class: 'pcap' }, au.caption)); }
    const wrap = h('div', { class: 'slotwrap' }, box);
    if (im) wrap.append(captionBar(im, disabled)); 
    grid.append(wrap);
  }
  const more = (R.auto?.[s.key] || []).length - 4;
  if (more > 0) return h('div', {}, grid, h('div', { class: 'muted', style: 'margin-top:6px' }, `+${more} more photo${more > 1 ? 's' : ''} go on additional slides in the PowerPoint.`));
  return grid;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// The free-tier report service goes to sleep when idle and needs up to ~1.5 minutes to wake. While it is waking the browser sees a
// network error or a 502/503/504 with no CORS headers ("Failed to fetch"), so those cases are retried instead of reported straight away.
async function callReportService(body) {
  const waits = [0, 15000, 30000, 30000];   // pauses before each attempt
  for (let i = 0; i < waits.length; i++) {
    if (waits[i]) { toast(`The report service is waking up, trying again (${i}/${waits.length - 1})… this can take up to 2 minutes.`); await sleep(waits[i]); }
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 180000);
    try {
      const r = await fetch(CFG.REPORT_API_URL, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + db.tok }, body: JSON.stringify(body) });
      if (![502, 503, 504].includes(r.status)) return r;
    } catch { /* network error or timeout: retry */ } finally { clearTimeout(timer); }
  }
  let host = CFG.REPORT_API_URL; try { host = new URL(CFG.REPORT_API_URL).host; } catch { }
  throw new Error(`the report service (${host}) did not respond. Check that it is deployed and running in Render, that REPORT_API_URL in config.js is its exact address, and that ALLOWED_ORIGIN in Render is this site's address (${location.origin}).`);
}
async function generate(report) {
  if (!CFG.REPORT_API_URL) return toast('PPT service not connected yet. Set REPORT_API_URL in config.js (see README).', true);
  try {
    toast('Building the PowerPoint… the first request after idle can take up to a minute.');
    const r = await callReportService({ year: report.iso_year, week: report.iso_week, report_id: report.id });
    if (!r.ok) { const t = await r.text(); let m = t; try { m = JSON.parse(t).error || t; } catch { } throw new Error(m || r.statusText); }
    download(`VF_BP_Week_${report.iso_week}.pptx`, await r.blob()); await db.setStatus(report.id, 'exported'); await db.audit('export', 'report', `${report.iso_year}-${report.iso_week}`); const wn = r.headers.get('X-Report-Warnings'); toast(wn ? 'PowerPoint downloaded, but some sections were skipped: ' + wn : 'PowerPoint downloaded', !!wn);
  } catch (e) { toast('Export failed: ' + e.message, true); }
}
function pack(R, calc) {
  const out = { year: R.report.iso_year, week: R.report.iso_week, status: R.report.status, sections: SECTIONS.map(s => ({ key: s.key, title: s.title, include: (R.sections.find(x => x.section_key === s.key) || {}).include !== false, comment: (R.sections.find(x => x.section_key === s.key) || {}).comment ?? A.draftComment(s.key, calc[s.key]) })), analytics: calc };
  download(`BP_Week_${out.week}_${out.year}_datapack.json`, new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
}
