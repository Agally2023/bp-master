// qc-sync: pulls changed Quality Control workbooks from SharePoint (Microsoft Graph, app-only, read-only) into BP Master.
// Called hourly by pg_cron (see supabase/SYNC_SETUP.md) or by an admin. Idempotent: row_hash matches the app's importer.
import * as XLSX from "npm:xlsx@0.18.5";
import { PONDS } from "./ponds.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const SB = env("SUPABASE_URL"), SRK = env("SUPABASE_SERVICE_ROLE_KEY");
const sbH = { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-sync-key", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
// Callers: pg_cron (x-sync-key) or a signed-in admin/auditor from the app's Data Entry page (their JWT is checked against bpm_profiles).
async function allowed(req: Request) {
  if (env("SYNC_KEY") && req.headers.get("x-sync-key") === env("SYNC_KEY")) return "cron";
  const a = req.headers.get("authorization") ?? ""; if (!a.startsWith("Bearer ")) return null;
  const r = await fetch(`${SB}/rest/v1/rpc/app_role`, { method: "POST", headers: { apikey: SRK, Authorization: a, "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) return null; const role = await r.json(); return role === "admin" || role === "auditor" ? role : null;
}

async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function graphToken() {
  const r = await fetch(`https://login.microsoftonline.com/${env("MS_TENANT_ID")}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("MS_CLIENT_ID"), client_secret: env("MS_CLIENT_SECRET"), scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  const j = await r.json(); if (!j.access_token) throw new Error("Microsoft sign-in failed: " + (j.error_description ?? r.status)); return j.access_token as string;
}
const rest = (path: string, init: RequestInit = {}) => fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...sbH, ...(init.headers ?? {}) } });

// ---- cell helpers
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
function isoDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(+v)) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), 12)).toISOString().slice(0, 10);
  if (typeof v === "number" && v > 30000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(String(v ?? "").trim()); // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const s = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}
const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
function isoWeek(d: string) {
  const t = new Date(d + "T12:00:00Z"); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3);
  const y = t.getUTCFullYear(), j = new Date(Date.UTC(y, 0, 4)); return { iso_year: y, iso_week: 1 + Math.round(((+t - +j) / 86400000 - 3 + ((j.getUTCDay() + 6) % 7)) / 7) };
}
const txt = (v: unknown) => { if (v == null || String(v).trim() === "") return null; const n = typeof v === "number" ? v : NaN; return Number.isFinite(n) && Number.isInteger(n) ? String(n) : String(v).trim(); };

// ---- 3-day recounts: same rules as web/js/engine.js + modules.json
async function day3(wb: XLSX.WorkBook) {
  const ws = wb.Sheets["Data"]; if (!ws) throw new Error("Sheet 'Data' not found");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null }) as unknown[][];
  const hi = rows.findIndex((r) => r.some((c) => norm(c) === "stocking date")); if (hi < 0) throw new Error("Header 'Stocking Date' not found");
  const idx: Record<string, number> = {}; rows[hi].forEach((c, i) => { const k = norm(c); if (k && !(k in idx)) idx[k] = i; });
  const need = ["stocking date", "pond", "hapa", "in fish no", "day 3 recount date", "day 3 recount pcs"];
  const miss = need.filter((k) => !(k in idx)); if (miss.length) throw new Error("Missing columns: " + miss.join(", "));
  const g = (r: unknown[], k: string) => (k in idx ? r[idx[k]] : null);
  const today = new Date().toISOString().slice(0, 10); const occ = new Map<string, number>(); const out: Record<string, unknown>[] = [];
  let read = 0, pending = 0, bad = 0;
  for (const r of rows.slice(hi + 1)) {
    if (r.every((c) => c == null || c === "")) continue; read++;
    let pond = txt(g(r, "pond")), hapa = txt(g(r, "hapa"));
    const u = /^(.+)-(\d+)$/.exec(String(g(r, "unit") ?? "").trim());
    if (u) { pond ??= u[1]; hapa ??= u[2]; }
    const rd = isoDate(g(r, "day 3 recount date")), pcs = num(g(r, "day 3 recount pcs")), fish = num(g(r, "in fish no"));
    if (rd == null || pcs == null || fish == null) { pending++; continue; }              // not recounted yet
    if (!pond || !hapa || rd > today || fish <= 0) { bad++; continue; }
    const sd = isoDate(g(r, "stocking date"));
    const base = JSON.stringify([sd, pond, hapa]); const n = occ.get(base) ?? 0; occ.set(base, n + 1);
    const w = isoWeek(rd);
    out.push({
      stocking_date: sd, pond, hapa, batch_code: txt(g(r, "ras")), in_abw: num(g(r, "in abw")), in_fish_no: Math.round(fish),
      recount_date: rd, recount_pcs: Math.round(pcs), recount_abw: num(g(r, "day 3 recount abw")),
      unit: `${pond}-${hapa}`, survival: Math.round((pcs / fish) * 1e4) / 1e4, ...w,
      row_hash: await sha256("day3_recounts|nat|" + [sd, pond, hapa].map((x) => String(x ?? "")).join("|") + "|#" + n),
    });
  }
  return { rows: out, read, pending, bad, dateKey: "recount_date" };
}

// ---- generic table importer: same column matching, coercion, validation and hashing as web/js/engine.js (row_hash must be identical)
const ERR = /^#(REF|DIV\/0|N\/A|VALUE|NAME|NUM|NULL)/i;
const isEmpty = (v: unknown) => v == null || (typeof v === "string" && (v.trim() === "" || ERR.test(v.trim())));
const pondKey = (v: unknown) => String(v ?? "").toUpperCase().replace(/[\s_]+/g, "").replace(/^HO-/, "H0-");
const POND_MAP = new Map(PONDS.map((p) => [pondKey(p), p]));
type F = { name: string; type: "date" | "num" | "int" | "text"; req?: boolean; min?: number; max?: number; pond?: boolean; derived?: boolean };
function coerce(f: F, v: unknown): unknown {
  if (isEmpty(v)) return null;
  switch (f.type) {
    case "date": return isoDate(v);
    case "int": { const n = Number(typeof v === "string" ? v.replace(/,/g, "") : v); return Number.isFinite(n) ? Math.round(n) : null; }
    case "num": { const n = Number(typeof v === "string" ? v.replace(/,/g, "").replace(/%$/, "") : v); return Number.isFinite(n) ? n : null; }
    default: { if (v instanceof Date) return v.toISOString().slice(0, 10); const s = String(v).trim(); return s === "" ? null : s; }
  }
}
function tableParser(spec: { sheet: string; header: string; map: Record<string, string>; fields: F[]; key: string; dateField: string; minDate?: string }) {
  return async (wb: XLSX.WorkBook) => {
    const ws = wb.Sheets[spec.sheet]; if (!ws) throw new Error(`Sheet '${spec.sheet}' not found`);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null }) as unknown[][];
    const want = norm(spec.header); let hi = -1;
    for (let i = 0; i < Math.min(rows.length, 80); i++) { const first = (rows[i] || []).find((v) => v != null && String(v).trim() !== ""); if (first != null && norm(first) === want) { hi = i; break; } }
    if (hi < 0) throw new Error(`Header '${spec.header}' not found on sheet '${spec.sheet}'`);
    const hs = rows[hi].map(norm); const idx: Record<string, number> = {};
    for (const [field, p] of Object.entries(spec.map)) idx[field] = hs.findIndex((x) => x && x.startsWith(p.replace(/\s+/g, " ").toLowerCase()));
    const missing = Object.entries(idx).filter(([k, v]) => v < 0 && spec.fields.find((f) => f.name === k)?.req).map(([k]) => k);
    if (missing.length) throw new Error("Missing columns: " + missing.join(", "));
    const today = new Date().toISOString().slice(0, 10); const occ = new Map<string, number>(); const out: Record<string, unknown>[] = [];
    let read = 0, bad = 0;
    for (const r of rows.slice(hi + 1)) {
      const row: Record<string, unknown> = {}; let any = false;
      for (const f of spec.fields) { if (f.derived || !(f.name in idx) || idx[f.name] < 0) continue; const v = r[idx[f.name]]; if (!isEmpty(v)) { row[f.name] = coerce(f, v); any = true; } }
      if (!any) continue; read++;
      for (const f of spec.fields) if (f.pond && row[f.name] != null) { const c = POND_MAP.get(pondKey(row[f.name])); if (c) row[f.name] = c; }
      const dv = row[spec.dateField] as string | null;
      if (spec.fields.some((f) => f.req && !f.derived && (row[f.name] == null || row[f.name] === "")) || !dv || dv > today || (spec.minDate && dv < spec.minDate)) { bad++; continue; }
      if (spec.fields.some((f) => f.pond && row[f.name] != null && !POND_MAP.has(pondKey(row[f.name])))) { bad++; continue; }
      if (spec.fields.some((f) => (f.min != null || f.max != null) && row[f.name] != null && ((row[f.name] as number) < (f.min ?? -Infinity) || (row[f.name] as number) > (f.max ?? Infinity)))) { bad++; continue; }
      Object.assign(row, isoWeek(dv));
      const stored: Record<string, unknown> = {}; for (const f of [...spec.fields.filter((f) => !f.derived), { name: "iso_year" }, { name: "iso_week" }] as F[]) stored[f.name] = row[f.name] ?? null;
      const base = JSON.stringify(stored); const n = occ.get(base) ?? 0; occ.set(base, n + 1);
      const sh = spec.key + "|" + Object.keys(stored).sort().map((k) => k + "=" + JSON.stringify(stored[k])).join("|") + "|#" + n;
      out.push({ ...stored, row_hash: await sha256(sh) });
    }
    return { rows: out, read, pending: 0, bad, dateKey: spec.dateField };
  };
}
const MODULES: Record<string, { table: string; parse: (wb: XLSX.WorkBook) => Promise<{ rows: Record<string, unknown>[]; read: number; pending: number; bad: number; dateKey: string }> }> = {
  day3_recounts: { table: "bpm_day3_recounts", parse: day3 },
  egg_volumetric_jars: { table: "bpm_egg_volumetric_jars", parse: tableParser({ key: "egg_volumetric_jars", sheet: "Egg Volumetric Data", header: "Date", dateField: "date", minDate: "2025-01-01",
    map: { date: "date", pond: "pond id", incubator: "incubator", total_h: "total egg height", mixed_h: "mixed stages", pct12: "% stage 1", overall: "% overall", star: "star rating" },
    fields: [{ name: "date", type: "date", req: true }, { name: "pond", type: "text", req: true, pond: true }, { name: "incubator", type: "text" }, { name: "total_h", type: "num" }, { name: "mixed_h", type: "num" },
      { name: "pct12", type: "num" }, { name: "overall", type: "num" }, { name: "star", type: "int", req: true, min: 0, max: 5 }] }) },
  egg_separation_ratings: { table: "bpm_egg_separation_ratings", parse: tableParser({ key: "egg_separation_ratings", sheet: "Egg Separation Ratings", header: "Egg Collection Date", dateField: "date",
    map: { date: "egg collection date", incubation_rating: "incubation rating", abp_rating: "aqua best practice", comments: "comments" },
    fields: [{ name: "date", type: "date", req: true }, { name: "incubation_rating", type: "num" }, { name: "abp_rating", type: "num", req: true, min: 1, max: 5 }, { name: "comments", type: "text" }] }) },
};

const FILES = new Map<string, Promise<ArrayBuffer>>();   // one download per file per run
async function syncOne(src: Record<string, any>, token: string, force: boolean) {
  const mod = MODULES[src.key]; if (!mod) return { key: src.key, status: "skipped", message: "no importer for this source yet" };
  const meta = await (await fetch(`https://graph.microsoft.com/v1.0/drives/${src.drive_id}/items/${src.item_id}?select=lastModifiedDateTime,name`, { headers: { Authorization: `Bearer ${token}` } })).json();
  if (!meta.lastModifiedDateTime) throw new Error("SharePoint: " + (meta.error?.message ?? "file not reachable"));
  if (!force && src.remote_modified && new Date(src.remote_modified).getTime() === new Date(meta.lastModifiedDateTime).getTime()) {
    await rest(`bpm_sync_sources?key=eq.${src.key}`, { method: "PATCH", body: JSON.stringify({ last_run: new Date().toISOString(), last_status: "unchanged", last_message: "File not changed since last load" }) });
    return { key: src.key, status: "unchanged" };
  }
  const fk = src.drive_id + "|" + src.item_id + "|" + meta.lastModifiedDateTime;
  if (!FILES.has(fk)) FILES.set(fk, (async () => {
    const f = await fetch(`https://graph.microsoft.com/v1.0/drives/${src.drive_id}/items/${src.item_id}/content`, { headers: { Authorization: `Bearer ${token}` } });
    if (!f.ok) throw new Error(`Download failed (${f.status}). A sensitivity label or permission may block app access.`);
    return await f.arrayBuffer();
  })());
  const wb = XLSX.read(new Uint8Array(await FILES.get(fk)!), { type: "array", cellDates: false });
  const p = await mod.parse(wb);
  for (let i = 0; i < p.rows.length; i += 400) {
    const r = await rest(`${mod.table}?on_conflict=row_hash&select=row_hash`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(p.rows.slice(i, i + 400)) });
    if (!r.ok) throw new Error("Database write failed: " + (await r.text()).slice(0, 300));
  }
  const latest = p.rows.map((x) => String(x[p.dateKey])).sort().pop() ?? null;
  const cnt = await (await rest(`${mod.table}?select=id`, { method: "HEAD", headers: { Prefer: "count=exact" } })).headers.get("content-range");
  const msg = `${p.rows.length} complete rows read, ${p.pending} awaiting recount, ${p.bad} skipped; latest recount ${latest}. Table now ${cnt?.split("/")[1] ?? "?"} rows.`;
  await rest(`bpm_sync_sources?key=eq.${src.key}`, { method: "PATCH", body: JSON.stringify({ remote_modified: meta.lastModifiedDateTime, last_run: new Date().toISOString(), last_status: "ok", last_message: msg, rows_read: p.read, rows_new: p.rows.length, latest_data_date: latest }) });
  await rest("bpm_sync_log", { method: "POST", body: JSON.stringify({ source: src.key, status: "ok", message: msg, rows_read: p.read, rows_new: p.rows.length }) });
  return { key: src.key, status: "ok", message: msg };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (!(await allowed(req))) return json({ error: "unauthorized" }, 401);
  if (!env("MS_TENANT_ID") || !env("MS_CLIENT_ID") || !env("MS_CLIENT_SECRET")) return json({ error: "Microsoft app not configured yet (MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET secrets missing)" }, 503);
  const url = new URL(req.url); const force = url.searchParams.get("force") === "1"; const only = url.searchParams.get("source");
  const results: unknown[] = [];
  try {
    const token = await graphToken();
    const srcs: any[] = await (await rest(`bpm_sync_sources?enabled=eq.true${only ? `&key=eq.${only}` : ""}&select=*`)).json();
    for (const s of srcs) {
      try { results.push(await syncOne(s, token, force)); }
      catch (e) {
        const m = String((e as Error).message);
        await rest(`bpm_sync_sources?key=eq.${s.key}`, { method: "PATCH", body: JSON.stringify({ last_run: new Date().toISOString(), last_status: "error", last_message: m }) });
        await rest("bpm_sync_log", { method: "POST", body: JSON.stringify({ source: s.key, status: "error", message: m }) });
        results.push({ key: s.key, status: "error", message: m });
      }
    }
  } catch (e) { return json({ error: String((e as Error).message) }, 502); }
  return json({ results });
});
