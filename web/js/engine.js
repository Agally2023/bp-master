// Registry-driven import/derive/validate engine. Same rules as the Python report engine.
import { isoWeek, sha256, todayIso, iso } from './util.js';

export const ERR = /^#(REF!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!|NULL!)$/;
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const isEmpty = v => v == null || (typeof v === 'string' && (v.trim() === '' || ERR.test(v.trim())));

export const storedFields = m => m.fields.filter(f => !f.virtual && !f.excel_formula);
export const entryFields = m => m.fields.filter(f => !f.derived && !f.virtual || f.virtual);

export function findHeaderRow(rows, header) {
  const want = norm(header);
  for (let i = 0; i < Math.min(rows.length, 80); i++) {
    const first = (rows[i] || []).find(v => v != null && String(v).trim() !== '');
    if (first != null && norm(first) === want) return i;
  }
  return -1;
}
export function mapColumns(headerCells, spec) {
  const hs = headerCells.map(norm); const idx = {}; const missing = [];
  for (const [field, pref] of Object.entries(spec.map || {})) {
    const prefs = Array.isArray(pref) ? pref : [pref]; let found = -1;
    for (const p of prefs) {
      const k = spec.exact ? hs.indexOf(norm(p)) : hs.findIndex(x => x && x.startsWith(String(p).replace(/\s+/g, ' ').toLowerCase()));
      if (k >= 0) { found = k; break; }
    }
    idx[field] = found; if (found < 0) missing.push(field);
  }
  return { idx, missing };
}

