import { setPonds } from './engine.js?v=202611270912';
import { h, $, clear, toast } from './util.js?v=202611270912';
import { db, isDemo } from './db.js?v=202611270912';
import { S, currentWeek, setWeek } from './state.js?v=202611270912';
import { weeksAvailable } from './analytics.js?v=202611270912';
import { ensure, cacheClear } from './state.js?v=202611270912';

const CFG = window.BPM_CONFIG || {};
const ICON = {
  dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  entry: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  rep: '<path d="M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  upd: '<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3"/>',
  col: '<path d="M15 6l-6 6 6 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};
const svg = p => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.innerHTML = p; return s; };
const ROUTES = [
  { id: 'dashboard', label: 'Dashboard', title: 'Dashboard', icon: 'dash', load: () => import('./views/dashboard.js?v=202611270912') },
  { id: 'entry', label: 'Data Entry', title: 'Data Entry & Import', icon: 'entry', load: () => import('./views/entry.js?v=202611270912') },
  { id: 'users', label: 'Users', title: 'User management', icon: 'users', admin: true, load: () => import('./views/users.js?v=202611270912') },
  { id: 'statistics', label: 'Statistics', title: 'Statistics', icon: 'dash', load: () => import('./views/statistics.js?v=202611270912') },
  { id: 'reports', label: 'Reports', title: 'Weekly Report', icon: 'rep', load: () => import('./views/reports.js?v=202611270912') },
  { id: 'updates', label: 'App updates', title: 'App updates', icon: 'upd', load: () => import('./views/updates.js?v=202611270912') },
  { id: 'settings', label: 'Settings', title: 'Settings', icon: 'gear', load: () => import('./views/settings.js?v=202611270912') },
];
let idleT;
function idleReset() { clearTimeout(idleT); idleT = setTimeout(signOut, (window.bpmPrefs?.get().idle || CFG.IDLE_LOGOUT_MINUTES || 15) * 60000); }
async function signOut() { clearTimeout(idleT); await db.signOut(); S.data = {}; S.loaded.clear(); cacheClear(); showLogin('You have been signed out.'); }

