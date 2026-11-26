// Statistics library for BP Master (no dependencies). Every function returns plain numbers; p-values are two-sided unless stated.
// Distribution functions: normal, Student t, chi-square, F (regularised incomplete beta / gamma).
const EPS = 1e-14, TINY = 1e-300;
export const sum = a => a.reduce((s, v) => s + v, 0);
export const clean = a => (a || []).map(Number).filter(v => Number.isFinite(v));

function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const k of c) s += k / ++y;
  return -t + Math.log(2.5066282746310005 * s / x);
}
function betacf(a, b, x) {
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < TINY) d = TINY; d = 1 / d; let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
  } return h;
}
export function ibeta(x, a, b) {          // regularised incomplete beta I_x(a,b)
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
export function igamma(a, x) {            // regularised lower incomplete gamma P(a,x)
  if (x <= 0) return 0;
  if (x < a + 1) { let ap = a, del = 1 / a, s = del; for (let n = 0; n < 500; n++) { ap++; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * EPS) break; } return s * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
  let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < TINY) d = TINY; c = b + an / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break; }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}
export function normCdf(z) { return 0.5 * (1 + (z >= 0 ? 1 : -1) * igamma(0.5, z * z / 2)); }
export const normP = z => 2 * (1 - normCdf(Math.abs(z)));
export function normInv(p) {              // Acklam
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572],
    c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const pl = 0.02425; let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
export const tCdf = (t, df) => { const x = df / (df + t * t), p = 0.5 * ibeta(x, df / 2, 0.5); return t > 0 ? 1 - p : p; };
export const tP = (t, df) => ibeta(df / (df + t * t), df / 2, 0.5);                 // two-sided
export function tInv(p, df) { let lo = -200, hi = 200; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; tCdf(m, df) < p ? lo = m : hi = m; } return (lo + hi) / 2; }
export const chi2P = (x, df) => x <= 0 ? 1 : 1 - igamma(df / 2, x / 2);               // upper tail
export const fP = (f, d1, d2) => f <= 0 ? 1 : ibeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2);

// ---- descriptive
export function quantile(sorted, q) { if (!sorted.length) return null; const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
export function describe(xs) {
  xs = clean(xs); const n = xs.length; if (!n) return { n: 0 };
  const mean = sum(xs) / n, s = [...xs].sort((a, b) => a - b), sd = n > 1 ? Math.sqrt(sum(xs.map(v => (v - mean) ** 2)) / (n - 1)) : null, se = sd == null ? null : sd / Math.sqrt(n);
  const tq = n > 1 ? tInv(0.975, n - 1) : null, q1 = quantile(s, 0.25), q3 = quantile(s, 0.75);
  return { n, mean, sd, se, cv: sd != null && mean ? Math.abs(sd / mean) : null, median: quantile(s, 0.5), q1, q3, iqr: q3 - q1, min: s[0], max: s[n - 1], ci: se == null ? null : [mean - tq * se, mean + tq * se] };
}
export function outliers(xs) { xs = clean(xs); const s = [...xs].sort((a, b) => a - b), q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), i = q3 - q1; return xs.filter(v => v < q1 - 1.5 * i || v > q3 + 1.5 * i); }
export function wilson(k, n, z = 1.959964) {
  if (!n) return { p: null, lo: null, hi: null }; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), a = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return { p, lo: Math.max(0, (c - a) / d), hi: Math.min(1, (c + a) / d) };
}