// ---- value coercion
export function toIsoDate(v) {
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  if (typeof v !== 'string') return null; const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(s);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
}
export function coerce(f, v) {
  if (isEmpty(v)) return null;
  switch (f.type) {
    case 'date': return toIsoDate(v);
    case 'int': { const n = Number(typeof v === 'string' ? v.replace(/,/g, '') : v); return Number.isFinite(n) ? Math.round(n) : null; }
    case 'num': { const n = Number(typeof v === 'string' ? v.replace(/,/g, '').replace(/%$/, '') : v); return Number.isFinite(n) ? n : null; }
    case 'bool': return v === true || /^(true|yes|1)$/i.test(String(v));
    default: { if (v instanceof Date) return v.toISOString().slice(0, 10); const s = String(v).trim(); return s === '' ? null : s; }
  }
}
// Pond list (ponds.json, from the "Pond Allocation file" tab of the hapa coverage audit). Pond fields must match it.
let POND_MAP = new Map();
const pondKey = v => String(v ?? '').toUpperCase().replace(/[\s_]+/g, '').replace(/^HO-/, 'H0-');
export function setPonds(list) { POND_MAP = new Map(list.map(p => [pondKey(p), p])); }
export const pondCanon = v => POND_MAP.get(pondKey(v));
export function normalizeRow(m, row) {
  for (const f of m.fields) if (f.pond && row[f.name] != null) { const c = pondCanon(row[f.name]); if (c) row[f.name] = c; }
  for (const [k, rule] of Object.entries(m.normalize || {})) {
    if (row[k] == null) continue;
    if (rule === 'ras') row[k] = String(row[k]).toUpperCase().replace(/\s+/g, '');
    else if (Array.isArray(rule)) { const c = rule.find(x => x.toLowerCase() === String(row[k]).trim().toLowerCase()); if (c) row[k] = c; }
  }
  return row;
}
const r4 = (v, n) => n == null ? v : Math.round(v * 10 ** n) / 10 ** n;
export function derive(m, row) {
  for (const d of m.derive || []) {
    const g = k => row[k] == null || row[k] === '' ? null : Number(row[k]);
    switch (d.fn) {
      case 'isoweek': { const v = row[d.date]; if (v) { const w = isoWeek(v); row.iso_year = w.year; row.iso_week = w.week; } else { row.iso_year = row.iso_week = null; } break; }
      case 'ratio': { const a = g(d.num), b = g(d.den); row[d.out] = a != null && b ? r4(a / b, d.round) : null; break; }
      case 'ratio_m1': { const a = g(d.num), b = g(d.den); row[d.out] = a != null && b ? r4(a / b - 1, d.round) : null; break; }
      case 'minus': { const a = g(d.a), b = g(d.b); row[d.out] = a != null && b != null ? r4(a - b, d.round) : null; break; }
      case 'sum': row[d.out] = d.of.reduce((s, k) => s + (g(k) || 0), 0); break;
      case 'gt0': row[d.out] = (g(d.of) || 0) > 0; break;
      case 'concat': row[d.out] = d.parts.every(k => row[k] != null && row[k] !== '') ? d.parts.map(k => row[k]).join(d.sep) : null; break;
      case 'countpos': row[d.out] = d.of.filter(k => (g(k) || 0) > 0).length; break;
      case 'pond_prep': pondPrep(m, row); break;
      case 'sumcols': row[d.out] = d.of.reduce((s, k) => s + (g(k) || 0), 0); break;
    }
  }
  return row;
}
// Pond Preparation Scoring: same rules as the "Pond Scoring" sheet (stage = KPIs met / 5; preparation = average of the stages;
// WQ = parameters inside their limit / parameters tested; post-stocking = KPIs passed / KPIs with data; overall = average of preparation and post-stocking).
function pondPrep(m, row) {
  const R = m.rules, n = v => v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v), r4 = v => v == null ? null : Math.round(v * 1e4) / 1e4;
  if (n(row.survival_3doc) > 3) row.survival_3doc = n(row.survival_3doc) / 100;   // typed as a percentage
  if (n(row.parasite_d6) > 1.5) row.parasite_d6 = n(row.parasite_d6) / 100;
  const st = R.stages.map(k => { const kk = n(row['k_' + k]); const sc = kk == null ? null : r4(kk / R.kpis); row['s_' + k] = sc; return sc; }).filter(v => v != null);
  const prep = st.length ? st.reduce((a, b) => a + b, 0) / st.length : null; row.prep_score = r4(prep);
  const t = [['ammonia', v => v <= R.ammonia], ['nitrite', v => v <= R.nitrite], ['nitrate', v => v <= R.nitrate], ['calcium_hardness', v => v <= R.calcium_hardness], ['secchi', v => v >= R.secchi],
    ['ph', v => v >= R.ph_lo && v <= R.ph_hi], ['dissolved_oxygen', v => v >= R.dissolved_oxygen], ['chlorine_residue', v => v <= R.chlorine_residue]].filter(([k]) => n(row[k]) != null);
  row.wq_score = t.length ? r4(t.filter(([k, f]) => f(n(row[k]))).length / t.length) : null;
  const p = [];
  if (n(row.survival_3doc) != null) p.push(n(row.survival_3doc) >= R.surv);
  if (n(row.mort_d7) != null || n(row.mort_d14) != null) p.push((n(row.mort_d7) == null || n(row.mort_d7) < R.mort) && (n(row.mort_d14) == null || n(row.mort_d14) < R.mort));
  if (n(row.parasite_d6) != null) p.push(n(row.parasite_d6) < R.prev);
  if (row.wq_score != null) p.push(row.wq_score >= R.wq_pass);
  const post = p.length ? p.filter(Boolean).length / p.length : null; row.post_score = r4(post);
  row.overall_score = prep != null && post != null ? r4((prep + post) / 2) : null;
  const b = row.overall_score == null ? null : [...R.bands].reverse().find(([lim]) => row.overall_score >= lim); row.rating = b ? b[1] : null;
  if (t.length) {
    const a = [], x = k => n(row[k]);
    if ((x('ammonia') != null && x('ammonia') > R.ammonia) || (x('nitrite') != null && x('nitrite') > R.nitrite) || (x('nitrate') != null && x('nitrate') > R.nitrate)) a.push('Flush (ammonia/nitrite/nitrate)');
    if (x('secchi') != null && x('secchi') < R.secchi) a.push('Flush (Secchi low)');
    if (x('calcium_hardness') != null && x('calcium_hardness') > R.calcium_hardness) a.push('Review hardness');
    if (x('ph') != null && (x('ph') < R.ph_lo || x('ph') > R.ph_hi)) a.push('Adjust pH');
    if (x('dissolved_oxygen') != null && x('dissolved_oxygen') < R.dissolved_oxygen) a.push('Aerate (low DO)');
    if (x('chlorine_residue') != null && x('chlorine_residue') > R.chlorine_residue) a.push('Flush (chlorine residue)');
    row.action_points = a.length ? a.join('; ') : 'No action';
  } else row.action_points = null;
}
export function stored(m, row) { const o = {}; for (const f of storedFields(m)) o[f.name] = row[f.name] ?? null; return o; }
export async function rowHash(m, row, occ) {
  const s = stored(m, row); const keys = Object.keys(s).sort();
  if (m.natural) return sha256(m.key + '|nat|' + m.natural.map(k => String(s[k] ?? '')).join('|') + '|#' + occ);   // same hapa/pond/day = same record, even if values were updated
  return sha256(m.key + '|' + keys.map(k => k + '=' + JSON.stringify(s[k])).join('|') + '|#' + occ);
}

