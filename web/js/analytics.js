import { S } from './state.js';
// Weekly analytics for the dashboard & report preview. Mirrors engine/bpm/analytics.py.
import { mean, sum, weekRange } from './util.js';
const inWeek = (rows, y, w) => (rows || []).filter(r => r.iso_year === y && r.iso_week === w);
// Weekly tables that have no rows for the selected week show the latest earlier week that has some (flagged via asOf).
const lastWk = (rows, y, w) => { rows = rows || []; if (rows.some(r => r.iso_year === y && r.iso_week === w)) return { y, w, stale: false }; const k = y * 100 + w; const m = Math.max(0, ...rows.map(r => (r.iso_year || 0) * 100 + (r.iso_week || 0)).filter(v => v < k)); return m ? { y: Math.floor(m / 100), w: m % 100, stale: true } : { y, w, stale: false }; };
export const asOfNote = (a, w) => a && a.stale ? `No week ${w} data yet - showing latest available: week ${a.w}` : '';
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
  const wkNC = lastWk((data.workstation_audits || []).filter(r => r.score < 1), y, w), nc = inWeek(data.workstation_audits, wkNC.y, wkNC.w).filter(r => r.score < 1).sort((a, b) => (a.audit_date + (a.audit_time || '')).localeCompare(b.audit_date + (b.audit_time || '')));
  const reasons = {}; for (const r of nc) { const t = String(r.reason || '').trim().toLowerCase(); if (!t || ['n/a', 'none'].includes(t)) continue; const hit = REASONS.filter(([, rx]) => rx.test(t)).map(x => x[0]); for (const k of hit.length ? hit : ['Other']) reasons[k] = (reasons[k] || 0) + 1; }
  return { labels: weeks.map(wl), trend, current: trend.at(-1), nc, ncAsOf: wkNC, reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 3), audits: inWeek(data.workstation_audits, y, w).length };
}

export function biosecurity(data, y, w) {          // same shape as the PPT slide: every week from the first audit, gaps joined, category table with a rating band
  const all = inYear(data.biosecurity_audits, y).filter(r => !r.superseded);       // rows of dates the Biosecurity dashboard covers replace the Excel rows (see migration 0008)
  const typed = new Map(all.filter(r => r.analysis_category === 'Overall (typed)' && r.rating_value != null).map(r => [r.iso_week, +r.rating_value]));   // overall typed in the Excel, as in the Biosecurity dashboard
  const d = all.filter(r => r.rating_value != null && r.analysis_category !== 'Not scored' && r.analysis_category !== 'Overall (typed)');
  const byWeek = group(d, r => r.iso_week), have = [...byWeek.keys()].filter(x => x <= w).sort((a, b) => a - b);
  const first = have[0] ?? w, weeks = Array.from({ length: w - first + 1 }, (_, i) => first + i);
  const overall = weeks.map(x => typed.has(x) ? typed.get(x) : byWeek.has(x) ? mean([...group(byWeek.get(x), r => r.analysis_category).values()].map(g => mean(g.map(r => r.rating_value)))) : null);
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
  const a = lastWk(data.stocking_audits, y, w), g = group(inWeek(data.stocking_audits, a.y, a.w), r => r.audit_date);
  return Object.assign([...g].sort().map(([dt, rows]) => ({ date: dt, n: rows.length, abw: mean(rows.map(r => r.abw)), req: mean(rows.map(r => r.req)), target: mean(rows.map(r => r.target)), actual: mean(rows.map(r => r.actual)), variance: mean(rows.map(r => r.variance)), est: mean(rows.map(r => r.est)), diff: mean(rows.map(r => r.diff)) })), { asOf: a });
}