// ---- association
function ranks(xs) { const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]), r = new Array(xs.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const rk = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = rk; i = j + 1; } return r; }
function pairs(x, y) { const a = [], b = []; for (let i = 0; i < Math.min(x.length, y.length); i++) { const u = Number(x[i]), v = Number(y[i]); if (x[i] != null && y[i] != null && Number.isFinite(u) && Number.isFinite(v)) { a.push(u); b.push(v); } } return [a, b]; }
export function pearson(x, y) {
  const [a, b] = pairs(x, y), n = a.length; if (n < 3) return { n, r: null, p: null };
  const ma = sum(a) / n, mb = sum(b) / n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  if (!saa || !sbb) return { n, r: null, p: null }; const r = sab / Math.sqrt(saa * sbb), t = r * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r));
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, r))), se = n > 3 ? 1 / Math.sqrt(n - 3) : null;
  return { n, r, r2: r * r, p: Math.abs(r) >= 1 ? 0 : tP(t, n - 2), ci: se ? [Math.tanh(z - 1.959964 * se), Math.tanh(z + 1.959964 * se)] : null };
}
export function spearman(x, y) { const [a, b] = pairs(x, y); if (a.length < 3) return { n: a.length, rho: null, p: null }; const o = pearson(ranks(a), ranks(b)); return { n: a.length, rho: o.r, p: o.p }; }
export function linreg(x, y) {
  const [a, b] = pairs(x, y), n = a.length; if (n < 3) return { n, slope: null };
  const ma = sum(a) / n, mb = sum(b) / n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  if (!saa) return { n, slope: null }; const slope = sab / saa, icpt = mb - slope * ma, sse = sbb - slope * sab, r2 = sbb ? 1 - sse / sbb : null, se = Math.sqrt(Math.max(0, sse) / (n - 2) / saa);
  return { n, slope, intercept: icpt, r2, se, p: se ? tP(slope / se, n - 2) : 0 };
}
export const pearsonStrength = r => r == null ? '' : Math.abs(r) >= 0.7 ? 'strong' : Math.abs(r) >= 0.4 ? 'moderate' : Math.abs(r) >= 0.2 ? 'weak' : 'negligible';