// ---- parse one sheet according to an import spec
export function parseSheet(m, spec, rows) {
  const hi = findHeaderRow(rows, spec.header); if (hi < 0) return null;
  if (m.special === 'flip') return parseFlip(m, spec, rows, hi);
  const { idx, missing } = mapColumns(rows[hi], spec);
  const reqMissing = missing.filter(k => m.fields.find(f => f.name === k && f.req));
  const errs = {}; const out = []; let read = 0;
  const hdr = rows[hi];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i] || []; const rawVals = {}; let any = false;
    for (const [field, c] of Object.entries(idx)) {
      if (c < 0) continue; const v = r[c];
      if (typeof v === 'string' && ERR.test(v.trim())) { const n = String(hdr[c]).trim(); errs[n] = (errs[n] || 0) + 1; continue; }
      if (!isEmpty(v)) { rawVals[field] = v; any = true; }
    }
    if (!any) continue;
    if (spec.skipRe && rawVals.pond != null && new RegExp(spec.skipRe, 'i').test(String(rawVals.pond))) continue;   // example / target / rule rows
    read++;
    // trailing pre-formatted rows hold only formula zeros: require a date or key text to count as a record
    out.push({ rowNo: i + 1, raw: rawVals });
  }
  return { rows: out, errs, read, missing, reqMissing, headerRow: hi + 1, hdr };
}
function parseFlip(m, spec, rows, hi) {
  const hdr = Array.from(rows[hi], x => String(x ?? '').replace(/\s+/g, ' ').trim()); const col = p => hdr.findIndex(h => h.toLowerCase().startsWith(p));
  const ci = { pond: col('pond id'), sched: col('scheduled flipping') };
  const stages = [];
  hdr.forEach((h, j) => {
    const mm = /^(.*?)\s*\((\d+)\s*days?\)\s*$/.exec(h);
    if (mm) { let nm = mm[1].replace(/\s+days?$/i, '').trim(); stages.push({ name: nm[0].toUpperCase() + nm.slice(1), exp: +mm[2], j }); }
    else if (h.toLowerCase().startsWith('days late to last')) stages.unshift({ name: spec.const?.kind === 'broodstock' ? 'Last egg collection' : 'Last fish transfer', exp: 0, j });
  });
  const out = []; let read = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i] || []; if (isEmpty(r[ci.pond]) || isEmpty(r[ci.sched])) continue; read++;
    const sd = {}; for (const s of stages) { const v = Number(r[s.j]); if (!isEmpty(r[s.j]) && Number.isFinite(v)) sd[s.name] = v; }
    out.push({ rowNo: i + 1, raw: { pond: r[ci.pond], scheduled: r[ci.sched], stage_days: sd } });
  }
  return { rows: out, errs: {}, read, missing: [], reqMissing: ci.pond < 0 || ci.sched < 0 ? ['pond', 'scheduled'] : [], headerRow: hi + 1, hdr };
}

