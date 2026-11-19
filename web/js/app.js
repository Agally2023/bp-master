import { h, $, clear, toast } from './util.js';
import { db, isDemo } from './db.js';
import { S, currentWeek, setWeek } from './state.js';
import { weeksAvailable } from './analytics.js';
import { ensure } from './state.js';

const CFG = window.BPM_CONFIG || {};
const ICON = {
  dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  entry: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  rep: '<path d="M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8"/>',
  col: '<path d="M15 6l-6 6 6 6"/>',
};
const svg = p => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.innerHTML = p; return s; };
const ROUTES = [
  { id: 'dashboard', label: 'Dashboard', title: 'Dashboard', icon: 'dash', load: () => import('./views/dashboard.js') },
  { id: 'entry', label: 'Data Entry', title: 'Data Entry & Import', icon: 'entry', load: () => import('./views/entry.js') },
  { id: 'reports', label: 'Reports', title: 'Weekly Report', icon: 'rep', load: () => import('./views/reports.js') },
];
let idleT;
function idleReset() { clearTimeout(idleT); idleT = setTimeout(signOut, (CFG.IDLE_LOGOUT_MINUTES || 15) * 60000); }
async function signOut() { clearTimeout(idleT); await db.signOut(); S.data = {}; S.loaded.clear(); showLogin('You have been signed out.'); }

function showLogin(msg) {
  $('#app').hidden = true; const L = $('#login'); L.hidden = false; clear(L);
  const err = h('div', { class: 'err-msg', hidden: !msg }, msg || '');
  const em = h('input', { type: 'email', autocomplete: 'username', required: true, placeholder: 'name@victoryfarms.com' });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const box = h('form', { class: 'box', onsubmit: async e => {
    e.preventDefault(); err.hidden = true;
    try { const r = await db.signIn(em.value.trim(), pw.value); r.mfa ? mfaStep(r.mfa) : start(); } catch (x) { err.textContent = x.message; err.hidden = false; }
  } },
    h('img', { src: 'assets/victoryfarms-logo.png', alt: 'Victory Farms' }), h('h1', {}, 'BP Master'),
    h('div', { class: 'muted' }, 'Best Practice audit reporting. Authorised users only.'), err,
    h('label', { class: 'f' }, 'Email', em), h('label', { class: 'f' }, 'Password', pw),
    isDemo() ? h('div', { class: 'note' }, 'Demo mode: any email and password. Data stays in this browser tab and is never saved.') : null,
    h('button', { class: 'btn', type: 'submit' }, 'Sign in'));
  L.append(box);
}
function mfaStep(mfa) {
  const L = clear($('#login')); const err = h('div', { class: 'err-msg', hidden: true });
  const code = h('input', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, required: true, placeholder: '6-digit code' });
  L.append(h('form', { class: 'box', onsubmit: async e => { e.preventDefault(); try { await db.verifyMfa(mfa.factorId, code.value.trim()); start(); } catch (x) { err.textContent = x.message; err.hidden = false; } } },
    h('img', { src: 'assets/victoryfarms-logo.png', alt: 'Victory Farms' }), h('h1', {}, 'Two-step verification'),
    mfa.enroll ? h('div', {}, h('p', {}, 'Scan this QR code with an authenticator app (Google Authenticator, Microsoft Authenticator), then enter the code.'),
      (() => { const i = h('img', { alt: 'MFA QR code', src: mfa.enroll.qr, style: 'height:170px' }); return i; })(), h('div', { class: 'muted' }, 'Manual key: ' + mfa.enroll.secret)) : h('div', { class: 'muted' }, 'Enter the 6-digit code from your authenticator app.'),
    err, code, h('button', { class: 'btn', type: 'submit' }, 'Verify')));
}

function buildNav() {
  const nav = clear($('#nav'));
  for (const r of ROUTES) nav.append(h('button', { 'data-r': r.id, title: r.label, onclick: () => { location.hash = '#/' + r.id; } }, svg(ICON[r.icon]), h('span', { class: 'lbl' }, r.label)));
  const cb = clear($('#collapse')); cb.append(svg(ICON.col));
  cb.onclick = () => { const a = $('#app'); a.classList.toggle('collapsed'); const c = a.classList.contains('collapsed'); cb.title = c ? 'Expand menu' : 'Collapse menu'; cb.setAttribute('aria-label', cb.title); cb.style.transform = c ? 'rotate(180deg)' : ''; };
}
let token = 0;
async function route() {
  const id = (location.hash.replace('#/', '') || 'dashboard').split('?')[0]; const r = ROUTES.find(x => x.id === id) || ROUTES[0]; const my = ++token;
  document.querySelectorAll('#nav button').forEach(b => b.dataset.r === r.id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  $('#title').textContent = r.title; clear($('#ctx')); const v = clear($('#view')); v.append(h('div', { class: 'empty' }, 'Loading…'));
  try { const mod = await r.load(); if (my !== token) return; clear(v); await mod.render({ view: v, ctx: $('#ctx') }); v.focus({ preventScroll: true }); }
  catch (e) { console.error(e); clear(v); v.append(h('div', { class: 'err-msg' }, 'Could not open this page: ' + e.message)); }
}
export async function start() {
  $('#login').hidden = true; $('#app').hidden = false;
  $('#who').textContent = `${db.user.name || db.user.email} · ${db.user.role}`;
  $('#banner').replaceChildren(...(isDemo() ? [h('div', { class: 'demo' }, 'DEMO MODE: nothing is saved or sent anywhere. Connect Supabase in config.js to go live.')] : []));
  await db.audit('login', 'session', db.user.id);
  const w = currentWeek(); if (!S.week) S.week = w;
  buildNav(); route(); idleReset();
}
export async function init() {
  S.reg = await (await fetch('modules.json')).json(); await db.init();
  $('#signout').onclick = signOut;
  for (const ev of ['click', 'keydown', 'mousemove']) document.addEventListener(ev, () => { if (db.user) idleReset(); }, { passive: true });
  window.addEventListener('hashchange', () => db.user && route());
  showLogin();
}
init();
