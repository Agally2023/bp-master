// Small DOM + date helpers (no dependencies)
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('aria-') && typeof v === 'boolean') { el.setAttribute(k, String(v)); continue; }
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') throw new Error('html attribute is disabled (XSS safety)');
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function toast(msg, bad) {
  // "x is not a function" / "is not defined" after a deploy = this tab still holds older copies of some script files: tell the user how to fix it
  if (bad && /is not a function|is not defined|does not provide an export/i.test(String(msg))) msg = String(msg) + '. The app was updated while this page was open: reload the page (Ctrl+Shift+R) and try again.';
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.className = 'toast', bad ? 9000 : 3600);
}
// Victory Farms format: % with one decimal, negatives in ( ), smaller numbers with 2 decimals, dates dd/mm/yyyy
export const pct = (v, d = 1) => v == null || Number.isNaN(v) ? '–' : v < 0 ? '(' + Math.abs(v * 100).toFixed(1) + '%)' : (v * 100).toFixed(1) + '%';
export const num = (v, d = 1) => { if (v == null || Number.isNaN(v)) return '–'; const k = d >= 1 && Math.abs(v) < 10 ? Math.max(d, 2) : d, t = Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: k, minimumFractionDigits: k }); return Number(v) < 0 ? '(' + t + ')' : t; };
export const mean = a => { const x = a.filter(v => v != null && !Number.isNaN(v)); return x.length ? x.reduce((s, v) => s + v, 0) / x.length : null; };
export const sum = a => a.reduce((s, v) => s + (Number(v) || 0), 0);

// ISO week of a 'YYYY-MM-DD' string or Date (UTC based, matches Excel ISOWEEKNUM)
export function isoWeek(d) {
  const dt = d instanceof Date ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) : new Date(d + 'T00:00:00Z');
  const day = dt.getUTCDay() || 7; dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const y = dt.getUTCFullYear(); const w = Math.ceil((((dt - Date.UTC(y, 0, 1)) / 86400000) + 1) / 7);
  return { year: y, week: w };
}
export function weekRange(year, week) {   // Monday..Sunday of ISO week
  const j4 = new Date(Date.UTC(year, 0, 4)); const dow = j4.getUTCDay() || 7;
  const mon = new Date(j4.getTime() + ((week - 1) * 7 - (dow - 1)) * 86400000);
  const sun = new Date(mon.getTime() + 6 * 86400000);
  return { mon, sun, monIso: mon.toISOString().slice(0, 10), sunIso: sun.toISOString().slice(0, 10) };
}
export const fmtDate = (d, o) => new Date(d.getTime ? d : d + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: o || '2-digit', year: 'numeric' });
export const todayIso = () => new Date().toISOString().slice(0, 10);
export function iso(d) { return d instanceof Date ? d.toISOString().slice(0, 10) : d; }
export async function sha256(text) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
// Saves a file. Browser and Windows app: normal download. Android app (Capacitor WebView ignores blob downloads): write the file to the app cache and open the share sheet (Save to Files / Drive / WhatsApp / Open).
export function download(name, blob) {
  const C = window.Capacitor;
  if (C?.isNativePlatform?.()) {
    (async () => {
      const P = C.Plugins || {}, FSx = P.Filesystem || C.registerPlugin?.('Filesystem'), Sh = P.Share || C.registerPlugin?.('Share');
      try {
        if (!FSx?.writeFile || !Sh?.share) throw new Error('NOPLUGIN');
        const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
        const f = await FSx.writeFile({ path: name, data: b64, directory: 'CACHE' });
        await Sh.share({ title: name, url: f.uri, dialogTitle: 'Save or share ' + name });
      } catch (e) {
        const msg = String(e && e.message || e); if (/cancel/i.test(msg)) return;
        alert('Could not save ' + name + ' (' + (msg === 'NOPLUGIN' ? 'this Android app build cannot save files yet: install the latest BP-Master.apk' : msg) + ').');
      }
    })();
    return;
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 180000);   // keep the file for 3 min: a save dialog can stay open longer than a few seconds
}
export const esc = s => String(s ?? '');
