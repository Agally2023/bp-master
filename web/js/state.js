import { db } from './db.js?v=202611270912';
import { isoWeek, weekRange } from './util.js?v=202611270912';
export const S = { reg: null, week: null, data: {}, loaded: new Set(), listeners: [] };
export const modByKey = k => S.reg.modules.find(m => m.key === k);
// Dashboard / report preview download only the columns they read (no row_hash, batch or audit-user ids): about a third less data.
// Data Entry and Import need the full rows, so they reload a table that was loaded slim.
export const SLIM = {
 "biosecurity_audits": "id,audit_date,location,category,metric,reported_pct,rating,rating_value,analysis_category,iso_year,iso_week,source,superseded",
 "bottom_rope_audits": "id,unit_type,audit_date,iso_year,iso_week,pond_id,hapa_no,top_position,middle_position,bottom_position,not_tied,missing_hook,total_ropes,missing_posts,wrong_position_ropes,non_conformances,hapa_failed,comment,sinkers",
 "broodstock_density": "id,date,pond,hapa_no,unit_id,female_count,male_count,female_biomass,male_biomass,target_biomass,target_stocking_density_range,sex_ratio_compliant,stocking_density_compliant,iso_year,iso_week",
 "day3_recounts": "id,stocking_date,unit,pond,hapa,batch_code,in_abw,in_fish_no,recount_date,iso_year,iso_week,recount_pcs,recount_abw,survival",
 "egg_separation_ratings": "id,date,incubation_rating,abp_rating,comments,iso_year,iso_week",
 "egg_volumetric_jars": "id,date,pond,incubator,total_h,mixed_h,pct12,overall,star,iso_year,iso_week",
 "fry_transfers": "id,date,origin,load_time,stock_time,pond,hapa,aerators,tray_do,tray_temp,bucket_do_wo,bucket_temp_wo,bucket_do_w,bucket_temp_w,pond_do,pond_temp,activeness,handling,auditor,temp_var,iso_year,iso_week",
 "hapa_exchanges": "id,kind,scheduled,pond,to_exchange,exchanged,actual_date,days_delayed,compliant,comments,iso_year,iso_week",
 "parasitology_samples": "id,sample_date,ras,stage,location,island,parasite,samples_collected,infected_samples,total_parasites,iso_year,iso_week",
 "ras_parasite_prevalence": "id,sample_date,stage_group,prevalence,iso_year,iso_week",
 "ras_water_volume": "id,used_date,shift,tank,volume_l,iso_year,iso_week",
 "stocking_audits": "id,audit_date,ras,abw,req,actual,auditor,remarks,target,est,variance,diff,iso_year,iso_week",
 "workstation_audits": "id,audit_date,iso_year,iso_week,audit_time,ras,total_islands,compliant_islands,noncompliant_islands,score,noncompliance_location,noncompliant_island,employee_responsible,reason,auditor"
};
S.slim = new Set();
const inflight = new Map();   // a table requested twice at once (fast navigation) is downloaded once
S.since = {}; S.period = 'week'; S.failed = new Map();   // tables that could not be loaded (shown as a notice, retried on the next visit)                 // oldest ISO year loaded per table (-Infinity = everything)

// ---- Local cache (IndexedDB): the dashboard opens instantly from the last copy of each table and refreshes it in the background; the screen redraws only if the data changed.
// Cleared on sign-out. Keyed per signed-in user. Any failure here just means "no cache".
const IDB_NAME = 'bpm-cache', IDB_STORE = 't';
let _idb = null;
const idb = () => _idb ||= new Promise(res => { try { const r = indexedDB.open(IDB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch { res(null); } });
const idbOp = async (mode, f) => { const d = await idb(); if (!d) return null; return new Promise(res => { try { const tx = d.transaction(IDB_STORE, mode), q = f(tx.objectStore(IDB_STORE)); tx.oncomplete = () => res(q ? q.result : null); tx.onerror = tx.onabort = () => res(null); } catch { res(null); } }); };
const ckey = (k, slim) => `${db.user?.id || 'anon'}|${k}|${slim ? 's' : 'f'}`;
const cacheGet = (k, slim) => idbOp('readonly', st => st.get(ckey(k, slim)));
const cachePut = (k, slim, since, rows) => idbOp('readwrite', st => st.put({ since, rows, ts: Date.now() }, ckey(k, slim)));
export const cacheClear = () => idbOp('readwrite', st => st.clear());
const cacheDrop = k => idbOp('readwrite', st => { st.delete(ckey(k, true)); st.delete(ckey(k, false)); });
const sig = rows => rows.length + ':' + JSON.stringify(rows).length;
S.dataListeners = new Set();   // views that redraw when a background refresh changed a table
// ensure(keys, sinceYear): sinceYear limits the download to iso_year >= sinceYear (the dashboard only needs the recent trend window).
const ALL_YEARS = new Set(['pond_flips']);   // progressive exercises: a pond can start in one year and finish in the next
export async function ensure(keys, since0 = -Infinity, slim = false) {
  await Promise.all(keys.filter(k => { const since = ALL_YEARS.has(k) ? -Infinity : since0; return !S.loaded.has(k) || (S.since[k] ?? -Infinity) > since || (!slim && S.slim.has(k)); }).map(async k => {
    const since = ALL_YEARS.has(k) ? -Infinity : since0;
    const useSlim = slim && SLIM[k]; const id = k + '|' + since + '|' + (useSlim ? 's' : 'f');
    const fetchFresh = () => {
      const filter = Number.isFinite(since) ? `&iso_year=gte.${since}` : '';
      return db.load(k, filter, useSlim ? SLIM[k] : '*');
    };
    const apply = d => { S.data[k] = d; S.loaded.add(k); S.since[k] = since; useSlim ? S.slim.add(k) : S.slim.delete(k); S.failed.delete(k); };
    if (!inflight.has(id)) {
      const cached = db.mode !== 'demo' ? await cacheGet(k, !!useSlim) : null;
      if (cached && Array.isArray(cached.rows) && (cached.since ?? -Infinity) <= since && Date.now() - cached.ts < 7 * 864e5) {
        apply(cached.rows);   // show the last copy now, refresh behind the scenes
        const p = fetchFresh().then(d => { if (sig(d) !== sig(cached.rows)) { apply(d); cachePut(k, !!useSlim, since, d); S.dataListeners.forEach(f => f()); } else cachePut(k, !!useSlim, since, d); }).catch(() => { }).finally(() => inflight.delete(id));
        inflight.set(id, p); return;
      }
      const p = fetchFresh().then(d => { apply(d); if (db.mode !== 'demo') cachePut(k, !!useSlim, since, d); }).catch(e => { S.failed.set(k, e.message); if (!S.data[k]) S.data[k] = []; }).finally(() => inflight.delete(id));
      inflight.set(id, p);
    }
    return inflight.get(id);
  }));
  return S.data;
}
export const invalidate = k => { S.slim.delete(k); S.loaded.delete(k); delete S.since[k]; cacheDrop(k); };
export function currentWeek() { const d = new Date(Date.now() - 864e5); const r = isoWeek(d); return { y: r.year, w: r.week }; }
export const onWeek = f => S.listeners.push(f);
export function setWeek(y, w) { S.week = { y, w }; S.listeners.forEach(f => f()); }
export function setPeriod(mode) { S.period = mode; }
