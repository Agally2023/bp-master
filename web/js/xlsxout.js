// Excel export in the Victory Farms XLS template format (20250313_Victory_Farms_XLS_Template.xlsx):
// Calibri 12 in 262626, gridlines off, 22 pt navy title in C2 + "Victory Farms" + date, navy (002060) white-bold header row,
// light-navy band with the table title, numbers right-aligned with one consistent format per column (negatives in ( ), small numbers 2 decimals,
// % one decimal, dates dd/mm/yyyy), hard-coded values in blue, fish logo top right (not distorted).
import { weekRange } from './util.js';

const NAVY = '002060', INK = '262626', BAND = 'E6E9EF', BLUE = '0000FF';
const FMT = {
  int: '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)',
  dec1: '_(* #,##0.0_);_(* \\(#,##0.0\\);_(* "-"?_);_(@_)',
  dec2: '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)',
  dec4: '_(* #,##0.0000_);_(* \\(#,##0.0000\\);_(* "-"????_);_(@_)',
  pct: '0.0%;\\(0.0%\\)', date: 'dd/mm/yyyy',
};
const FILLS = { good: 'C6EFCE', avg: 'FFEB9C', poor: 'FFC7CE', late: 'FF3B3B' };
const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colL = n => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

// text shown on the dashboard -> typed cell
function parseCell(t) {
  t = t.trim(); let m;
  if ((m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t))) return { v: Date.UTC(+m[3], +m[2] - 1, +m[1]) / 864e5 + 25569, fmt: 'date' };
  if ((m = /^(\()?(-)?([\d,]*\.?\d+)(%)?\)?$/.exec(t)) && !(m[1] && !t.endsWith(')'))) {
    const dec = (m[3].split('.')[1] || '').length; let v = parseFloat(m[3].replace(/,/g, '')); if (m[1] || m[2]) v = -v;
    return m[4] ? { v: v / 100, fmt: 'pct' } : { v, fmt: dec === 0 ? 'int' : dec === 1 ? 'dec1' : dec === 2 ? 'dec2' : 'dec4' };
  }
  return { s: t };
}

