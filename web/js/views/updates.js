import { h, clear, toast } from '../util.js?v=202611270856';
import { cacheClear } from '../state.js?v=202611270856';
import { db } from '../db.js?v=202611270856';
const REPO = 'Agally2023/bp-master';
const WEB = (/[?&]v=(\d+)/.exec(import.meta.url) || [])[1] || 'unknown';
const UA = navigator.userAgent;
const isAndroidApp = !!window.Capacitor?.isNativePlatform?.();
const isWindowsApp = /Electron\//.test(UA);
const appVer = (/BPMasterApp\/([\d.]+)/.exec(UA) || [])[1] || '';
const build = v => Number((String(v).match(/(\d+)$/) || [])[1] || 0);
const fmtWeb = v => /^\d{12}$/.test(v) ? `${v.slice(6, 8)}/${v.slice(4, 6)}/${v.slice(0, 4)} ${v.slice(8, 10)}:${v.slice(10)}` : v;
function openExt(url) { window.open(url, '_blank', 'noopener'); }

// The newest deployed website version, read from the live index.html (never from the cache)
export async function latestWeb() {
  let last;
  for (const url of ['./?_=' + Date.now(), 'index.html?_=' + Date.now(), 'index.html']) {   // same-origin page; the first form avoids the /index.html redirect some hosts add
    for (let i = 0; i < 2; i++) { try { const r = await fetch(url, { cache: 'no-store', credentials: 'same-origin' }); if (r.ok) { const v = (/[?&]v=(\d{12})/.exec(await r.text()) || [])[1]; if (v) return v; } else last = new Error('HTTP ' + r.status); } catch (e) { last = e; } await new Promise(res => setTimeout(res, 600)); }
  }
  throw new Error(/fetch/i.test(String(last && last.message)) ? 'the app could not reach the website (check the internet connection)' : (last && last.message) || 'no version found');
}
export const runningWeb = () => WEB;
export async function applyWeb(btn) { return refreshWeb(btn || {}); }
async function refreshWeb(btn) {
  btn.disabled = true; btn.textContent = 'Updating…';
  db.saveResume?.();   // stay signed in across the reload
  try { await cacheClear(); } catch { }
  try { for (const r of await navigator.serviceWorker?.getRegistrations?.() || []) await r.unregister(); } catch { }
  try { for (const k of await caches?.keys?.() || []) await caches.delete(k); } catch { }
  location.reload();
}

export async function render({ view }) {
  const where = isAndroidApp ? 'Android app' : isWindowsApp ? 'Windows app' : 'Web browser';
  const webMsg = h('div', { class: 'muted', style: 'margin-top:8px' });
  const result = h('div', { class: 'muted' }, 'Checking for the latest app build…');
  view.append(h('div', { class: 'card' }, h('h2', { style: 'margin:0 0 6px' }, 'App updates'),
    h('p', { class: 'muted' }, 'The dashboards, forms, statistics and reports update by themselves: every time you open the app it loads the latest version of the website. Tap Check for updates to get the newest version in one tap. A new installer is only needed when the app shell itself changes, which is rare.'),
    h('table', { class: 'kv' }, h('tbody', {},
      h('tr', {}, h('th', {}, 'You are using'), h('td', {}, where)),
      h('tr', {}, h('th', {}, 'Website version'), h('td', {}, fmtWeb(WEB))),
      (isAndroidApp || isWindowsApp) ? h('tr', {}, h('th', {}, 'Installed app build'), h('td', {}, appVer || 'older build (before the Updates menu)')) : null)),
    h('div', { class: 'row mt' }, h('button', { class: 'btn', onclick: () => draw() }, 'Check for updates'), h('button', { class: 'btn sec', onclick: e => refreshWeb(e.currentTarget) }, 'Force refresh')), webMsg), h('div', { class: 'card' }, h('h2', { style: 'margin:0 0 6px' }, 'Install or update the app'), result));
  async function checkWebNow() {
    clear(webMsg); webMsg.className = 'muted'; webMsg.style.marginTop = '8px'; webMsg.append('Checking the website…');
    try {
      const v = await latestWeb(); clear(webMsg);
      if (v && v !== WEB && v > WEB) { webMsg.className = 'note'; webMsg.append(h('b', {}, 'Update available: '), `website version ${fmtWeb(v)}. No reinstall needed. `, h('button', { class: 'btn sm', onclick: e => refreshWeb(e.currentTarget) }, 'Update now')); }
      else { webMsg.className = 'pill ok'; webMsg.append('The website is up to date. Dashboards, forms, statistics and reports are the latest version.'); }
    } catch (e) { clear(webMsg); webMsg.className = 'note stale'; webMsg.append('Could not check the website: ' + e.message); }
  }
  async function draw() {
    checkWebNow();
    clear(result); result.append(h('div', { class: 'muted' }, 'Checking for the latest app build…'));
    let rel;
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
      if (r.status === 404) { clear(result); result.append(h('div', {}, 'No app build has been published yet. Ask the administrator to run Actions > build-apps on GitHub.')); return; }
      if (!r.ok) throw new Error('GitHub answered ' + r.status);
      rel = await r.json();
    } catch (e) { clear(result); result.append(h('div', { class: 'note stale' }, 'Could not check for updates: ' + e.message + '. Check the internet connection and try again.')); return; }
    const apk = (rel.assets || []).find(a => /\.apk$/i.test(a.name)), exe = (rel.assets || []).find(a => /\.exe$/i.test(a.name));
    const latest = build(rel.tag_name), mine = build(appVer), mb = a => a ? ` (${(a.size / 1048576).toFixed(0)} MB)` : '';
    const mineIs = isAndroidApp ? 'android' : isWindowsApp ? 'windows' : '';
    clear(result);
    let status;
    if (!mineIs) status = 'Download the app for your device below.';
    else if (!appVer) status = `A newer app build (${rel.tag_name}) is available. Your installed app was built before the Updates menu, so please update it once.`;
    else if (mine < latest) status = `Update available: you have build ${mine}, the latest is ${latest}.`;
    else status = `You have the latest app build (${mine}).`;
    result.append(h('p', { class: mineIs && appVer && mine >= latest ? 'pill ok' : 'note' }, status),
      h('p', { class: 'muted' }, `Latest build: ${rel.name || rel.tag_name}, published ${new Date(rel.published_at).toLocaleDateString('en-GB')}.`));
    const row = h('div', { class: 'row' });
    if (apk) row.append(h('button', { class: mineIs === 'android' ? 'btn' : 'btn sec', onclick: () => openExt(apk.browser_download_url) }, 'Download Android app (APK)' + mb(apk)));
    if (exe) row.append(h('button', { class: mineIs === 'windows' ? 'btn' : 'btn sec', onclick: () => openExt(exe.browser_download_url) }, 'Download Windows installer' + mb(exe)));
    result.append(row, h('ul', { class: 'muted' },
      h('li', {}, 'Android: open the downloaded APK and tap Install (allow "Install unknown apps" for your browser the first time). It installs over the old app and keeps your sign-in settings.'),
      h('li', {}, 'Windows: run the installer; "Windows protected your PC" > More info > Run anyway. Close BP Master first.')));
  }
  draw();
}