// ---- validate + derive
const hooks = {
  workstation_audits(m, rows, issues) {
    const bad = rows.filter(r => r.row.compliant_islands > r.row.total_islands);
    if (bad.length) issues.push(['error', `${bad.length} row(s) with more compliant islands than total islands were rejected.`, bad.length]);
    rows.splice(0, rows.length, ...rows.filter(r => !bad.includes(r)));
    const mm = rows.filter(r => r.fileNon != null && r.fileNon !== r.row.noncompliant_islands);
    if (mm.length) issues.push(['warning', `${mm.length} row(s) where the file's non-compliant count differs from total − compliant; app value used.`, mm.length]);
  },
  stocking_audits(m, rows, issues) { const w = rows.filter(r => Math.abs(r.row.variance ?? 0) > 0.5); if (w.length) issues.push(['warning', `${w.length} row(s) with variance beyond ±50% – check weights.`, w.length]); },
  day3_recounts(m, rows, issues) { const w = rows.filter(r => (r.row.survival ?? 0) > 1.5); if (w.length) issues.push(['warning', `${w.length} unit(s) with survival above 150% – recount or stocking number likely wrong.`, w.length, w.slice(0, 6).map(r => r.row.unit)]); },
  hapa_exchanges(m, rows, issues) {
    const p = rows.filter(r => r.row.exchanged == null); p.forEach(r => r.row.exchanged = 0);
    if (p.length) issues.push(['info', `${p.length} scheduled row(s) have no 'number exchanged' yet (counted as 0).`, p.length]);
    const o = rows.filter(r => r.row.exchanged > r.row.to_exchange); if (o.length) issues.push(['warning', `${o.length} row(s) exchanged more hapas than scheduled.`, o.length]);
  },
  parasitology_samples(m, rows, issues) { const o = rows.filter(r => r.row.infected_samples > r.row.samples_collected); if (o.length) issues.push(['warning', `${o.length} row(s) have more positive samples than samples collected.`, o.length]); },
  bottom_rope_audits(m, rows, issues) {
    const seen = new Map(); let d = 0; for (const r of rows) { const k = [r.row.unit_type, r.row.audit_date, r.row.pond_id, r.row.hapa_no].join('|'); if (seen.has(k)) d++; seen.set(k, 1); }
    if (d) issues.push(['warning', `${d} row(s) are the same hapa audited twice on one date (kept, as Excel counts them).`, d]);
  }
};
const PENDING = { day3_recounts: ['recount_date', 'recount_pcs', 'in_fish_no'], egg_separation_ratings: ['abp_rating'], hapa_exchanges: [] };
// Bottom rope sheets leave a count blank when none was found (e.g. no untied ropes): that means 0, and the table columns are NOT NULL.
const ZERO_FILL = { bottom_rope_audits: ['top_position', 'middle_position', 'bottom_position', 'not_tied', 'missing_hook', 'total_ropes', 'missing_posts', 'wrong_position_ropes'] };
// Pre-formatted spare rows at the bottom of these sheets (no date, pond or hapa, only formula zeros) are skipped quietly, not reported as rejected.
const SPARE_IF_EMPTY = { bottom_rope_audits: ['audit_date', 'pond_id', 'hapa_no'] };