function showLogin(msg, ok) {
  $('#app').hidden = true; const L = $('#login'); L.hidden = false; clear(L);
  const err = h('div', { class: ok ? 'note' : 'err-msg', hidden: !msg }, msg || '');
  const em = h('input', { type: 'email', autocomplete: 'username', required: true, placeholder: 'name@victoryfarms.com' });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const box = h('form', { class: 'box', onsubmit: async e => {
    e.preventDefault(); err.hidden = true;
    try { const r = await db.signIn(em.value.trim(), pw.value); r.mfa ? mfaStep(r.mfa) : start(); } catch (x) { if (/Request sent|approval/.test(x.message)) { showLogin(x.message, true); return; } err.className = 'err-msg'; err.textContent = x.message; err.hidden = false; }
  } },
    h('img', { src: 'assets/victoryfarms-logo.png', alt: 'Victory Farms' }), h('h1', {}, 'BP Master'),
    h('div', { class: 'muted' }, 'Best Practice audit reporting. Authorised users only.'), err,
    h('label', { class: 'f' }, 'Email', em), h('label', { class: 'f' }, 'Password', pw),
    isDemo() ? h('div', { class: 'note' }, 'Demo mode: any email and password. Data stays in this browser tab and is never saved.') : null,
    h('button', { class: 'btn', type: 'submit' }, 'Sign in'),
    h('button', { class: 'btn sec', type: 'button', onclick: () => showSignup() }, 'Create account'),
    h('button', { class: 'btn sec', type: 'button', onclick: () => showForgot(em.value.trim()) }, 'Forgot password?'));
  L.append(box);
}
function showForgot(prefill) {
  const L = clear($('#login')); const err = h('div', { class: 'err-msg', hidden: true });
  const em = h('input', { type: 'email', required: true, autocomplete: 'username', placeholder: 'name@victoryfarms.com', value: prefill || '' });
  L.append(h('form', { class: 'box', onsubmit: async e => {
    e.preventDefault(); err.hidden = true;
    try { await db.requestPasswordReset(em.value.trim()); showLogin('If an account exists for that email, a password reset link has been sent. Check your inbox (and spam folder).', true); }
    catch (x) { err.textContent = x.message; err.hidden = false; }
  } },
    h('img', { src: 'assets/victoryfarms-logo.png', alt: 'Victory Farms' }), h('h1', {}, 'Reset password'),
    h('div', { class: 'muted' }, 'Enter your email and we will send you a link to choose a new password.'), err,
    h('label', { class: 'f' }, 'Email', em),
    h('button', { class: 'btn', type: 'submit' }, 'Send reset link'),
    h('button', { class: 'btn sec', type: 'button', onclick: () => showLogin() }, 'Back to sign in')));
}
function showReset() {   // reached from the emailed reset link
  const L = clear($('#login')); $('#app').hidden = true; L.hidden = false; const err = h('div', { class: 'err-msg', hidden: true });
  const pw = h('input', { type: 'password', required: true, minlength: 12, autocomplete: 'new-password' }), pw2 = h('input', { type: 'password', required: true, minlength: 12, autocomplete: 'new-password' });
  L.append(h('form', { class: 'box', onsubmit: async e => {
    e.preventDefault(); err.hidden = true;
    if (pw.value !== pw2.value) { err.textContent = 'The two passwords do not match.'; err.hidden = false; return; }
    try { await db.updatePassword(pw.value); showLogin('Password updated. Sign in with your new password.', true); }
    catch (x) { err.textContent = x.message; err.hidden = false; }
  } },
    h('img', { src: 'assets/victoryfarms-logo.png', alt: 'Victory Farms' }), h('h1', {}, 'Choose a new password'),
    h('div', { class: 'muted' }, 'Use at least 12 characters.'), err,
    h('label', { class: 'f' }, 'New password', pw), h('label', { class: 'f' }, 'Repeat new password', pw2),
    h('button', { class: 'btn', type: 'submit' }, 'Update password')));
}
function showSignup() {
  const L = clear($('#login')); const err = h('div', { class: 'err-msg', hidden: true });
  const nm = h('input', { required: true, autocomplete: 'name', maxlength: 100 }), em = h('input', { type: 'email', required: true, autocomplete: 'username' });
  const pw = h('input', { type: 'password', required: true, minlength: 12, autocomplete: 'new-password' }), pw2 = h('input', { type: 'password', required: true, minlength: 12, autocomplete: 'new-password' });
  L.append(h('form', { class: 'box', onsubmit: async e => {
    e.preventDefault(); err.hidden = true;
    if (pw.value !== pw2.value) { err.textContent = 'Passwords do not match.'; err.hidden = false; return; }
    if (pw.value.length < 12) { err.textContent = 'Use at least 12 characters.'; err.hidden = false; return; }
    try {
      const r = await db.signUp(nm.value.trim(), em.value.trim(), pw.value);
      showLogin(r.needsConfirm ? 'Account created. Check your email and confirm your address, then sign in. An administrator must approve your account before you can use BP Master.' : 'Account created. Sign in to set up two-step verification. An administrator must approve your account before you can use BP Master.', true);
    } catch (x) { err.textContent = x.message; err.hidden = false; }
  } },
    h('img', { src: 'assets/victoryfarms-logo.png', alt: 'Victory Farms' }), h('h1', {}, 'Create account'),
    h('div', { class: 'muted' }, 'New accounts need administrator approval before they can open BP Master.'), err,
    h('label', { class: 'f' }, 'Full name', nm), h('label', { class: 'f' }, 'Work email', em), h('label', { class: 'f' }, 'Password (12+ characters)', pw), h('label', { class: 'f' }, 'Repeat password', pw2),
    h('button', { class: 'btn', type: 'submit' }, 'Create account'), h('button', { class: 'btn sec', type: 'button', onclick: () => showLogin() }, 'Back to sign in')));
}
function mfaStep(mfa) {
  const L = clear($('#login')); const err = h('div', { class: 'err-msg', hidden: true });
  const code = h('input', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, required: true, placeholder: '6-digit code' });
  L.append(h('form', { class: 'box', onsubmit: async e => { e.preventDefault(); try { await db.verifyMfa(mfa.factorId, code.value.trim()); start(); } catch (x) { err.textContent = x.message; err.hidden = false; if (/Request sent|approval|disabled/.test(x.message)) setTimeout(() => showLogin(x.message, /Request sent|approval/.test(x.message)), 50); } } },
    h('img', { src: 'assets/victoryfarms-logo.png', alt: 'Victory Farms' }), h('h1', {}, 'Two-step verification'),
    mfa.enroll ? h('div', {}, h('p', {}, 'Scan this QR code with an authenticator app (Google Authenticator, Microsoft Authenticator), then enter the code.'),
      (() => { const i = h('img', { alt: 'MFA QR code', src: mfa.enroll.qr, style: 'height:170px' }); return i; })(), h('div', { class: 'muted' }, 'Manual key: ' + mfa.enroll.secret)) : h('div', { class: 'muted' }, 'Enter the 6-digit code from your authenticator app.'),
    err, code, h('button', { class: 'btn', type: 'submit' }, 'Verify')));
}