export function transfers(data, y, w) {       // Reporting-tab rule: variance = bucket temp (with fish) − pond temp
  const a = lastWk(data.fry_transfers, y, w), rows = inWeek(data.fry_transfers, a.y, a.w), g = group(rows, r => r.date);
  const mm = (a, k) => { const v = a.map(r => r[k]).filter(x => x != null); return v.length ? [Math.min(...v), Math.max(...v)] : [null, null]; };
  return Object.assign([...g].sort().map(([dt, x]) => { const pond = mm(x, 'pond_temp')[0], bw = mm(x, 'bucket_temp_w'); return { date: dt, time: x[0].stock_time, n: x.length, tray: mm(x, 'tray_temp'), bwo: mm(x, 'bucket_temp_wo'), bw, pond, variance: [bw[0] - pond, bw[1] - pond] }; }), { asOf: a });
}

export function eggs(data, y, w, n = 13) {
  const abp = inYear(data.egg_separation_ratings, y), g = group(abp, r => r.iso_week), weeks = weeksTo(w, n);
  const trend = weeks.map(x => g.has(x) ? mean(g.get(x).map(r => r.abp_rating)) : null);
  const jw = lastWk(data.egg_volumetric_jars, y, w), jars = inWeek(data.egg_volumetric_jars, jw.y, jw.w), low = jars.filter(r => r.star <= 2).sort((a, b) => (a.date + a.pond).localeCompare(b.date + b.pond));
  return { labels: weeks.map(wl), trend, current: trend.at(-1), low, jarsAsOf: jw, total: jars.length, mixed: low.filter(r => (r.mixed_h || 0) > 0).length };
}

export function bottomRope(data, y, w, n = 12) {
  const d = inYear(data.bottom_rope_audits, y), weeks = weeksTo(w, n), out = {};
  for (const kind of ['Nursery', 'Broodstock']) {
    const rows = d.filter(r => String(r.unit_type).toLowerCase() === kind.toLowerCase());
    const trend = weeks.map(x => { const g = rows.filter(r => r.iso_week === x); return g.length ? g.filter(r => r.hapa_failed).length / g.length : null; });
    const aw = lastWk(rows, y, w), cur = rows.filter(r => r.iso_week === aw.w && r.iso_year === aw.y), bp = [...group(cur, r => r.pond_id)].sort().map(([p, g]) => ({ pond: p, audited: g.length, failed: g.filter(r => r.hapa_failed).length }));
    out[kind] = { labels: weeks.map(wl), trend, current: trend.at(-1), ponds: bp, asOf: aw };
  }
  return out;
}

