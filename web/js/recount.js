// Day-3 recounts vs terminal (22-day) survival of the same hapas, by month.
// Day-3 survival: 3-Day Pond Survival (Recounts). Terminal survival: VF Hatchery Masterfile, Transfer to Lake tab (matched on pond + hapa, the transfer
// following the recount); the salt-bath file's terminal survival fills in hapas that are not in the Masterfile yet.
import * as T from './stats.js?v=202611270945';
const { fp, fn, fpc, describe } = T;
const num = v => { if (v == null || v === '') return null; const x = Number(String(v).replace(/[^0-9.\-eE]/g, '')); return Number.isFinite(x) ? x : null; };
const frac = v => { const x = num(v); return x == null ? null : x > 1.5 ? x / 100 : x; };
const day = s => { const t = Date.parse(String(s || '').slice(0, 10) + 'T00:00:00Z'); return Number.isFinite(t) ? t / 864e5 : null; };
const key = (p, h) => `${String(p || '').trim().toUpperCase()}|${num(h)}`;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = ym => { const [y, m] = ym.split('-'); return `${MONTHS[+m - 1]} ${y}`; };

// all matched hapas (recount month = month of the day-3 recount)
export function recountPairs(D) {
  const lake = new Map(), bath = new Map();
  for (const r of D.transfer_to_lake || []) { const s = frac(r.survival), d = day(r.date_stocked_to_lake); if (s == null || d == null) continue; const k = key(r.pond, r.hapa_no); (lake.get(k) || lake.set(k, []).get(k)).push({ d, s }); }
  for (const r of D.salt_bath || []) { const s = frac(r.terminal_survival); if (s == null) continue; bath.set(key(r.pond, r.hapa_no) + '|' + String(r.stocking_date || '').slice(0, 10), s); }
  const out = [];
  for (const r of D.day3_recounts || []) {
    const d3 = frac(r.survival), rd = day(r.recount_date); if (d3 == null || rd == null) continue;
    const k = key(r.pond, r.hapa);
    let term = null, via = null;
    const c = (lake.get(k) || []).filter(x => x.d > rd && x.d <= rd + 45).sort((a, b) => a.d - b.d)[0];
    if (c) { term = c.s; via = 'Masterfile'; } else if (bath.has(k + '|' + String(r.stocking_date || '').slice(0, 10))) { term = bath.get(k + '|' + String(r.stocking_date || '').slice(0, 10)); via = 'Salt bath file'; }
    out.push({ ym: String(r.recount_date).slice(0, 7), id: `${String(r.pond).toUpperCase()}-${num(r.hapa) ?? r.hapa}`, pond: String(r.pond).toUpperCase(), d3, term, via });
  }
  return out;
}
export const recountMonths = D => { const m = new Map(); for (const p of recountPairs(D)) if (p.term != null) m.set(p.ym, (m.get(p.ym) || 0) + 1); return [...m.keys()].sort().reverse(); };

// the analysis for one month, in the same shape as the Statistics catalogue ({ title, objective, n, stats, chart, table, comment })
export function recountTerminal(D, ym) {
  const all = recountPairs(D).filter(p => p.ym === ym), recounted = all.length, matched = all.filter(p => p.term != null);
  const ok = matched.filter(p => p.d3 > 0 && p.d3 <= 1 && p.term > 0 && p.term <= 1), over = matched.length - ok.length;
  const title = `Day-3 recount vs terminal survival, ${monthLabel(ym)}`, objective = 'Check whether hapas that survived well at the 3-day recount also survive well to the 22-day transfer, and measure the loss between the two counts.';
  const base = { id: 'recount_terminal', group: 'Nursery', title, objective, ym };
  if (ok.length < 3) return { ...base, n: ok.length, stats: [['Hapas recounted', recounted], ['Matched to terminal survival', matched.length]], chart: null, table: null,
    comment: `Hypothesis: terminal survival follows day-3 survival. Too few records to test (${ok.length} matched hapas with survival between 0 and 100%). Hapas are matched when they appear in both the 3-Day Survival file and the Transfer to Lake tab; import both files to complete the month.` };
  const d3 = ok.map(p => p.d3), tm = ok.map(p => p.term), loss = ok.map(p => p.d3 - p.term), wp = T.wilcoxonPaired(d3, tm), sp = T.spearman(d3, tm);
  const md3 = describe(d3).median, mtm = describe(tm).median, mloss = describe(loss).median;
  const sorted = [...ok].sort((a, b) => a.d3 - b.d3), cap = 40, shown = sorted.length > cap ? Array.from({ length: cap }, (_, i) => sorted[Math.round(i * (sorted.length - 1) / (cap - 1))]) : sorted;
  const pv = p => p == null ? null : p < 0.001 ? '<0.001' : p.toFixed(3);
  const lossTxt = `median loss ${(mloss * 100).toFixed(1)} percentage points`;
  const comment = `Hypothesis: terminal survival equals day-3 survival for the hapas recounted in ${monthLabel(ym)}. ` + (wp.p == null ? 'Too few records to test. ' :
    wp.p < 0.05 ? `Rejected (Wilcoxon p ${pv(wp.p)}): median survival ${mtm < md3 ? 'fell' : 'rose'} from ${fpc(md3)} at day 3 to ${fpc(mtm)} at day 22 (${lossTxt})${mtm < md3 ? ', so much of the loss happens after the 3-day count' : ', which points to recount over-estimation or errors at day 3'}. ` : `Not rejected (Wilcoxon p ${pv(wp.p)}): median survival stayed close, ${fpc(md3)} at day 3 and ${fpc(mtm)} at day 22. `)
    + (sp.p == null ? '' : sp.p < 0.05 ? `Day-3 survival is a useful early warning: hapas with low day-3 survival also ended low (Spearman rho ${fn(sp.rho)}, p ${pv(sp.p)}). ` : `Day-3 survival does not predict terminal survival here (Spearman rho ${fn(sp.rho)}, p ${pv(sp.p)}), so the 22-day count is needed to judge performance. `)
    + (over ? `${over} matched hapa${over > 1 ? 's' : ''} with a survival above 100% (recount or entry error) were left out.` : '');
  return { ...base, n: ok.length, comment: comment.trim(),
    stats: [['Hapas recounted', recounted], ['Matched', matched.length], ['Median day-3', fpc(md3)], ['Median terminal', fpc(mtm)], ['Median loss', `${(mloss * 100).toFixed(1)} pts`], ['Wilcoxon p', pv(wp.p) ?? '–'], ['Spearman rho', fn(sp.rho)]],
    chart: { kind: 'bar', cats: shown.map(p => p.id), series: [['Day-3 survival', shown.map(p => p.d3), 'CB8306'], ['Terminal (22-day) survival', shown.map(p => p.term), '0E812E']], x: 'Hapa (pond-hapa)' + (sorted.length > cap ? `, ${cap} of ${sorted.length} shown, sorted by day-3 survival` : ', sorted by day-3 survival'), y: 'Survival (%)', pct: true, min: 0, max: 1 },
    table: { head: ['Hapa', 'Day-3', 'Terminal', 'Change (pts)'], rows: sorted.slice(0, 12).map(p => [p.id, fpc(p.d3), fpc(p.term), ((p.term - p.d3) * 100).toFixed(1)]) } };
}