function buildNav() {
  const nav = clear($('#nav'));
  for (const r of ROUTES.filter(r => !r.admin || db.user.role === 'admin')) nav.append(h('button', { 'data-r': r.id, title: r.label, onclick: () => { location.hash = '#/' + r.id; } }, svg(ICON[r.icon]), h('span', { class: 'lbl' }, r.label)));
  const mb = $('#menu'), app = $('#app'); mb.replaceChildren(svg(ICON.menu || ICON.col));
  const setNav = o => { app.classList.toggle('nav-open', o); mb.setAttribute('aria-expanded', String(o)); mb.setAttribute('aria-label', o ? 'Close menu' : 'Open menu'); };
  mb.onclick = () => setNav(!app.classList.contains('nav-open')); $('#backdrop').onclick = () => setNav(false);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setNav(false); }); window.addEventListener('hashchange', () => setNav(false));
  const cb = clear($('#collapse')); cb.append(svg(ICON.col));
  cb.onclick = () => { const a = $('#app'); a.classList.toggle('collapsed'); const c = a.classList.contains('collapsed'); cb.title = c ? 'Expand menu' : 'Collapse menu'; cb.setAttribute('aria-label', cb.title); cb.style.transform = c ? 'rotate(180deg)' : ''; };
}
let token = 0;
async function route() {
  const id = (location.hash.replace('#/', '') || 'dashboard').split('?')[0]; const r = ROUTES.find(x => x.id === id && (!x.admin || db.user.role === 'admin')) || ROUTES[0]; const my = ++token;
  document.querySelectorAll('#nav button').forEach(b => b.dataset.r === r.id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  $('#title').textContent = r.title; clear($('#ctx')); const v = clear($('#view')); v.append(h('div', { class: 'empty' }, 'Loading…'));
  try { const mod = await r.load(); if (my !== token) return; clear(v); await mod.render({ view: v, ctx: $('#ctx') }); v.focus({ preventScroll: true }); }
  catch (e) { console.error(e); clear(v); v.append(h('div', { class: 'err-msg' }, 'Could not open this page: ' + e.message)); }
}
export async function start() {
  $('#login').hidden = true; $('#app').hidden = false;
  $('#who').textContent = `${db.user.name || db.user.email} · ${db.user.role}`;
  $('#banner').replaceChildren(...(isDemo() ? [h('div', { class: 'demo' }, 'DEMO MODE: nothing is saved or sent anywhere. Connect Supabase in config.js to go live.')] : []));
  db.audit('login', 'session', db.user.id);   // fire and forget: do not make the screen wait for the audit write
  const w = currentWeek(); if (!S.week) S.week = w;
  buildNav(); route(); idleReset(); watchUpdates();
}
// Offers a one-tap website update when a newer version has been deployed (checked at start, every 15 min and when the app comes back to the foreground)
let updTimer;
async function watchUpdates() {
  const check = async () => {
    try {
      const U = await import('./views/updates.js?v=202611270912'); const v = await U.latestWeb(); const box = $('#banner'); box.querySelector('.updbar')?.remove();
      if (v && v > U.runningWeb()) box.append(h('div', { class: 'demo updbar' }, 'A new version of BP Master is available. ', h('button', { class: 'btn sm', onclick: e => U.applyWeb(e.currentTarget) }, 'Update now')));
    } catch { }
  };
  check(); clearInterval(updTimer); updTimer = setInterval(check, 15 * 60000); document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}
export async function init() {
  // Launch-time self-update: if a newer website version is deployed, load it before the sign-in screen (once per minute at most, so it can never loop)
  try {
    const U = await import('./views/updates.js?v=202611270912'); const last = Number(sessionStorage.getItem('bpm_autoupd') || 0);
    if (Date.now() - last > 60000) { const v = await Promise.race([U.latestWeb(), new Promise((_, no) => setTimeout(no, 4000))]); if (v && v > U.runningWeb()) { sessionStorage.setItem('bpm_autoupd', String(Date.now())); await U.applyWeb(); return; } }
  } catch { }
  S.reg = await (await fetch('modules.json')).json();
  try {   // pond list: every pond-name field becomes a required drop-down of these ponds
    S.ponds = (await (await fetch('ponds.json')).json()).map(p => p.pond); setPonds(S.ponds);
    for (const m of S.reg.modules) for (const f of m.fields) if (f.pond) { f.type = 'select'; f.options = S.ponds; f.req = true; }
  } catch { S.ponds = []; }
  await db.init();
  $('#signout').onclick = signOut;
  $('#refresh').onclick = async e => {   // reload every table from the server (drops the local copy) and pick up a newer app version if one was published
    const b = e.currentTarget; b.classList.add('busy');
    try {
      const cur = (document.querySelector('script[src*="app.js"]')?.src.match(/v=(\d+)/) || [])[1];
      const html = await (await fetch('index.html?r=' + Date.now(), { cache: 'no-store' })).text(), nu = (html.match(/app\.js\?v=(\d+)/) || [])[1];
      if (cur && nu && cur !== nu) { await cacheClear(); location.reload(); return; }
    } catch { }
    S.data = {}; S.loaded.clear(); S.since = {}; S.slim.clear(); S.failed.clear(); await cacheClear();
    try { if (db.user) await route(); } finally { b.classList.remove('busy'); }
  };
  let lastAct = 0; for (const ev of ['click', 'keydown', 'mousemove']) document.addEventListener(ev, () => { const t = Date.now(); if (db.user && t - lastAct > 1000) { lastAct = t; idleReset(); } }, { passive: true });
  window.addEventListener('hashchange', () => db.user && route());
  const rec = db.takeRecovery(location.hash);   // opened from a password-reset email?
  if (rec) { history.replaceState(null, '', location.pathname + location.search); return rec.error ? showLogin(rec.error) : showReset(); }
  if (await db.resume?.()) return start();
  showLogin();
}
init();