// Hapa exchange compliance is reported as TWO separate curves, each with its own percentage: Nursery (PNS) and Broodstock (BS).
// There is deliberately no combined curve. "last" = the most recent week (up to the selected one) that had exchanges scheduled, so a unit
// with no data this week still shows where it stood.
export function hapaExchange(data, y, w, n = 12) {
  const all = inYear(data.hapa_exchanges, y);
  const rate = g => { const t = sum(g.map(r => r.to_exchange)); return g.length && t ? sum(g.map(r => r.exchanged)) / t : null; };
  const by = kind => all.filter(r => String(r.kind).toLowerCase() === kind);
  const lastOf = d => { for (let x = w; x >= 1; x--) { const v = rate(d.filter(r => r.iso_week === x)); if (v != null) return { w: x, v }; } return null; };
  const units = { nursery: by('nursery'), broodstock: by('broodstock') }, last = { nursery: lastOf(units.nursery), broodstock: lastOf(units.broodstock) };
  // Both curves run across ONE shared axis from the first week that has any exchange data up to the selected week (max 52 weeks), so each
  // curve is drawn in full and nothing looks cut off. Weeks without exchanges are joined by the line (see joinGaps in the charts).
  const first = Math.min(...all.filter(r => r.iso_week <= w && r.to_exchange > 0).map(r => r.iso_week), w);
  n = Math.min(52, Math.max(n, w - first + 1));
  const weeks = weeksTo(w, n);
  const one = k => { const trend = weeks.map(x => rate(units[k].filter(r => r.iso_week === x))); return { trend, current: trend.at(-1), last: last[k] }; };
  return { labels: weeks.map(wl), nursery: one('nursery'), broodstock: one('broodstock') };
}
// Broodstock stocking density & sex ratio, weekly: pooled F:M ratio (all hapas recounted that week) and mean density (kg/m2 = total biomass / hapa area,
// hapa area 80 m2). Weeks without recounts are joined by the line. Standard sex ratio = 3 females : 1 male.
export const SEX_TARGET = 3, DENS_TARGET = 1.5, DENS_AREA = 80;   // standard stocking density 1.5 kg/m2 (120 kg per 80 m2 hapa); sex ratio 3:1
export function broodDensity(data, y, w, n = 12) {
  const all = inYear(data.broodstock_density, y).filter(r => r.iso_week <= w);
  const dens = r => ((+r.female_biomass || 0) + (+r.male_biomass || 0)) / DENS_AREA;
  const first = all.length ? Math.min(...all.map(r => r.iso_week)) : w; n = Math.min(52, Math.max(n, w - first + 1));
  const weeks = weeksTo(w, n), by = group(all, r => r.iso_week);
  const ratio = weeks.map(x => { const g = by.get(x) || []; const m = sum(g.map(r => +r.male_count || 0)); return g.length && m ? sum(g.map(r => +r.female_count || 0)) / m : null; });
  const density = weeks.map(x => { const g = (by.get(x) || []).filter(r => r.female_biomass != null || r.male_biomass != null); return g.length ? mean(g.map(dens)) : null; });
  const last = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return { w: weeks[i], v: a[i] }; return null; };
  return { week: w, labels: weeks.map(wl), ratio, density, target_density: DENS_TARGET, hapas: (by.get(w) || []).length, lastRatio: last(ratio), lastDensity: last(density), thisWeek: by.has(w) };
}
// Sinkers per hapa at the bottom rope check. Standard: broodstock 20, nursery 4 (maximum counted). Each hapa scores min(1, sinkers / standard);
// the weekly curve is the average of those scores, so both units sit on one % axis. Only hapas with a recorded sinker count are included.
export const SINKER_STD = { nursery: 4, broodstock: 20 };
export function sinkers(data, y, w, n = 12) {
  const all = inYear(data.bottom_rope_audits, y).filter(r => r.iso_week <= w && r.sinkers != null);
  const first = all.length ? Math.min(...all.map(r => r.iso_week)) : w; n = Math.min(52, Math.max(n, w - first + 1));
  const weeks = weeksTo(w, n), one = k => {
    const rows = all.filter(r => String(r.unit_type).toLowerCase() === k), by = group(rows, r => r.iso_week), std = SINKER_STD[k];
    const trend = weeks.map(x => { const g = by.get(x) || []; return g.length ? mean(g.map(r => Math.min(1, (+r.sinkers || 0) / std))) : null; });
    const avg = weeks.map(x => { const g = by.get(x) || []; return g.length ? mean(g.map(r => Math.min(+r.sinkers || 0, std))) : null; });
    const short = (by.get(w) || []).filter(r => (+r.sinkers || 0) < std).length;
    let li = -1; for (let i = trend.length - 1; i >= 0; i--) if (trend[i] != null) { li = i; break; }
    return { trend, avg, std, hapas: (by.get(w) || []).length, short, last: li >= 0 ? { w: weeks[li], v: trend[li], avg: avg[li] } : null };
  };
  return { labels: weeks.map(wl), nursery: one('nursery'), broodstock: one('broodstock') };
}
export const hapaUnits = [['nursery', 'Nursery (PNS)'], ['broodstock', 'Broodstock (BS)']];

