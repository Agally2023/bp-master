// Data layer. DemoDB = in-memory (nothing persisted, nothing leaves the browser). SupabaseDB = RLS-protected REST.
const CFG = window.BPM_CONFIG || {};
export const isDemo = () => !CFG.SUPABASE_URL;
const uuid = () => crypto.randomUUID();
const P = 'bpm_', BUCKET = 'bpm-report-images';   // all BP Master tables/buckets are prefixed (the Supabase project is shared with another app)

class DemoDB {
  constructor() { this.mode = 'demo'; this.t = {}; this.user = null; this.batchesL = []; this.reports = []; this.sections = []; this.images = []; this.auditL = []; }
  async init() {
    try { const r = await fetch('demo-data.json', { cache: 'no-store' }); if (r.ok) this.t = await r.json(); } catch { /* no seed file */ }
  }
  async signIn(email) { this.user = { id: 'demo', email: email || 'admin@demo.local', name: 'Demo admin', role: 'admin' }; return { user: this.user }; }
  async signOut() { this.user = null; }
  async load(table) { return (this.t[table] || []).slice(); }
  async insert(table, rows, o = {}) {
    const cur = (this.t[table] ||= []); const idx = new Map(cur.map((r, i) => [r.row_hash, i])); let n = 0, u = 0;
    for (const r of rows) { if (idx.has(r.row_hash)) { if (o.merge && this.user?.role === 'admin') { cur[idx.get(r.row_hash)] = { ...cur[idx.get(r.row_hash)], ...r }; u++; } continue; } idx.set(r.row_hash, cur.length); cur.push({ id: uuid(), ...r }); n++; }
    return { inserted: n, updated: u, skipped: rows.length - n - u };
  }
  async batches() { return this.batchesL.slice().reverse(); }
  async recordBatch(b) { if (this.batchesL.some(x => x.module === b.module && x.file_sha256 === b.file_sha256)) return false; this.batchesL.push({ id: uuid(), created_at: new Date().toISOString(), ...b }); return true; }
  async audit(action, entity, entity_id, meta) { this.auditL.push({ at: new Date().toISOString(), action, entity, entity_id, meta }); }
  async report(y, w, create) {
    let r = this.reports.find(x => x.iso_year === y && x.iso_week === w);
    if (!r && create) { r = { id: uuid(), iso_year: y, iso_week: w, status: 'draft' }; this.reports.push(r); }
    return r ? { report: r, sections: this.sections.filter(s => s.report_id === r.id), images: this.images.filter(i => i.report_id === r.id) } : null;
  }
  async saveSection(rid, key, patch) { let s = this.sections.find(x => x.report_id === rid && x.section_key === key); if (!s) { s = { report_id: rid, section_key: key, comment: '', include: true }; this.sections.push(s); } Object.assign(s, patch); return s; }
  async setStatus(rid, status) { const r = this.reports.find(x => x.id === rid); r.status = status; return r; }
  async putImage(rid, key, slot, kind, file) {
    this.images = this.images.filter(i => !(i.report_id === rid && i.section_key === key && i.slot === slot));
    const im = { id: uuid(), report_id: rid, section_key: key, slot, kind, storage_path: URL.createObjectURL(file), caption: file.name }; this.images.push(im); return im;
  }
  async removeImage(im) { this.images = this.images.filter(i => i.id !== im.id); }
  async imageUrl(im) { return im.storage_path; }
}

