// Weekly analytics for the dashboard & report preview. Mirrors engine/bpm/analytics.py.
import { mean, sum } from './util.js';
const inWeek = (rows, y, w) => (rows || []).filter(r => r.iso_year === y && r.iso_week === w);
const inYear = (rows, y) => (rows || []).filter(r => r.iso_year === y);
const group = (rows, f) => { const m = new Map(); for (const r of rows) { const k = f(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
const weeksTo = (week, n) => Array.from({ length: Math.min(n, week) }, (_, i) => week - Math.min(n, week) + 1 + i);
const wl = w => 'Wk ' + w;
export const STAGES = ['Stage 2', 'Stage 3', 'Early Stage 4', 'Late Stage 4', 'Stage 1', 'Fry'];
export const REASONS = [['Lunch break', /lunch/], ['Breakfast / tea break', /breakfast|tea/], ['Stocking / transfer duties', /stock|transfer/], ['Recount / sampling', /recount|sampl/], ['Meeting', /meeting|briefing/], ['Sump / maintenance', /sump|repair|maint/], ['Leave / sickness', /sick|leave|off duty|absent/], ['Washroom', /wash ?room|toilet|restroom/], ['Harvest / feeding', /harvest|feed/]];

export function weeksAvailable(data) {          // [{y,w}] with any data, newest first
  const s = new Set();
  for (const k of ['workstation_audits', 'biosecurity_audits', 'parasitology_samples', 'stocking_audits', 'bottom_rope_audits', 'day3_recounts', 'fry_transfers', 'egg_volumetric_jars'])
    for (const r of data[k] || []) if (r.iso_year && r.iso_week) s.add(r.iso_year * 100 + r.iso_week);
  return [...s].sort((a, b) => b - a).map(v => ({ y: Math.floor(v / 100), w: v % 100 }));
}

export function workstation(data, y, w, n = 13) {
  const d = inYear(data.workstation_audits, y), g = group(d, r => r.iso_week);
  const weeks = weeksTo(w, n);
  const trend = weeks.map(x => g.has(x) ? mean(g.get(x).map(r => r.score)) : null);
  const nc = inWeek(data.workstation_audits, y, w).filter(r => r.score < 1).sort((a, b) => (a.audit_date + (a.audit_time || '')).localeCompare(b.audit_date + (b.audit_time || '')));
  const reasons = {}; for (const r of nc) { const t = String(r.reason || '').trim().toLowerCase(); if (!t || ['n/a', 'none'].includes(t)) continue; const hit = REASONS.filter(([, rx]) => rx.test(t)).map(x => x[0]); for (const k of hit.length ? hit : ['Other']) reasons[k] = (reasons[k] || 0) + 1; }
  return { labels: weeks.map(wl), trend, current: trend.at(-1), nc, reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 3), audits: inWeek(data.workstation_audits, y, w).length };
}

export function biosecurity(data, y, w) {          // same shape as the PPT slide: every week from the first audit, gaps joined, category table with a rating band
  const d = inYear(data.biosecurity_audits, y).filter(r => r.rating_value != null && r.analysis_category !== 'Not scored');
  const byWeek = group(d, r => r.iso_week), have = [...byWeek.keys()].filter(x => x <= w).sort((a, b) => a - b);
  const first = have[0] ?? w, weeks = Array.from({ length: w - first + 1 }, (_, i) => first + i);
  const overall = weeks.map(x => byWeek.has(x) ? mean([...group(byWeek.get(x), r => r.analysis_category).values()].map(g => mean(g.map(r => r.rating_value)))) : null);
  const cur = group(byWeek.get(w) || [], r => r.analysis_category);
  const cats = [...cur].map(([k, g]) => ({ category: k, n: g.length, score: mean(g.map(r => r.rating_value)) })).sort((a, b) => b.n - a.n || a.category.localeCompare(b.category));
  const lowest = [...cats].sort((a, b) => a.score - b.score);
  return { labels: weeks.map(wl), weeks, overall, current: overall.at(-1), cats, lowest, checks: cats.reduce((n, c) => n + c.n, 0) };
}

const prevInt = g => { const n = sum(g.map(r => r.samples_collected)), c = sum(g.map(r => r.infected_samples)), t = sum(g.map(r => r.total_parasites)); return [n ? c / n : null, c ? t / c : n ? 0 : null]; };
export function parasitology(data, y, w, ras = 'RAS2', by = 'stage', n = 8) {
  const d = inYear(data.parasitology_samples, y).filter(r => r.ras === ras), weeks = weeksTo(w, n);
  const keys = by === 'stage' ? STAGES.filter(s => d.some(r => r.stage === s)) : [...new Set(d.map(r => r.island).filter(Boolean))].sort();
  const out = keys.map(k => { const pp = [], ii = []; for (const x of weeks) { const g = d.filter(r => r.iso_week === x && r[by] === k); const [p, i] = g.length ? prevInt(g) : [null, null]; pp.push(p); ii.push(i); } return { key: k, prev: pp, int: ii }; });
  const cur = d.filter(r => r.iso_week === w); const [p, i] = cur.length ? prevInt(cur) : [null, null];
  return { labels: weeks.map(wl), series: out, prevalence: p, intensity: i, rasList: [...new Set((data.parasitology_samples || []).map(r => r.ras).filter(Boolean))] };
}

export function water(data, y, w) {
  const dates = new Set(); const ws = (data.ras_water_volume || []).filter(r => r.iso_year === y && r.iso_week === w), ps = (data.ras_parasite_prevalence || []).filter(r => r.iso_year === y && r.iso_week === w);
  ws.forEach(r => dates.add(r.used_date)); ps.forEach(r => dates.add(r.sample_date));
  const days = [...dates].sort(), vol = days.map(dt => { const g = ws.filter(r => r.used_date === dt); return g.length ? sum(g.map(r => r.volume_l)) : null; });
  const prev = days.map(dt => { const g = ps.filter(r => r.sample_date === dt); return g.length ? mean(g.map(r => r.prevalence)) : null; });
  const pairs = days.map((_, i) => [vol[i], prev[i]]).filter(([a, b]) => a != null && b != null); let r = null;
  if (pairs.length >= 3) { const mx = mean(pairs.map(p => p[0])), my = mean(pairs.map(p => p[1])); const sxy = sum(pairs.map(p => (p[0] - mx) * (p[1] - my))), sx = Math.sqrt(sum(pairs.map(p => (p[0] - mx) ** 2))), sy = Math.sqrt(sum(pairs.map(p => (p[1] - my) ** 2))); r = sx && sy ? sxy / (sx * sy) : null; }
  return { days, vol, prev, r, n: pairs.length };
}

export function day3(data, y, w) {
  const d = inWeek(data.day3_recounts, y, w).filter(r => r.survival != null).sort((a, b) => String(a.unit).localeCompare(String(b.unit)));
  const failed = d.filter(r => r.survival < 0.97);
  return { rows: d, units: d.map(r => r.unit), values: d.map(r => r.survival), failed: failed.length, total: d.length, avg: mean(d.map(r => r.survival)) };
}

export function stocking(data, y, w) {
  const g = group(inWeek(data.stocking_audits, y, w), r => r.audit_date);
  return [...g].sort().map(([dt, rows]) => ({ date: dt, n: rows.length, abw: mean(rows.map(r => r.abw)), req: mean(rows.map(r => r.req)), target: mean(rows.map(r => r.target)), actual: mean(rows.map(r => r.actual)), variance: mean(rows.map(r => r.variance)), est: mean(rows.map(r => r.est)), diff: mean(rows.map(r => r.diff)) }));
}

export function transfers(data, y, w) {       // Reporting-tab rule: variance = bucket temp (with fish) − pond temp
  const rows = inWeek(data.fry_transfers, y, w), g = group(rows, r => r.date);
  const mm = (a, k) => { const v = a.map(r => r[k]).filter(x => x != null); return v.length ? [Math.min(...v), Math.max(...v)] : [null, null]; };
  return [...g].sort().map(([dt, a]) => { const pond = mm(a, 'pond_temp')[0], bw = mm(a, 'bucket_temp_w'); return { date: dt, time: a[0].stock_time, n: a.length, tray: mm(a, 'tray_temp'), bwo: mm(a, 'bucket_temp_wo'), bw, pond, variance: [bw[0] - pond, bw[1] - pond] }; });
}

export function eggs(data, y, w, n = 13) {
  const abp = inYear(data.egg_separation_ratings, y), g = group(abp, r => r.iso_week), weeks = weeksTo(w, n);
  const trend = weeks.map(x => g.has(x) ? mean(g.get(x).map(r => r.abp_rating)) : null);
  const jars = inWeek(data.egg_volumetric_jars, y, w), low = jars.filter(r => r.star <= 2).sort((a, b) => (a.date + a.pond).localeCompare(b.date + b.pond));
  return { labels: weeks.map(wl), trend, current: trend.at(-1), low, total: jars.length, mixed: low.filter(r => (r.mixed_h || 0) > 0).length };
}

export function bottomRope(data, y, w, n = 12) {
  const d = inYear(data.bottom_rope_audits, y), weeks = weeksTo(w, n), out = {};
  for (const kind of ['Nursery', 'Broodstock']) {
    const rows = d.filter(r => String(r.unit_type).toLowerCase() === kind.toLowerCase());
    const trend = weeks.map(x => { const g = rows.filter(r => r.iso_week === x); return g.length ? g.filter(r => r.hapa_failed).length / g.length : null; });
    const cur = rows.filter(r => r.iso_week === w), bp = [...group(cur, r => r.pond_id)].sort().map(([p, g]) => ({ pond: p, audited: g.length, failed: g.filter(r => r.hapa_failed).length }));
    out[kind] = { labels: weeks.map(wl), trend, current: trend.at(-1), ponds: bp };
  }
  return out;
}

export function hapaExchange(data, y, w, n = 12) {
  const d = inYear(data.hapa_exchanges, y), weeks = weeksTo(w, n);
  const trend = weeks.map(x => { const g = d.filter(r => r.iso_week === x); const t = sum(g.map(r => r.to_exchange)); return g.length && t ? sum(g.map(r => r.exchanged)) / t : null; });
  return { labels: weeks.map(wl), trend, current: trend.at(-1) };
}

export function flips(data, y, w) {
  const rows = (data.pond_flips || []), inw = rows.filter(r => r.iso_year === y && r.iso_week === w);
  return { nursery: inw.filter(r => String(r.kind).toLowerCase() === 'nursery'), brood: inw.filter(r => String(r.kind).toLowerCase() === 'broodstock'), all: rows };
}

// Automatic first-draft comments (a person edits them; same wording as the PPT engine).
export function draftComment(key, a) {
  const p = v => v == null ? '–' : (v * 100).toFixed(1) + '%';
  switch (key) {
    case 'workstation': return a.current == null ? 'No workstation audits this week.' : `Workstation compliance was ${p(a.current)} this week from ${a.audits} audits; ${a.nc.length} audit(s) had non-compliant islands.${a.reasons.length ? ' Main reasons: ' + a.reasons.map(r => `${r[0]} (${r[1]})`).join(', ') + '.' : ''}`;
    case 'biosecurity': return a.current == null ? 'No biosecurity audits this week.' : `Overall biosecurity score was ${p(a.current)}.${a.cats[0] ? ` Weakest category: ${a.lowest[0].category} (${p(a.lowest[0].score)}).` : ''}`;
    case 'day3': return a.total ? `${a.total - a.failed} of ${a.total} hapas met the 97% three-day survival target (average ${p(a.avg)}).` : 'No 3-day recounts completed this week.';
    case 'stocking': return a.length ? `Daily average variance ranged ${p(Math.min(...a.map(r => r.variance)))} to ${p(Math.max(...a.map(r => r.variance)))}; ${a.filter(r => Math.abs(r.variance) <= 0.05).length} of ${a.length} days within ±5%.` : 'No stocking audits this week.';
    case 'transfers': return a.length ? `Temperature variance (bucket with fish vs pond) ranged ${Math.min(...a.map(r => r.variance[0])).toFixed(1)} to ${Math.max(...a.map(r => r.variance[1])).toFixed(1)}°C across ${sum(a.map(r => r.n))} audited hapa stockings.` : 'No fry transfers audited this week.';
    case 'eggs': return a.current == null ? 'No egg separation ratings this week.' : `Weekly average egg stage separation was ${a.current.toFixed(2)}; ${a.low.length} of ${a.total} jars scored 0–2 stars (${a.mixed} with mixed stages).`;
    case 'hapa_exchange': return a.current == null ? 'No hapa exchanges scheduled this week.' : `Hapa exchange compliance was ${p(a.current)} this week.`;
    case 'bottom_rope': return ['Nursery', 'Broodstock'].map(k => {
      const t = a[k].ponds.reduce((n, x) => n + x.audited, 0), f = a[k].ponds.reduce((n, x) => n + x.failed, 0);
      return t ? `${k}: total of ${t} hapas were audited; ${f} failed the audit metrics, a non-conformance of ${p(f / t)} (${f ? 'still fail' : 'meets the standard'}).` : `${k}: no bottom rope audits were recorded this week.`;
    }).join('\n');
    default: return '';
  }
}