// Pond flipping is progressive. A pond stays "in progress" until its preparation is complete, and that is worked out automatically:
// either every stage has a recorded value, or every stage before the last is recorded and the last stage (final fill & maturation)
// has had its expected days since the previous stage ended (scheduled date + recorded days). Nobody has to tick anything.
const DAY = 86400000;
function flipComplete(r, st, asOf) {
  const rec = x => r.stage_days?.[x.name] != null;
  if (!st.length) return false;
  if (st.every(rec)) return true;
  if (!st.slice(0, -1).every(rec) || !r.scheduled) return false;
  const start = new Date(r.scheduled + 'T00:00:00Z').getTime() + st.slice(0, -1).reduce((t, x) => t + Math.max(0, Number(r.stage_days[x.name]) || 0), 0) * DAY;
  return start + (st.at(-1).expected || 0) * DAY <= asOf.getTime();
}
export function flips(data, y, w) {
  const defs = S.reg?.modules.find(m => m.key === 'pond_flips')?.stages || {};
  const rows = data.pond_flips || [], inw = rows.filter(r => r.iso_year === y && r.iso_week === w);
  const { sun } = weekRange(y, w), asOf = new Date(Math.min(Date.now(), sun.getTime()));
  const stOf = r => defs[String(r.kind).toLowerCase()] || [];
  const prog = rows.map(r => {
    const kind = String(r.kind).toLowerCase(), st = stOf(r), done = st.filter(x => r.stage_days?.[x.name] != null);
    const next = st.find(x => r.stage_days?.[x.name] == null);
    return { kind: kind === 'broodstock' ? 'Broodstock' : 'Nursery', pond: r.pond, scheduled: r.scheduled, done: done.length || Object.keys(r.stage_days || {}).length, total: st.length, next: next?.name || '',
      complete: flipComplete(r, st, asOf), over: st.filter(x => (r.stage_days?.[x.name] ?? 0) > x.expected).map(x => ({ stage: x.name, days: r.stage_days[x.name], exp: x.expected })) };
  }).filter(r => r.total && !r.complete).sort((a, b) => a.kind.localeCompare(b.kind) || String(a.scheduled).localeCompare(String(b.scheduled)));
  // Stage x pond table of days taken (as on the weekly slide): every pond in progress plus ponds scheduled in the month of the selected week.
  const inProg = new Set(prog.map(r => r.kind.toLowerCase() + '|' + r.pond + '|' + r.scheduled));
  const matrix = Object.fromEntries(['nursery', 'broodstock'].map(kind => {
    const st = defs[kind] || [];
    const sel = rows.filter(r => String(r.kind).toLowerCase() === kind && (inProg.has(kind + '|' + r.pond + '|' + r.scheduled) || String(r.scheduled).slice(0, 7) === sun.toISOString().slice(0, 7)));
    const latest = new Map(); for (const r of sel) { const c = latest.get(r.pond); if (!c || String(r.scheduled) > String(c.scheduled)) latest.set(r.pond, r); }
    const ponds = [...latest.values()].sort((a, b) => String(a.scheduled).localeCompare(String(b.scheduled)) || String(a.pond).localeCompare(String(b.pond)));
    return [kind, { st, ponds }];
  }));
  return { nursery: inw.filter(r => String(r.kind).toLowerCase() === 'nursery'), brood: inw.filter(r => String(r.kind).toLowerCase() === 'broodstock'), all: rows, progress: prog, matrix };
}
export const flipHead = ['Type', 'Pond', 'Scheduled', 'Stages done', 'Next stage', 'Over expected (days)'];
export const flipRow = (r, fmtDate) => [r.kind, r.pond, fmtDate(r.scheduled), `${r.done} of ${r.total}`, r.next, r.over.map(o => `${o.stage} ${o.days}d (exp. ${o.exp}d)`).join('; ') || '–'];

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
    case 'hapa_exchange': { const t = (k, name) => a[k].current != null ? `${name} ${p(a[k].current)}` : a[k].last ? `${name} no exchanges scheduled this week (last recorded week ${a[k].last.w}: ${p(a[k].last.v)})` : `${name} no exchanges recorded`; return `Hapa exchange compliance: ${t('nursery', 'nursery (PNS)')}; ${t('broodstock', 'broodstock (BS)')}.`; }
    case 'bottom_rope': return ['Nursery', 'Broodstock'].map(k => {
      const t = a[k].ponds.reduce((n, x) => n + x.audited, 0), f = a[k].ponds.reduce((n, x) => n + x.failed, 0);
      return t ? `${k}: total of ${t} hapas were audited; ${f} failed the audit metrics, a non-conformance of ${p(f / t)} (${f ? 'still fail' : 'meets the standard'}).` : `${k}: no bottom rope audits were recorded this week.`;
    }).join('\n');
    case 'flipping': return ['Nursery', 'Broodstock'].map(k => { const l = a.progress.filter(r => r.kind === k); return `${k}: ` + (l.length ? `${l.length} pond(s) in progress: ${l.map(r => `${r.pond} (${r.done} of ${r.total} stages${r.next ? ', next: ' + r.next : ''})`).join(', ')}.` : 'no pond in progress.'); }).concat(a.progress.some(r => r.over.length) ? ['Stages above expected days: ' + a.progress.flatMap(r => r.over.map(o => `${r.pond} ${o.stage} ${o.days}d (exp. ${o.exp}d)`)).slice(0, 6).join('; ') + '.'] : []).join('\n');
    case 'brood_density': { const bd = a, f = (l, fn, nm) => l ? `${nm} ${fn(l.v)}${bd.thisWeek && l.w === bd.week ? '' : ` (no recounts this week; last recorded week ${l.w})`}` : `${nm}: no recounts recorded`;
      return `Broodstock ${f(bd.lastRatio, v => `${v.toFixed(2)}:1, ${(v / SEX_TARGET * 100).toFixed(0)}% of the 3:1 standard`, 'sex ratio was')}; ${f(bd.lastDensity, v => `${v.toFixed(2)} kg/m2, ${(v / bd.target_density * 100).toFixed(0)}% of the ${bd.target_density} kg/m2 target`, 'mean stocking density was')}.${bd.thisWeek ? ` ${bd.hapas} hapas were recounted this week.` : ''}`; }
    case 'prep_scoring': return a.length ? `${a.length} pond(s) flipped this month were scored; lowest overall: ${a[0].pond} at ${a[0].overall_score == null ? '-' : (a[0].overall_score * 100).toFixed(0) + '%'}.` : 'No ponds were scored this month.';
    default: return '';
  }
}

