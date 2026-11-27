import { h, clear, toast, fmtDate } from '../util.js?v=202611270923';
import { db } from '../db.js?v=202611270923';

const ROLES = [['auditor', 'Auditor (enter/import data)'], ['reviewer', 'Reviewer (read only)'], ['admin', 'Administrator']];
export async function render({ view }) {
  const box = h('div', {}); view.append(box); await draw();
  async function draw() {
    const users = await db.listUsers(); clear(box);
    const pending = users.filter(u => u.status === 'pending');
    if (pending.length) box.append(h('div', { class: 'demo', style: 'margin:0 0 12px;border-radius:8px' }, `${pending.length} account(s) waiting for your approval`));
    const act = async (u, patch, what) => { try { await db.updateUser(u.id, patch); await db.audit('user_' + what, 'profile', u.id, { email: u.email }); toast(`${u.email}: ${what}`); await draw(); } catch (e) { toast(e.message, true); await draw(); } };
    const rows = users.map(u => {
      const me = u.id === db.user.id, role = h('select', { 'aria-label': 'Role', disabled: me, onchange: e => act(u, { role: e.target.value }, 'role changed') }, ROLES.map(([v, l]) => h('option', { value: v, selected: v === u.role }, l)));
      const pill = h('span', { class: 'pill ' + (u.status === 'active' ? 'ok' : u.status === 'pending' ? 'warn' : 'err') }, u.status);
      const btns = [];
      if (u.status === 'pending') btns.push(h('button', { class: 'btn sm', onclick: () => act(u, { status: 'active', active: true, role: role.value }, 'approved') }, 'Approve'));
      if (u.status === 'active' && !me) btns.push(h('button', { class: 'btn sec sm', onclick: () => confirm(`Disable ${u.email}? They will be signed out of BP Master at their next request.`) && act(u, { status: 'disabled', active: false }, 'disabled') }, 'Disable'));
      if (u.status === 'disabled') btns.push(h('button', { class: 'btn sec sm', onclick: () => act(u, { status: 'active', active: true }, 'enabled') }, 'Enable'));
      if (!me) btns.push(h('button', { class: 'btn danger sm', onclick: async () => { if (!confirm(`Remove ${u.email} from BP Master?\n\nTheir login to other apps is not affected. They can request access again.`)) return; try { await db.removeUser(u.id); await db.audit('user_removed', 'profile', u.id, { email: u.email }); toast('Access removed'); await draw(); } catch (e) { toast(e.message, true); } } }, 'Remove'));
      return h('tr', {}, h('td', {}, h('b', {}, u.full_name), me ? h('span', { class: 'muted' }, '  (you)') : null, h('div', { class: 'muted' }, u.email)), h('td', {}, pill), h('td', {}, role), h('td', {}, fmtDate((u.requested_at || '').slice(0, 10))), h('td', { class: 'row' }, ...btns));
    });
    box.append(h('div', { class: 'card' }, h('h2', {}, 'Accounts'),
      h('p', { class: 'muted' }, 'People create their own account from the sign-in page, then appear here as “pending”. Approve to give access, Disable to block without deleting, Remove to take away BP Master access. You cannot change your own access, and there must always be one active administrator.'),
      h('div', { class: 'tw' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Person', 'Status', 'Role', 'Requested', 'Actions'].map(x => h('th', {}, x)))), h('tbody', {}, rows)))));
  }
}
