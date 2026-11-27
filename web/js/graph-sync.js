// Automatic SharePoint sync from the browser. The person signs in with their own Microsoft account once (OAuth code + PKCE, read-only Files.Read.All);
// afterwards the app renews its access silently, lists the Quality Control folder in SharePoint, downloads the workbooks that changed and loads their new rows
// with the module markers of the registry. No folder to pick, no file to upload. Needs the one-time Entra app registration (see supabase/SYNC_SETUP.md, Option C).
import { ingest, sha256Hex } from './folder-sync.js?v=202611270351';
export const DEFAULT_FOLDER = 'https://victoryfarmsltd.sharepoint.com/sites/AquaData/Shared%20Documents/Aqua%20Quality%20Control';
const SCOPE = 'Files.Read.All offline_access';
const k = n => 'bpm-ms-' + n, get = n => { try { return localStorage.getItem(k(n)); } catch { return null; } }, set = (n, v) => { try { v == null ? localStorage.removeItem(k(n)) : localStorage.setItem(k(n), v); } catch { } };
export const cfg = () => ({ client: get('client') || (window.BPM_CONFIG?.msClientId ?? ''), tenant: get('tenant') || window.BPM_CONFIG?.msTenant || 'organizations', folder: get('folder') || DEFAULT_FOLDER });
export const configured = () => !!cfg().client;
export const saveCfg = ({ client, tenant, folder }) => { set('client', (client || '').trim() || null); set('tenant', (tenant || '').trim() || null); set('folder', (folder || '').trim() || null); };
export const redirectUri = () => location.origin + '/ms-callback.html';
export const signedIn = () => !!get('refresh');
export const signOut = () => { set('refresh', null); tok = null; };
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = n => b64u(crypto.getRandomValues(new Uint8Array(n)));
let tok = null, tokExp = 0;

async function tokenCall(params) {
  const { client, tenant } = cfg();
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: client, scope: SCOPE, ...params }) });
  const j = await r.json(); if (!j.access_token) throw new Error(j.error_description?.split('\r')[0] || j.error || 'Microsoft sign-in failed');
  if (j.refresh_token) set('refresh', j.refresh_token); tok = j.access_token; tokExp = Date.now() + (j.expires_in || 3600) * 1000; return tok;
}
async function signIn() {
  const { client, tenant } = cfg(), verifier = rand(48), state = rand(12);
  const challenge = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?` + new URLSearchParams({ client_id: client, response_type: 'code', redirect_uri: redirectUri(), response_mode: 'query', scope: SCOPE, state, code_challenge: challenge, code_challenge_method: 'S256' });
  const w = window.open(url, 'bpm-ms', 'width=520,height=700'); if (!w) throw new Error('Allow pop-ups for this site, then press Sync again');
  const code = await new Promise((res, rej) => {
    const on = e => { if (e.origin !== location.origin || e.data?.type !== 'bpm-ms') return; removeEventListener('message', on); clearInterval(t); e.data.error ? rej(new Error(e.data.error)) : e.data.state !== state ? rej(new Error('Sign-in was not recognised')) : res(e.data.code); };
    addEventListener('message', on); const t = setInterval(() => { if (w.closed) { clearInterval(t); setTimeout(() => { removeEventListener('message', on); rej(new Error('Sign-in window closed')); }, 800); } }, 500);
  });
  return tokenCall({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier });
}
// interactive = a click: may open the sign-in popup. Otherwise only silent renewal.
async function accessToken(interactive) {
  if (tok && Date.now() < tokExp - 60000) return tok;
  if (get('refresh')) { try { return await tokenCall({ grant_type: 'refresh_token', refresh_token: get('refresh') }); } catch (e) { if (!interactive) throw e; set('refresh', null); } }
  if (!interactive) throw new Error('Microsoft sign-in needed'); return signIn();
}
async function g(path, token) {
  const r = await fetch(path.startsWith('http') ? path : 'https://graph.microsoft.com/v1.0' + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) { let m = ''; try { m = (await r.json()).error?.message; } catch { } throw new Error(`SharePoint ${r.status}${m ? ': ' + m : ''}`); } return r.json();
}
async function* walk(drive, id, token, depth = 0) {
  let next = `/drives/${drive}/items/${id}/children?$top=200`;
  while (next) {
    const j = await g(next, token); next = j['@odata.nextLink'] || null;
    for (const it of j.value || []) {
      if (it.name.startsWith('~$')) continue;
      if (it.folder) { if (depth < 3) yield* walk(drive, it.id, token, depth + 1); }
      else if (/\.xls[xm]$/i.test(it.name)) yield it;
    }
  }
}
const seenGet = () => { try { return JSON.parse(localStorage.getItem('bpm-ms-seen') || '{}'); } catch { return {}; } };
export async function syncSharePoint(onProgress = () => { }, interactive = false) {
  const token = await accessToken(interactive), seen = seenGet(), out = { files: 0, imported: [], problems: [], unchanged: 0 };
  const root = await g('/shares/u!' + b64u(new TextEncoder().encode(cfg().folder)) + '/driveItem', token);
  for await (const it of walk(root.parentReference?.driveId || root.id, root.id, token)) {
    if (it.size > 60e6) { out.problems.push(`${it.name}: over 60 MB, import it from Data entry`); continue; }
    const sig = it.lastModifiedDateTime + ':' + it.size; if (seen[it.id]?.sig === sig) { out.unchanged++; continue; }
    out.files++; onProgress(`Reading ${it.name}…`);
    try {
      const url = it['@microsoft.graph.downloadUrl']; const r = await fetch(url || `https://graph.microsoft.com/v1.0/drives/${it.parentReference.driveId}/items/${it.id}/content`, url ? {} : { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) throw new Error('download blocked (' + r.status + '); a sensitivity label may stop app access');
      const buf = await r.arrayBuffer(), hash = await sha256Hex(buf);
      if (seen[it.id]?.hash !== hash) await ingest(it.name, buf, hash, out, onProgress);
      else out.unchanged++;
      seen[it.id] = { sig, hash }; localStorage.setItem('bpm-ms-seen', JSON.stringify(seen));
    } catch (e) { out.problems.push(`${it.name}: ${e.message}`); }
  }
  return out;
}
