import { db } from './db.js';
import { isoWeek, weekRange } from './util.js';
export const S = { reg: null, week: null, data: {}, loaded: new Set(), listeners: [] };
export const modByKey = k => S.reg.modules.find(m => m.key === k);
export async function ensure(keys) {
  const need = keys.filter(k => !S.loaded.has(k));
  await Promise.all(need.map(async k => { S.data[k] = await db.load(k); S.loaded.add(k); }));
  return S.data;
}
export const invalidate = k => { S.loaded.delete(k); };
export function currentWeek() { const d = new Date(Date.now() - 864e5); const r = isoWeek(d); return { y: r.year, w: r.week }; }
export const onWeek = f => S.listeners.push(f);
export function setWeek(y, w) { S.week = { y, w }; S.listeners.forEach(f => f()); }
