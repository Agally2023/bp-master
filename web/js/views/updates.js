import { h, clear, toast } from '../util.js?v=202611270845';
import { cacheClear } from '../state.js?v=202611270845';
const REPO = 'Agally2023/bp-master';
const WEB = (/[?&]v=(\d+)/.exec(import.meta.url) || [])[1] || 'unknown';
const UA = navigator.userAgent;
const isAndroidApp = !!window.Capacitor?.isNativePlatform?.();
const isWindowsApp = /Electron\//.test(UA);
const appVer = (/BPMasterApp\/([\d.]+)/.exec(UA) || [])[1] || '';
const build = v => Number((String(v).match(/(\d+)$/) || [])[1] || 0);
const fmtWeb = v => /^\d{12}$/.test(v) ? `${v.slice(6, 8)}/${v.slice(4, 6)}/${v.slice(0, 4)} ${v.slice(8, 10)}:${v.slice(10)}` : v;
function openExt(url) { window.open(url, '_blank', 'noopener'); }

async function refreshWeb(btn) {
  btn.disabled = true; btn.textContent = 'Updating…';
  try { await cacheClear(); } catch { }
  try { for (const r of await navigator.serviceWorker?.getRegistrations?.() || []) await r.unregister(); } catch { }
  try { for (const k of await caches?.keys?.() || []) await caches.delete(k); } catch { }
  location.reload();
}

export async function render({ view }) {
  const where = isAndroidApp ? 'Android app' : isWindowsApp ? 'Windows app' : 'Web browser';
  const result = h('div', { class: 'muted' }, 'Checking for the latest app build…');
  view.append(h('div', { class: 'card' }, h('h2', { style: 'margin:0 0 6px' }, 'App updates'),
    h('p', { class: 'muted' }, 'The dashboards, forms, statistics and reports update by themselves: every time you open the app it loads the latest version of the website. A new installer is only needed when the app itself changes (for example saving files on Android).'),
    h('table', { class: 'kv' }, h('tbody', {},
      h('tr', {}, h('th', {}, 'You are using'), h('td', {}, where)),
      h('tr', {}, h('th', {}, 'Website version'), h('td', {}, fmtWeb(WEB))),
      (isAndroidApp || isWindowsApp) ? h('tr', {}, h('th', {}, 'Installed app build'), h('td', {}, appVer || 'older build (before the Updates menu)')) : null)),
    h('div', { class: 'row mt' }, h('button', { class: 'btn', onclick: e => refreshWeb(e.currentTarget) }, 'Update website now'), h('button', { class: 'btn sec', onclick: () => draw() }, 'Check for app updates'))), h('div', { class: 'card' }, h('h2', { style: 'margin:0 0 6px' }, 'Install or update the app'), result));
  async function draw() {
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
