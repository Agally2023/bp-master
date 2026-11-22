// qc-sync: pulls changed Quality Control workbooks from SharePoint (Microsoft Graph, app-only, read-only) into BP Master.
// Called hourly by pg_cron (see supabase/SYNC_SETUP.md) or by an admin. Idempotent: row_hash matches the app's importer.
import * as XLSX from "npm:xlsx@0.18.5";

const env = (k: string) => Deno.env.get(k) ?? "";
const SB = env("SUPABASE_URL"), SRK = env("SUPABASE_SERVICE_ROLE_KEY");
const sbH = { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

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
const MODULES: Record<string, { table: string; parse: (wb: XLSX.WorkBook) => Promise<{ rows: Record<string, unknown>[]; read: number; pending: number; bad: number; dateKey: string }> }> = {
  day3_recounts: { table: "bpm_day3_recounts", parse: day3 },
};

async function syncOne(src: Record<string, any>, token: string, force: boolean) {
  const mod = MODULES[src.key]; if (!mod) return { key: src.key, status: "skipped", message: "no importer for this source yet" };
  const meta = await (await fetch(`https://graph.microsoft.com/v1.0/drives/${src.drive_id}/items/${src.item_id}?select=lastModifiedDateTime,name`, { headers: { Authorization: `Bearer ${token}` } })).json();
  if (!meta.lastModifiedDateTime) throw new Error("SharePoint: " + (meta.error?.message ?? "file not reachable"));
  if (!force && src.remote_modified && new Date(src.remote_modified).getTime() === new Date(meta.lastModifiedDateTime).getTime()) {
    await rest(`bpm_sync_sources?key=eq.${src.key}`, { method: "PATCH", body: JSON.stringify({ last_run: new Date().toISOString(), last_status: "unchanged", last_message: "File not changed since last load" }) });
    return { key: src.key, status: "unchanged" };
  }
  const f = await fetch(`https://graph.microsoft.com/v1.0/drives/${src.drive_id}/items/${src.item_id}/content`, { headers: { Authorization: `Bearer ${token}` } });
  if (!f.ok) throw new Error(`Download failed (${f.status}). A sensitivity label or permission may block app access.`);
  const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array", cellDates: true });
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
  if (!env("SYNC_KEY") || req.headers.get("x-sync-key") !== env("SYNC_KEY")) return json({ error: "unauthorized" }, 401);
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
