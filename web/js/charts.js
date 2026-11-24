import { S } from './state.js?v=202611241413';
import { periodWord } from './period.js?v=202611241413';
// Dependency-free SVG charts in the Victory Farms palette.
// Bars never use red (red is reserved for targets / non-compliance markers): their own palette, in order
export const BARPAL = ['#0E812E', '#CB8306', '#00BDF0', '#3B6FD4', '#9B59D0', '#14A3A3'];
export const PAL = ['#0E812E', '#CB8306', '#D7263D', '#00BDF0', '#3B6FD4', '#9B59D0'];
const NS = 'http://www.w3.org/2000/svg';
const el = (t, a = {}, txt) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; };
const fmtDef = v => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/\.0+$/, '');

function frame(o) {
  const W = o.w || 520, H = (o.h || 250) + (o.xTitle ? 18 : 0), m = { t: 14, r: 14, b: (o.labels.length > 9 ? 44 : 30) + (o.xTitle ? 18 : 0), l: o.yTitle ? 60 : 44 };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': o.title || 'chart' });
  const vals = o.series.flatMap(s => s.values).filter(v => v != null && !Number.isNaN(v));
  if (o.target != null) vals.push(o.target);
  if (o.line) vals.push(...o.line.values.filter(v => v != null));
  let lo = o.min ?? Math.min(0, ...vals), hi = o.max ?? Math.max(...vals, 0.0001);
  if (o.stacked) hi = o.max ?? Math.max(...o.labels.map((_, i) => o.series.reduce((s, x) => s + (x.values[i] || 0), 0)), 0.0001);
  if (o.max == null) {                                   // round the top up to a tidy tick step (e.g. 0, 25, 50, 75, 100 %)
    const raw = (hi - lo) / 4 || 0.25, pw = Math.pow(10, Math.floor(Math.log10(raw))), nz = [1, 2, 2.5, 5, 10].find(k => k * pw >= raw * 1.0001) * pw;
    hi = lo + Math.ceil((hi - lo) / nz - 1e-9) * nz; if (hi - lo < nz * 4) hi = lo + nz * 4;
  }
  if (lo === hi) hi = lo + 1;
  const iw = W - m.l - m.r, ih = H - m.t - m.b, y = v => m.t + ih - (v - lo) / (hi - lo) * ih;
  const f = o.fmt || fmtDef;
  for (let i = 0; i <= 4; i++) {
    const v = lo + (hi - lo) * i / 4;
    svg.append(el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'gl' }), el('text', { x: m.l - 6, y: y(v) + 3, 'text-anchor': 'end', fill: '#555' }, f(v)));
  }
  const step = Math.ceil(o.labels.length / (o.maxLabels || 14));
  // axis titles (every chart carries both)
  if (o.xTitle) svg.append(el('text', { x: m.l + iw / 2, y: H - 6, 'text-anchor': 'middle', fill: '#222', 'font-weight': 700 }, o.xTitle === 'ISO week' ? periodWord[S.period] || o.xTitle : o.xTitle));
  if (o.yTitle) svg.append(el('text', { transform: `translate(13,${m.t + ih / 2}) rotate(-90)`, 'text-anchor': 'middle', fill: '#222', 'font-weight': 700 }, o.yTitle));
  return { svg, W, H, m, iw, ih, y, f, lo, hi, step };
}
function finish(c, o) {
  const { svg, m, y } = c;
  if (o.target != null) svg.append(el('line', { x1: m.l, x2: c.W - m.r, y1: y(o.target), y2: y(o.target), stroke: '#D7263D', 'stroke-dasharray': '5 4', 'stroke-width': 1.5 }), el('text', { x: c.W - m.r, y: y(o.target) - 4, 'text-anchor': 'end', fill: '#D7263D' }, o.targetLabel || 'Target'));
  const wrap = document.createElement('div'); wrap.className = 'chartbox';
  if (o.title) { const t = document.createElement('div'); t.className = 'chart-title'; t.textContent = o.title; wrap.append(t); }
  wrap.append(svg);
  if (o.series.length > 1 || o.legend) { const lg = document.createElement('div'); lg.className = 'legend'; o.series.forEach((s, i) => { const sp = document.createElement('span'); const sw = document.createElement('i'); sw.style.background = s.color || PAL[i % PAL.length]; sp.append(sw, s.name); lg.append(sp); }); wrap.append(lg); }
  return wrap;
}
export function lineChart(o) {
  const c = frame(o), { svg, m, iw, y, f } = c, n = o.labels.length, x = i => m.l + (n === 1 ? iw / 2 : i * iw / (n - 1));
  o.labels.forEach((l, i) => { if (i % c.step === 0 || i === n - 1) svg.append(el('text', { x: x(i), y: c.H - m.b + 15, 'text-anchor': 'middle', fill: '#444' }, l)); });
  o.series.forEach((s, k) => {
    const col = o.series.length === 1 ? PAL[0] : (s.color || PAL[k % PAL.length]); let d = '', pen = false;   // a single line is always Victory Farms green
    s.values.forEach((v, i) => { if (v == null || Number.isNaN(v)) { if (!o.joinGaps) pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    if (o.area && d) {                       // light shaded area under the line (the PPT biosecurity look); weeks without data are joined, not broken
      const pts = s.values.map((v, i) => v == null || Number.isNaN(v) ? null : [x(i), y(v)]).filter(Boolean);
      if (pts.length > 1) svg.append(el('path', { d: `M${pts[0][0].toFixed(1)},${y(c.lo).toFixed(1)}` + pts.map(q => `L${q[0].toFixed(1)},${q[1].toFixed(1)}`).join('') + `L${pts.at(-1)[0].toFixed(1)},${y(c.lo).toFixed(1)}Z`, fill: col, 'fill-opacity': 0.16, stroke: 'none' }));
    }
    svg.append(el('path', { d, fill: 'none', stroke: col, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }));
    s.values.forEach((v, i) => { if (v == null || Number.isNaN(v)) return; const p = el('circle', { cx: x(i), cy: y(v), r: 3.4, fill: col }); p.append(el('title', {}, `${s.name} · ${o.labels[i]}: ${f(v)}`)); svg.append(p); });
    if (o.valueLabels) s.values.forEach((v, i) => { if (v != null && !Number.isNaN(v)) svg.append(el('text', { x: x(i), y: y(v) - 7, 'text-anchor': 'middle', fill: col, 'font-weight': 700 }, f(v))); });
  });
  return finish(c, o);
}
export function barChart(o) {
  const c = frame(o), { svg, m, iw, y, f } = c, n = o.labels.length, gw = iw / n, k = o.stacked ? 1 : o.series.length, bw = Math.min(34, gw * 0.76 / k);
  o.labels.forEach((l, i) => {
    const cx = m.l + gw * (i + 0.5);
    if (i % c.step === 0) svg.append(el('text', { x: cx, y: c.H - m.b + 15, 'text-anchor': 'middle', fill: '#444' }, String(l).slice(0, o.labelLen || 10)));
    let acc = 0;
    o.series.forEach((s, j) => {
      const v = s.values[i]; if (v == null || Number.isNaN(v)) return; const col = s.color || BARPAL[j % BARPAL.length];
      const x0 = o.stacked ? cx - bw / 2 : cx - bw * k / 2 + bw * j, y1 = y(o.stacked ? acc + v : v), y0 = y(o.stacked ? acc : 0);
      const r = el('rect', { x: x0, y: Math.min(y1, y0), width: bw, height: Math.abs(y0 - y1), fill: col, rx: 2 }); r.append(el('title', {}, `${s.name} · ${l}: ${f(v)}`)); svg.append(r);
      if (o.valueLabels && !o.stacked) svg.append(el('text', { x: x0 + bw / 2, y: y1 - 4, 'text-anchor': 'middle', fill: '#333' }, f(v)));
      if (o.stacked) acc += v;
    });
  });
  if (o.line) {   // reference line over the bars (e.g. expected days per stage)
    let d = ''; o.line.values.forEach((v, i) => { if (v != null) d += (d ? 'L' : 'M') + (m.l + gw * (i + 0.5)).toFixed(1) + ' ' + y(v).toFixed(1); });
    svg.append(el('path', { d, fill: 'none', stroke: o.line.color || '#FFC000', 'stroke-width': 2.5 }));
    o.line.values.forEach((v, i) => { if (v != null) svg.append(el('circle', { cx: m.l + gw * (i + 0.5), cy: y(v), r: 3, fill: o.line.color || '#FFC000' })); });
    return finish(c, { ...o, legend: true, series: [...o.series, { name: o.line.name, color: o.line.color || '#FFC000' }] });
  }
  return finish(c, o);
}