function styles() {
  const fonts = [], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], nf = [], xfs = [], seen = new Map();
  const idx = (arr, x) => { let i = arr.indexOf(x); if (i < 0) { arr.push(x); i = arr.length - 1; } return i; };
  const get = (o = {}) => {
    const k = JSON.stringify(o); if (seen.has(k)) return seen.get(k);
    const font = idx(fonts, `<font>${o.b ? '<b/>' : ''}<sz val="${o.sz || 12}"/><color rgb="FF${o.color || INK}"/><name val="Calibri"/><family val="2"/></font>`);
    const fill = o.fill ? idx(fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${o.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const numFmt = o.fmt ? 164 + idx(nf, FMT[o.fmt] || o.fmt) : 0;
    xfs.push(`<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${o.top ? 1 : 0}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment${o.h ? ` horizontal="${o.h}"` : ''} vertical="${o.wrap ? 'center' : 'bottom'}"${o.wrap ? ' wrapText="1"' : ''}/></xf>`);
    seen.set(k, xfs.length - 1); return xfs.length - 1;
  };
  get({});   // default style 0
  const xml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="${nf.length}">${nf.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('')}</numFmts>` +
    `<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills>` +
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color auto="1"/></top><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return { get, xml };
}

/** tables: [{ title, head: [..], rows: [[{t:'text', cls:'good'}..]..] }] */
export function buildSheets(tables, dateText) {
  const st = styles(), used = new Set();
  return { st, sheets: tables.map(tb => {
    let name = tb.title.replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet'; for (let i = 2; used.has(name.toLowerCase()); i++) name = name.slice(0, 28) + ' ' + i; used.add(name.toLowerCase());
    const nc = tb.head.length, typed = tb.rows.map(r => r.map(c => ({ ...parseCell(c.t), cls: c.cls })));
    const numCol = tb.head.map((_, c) => typed.length > 0 && typed.filter(r => r[c].v != null).length >= Math.max(1, typed.length / 2));
    const fmtOf = c => { const f = typed.map(r => r[c].fmt).filter(Boolean); return f.includes('dec4') ? 'dec4' : f.includes('dec2') ? 'dec2' : f.includes('dec1') ? 'dec1' : f[0]; };   // one format per column
    const cells = [], put = (r, c, v, s, isNum) => cells.push({ r, c, v, s, isNum });
    const C0 = 2;   // tables start in column C (A and B are narrow spacers, as in the template)
    put(2, C0, tb.title, st.get({ sz: 22, b: true, color: NAVY })); put(3, C0, 'Victory Farms', st.get({})); put(4, C0, dateText, st.get({}));
    tb.head.forEach((h, c) => put(6, C0 + c, h, st.get({ b: true, color: 'FFFFFF', fill: NAVY, h: numCol[c] ? 'right' : 'left', wrap: true })));
    for (let c = 0; c < nc; c++) put(7, C0 + c, c === 0 ? tb.title : '', st.get({ b: true, fill: BAND, h: 'left' }));
    typed.forEach((r, i) => r.forEach((x, c) => {
      const base = { fill: FILLS[x.cls], b: x.cls === 'redtxt' || x.cls === 'late', color: x.cls === 'redtxt' ? 'FF0000' : x.cls === 'late' ? 'FFFFFF' : undefined };
      if (x.v != null) put(8 + i, C0 + c, x.v, st.get({ ...base, color: base.color || BLUE, fmt: x.fmt === 'date' || x.fmt === 'pct' ? x.fmt : (fmtOf(c) && fmtOf(c) !== 'pct' && fmtOf(c) !== 'date' ? fmtOf(c) : x.fmt), h: 'right' }), true);
      else put(8 + i, C0 + c, x.s, st.get({ ...base, color: base.color || (x.s && x.s !== '–' && x.s !== '-' ? '000000' : INK), h: numCol[c] ? 'right' : 'left' }));
    }));
    const widths = tb.head.map((h, c) => Math.max(c === 0 ? 14 : 12, Math.min(c === 0 ? 40 : 30, Math.max(Math.ceil(h.length * 0.8) + 2, ...tb.rows.map(r => r[c].t.length + 2)))));
    return { name, cells, widths, C0, nc, lastRow: 7 + typed.length };
  }) };
}

function sheetXml(sh, hasLogo) {
  const rows = new Map(); for (const c of sh.cells) { if (!rows.has(c.r)) rows.set(c.r, []); rows.get(c.r).push(c); }
  const body = [...rows.keys()].sort((a, b) => a - b).map(r => `<row r="${r}"${r === 2 ? ' ht="29.25" customHeight="1"' : r === 6 ? ' ht="33" customHeight="1"' : ' ht="16.9" customHeight="1"'}>` + rows.get(r).sort((a, b) => a.c - b.c).map(c => {
    const ref = colL(c.c) + r;
    if (c.isNum) return `<c r="${ref}" s="${c.s}"><v>${c.v}</v></c>`;
    return c.v === '' ? `<c r="${ref}" s="${c.s}"/>` : `<c r="${ref}" s="${c.s}" t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
  }).join('') + '</row>').join('');
  const cols = `<cols><col min="1" max="1" width="3.2" customWidth="1"/><col min="2" max="2" width="1.7" customWidth="1"/>` + sh.widths.map((w, i) => `<col min="${sh.C0 + 1 + i}" max="${sh.C0 + 1 + i}" width="${w}" customWidth="1"/>`).join('') + `</cols>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${colL(sh.C0 + sh.nc)}${sh.lastRow}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="16.9"/>${cols}<sheetData>${body}</sheetData><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>${hasLogo ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
}

const drawingXml = (col, w, h) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
  `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>88668</xdr:rowOff></xdr:from><xdr:ext cx="${w}" cy="${h}"/>` +
  `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Victory Farms logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
  `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;

export async function exportXlsx(JSZip, tables, dateText, logo /* {bytes, w, h} | null */) {
  const { st, sheets } = buildSheets(tables, dateText), z = new JSZip(), R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` + (logo ? `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : '')).join('') + `</Types>`);
  z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  z.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${R}/styles" Target="styles.xml"/></Relationships>`);
  if (logo) z.file('xl/media/logo.png', logo.bytes);
  sheets.forEach((sh, i) => {
    z.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sh, !!logo));
    if (logo) {
      const w = 751691, h = Math.round(w * logo.h / logo.w);
      z.file(`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/drawing" Target="../drawings/drawing${i + 1}.xml"/></Relationships>`);
      z.file(`xl/drawings/drawing${i + 1}.xml`, drawingXml(sh.C0 + sh.nc + 1, w, h));
      z.file(`xl/drawings/_rels/drawing${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/image" Target="../media/logo.png"/></Relationships>`);
    }
  });
  z.file('xl/styles.xml', st.xml());
  return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Collect every table card currently shown on the dashboard. */
export function collectTables(root) {
  const out = [];
  for (const card of root.querySelectorAll('.card')) {
    const t = card.querySelector('table.t'); if (!t) continue;
    const title = (card.querySelector('h2')?.textContent || 'Table').trim();
    const head = [...t.querySelectorAll('thead th')].map(x => x.textContent.trim());
    const rows = [...t.querySelectorAll('tbody tr')].filter(r => !r.querySelector('td.empty')).map(r => [...r.children].map(td => ({ t: td.textContent, cls: [...td.classList].find(c => ['good', 'avg', 'poor', 'late', 'redtxt'].includes(c)) })));
    if (head.length && rows.length) out.push({ title, head, rows });
  }
  return out;
}
export { weekRange };
