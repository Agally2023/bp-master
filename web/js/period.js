// Weekly / Monthly / Daily views. The analytics are written per ISO week, so for a month or a day the rows are re-keyed: iso_week becomes the
// month number (1-12) or the day of the year (1-366) of each row's own date. Every chart, table and KPI then works unchanged on that period.
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MODES = [['week', 'Weekly'], ['month', 'Monthly'], ['day', 'Daily']];
const DATE_FIELD = { pond_flips: 'scheduled', sr_efficiency: 'sampling_date', sex_reversal_feed: 'date', hapa_wash_dispatch: 'date', workstation_audits: 'audit_date', biosecurity_audits: 'audit_date', parasitology_samples: 'sample_date', ras_water_volume: 'used_date', ras_parasite_prevalence: 'sample_date',
  day3_recounts: 'recount_date', stocking_audits: 'audit_date', fry_transfers: 'date', egg_separation_ratings: 'date', egg_volumetric_jars: 'date', bottom_rope_audits: 'audit_date',
  broodstock_density: 'date', hapa_exchanges: 'scheduled', pond_prep_scoring: 'flipping_date', fry_culling: 'date', hapa_cov_aerated: 'date', hapa_cov_unaerated: 'date', do_temp_drone: 'date' };
const doy = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5) + 1;
const keyOf = (mode, s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); if (!m) return null; const y = +m[1]; return { y, w: mode === 'month' ? +m[2] : doy(y, +m[2], +m[3]) }; };
let memo = null;
export function periodize(raw, mode) {
  if (mode === 'week' || !raw) return raw;
  if (memo && memo.mode === mode && memo.raw === raw && memo.sig === Object.values(raw).map(a => a ? a.length : 0).join()) return memo.out;
  const out = { ...raw };
  for (const [k, f] of Object.entries(DATE_FIELD)) if (raw[k]) out[k] = raw[k].map(r => { const p = keyOf(mode, r[f] || r.actual_date || r.date); return p ? { ...r, iso_year: p.y, iso_week: p.w } : null; }).filter(Boolean);
  memo = { mode, raw, sig: Object.values(raw).map(a => a ? a.length : 0).join(), out }; return out;
}
export const dayDate = (y, n) => new Date(Date.UTC(y, 0, n));
export const dayShort = (y, n) => { const d = dayDate(y, n); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()].slice(0, 3); };
export const periodWord = { week: 'ISO week', month: 'Month', day: 'Day' };
export function periodLabel(mode, y, w) { return mode === 'month' ? `${MONTHS[w - 1] || w} ${y}` : mode === 'day' ? `${dayShort(y, w)} ${y}` : `Week ${w}, ${y}`; }
export function periodRangeText(mode, y, w) {
  const f = d => d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  if (mode === 'month') return `${f(new Date(Date.UTC(y, w - 1, 1)))} – ${f(new Date(Date.UTC(y, w, 0)))}`;
  if (mode === 'day') return f(dayDate(y, w));
  return null;
}
export function currentPeriod(mode) { const n = new Date(Date.now() - 864e5); const y = n.getUTCFullYear(); return { y, w: mode === 'month' ? n.getUTCMonth() + 1 : doy(y, n.getUTCMonth() + 1, n.getUTCDate()) }; }
// In the Monthly / Daily views the on-screen wording "this week" / "week 46" reads "this month" / "this day".
export function relabel(root, mode) {
  if (mode === 'week' || !root) return;
  const to = mode === 'month' ? 'this month' : 'this day', w = mode === 'month' ? 'month' : 'day';
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
  while ((n = tw.nextNode())) { const t = n.nodeValue; if (/week/i.test(t)) n.nodeValue = t.replace(/this week/gi, to).replace(/\bweekly\b/gi, w + 'ly').replace(/\bNo week \d+ data/g, 'No ' + w + ' data').replace(/last recorded week \d+/g, 'last recorded ' + w).replace(/\bweek\b/g, w); }
}
