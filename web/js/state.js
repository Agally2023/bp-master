import { db } from './db.js';
import { isoWeek, weekRange } from './util.js';
export const S = { reg: null, week: null, data: {}, loaded: new Set(), listeners: [] };
export const modByKey = k => S.reg.modules.find(m => m.key === k);
const inflight = new Map();   // a table requested twice at once (fast navigation) is downloaded once
export async function ensure(keys) {
  await Promise.all(keys.filter(k => !S.loaded.has(k)).map(k => {
    if (!inflight.has(k)) {
      const p = db.load(k).then(d => { if (inflight.get(k) === p) { S.data[k] = d; S.loaded.add(k); } }).finally(() => { if (inflight.get(k) === p) inflight.delete(k); });
      inflight.set(k, p);
    }
    return inflight.get(k);
  }));
  return S.data;
}
export const invalidate = k => { S.loaded.delete(k); inflight.delete(k); };
export function currentWeek() { const d = new Date(Date.now() - 864e5); const r = isoWeek(d); return { y: r.year, w: r.week }; }
export const onWeek = f => S.listeners.push(f);
export function setWeek(y, w) { S.week = { y, w }; S.listeners.forEach(f => f()); }