// ---- comparing groups
export function welch(a, b) {
  a = clean(a); b = clean(b); const A = describe(a), B = describe(b); if (A.n < 2 || B.n < 2) return { n1: A.n, n2: B.n, p: null };
  const va = A.sd ** 2 / A.n, vb = B.sd ** 2 / B.n, se = Math.sqrt(va + vb), t = (A.mean - B.mean) / se, df = (va + vb) ** 2 / (va ** 2 / (A.n - 1) + vb ** 2 / (B.n - 1)), sp = Math.sqrt(((A.n - 1) * A.sd ** 2 + (B.n - 1) * B.sd ** 2) / (A.n + B.n - 2)), tq = tInv(0.975, df);
  return { n1: A.n, n2: B.n, m1: A.mean, m2: B.mean, diff: A.mean - B.mean, ci: [A.mean - B.mean - tq * se, A.mean - B.mean + tq * se], t, df, p: se ? tP(t, df) : 1, d: sp ? (A.mean - B.mean) / sp : null };
}
export function pairedT(before, after) {
  const [a, b] = pairs(before, after), n = a.length; if (n < 3) return { n, p: null }; const d = a.map((v, i) => b[i] - v), D = describe(d); if (!D.sd) return { n, mean: D.mean, p: D.mean ? 0 : 1 };
  const t = D.mean / D.se; return { n, mean: D.mean, sd: D.sd, ci: D.ci, t, df: n - 1, p: tP(t, n - 1), d: D.mean / D.sd, up: d.filter(v => v > 0).length };
}
export function oneSampleT(xs, mu) { const D = describe(xs); if (D.n < 2 || !D.sd) return { n: D.n, p: null }; const t = (D.mean - mu) / D.se; return { n: D.n, mean: D.mean, diff: D.mean - mu, ci: D.ci, t, df: D.n - 1, p: tP(t, D.n - 1) }; }
export function mannWhitney(a, b) {
  a = clean(a); b = clean(b); const n1 = a.length, n2 = b.length; if (n1 < 2 || n2 < 2) return { n1, n2, p: null };
  const all = [...a, ...b], rk = ranks(all), R1 = sum(rk.slice(0, n1)), U1 = R1 - n1 * (n1 + 1) / 2, N = n1 + n2, mu = n1 * n2 / 2;
  const ties = new Map(); for (const v of all) ties.set(v, (ties.get(v) || 0) + 1); const tc = sum([...ties.values()].map(t => t ** 3 - t));
  const sd = Math.sqrt(n1 * n2 / 12 * ((N + 1) - tc / (N * (N - 1)))); if (!sd) return { n1, n2, p: 1, U: U1 };
  const z = (Math.abs(U1 - mu) - 0.5) / sd; return { n1, n2, U: U1, z, p: normP(z), median1: describe(a).median, median2: describe(b).median, rbc: 1 - 2 * Math.min(U1, n1 * n2 - U1) / (n1 * n2) };
}
export function kruskal(groups) {
  groups = groups.map(clean).filter(g => g.length); const k = groups.length, N = sum(groups.map(g => g.length)); if (k < 2 || N < k + 1) return { k, N, p: null };
  const all = groups.flat(), rk = ranks(all); let i = 0, H = 0; for (const g of groups) { const r = sum(rk.slice(i, i + g.length)); i += g.length; H += r * r / g.length; }
  H = 12 / (N * (N + 1)) * H - 3 * (N + 1); const ties = new Map(); for (const v of all) ties.set(v, (ties.get(v) || 0) + 1); const c = 1 - sum([...ties.values()].map(t => t ** 3 - t)) / (N ** 3 - N);
  if (c <= 0) return { k, N, H: 0, df: k - 1, p: 1 }; H /= c; return { k, N, H, df: k - 1, p: chi2P(H, k - 1), eps2: H / ((N * N - 1) / (N + 1)) };
}
export function anova(groups) {
  groups = groups.map(clean).filter(g => g.length > 0); const k = groups.length, N = sum(groups.map(g => g.length)); if (k < 2 || N <= k) return { k, N, p: null };
  const gm = sum(groups.flat()) / N, ssb = sum(groups.map(g => g.length * (sum(g) / g.length - gm) ** 2)), ssw = sum(groups.map(g => { const m = sum(g) / g.length; return sum(g.map(v => (v - m) ** 2)); }));
  if (!ssw) return { k, N, p: 0 }; const F = (ssb / (k - 1)) / (ssw / (N - k)); return { k, N, F, df1: k - 1, df2: N - k, p: fP(F, k - 1, N - k), eta2: ssb / (ssb + ssw) };
}
export function shapiroLike(xs) {        // skew/kurtosis based normality screen (D'Agostino-Pearson); needs n >= 8
  xs = clean(xs); const n = xs.length; if (n < 8) return { n, p: null }; const m = sum(xs) / n, m2 = sum(xs.map(v => (v - m) ** 2)) / n, m3 = sum(xs.map(v => (v - m) ** 3)) / n, m4 = sum(xs.map(v => (v - m) ** 4)) / n;
  if (!m2) return { n, p: null }; const g1 = m3 / m2 ** 1.5, g2 = m4 / m2 ** 2 - 3;
  const Y = g1 * Math.sqrt((n + 1) * (n + 3) / (6 * (n - 2))), b2 = 3 * (n * n + 27 * n - 70) * (n + 1) * (n + 3) / ((n - 2) * (n + 5) * (n + 7) * (n + 9)), W2 = -1 + Math.sqrt(2 * (b2 - 1)), dd = 1 / Math.sqrt(Math.log(Math.sqrt(W2))), aa = Math.sqrt(2 / (W2 - 1)), Z1 = dd * Math.log(Y / aa + Math.sqrt((Y / aa) ** 2 + 1));
  const E = -6 / (n + 1), V = 24 * n * (n - 2) * (n - 3) / ((n + 1) ** 2 * (n + 3) * (n + 5)), x = (g2 - E) / Math.sqrt(V), sq = 6 * (n * n - 5 * n + 2) / ((n + 7) * (n + 9)) * Math.sqrt(6 * (n + 3) * (n + 5) / (n * (n - 2) * (n - 3))), A = 6 + 8 / sq * (2 / sq + Math.sqrt(1 + 4 / (sq * sq))), Z2 = ((1 - 2 / (9 * A)) - Math.cbrt((1 - 2 / A) / (1 + x * Math.sqrt(2 / (A - 4))))) / Math.sqrt(2 / (9 * A));
  const K2 = Z1 * Z1 + Z2 * Z2; return { n, skew: g1, kurt: g2, p: chi2P(K2, 2) };
}

