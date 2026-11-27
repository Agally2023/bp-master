import { h, clear, pct, fmtDate } from '../util.js?v=202611270845';
import { S, setWeek, setPeriod, currentWeek } from '../state.js?v=202611270845';
import { MODES, periodize, periodLabel, periodRangeText, currentPeriod } from '../period.js?v=202611270845';
import { weeksAvailable } from '../analytics.js?v=202611270845';
import { weekRange } from '../util.js?v=202611270845';

// Weekly / Monthly / Daily switch and the period list. `raw` is the loaded data; the list is built from the data re-keyed for the chosen view.
export function weekPicker(ctx, raw, onChange) {
  const sel = h('select', { 'aria-label': 'Report period' }), rng = h('span', { class: 'muted' });
  const modeBox = h('div', { class: 'seg', role: 'group', 'aria-label': 'View' });
  const fill = () => {
    const d = periodize(raw, S.period), avail = weeksAvailable(d), cur = S.period === 'week' ? currentWeek() : currentPeriod(S.period);
    if (!avail.some(a => a.y === cur.y && a.w === cur.w)) avail.unshift(cur);
    if (!avail.some(a => a.y === S.week.y && a.w === S.week.w)) avail.push({ ...S.week });
    avail.sort((a, b) => b.y * 1000 + b.w - (a.y * 1000 + a.w));
    clear(sel); for (const a of avail) sel.append(h('option', { value: `${a.y}-${a.w}`, selected: a.y === S.week.y && a.w === S.week.w }, periodLabel(S.period, a.y, a.w)));
    const t = periodRangeText(S.period, S.week.y, S.week.w), r = S.period === 'week' ? weekRange(S.week.y, S.week.w) : null;
    rng.textContent = t || `${fmtDate(r.monIso)} – ${fmtDate(r.sunIso)}`;
  };
  const buttons = MODES.map(([m, label]) => h('button', { type: 'button', 'aria-pressed': S.period === m, onclick: () => {
    if (S.period === m) return; setPeriod(m);
    const avail = weeksAvailable(periodize(raw, m)), cur = m === 'week' ? currentWeek() : currentPeriod(m), pick = m === 'week' ? (avail.find(a => a.y === cur.y && a.w === cur.w) || avail[0] || cur) : (avail.find(a => a.y * 1000 + a.w <= cur.y * 1000 + cur.w) || avail[0] || cur);   // month/day: the latest period that has data and is not in the future
    S.week = { y: pick.y, w: pick.w }; buttons.forEach((b, i) => b.setAttribute('aria-pressed', MODES[i][0] === m)); fill(); S.listeners.forEach(f => f()); onChange();
  } }, label));
  modeBox.append(...buttons);
  sel.onchange = () => { const [y, w] = sel.value.split('-').map(Number); setWeek(y, w); fill(); onChange(); };
  fill(); ctx.append(modeBox, rng, sel);
}
export const kpi = (label, value, o = {}) => h('div', { class: 'kpi ' + (o.cls || '') }, h('div', { class: 'v' }, value), h('div', { class: 'l' }, label), o.note ? h('div', { class: 'd ' + (o.good == null ? '' : o.good ? 'good' : 'bad') }, o.note) : null);
// template: negative numbers in ( ) rather than with a minus sign, e.g. -5.0% -> (5.0)%
const paren = v => { if (typeof v !== 'string') return v; const m = /^[-−]\s?(\d[\d.,]*)\s?(%|x)?$/.exec(v.trim()); return m ? `(${m[1]})${m[2] || ''}` : v; };
export function table(heads, rows, o = {}) {
  return h('div', { class: 'tw' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, heads.map((x, i) => h('th', { class: rows.length && rows.filter(r => { const c = r[i]; const v = c && typeof c === 'object' && !(c instanceof Node) ? c.v : c; return v != null && /^[(\-–]?\s*[\d.,]+\s*(%|x)?\)?$/.test(String(v).trim()); }).length >= Math.max(1, rows.length / 2) ? 'num' : '' }, x)))),
    h('tbody', {}, rows.length ? rows.map(r => h('tr', {}, r.map((c, i) => { const cell = c && typeof c === 'object' && !(c instanceof Node) ? c : { v: c }; const isNum = (o.num && o.num.includes(i)) || (cell.v != null && typeof cell.v !== 'object' && /^[(\-–]?\s*[\d.,]+\s*(%|x)?\)?$/.test(String(cell.v).trim())); const isDate = cell.v != null && typeof cell.v !== 'object' && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(String(cell.v).trim());
      return h('td', { class: [cell.cls, isNum ? 'num' : '', !cell.cls && (isNum || isDate) && !/%|score|total|average|avg|rate|compliance|survival|overall|rating|variance|diff/i.test(String(heads[i])) ? 'in' : ''].filter(Boolean).join(' ') || false }, cell.v instanceof Node ? cell.v : paren(cell.v) ?? '–'); }))) : [h('tr', {}, h('td', { colspan: heads.length, class: 'empty' }, o.empty || 'No data for this week'))])));
}
export const band = (v, good = 0.8, avg = 0.5) => v == null ? '' : v >= good ? 'good' : v >= avg ? 'avg' : 'poor';
export const card = (title, ...kids) => h('div', { class: 'card' }, title ? h('h2', {}, title) : null, ...kids);
export const noData = (msg = 'No data for this week') => h('div', { class: 'empty' }, msg);

// Biosecurity block shared by the dashboard and the report preview: category table + shaded trend, as on the PPT slide.
export const bandText = v => v == null ? '' : v >= 0.8 ? 'Good' : v >= 0.5 ? 'Average' : 'Poor';
export function bioTable(a, pct) {
  const rows = a.cats.map(c => [c.category, c.n, pct(c.score, 1), { v: bandText(c.score), cls: band(c.score) }]);
  if (a.current != null) rows.push([{ v: 'Overall', cls: 'tot' }, a.checks, pct(a.current, 1), { v: bandText(a.current), cls: band(a.current) }]);
  return table(['Category', 'Ratings (no.)', 'Average (%)', 'Rating'], rows, { num: [1, 2, 3] });
}
