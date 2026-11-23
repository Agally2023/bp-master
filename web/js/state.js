import { db } from './db.js';
import { isoWeek, weekRange } from './util.js';
export const S = { reg: null, week: null, data: {}, loaded: new Set(), listeners: [] };
export const modByKey = k => S.reg.modules.find(m => m.key === k);
const inflight = new Map();   // a table requested twice at once (fast navigation) is downloaded once
S.since = {}; S.failed = new Map();   // tables that could not be loaded (shown as a notice, retried on the next visit)                 // oldest ISO year loaded per table (-Infinity = everything)
// ensure(keys, sinceYear): sinceYear limits the download to iso_year >= sinceYear (the dashboard only needs the recent trend window).
const ALL_YEARS = new Set(['pond_flips']);   // progressive exercises: a pond can start in one year and finish in the next
export async function ensure(keys, since0 = -Infinity) {
  await Promise.all(keys.filter(k => { const since = ALL_YEARS.has(k) ? -Infinity : since0; return !S.loaded.has(k) || (S.since[k] ?? -Infinity) > since; }).map(k => {
    const since = ALL_YEARS.has(k) ? -Infinity : since0;
    const id = k + '|' + since;
    if (!inflight.has(id)) {
      const filter = Number.isFinite(since) ? `&iso_year=gte.${since}` : '';
      const p = db.load(k, filter).then(d => { S.data[k] = d; S.loaded.add(k); S.since[k] = since; S.failed.delete(k); }).catch(e => { S.failed.set(k, e.message); if (!S.data[k]) S.data[k] = []; }).finally(() => inflight.delete(id));   // one table failing no longer blocks the whole page
      inflight.set(id, p);
    }
    return inflight.get(id);
  }));
  return S.data;
}
export const invalidate = k => { S.loaded.delete(k); delete S.since[k]; };
export function currentWeek() { const d = new Date(Date.now() - 864e5); const r = isoWeek(d); return { y: r.year, w: r.week }; }
export const onWeek = f => S.listeners.push(f);
export function setWeek(y, w) { S.week = { y, w }; S.listeners.forEach(f => f()); }