// ---- counts / proportions
export function chi2Table(m) {            // m: rows x cols of counts
  const R = m.length, C = m[0]?.length || 0; if (R < 2 || C < 2) return { p: null };
  const rt = m.map(r => sum(r)), ct = m[0].map((_, j) => sum(m.map(r => r[j]))), N = sum(rt); if (!N) return { p: null };
  let x2 = 0, small = 0; const yates = R === 2 && C === 2;
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) { const e = rt[i] * ct[j] / N; if (e < 5) small++; if (e) x2 += (yates ? Math.max(0, Math.abs(m[i][j] - e) - 0.5) : Math.abs(m[i][j] - e)) ** 2 / e; }
  const df = (R - 1) * (C - 1); return { chi2: x2, df, p: chi2P(x2, df), v: Math.sqrt(x2 / (N * Math.min(R - 1, C - 1))), N, smallCells: small, cells: R * C };
}
export function fisher2x2(a, b, c, d) {   // two-sided exact p for [[a,b],[c,d]]
  const n = a + b + c + d, r1 = a + b, c1 = a + c, lf = k => lgamma(k + 1), lp = x => lf(r1) + lf(n - r1) + lf(c1) + lf(n - c1) - lf(n) - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(n - r1 - c1 + x);
  const lo = Math.max(0, r1 + c1 - n), hi = Math.min(r1, c1), p0 = Math.exp(lp(a)); let p = 0; for (let x = lo; x <= hi; x++) { const px = Math.exp(lp(x)); if (px <= p0 * (1 + 1e-7)) p += px; }
  const or = (b * c) ? (a * d) / (b * c) : null; return { p: Math.min(1, p), or };
}
export function twoProp(k1, n1, k2, n2) {
  if (!n1 || !n2) return { p: null }; const p1 = k1 / n1, p2 = k2 / n2, pp = (k1 + k2) / (n1 + n2), se = Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2)), z = se ? (p1 - p2) / se : 0;
  const f = fisher2x2(k1, n1 - k1, k2, n2 - k2); return { p1, p2, diff: p1 - p2, z, pz: se ? normP(z) : 1, p: (n1 * pp < 5 || n2 * pp < 5 || n1 * (1 - pp) < 5 || n2 * (1 - pp) < 5) ? f.p : normP(z), or: f.or };
}
export function chiGOF(obs, props) { const N = sum(obs); if (!N) return { p: null }; let x2 = 0; obs.forEach((o, i) => { const e = N * props[i]; if (e) x2 += (o - e) ** 2 / e; }); return { chi2: x2, df: obs.length - 1, p: chi2P(x2, obs.length - 1), N }; }
export function binomTest(k, n, p0) {     // exact two-sided
  if (!n) return { p: null }; const lf = x => lgamma(x + 1), pm = i => Math.exp(lf(n) - lf(i) - lf(n - i) + i * Math.log(p0) + (n - i) * Math.log(1 - p0)), obs = pm(k); let p = 0; for (let i = 0; i <= n; i++) { const v = pm(i); if (v <= obs * (1 + 1e-7)) p += v; } return { p: Math.min(1, p) };
}

// ---- trend + control charts + capability + agreement
export function mannKendall(ys) {
  const y = ys.map(v => v == null ? null : Number(v)).filter(v => v != null && Number.isFinite(v)), n = y.length; if (n < 4) return { n, p: null };
  let S = 0; const sl = []; for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) { S += Math.sign(y[j] - y[i]); sl.push((y[j] - y[i]) / (j - i)); }
  const ties = new Map(); for (const v of y) ties.set(v, (ties.get(v) || 0) + 1); const vs = (n * (n - 1) * (2 * n + 5) - sum([...ties.values()].map(t => t * (t - 1) * (2 * t + 5)))) / 18, z = S === 0 ? 0 : (S - Math.sign(S)) / Math.sqrt(vs);
  sl.sort((a, b) => a - b); return { n, S, tau: S / (n * (n - 1) / 2), z, p: normP(z), slope: quantile(sl, 0.5) };
}
export function pChart(ks, ns) {          // proportion control chart, limits vary with n
  const K = sum(ks), N = sum(ns), pbar = N ? K / N : null; if (pbar == null) return null;
  const pts = ks.map((k, i) => { const n = ns[i]; if (!n) return { p: null, ucl: null, lcl: null, out: false }; const s = Math.sqrt(pbar * (1 - pbar) / n), p = k / n, ucl = Math.min(1, pbar + 3 * s), lcl = Math.max(0, pbar - 3 * s); return { p, ucl, lcl, out: p > ucl || p < lcl }; });
  return { pbar, pts };
}
export function iChart(xs) {              // individuals chart: limits from the average moving range (MR-bar / 1.128)
  const v = xs.map(x => x == null ? null : Number(x)), o = v.filter(x => x != null && Number.isFinite(x)); if (o.length < 4) return null;
  let mr = [], prev = null; for (const x of v) { if (x == null || !Number.isFinite(x)) continue; if (prev != null) mr.push(Math.abs(x - prev)); prev = x; }
  const cl = sum(o) / o.length, s = sum(mr) / mr.length / 1.128, ucl = cl + 3 * s, lcl = cl - 3 * s; return { cl, ucl, lcl, sigma: s, out: v.map(x => x != null && (x > ucl || x < lcl)) };
}
export function capability(xs, lsl, usl) {
  const D = describe(xs); if (D.n < 5 || !D.sd) return { n: D.n }; const out = { n: D.n, mean: D.mean, sd: D.sd };
  if (lsl != null && usl != null) out.cp = (usl - lsl) / (6 * D.sd);
  const cu = usl != null ? (usl - D.mean) / (3 * D.sd) : null, cl = lsl != null ? (D.mean - lsl) / (3 * D.sd) : null; out.cpk = [cu, cl].filter(v => v != null).reduce((m, v) => Math.min(m, v), Infinity);
  out.inSpec = clean(xs).filter(v => (lsl == null || v >= lsl) && (usl == null || v <= usl)).length / D.n; return out;
}
export function blandAltman(a, b) { const [x, y] = pairs(a, b), d = x.map((v, i) => y[i] - v), D = describe(d); if (D.n < 3) return { n: D.n }; return { n: D.n, bias: D.mean, sd: D.sd, lo: D.mean - 1.96 * D.sd, hi: D.mean + 1.96 * D.sd, biasCi: D.ci, p: tP(D.mean / D.se, D.n - 1) }; }
export function holm(ps) { const o = ps.map((p, i) => [p, i]).filter(x => x[0] != null).sort((a, b) => a[0] - b[0]), m = o.length, out = ps.map(() => null); let mx = 0; o.forEach(([p, i], r) => { mx = Math.max(mx, Math.min(1, (m - r) * p)); out[i] = mx; }); return out; }
export function pareto(counts) { const e = Object.entries(counts).sort((a, b) => b[1] - a[1]), t = sum(e.map(x => x[1])); let c = 0; return e.map(([k, v]) => { c += v; return { k, v, pct: t ? v / t : 0, cum: t ? c / t : 0 }; }); }