/** Pond preparation scoring: latest scored record per pond for ponds flipped in the month of the selected week, lowest overall first. */
export function prepScoring(data, y, w, sunIso) {
  const mon = String(sunIso).slice(0, 7), latest = new Map();
  for (const r of data.pond_prep_scoring || []) if (String(r.flipping_date).slice(0, 7) === mon) { const c = latest.get(r.pond); if (!c || String(r.flipping_date) > String(c.flipping_date)) latest.set(r.pond, r); }
  return [...latest.values()].sort((a, b) => (a.overall_score ?? 9) - (b.overall_score ?? 9));
}

// ---- picture grids (the report fills them automatically) ----
const dmy = d => { const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };
/** Biosecurity: up to 4 photos of the week, newest first, one per item/location before any repeat. rows come from bio_photos. */
export function pickBioPhotos(rows, n = 4) {
  const seen = new Set(), first = [], rest = [];
  for (const r of rows) { const k = r.item + '|' + r.location; (seen.has(k) ? rest : first).push(r); seen.add(k); }
  return first.concat(rest).slice(0, n).map(r => ({ path: r.file_path, caption: [r.item, r.location, dmy(r.log_date)].filter(Boolean).join(', '), bio: true }));
}
/** Pond flipping: the latest photo of every pond still in progress, whatever week it was taken. */
export function pickPondPhotos(data, y, w, photos) {
  const latest = new Map(); for (const p of photos) { const k = String(p.pond).trim().toLowerCase(); if (!latest.has(k)) latest.set(k, p); }   // photos arrive newest first
  const seen = new Set(), out = [];
  for (const r of flips(data, y, w).progress) {
    const k = String(r.pond).trim().toLowerCase(), p = latest.get(k); if (!p || seen.has(k)) continue; seen.add(k);
    out.push({ row: p, caption: [r.pond, p.stage || `${r.done} of ${r.total} stages done`, dmy(p.photo_date)].join(', ') });
  }
  return out;
}