class SupabaseDB {
  constructor() { this.mode = 'live'; this.base = CFG.SUPABASE_URL.replace(/\/$/, ''); this.key = CFG.SUPABASE_ANON_KEY; this.tok = null; this.user = null; this.exp = 0; }
  async init() { /* memory-only session: nothing to restore */ }
  _h(extra) { return { apikey: this.key, Authorization: 'Bearer ' + (this.tok || this.key), 'Content-Type': 'application/json', ...extra }; }
  async _f(path, opt = {}) {
    if (this.tok && Date.now() > this.exp - 60000 && this.refresh_token && !opt.noRefresh) await this._refresh();
    const r = await fetch(this.base + path, { ...opt, headers: this._h(opt.headers) });
    if (!r.ok) { let m = r.statusText; try { const j = await r.json(); m = j.msg || j.message || j.error_description || j.error || m; } catch { } throw new Error(m || ('HTTP ' + r.status)); }
    return r;
  }
  _set(j) { this.tok = j.access_token; this.refresh_token = j.refresh_token; this.exp = Date.now() + (j.expires_in || 3600) * 1000; if (j.user) this.authUser = j.user; }
  async _refresh() { const r = await this._f('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: this.refresh_token }), noRefresh: true }); this._set(await r.json()); }
  async signIn(email, password) {
    const r = await this._f('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }), noRefresh: true });
    this._set(await r.json());
    const factors = (this.authUser.factors || []).filter(f => f.factor_type === 'totp' && f.status === 'verified');
    if (factors.length) return { mfa: { factorId: factors[0].id } };
    const e = await (await this._f('/auth/v1/factors', { method: 'POST', body: JSON.stringify({ factor_type: 'totp', friendly_name: 'BP Master ' + Date.now() }) })).json();
    return { mfa: { factorId: e.id, enroll: { qr: e.totp.qr_code, secret: e.totp.secret } } };
  }
  async verifyMfa(factorId, code) {
    const c = await (await this._f(`/auth/v1/factors/${factorId}/challenge`, { method: 'POST', body: '{}' })).json();
    const v = await this._f(`/auth/v1/factors/${factorId}/verify`, { method: 'POST', body: JSON.stringify({ challenge_id: c.id, code }) });
    this._set(await v.json());
    const me = await (await this._f('/auth/v1/user')).json();
    const p = (await (await this._f(`/rest/v1/${P}profiles?id=eq.${me.id}&select=full_name,role,active`)).json())[0];
    if (!p || !p.active) { await this.signOut(); throw new Error('Your account has no active BP Master profile. Ask the administrator.'); }
    this.user = { id: me.id, email: me.email, name: p.full_name, role: p.role }; return { user: this.user };
  }
  async signOut() { try { if (this.tok) await this._f('/auth/v1/logout', { method: 'POST', noRefresh: true }); } catch { } this.tok = this.refresh_token = this.user = null; }
  async load(table, filter = '') {
    const out = []; for (let from = 0; ; from += 1000) {
      const r = await this._f(`/rest/v1/${P}${table}?select=*${filter}`, { headers: { Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } });
      const j = await r.json(); out.push(...j); if (j.length < 1000) break;
    }
    return out;
  }
  async insert(table, rows, o = {}) {
    const merge = o.merge && this.user?.role === 'admin'; let n = 0, u = 0; for (let i = 0; i < rows.length; i += 400) {
      const r = await this._f(`/rest/v1/${P}${table}?on_conflict=row_hash&select=row_hash`, { method: 'POST', headers: { Prefer: (merge ? 'resolution=merge-duplicates' : 'resolution=ignore-duplicates') + ',return=representation' }, body: JSON.stringify(rows.slice(i, i + 400)) });
      const j = await r.json(); n += j.length;
    }
    return merge ? { inserted: n, updated: 0, skipped: rows.length - n, note: 'merged' } : { inserted: n, updated: 0, skipped: rows.length - n };
  }
  async batches() { return this.load('import_batches', '&order=created_at.desc&limit=50').then(r => r.slice(0, 50)); }
  async recordBatch(b) { try { await this._f(`/rest/v1/${P}import_batches`, { method: 'POST', body: JSON.stringify(b) }); return true; } catch (e) { if (/duplicate|unique|409/i.test(e.message)) return false; throw e; } }
  async audit(action, entity, entity_id, meta) { try { await this._f(`/rest/v1/${P}audit_log`, { method: 'POST', body: JSON.stringify({ action, entity, entity_id: String(entity_id ?? ''), meta: meta || {} }) }); } catch { } }
  async report(y, w, create) {
    let r = (await (await this._f(`/rest/v1/${P}reports?iso_year=eq.${y}&iso_week=eq.${w}&select=*`)).json())[0];
    if (!r && create) r = (await (await this._f(`/rest/v1/${P}reports`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ iso_year: y, iso_week: w }) })).json())[0];
    if (!r) return null;
    const [sections, images] = await Promise.all([this.load('report_sections', `&report_id=eq.${r.id}`), this.load('report_images', `&report_id=eq.${r.id}`)]);
    return { report: r, sections, images };
  }
  async saveSection(rid, key, patch) {
    const r = await this._f(`/rest/v1/${P}report_sections?on_conflict=report_id,section_key`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ report_id: rid, section_key: key, ...patch, updated_at: new Date().toISOString() }) });
    return (await r.json())[0];
  }
  async setStatus(rid, status) {
    const body = { status }; if (status === 'approved') { body.approved_at = new Date().toISOString(); body.approved_by = this.user.id; }
    const r = await this._f(`/rest/v1/${P}reports?id=eq.${rid}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) }); return (await r.json())[0];
  }
  async putImage(rid, key, slot, kind, file) {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, ''), path = `${rid}/${key}-${slot}-${uuid()}.${ext}`;
    await this._f(`/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: file });
    const r = await this._f(`/rest/v1/${P}report_images?on_conflict=report_id,section_key,slot`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ report_id: rid, section_key: key, slot, kind, storage_path: path, caption: file.name }) });
    return (await r.json())[0];
  }
  async removeImage(im) { await this._f(`/rest/v1/${P}report_images?id=eq.${im.id}`, { method: 'DELETE' }); try { await this._f(`/storage/v1/object/${BUCKET}/${im.storage_path}`, { method: 'DELETE' }); } catch { } }
  async imageUrl(im) { const j = await (await this._f(`/storage/v1/object/sign/${BUCKET}/${im.storage_path}`, { method: 'POST', body: JSON.stringify({ expiresIn: 300 }) })).json(); return this.base + '/storage/v1' + j.signedURL; }
}
export const db = isDemo() ? new DemoDB() : new SupabaseDB();