// ---- formatting helpers
export const fp = p => p == null ? 'n/a' : p < 0.001 ? '<0.001' : p.toFixed(3);
export const fn = (v, d = 2) => v == null || !Number.isFinite(v) ? '–' : Math.abs(v) >= 1000 ? v.toLocaleString('en', { maximumFractionDigits: 0 }) : v.toFixed(d);
export const fpc = (v, d = 1) => v == null || !Number.isFinite(v) ? '–' : (v * 100).toFixed(d) + '%';
export const sig = p => p == null ? 'too few records' : p < 0.05 ? 'significant (p ' + (p < 0.001 ? '<0.001' : '= ' + p.toFixed(3)) + ')' : 'not significant (p = ' + p.toFixed(3) + ')';
export const cvBand = cv => cv == null ? '' : cv < 0.1 ? 'tight' : cv < 0.2 ? 'moderate' : cv < 0.3 ? 'variable' : 'erratic';

// Wilcoxon signed-rank test (normal approximation with tie and continuity correction): H0 median of the differences = mu. Returns the median and IQR of the differences too.
export function wilcoxon(xs, mu = 0) {
  const all = clean(xs).map(v => v - mu), d = describe(all), nz = all.filter(v => v !== 0), n = nz.length;
  const base = { n: all.length, nz: n, median: d.median, q1: d.q1, q3: d.q3, iqr: d.iqr, mean: d.mean, lo: d.n ? quantile([...all].sort((a, b) => a - b), 0.025) : null, hi: d.n ? quantile([...all].sort((a, b) => a - b), 0.975) : null, p: null };
  if (n < 6) return base;
  const ord = nz.map((v, i) => [Math.abs(v), v, i]).sort((a, b) => a[0] - b[0]), ranks = new Array(n); let ties = 0;
  for (let i = 0; i < n;) { let j = i; while (j + 1 < n && ord[j + 1][0] === ord[i][0]) j++; const r = (i + j) / 2 + 1, t = j - i + 1; for (let k = i; k <= j; k++) ranks[ord[k][2]] = r; ties += t ** 3 - t; i = j + 1; }
  const Wp = sum(nz.map((v, i) => v > 0 ? ranks[i] : 0)), mean = n * (n + 1) / 4, varr = n * (n + 1) * (2 * n + 1) / 24 - ties / 48;
  if (varr <= 0) return base; const z = (Wp - mean - 0.5 * Math.sign(Wp - mean)) / Math.sqrt(varr);
  return { ...base, W: Wp, z, p: Math.min(1, 2 * (1 - normCdf(Math.abs(z)))) };
}
export function wilcoxonPaired(before, after) { const d = []; for (let i = 0; i < Math.min(before.length, after.length); i++) if (Number.isFinite(before[i]) && Number.isFinite(after[i])) d.push(after[i] - before[i]); return wilcoxon(d, 0); }