export function validate(m, spec, parsed, { today = todayIso() } = {}) {
  const issues = []; const add = (sev, msg, n, sample) => issues.push({ severity: sev, message: msg, count: n, sample: sample || [] });
  if (parsed.reqMissing.length) {
    add('error', `Required column(s) not found in this sheet: ${parsed.reqMissing.map(k => m.fields.find(f => f.name === k)?.label || k).join(', ')}.`, parsed.reqMissing.length);
    return { valid: [], rejected: parsed.rows.length, issues, read: parsed.read };
  }
  for (const [c, n] of Object.entries(parsed.errs)) add('warning', `Column '${c}' has ${n} Excel error cell(s) (#REF!/#DIV/0!/…). Values ignored and recomputed where possible.`, n);
  const fieldBy = Object.fromEntries(m.fields.map(f => [f.name, f]));
  const valid = []; const reject = {}; const rej = (why, sample) => { (reject[why] ||= { n: 0, s: [] }).n++; if (reject[why].s.length < 6 && sample) reject[why].s.push(sample); };
  let pending = 0, spare = 0;
  const flip = m.special === 'flip';
  for (const pr of parsed.rows) {
    const row = {}; if (spec.const) Object.assign(row, spec.const);
    for (const f of m.fields) { if (f.derived || !(f.name in pr.raw)) continue; row[f.name] = f.type === 'stages' ? pr.raw[f.name] : coerce(f, pr.raw[f.name]); }
    if (pr.raw.noncompliant_islands != null && m.key === 'workstation_audits') pr.fileNon = coerce({ type: 'int' }, pr.raw.noncompliant_islands);
    normalizeRow(m, row);
    if (m.key === 'day3_recounts' && (row.pond == null || row.pond === '' || row.hapa == null || row.hapa === '')) {   // pond/hapa cells can be blank while the Unit label (e.g. A3-8) is filled
      const u = /^(.+)-(\d+)$/.exec(String(pr.raw.unit_label ?? '').trim()); if (u) { if (row.pond == null || row.pond === '') row.pond = u[1]; if (row.hapa == null || row.hapa === '') row.hapa = u[2]; }
    }
    if (SPARE_IF_EMPTY[m.key]?.every(k => row[k] == null || row[k] === '')) { spare++; continue; }
    for (const k of ZERO_FILL[m.key] || []) if (row[k] == null) row[k] = 0;
    if ((PENDING[m.key] || []).some(k => row[k] == null) && m.fields.filter(f => f.req && !(PENDING[m.key] || []).includes(f.name)).every(f => row[f.name] != null)) { pending++; continue; }
    const miss = m.fields.filter(f => f.req && !f.derived && (row[f.name] == null || row[f.name] === ''));
    if (miss.length) { rej(`missing ${miss.map(f => f.label).join(', ')}`, 'row ' + pr.rowNo); continue; }
    if (POND_MAP.size) { const bad = m.fields.find(f => f.pond && row[f.name] != null && !POND_MAP.has(pondKey(row[f.name]))); if (bad) { rej(`${bad.label} not on the pond list`, `row ${pr.rowNo}: ${row[bad.name]}`); continue; } }
    const df = m.dateField; const dv = df ? row[df] : null;
    if (df && row[df] == null) { rej('invalid date', 'row ' + pr.rowNo); continue; }
    if (dv && dv > today) { rej(`dated after ${today} (check day/month order)`, dv); continue; }
    if (dv && m.minDate && dv < m.minDate) { rej(`dated before ${m.minDate} (likely a year typo)`, dv); continue; }
    const oob = m.fields.find(f => (f.min != null || f.max != null) && row[f.name] != null && (row[f.name] < (f.min ?? -Infinity) || row[f.name] > (f.max ?? Infinity)));
    if (oob) { rej(`${oob.label} outside ${oob.min ?? ''}–${oob.max ?? ''}`, 'row ' + pr.rowNo); continue; }
    for (const f of m.fields) if (f.type === 'int' && !f.derived && !f.virtual && row[f.name] == null && f.name !== m.dateField && !f.req) row[f.name] = null;
    derive(m, row); valid.push({ row, rowNo: pr.rowNo, fileNon: pr.fileNon });
  }
  if (spare) add('info', `${spare} spare empty row(s) at the bottom of the sheet were ignored.`, spare);
  if (pending) add('info', `${pending} row(s) are not complete yet (no recount / rating) and were skipped – not an error.`, pending);
  for (const [why, v] of Object.entries(reject)) add('error', `${v.n} row(s) rejected: ${why}.`, v.n, v.s);
  hooks[m.key]?.(m, valid, { push: a => add(a[0], a[1], a[2], a[3]) });
  const rejected = Object.values(reject).reduce((s, v) => s + v.n, 0);
  return { valid, rejected, issues, read: parsed.read, pending };
}

// ---- assign row hashes (occurrence-aware so legitimate identical rows survive, re-imports are skipped)
export async function withHashes(m, valid) {
  const occ = new Map(); const out = [];
  for (const v of valid) {
    const base = JSON.stringify(m.natural ? m.natural.map(k => stored(m, v.row)[k]) : stored(m, v.row)); const n = (occ.get(base) || 0); occ.set(base, n + 1);
    out.push({ ...stored(m, v.row), row_hash: await rowHash(m, v.row, n) });
  }
  return out;
}

// ---- detect which modules a workbook can feed
export async function detectModules(wb, registry) {
  const found = [];
  for (const m of registry.modules) for (const spec of m.imports) {
    const names = spec.sheetRe ? wb.sheetNames.filter(n => new RegExp(spec.sheetRe, 'i').test(n)) : wb.sheetNames.includes(spec.sheet) ? [spec.sheet] : [];
    for (const name of names) {
    const sp = { ...spec, sheet: name };
    const rows = await wb.rows(name, { maxRows: 100 }); if (!rows) continue;
    const hi = findHeaderRow(rows, spec.header); if (hi < 0) continue;
    if (m.special !== 'flip') {
      const { missing } = mapColumns(rows[hi], sp); const need = Object.keys(spec.map).length;
      if (missing.length > Math.max(1, need * 0.4) || missing.some(k => m.fields.find(f => f.name === k && f.req))) continue;
    }
    found.push({ m, spec: sp });
    }
  }
  return found;
}
