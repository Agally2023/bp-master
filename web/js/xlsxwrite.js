// Excel export in the Victory Farms template style: title in navy, "Victory Farms" + export date, light-navy header row with a thin rule,
// entered values blue (0000FF), calculated values black, dates dd/mm/yyyy, numbers right-aligned with () for negatives, fish logo top right.
const X = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const colName = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const serial = iso => { const d = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); return d / 864e5 + 25569; };
// Victory Farms Excel template: Calibri 12; title 22 bold navy; navy (002060) header bar with bold white text; light-navy (D6E3FF) table banner with bold black label;
// labels black, hardcoded numbers/dates blue (0000FF), formulas black; numbers right-aligned, negatives in ( ); % one decimal; dates dd/mm/yyyy; thin rule above totals.
const NF = { year: '0', int: '#,##0;\\(#,##0\\)', dec: '#,##0.00;\\(#,##0.00\\)', pct: '#,##0.0%;\\(#,##0.0\\)%', date: 'dd/mm/yyyy' };
const NFID = { year: 1, int: 164, dec: 165, pct: 166, date: 167 };
const XF = []; const xfId = (font, fill, border, nf, h) => { const k = [font, fill, border, nf, h].join('|'); let i = XF.findIndex(x => x.k === k); if (i < 0) { XF.push({ k, font, fill, border, nf, h }); i = XF.length - 1; } return i; };
function styles() {
  XF.length = 0; xfId(0, 0, 0, 0, null);
  return () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<numFmts count="4">${Object.keys(NF).map(k => `<numFmt numFmtId="${NFID[k]}" formatCode="${X(NF[k])}"/>`).join('')}</numFmts>`
    + `<fonts count="5"><font><sz val="12"/><color rgb="FF000000"/><name val="Calibri"/></font><font><b/><sz val="22"/><color rgb="FF002060"/><name val="Calibri"/></font><font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><sz val="12"/><color rgb="FF0000FF"/><name val="Calibri"/></font><font><b/><sz val="12"/><color rgb="FF000000"/><name val="Calibri"/></font></fonts>`
    + `<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF002060"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD6E3FF"/><bgColor indexed="64"/></patternFill></fill></fills>`
    + `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color auto="1"/></top><bottom/><diagonal/></border></borders>`
    + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
    + `<cellXfs count="${XF.length}">${XF.map(x => `<xf numFmtId="${x.nf}" fontId="${x.font}" fillId="${x.fill}" borderId="${x.border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"${x.h ? ' applyAlignment="1"' : ''}>${x.h ? `<alignment horizontal="${x.h}" vertical="center"/>` : ''}</xf>`).join('')}</cellXfs>`
    + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}
const PCT = /pct|percent|score|survival|compliance|prevalence|rate\b|ratio|fail/i;
function kind(f, vals) {
  if (f.type === 'date') return 'date';
  if (/(^|_)(iso_)?(year|week)$|^(week|year)$/i.test(f.name)) return 'year';          // years and week numbers carry no thousands separator
  if (f.type === 'int' || f.type === 'num') {
    const nums = vals.filter(v => typeof v === 'number'); if (PCT.test(f.name) && nums.length && nums.every(v => v >= 0 && v <= 1.5)) return 'pct';
    return nums.every(Number.isInteger) ? 'int' : 'dec';
  }
  return 'text';
}

/** sheets: [{ name, title, cols: [{label, calc, kind}], rows: [[value...]], banner }] -> Blob */
export async function buildXlsx(JSZip, sheets, logo) {
  const zip = new JSZip(), done = styles();
  const now = new Date(), dateSerial = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5 + 25569;
  const used = new Set(), nm = s => { let n = String(s).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet', k = 2; while (used.has(n.toLowerCase())) n = n.slice(0, 28) + ' ' + k++; used.add(n.toLowerCase()); return n; };
  const names = sheets.map(s => nm(s.name));
  const colOf = i => i === 0 ? 2 : i + 3;                    // C = first column, D = spacer, E... = the rest (as in the template)
  const hdrBar = xfId(2, 2, 0, 0, 'left'), hdrR = xfId(2, 2, 0, 0, 'right'), banner = xfId(4, 3, 0, 0, 'left'), title = xfId(1, 0, 0, 0, null), plain = xfId(0, 0, 0, 0, null);
  sheets.forEach((s, si) => {
    const HDR = 6, BAN = 8, FIRST = 9, nc = s.cols.length, last = FIRST + s.rows.length - 1, lastCol = colOf(nc - 1);
    const widths = s.cols.map((c, i) => i === 0 ? 27.6 : Math.min(48, Math.max(12.2, c.label.length * 1.05 + 2, ...s.rows.slice(0, 300).map(r => String(r[i] ?? '').length + 2))));
    const cell = (r, c, st, v, str) => v == null || v === '' ? `<c r="${colName(c)}${r}" s="${st}"/>` : str ? `<c r="${colName(c)}${r}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${X(v)}</t></is></c>` : `<c r="${colName(c)}${r}" s="${st}"><v>${v}</v></c>`;
    let rows = `<row r="2" ht="29.25" customHeight="1">${cell(2, 2, title, s.title, true)}</row><row r="3" ht="16.9" customHeight="1">${cell(3, 2, plain, 'Victory Farms', true)}</row>`
      + `<row r="4" ht="16.9" customHeight="1">${cell(4, 2, xfId(0, 0, 0, NFID.date, 'left'), dateSerial)}</row>`;
    rows += `<row r="${HDR}" ht="16.9" customHeight="1">${cell(HDR, 2, hdrBar, s.cols[0].label, true)}${cell(HDR, 3, hdrBar)}${s.cols.slice(1).map((c, i) => cell(HDR, colOf(i + 1), c.kind === 'text' ? hdrBar : hdrR, c.label, true)).join('')}</row>`;
    rows += `<row r="${BAN}" ht="16.9" customHeight="1">${cell(BAN, 2, banner, s.banner || s.title, true)}${Array.from({ length: lastCol - 2 }, (_, k) => cell(BAN, 3 + k, banner)).join('')}</row>`;
    s.rows.forEach((r, ri) => {
      const rn = FIRST + ri;
      rows += `<row r="${rn}" ht="16.9" customHeight="1">` + s.cols.map((c, i) => {
        const v = r[i]; if (v == null || v === '') return '';
        const h = i === 0 ? 'left' : 'right', font = c.kind === 'text' || c.calc ? 0 : 3;
        if (c.kind === 'date') return /^\d{4}-\d{2}-\d{2}/.test(v) ? cell(rn, colOf(i), xfId(font, 0, 0, NFID.date, h), Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) / 864e5 + 25569) : cell(rn, colOf(i), xfId(0, 0, 0, 0, 'left'), v, true);
        if (c.kind !== 'text' && typeof v === 'number' && isFinite(v)) return cell(rn, colOf(i), xfId(font, 0, 0, NFID[c.kind], h), v);
        return cell(rn, colOf(i), xfId(0, 0, 0, 0, 'left'), v, true);
      }).join('') + '</row>';
    });
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
      + `<sheetPr><tabColor rgb="FFD6E3FF"/><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="C2:${colName(lastCol)}${Math.max(last, BAN)}"/>`
      + `<sheetViews><sheetView showGridLines="0" zoomScale="85" zoomScaleNormal="85"${si ? '' : ' tabSelected="1"'} workbookViewId="0"><pane ySplit="${BAN}" topLeftCell="A${FIRST}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      + `<sheetFormatPr defaultColWidth="10.97265625" defaultRowHeight="16.9" customHeight="1"/>`
      + `<cols><col min="1" max="1" width="3.2" customWidth="1"/>${widths.map((w, i) => `<col min="${colOf(i) + 1}" max="${colOf(i) + 1}" width="${i === 0 ? 27.6 : w}" customWidth="1"/>`).join('').replace(/^(<col[^>]*\/>)/, '$1<col min="4" max="4" width="1.7" customWidth="1"/>')}<col min="${lastCol + 2}" max="${lastCol + 2}" width="1.2" customWidth="1"/></cols>`
      + `<sheetData>${rows}</sheetData><pageMargins left="0.75" right="0.75" top="1" bottom="1" header="0.5" footer="0.5"/><pageSetup orientation="landscape" fitToHeight="0"/>`
      + `<headerFooter><oddFooter>&amp;L&amp;"Calibri,Regular"&amp;K000000&amp;T &amp;D&amp;C&amp;"Calibri,Regular"&amp;K000000Confidential &amp;F&amp;R&amp;"Calibri,Regular"&amp;K000000Page &amp;P of &amp;N</oddFooter></headerFooter>${logo ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
    zip.file(`xl/worksheets/sheet${si + 1}.xml`, xml);
    if (logo) {
      zip.file(`xl/worksheets/_rels/sheet${si + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${si + 1}.xml"/></Relationships>`);
      // fish logo top right of the table, square (not distorted), same size and offsets as the template
      zip.file(`xl/drawings/drawing${si + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>${lastCol + 2}</xdr:col><xdr:colOff>277936</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>88668</xdr:rowOff></xdr:from><xdr:ext cx="749990" cy="749990"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Victory Farms logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="749990" cy="749990"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
      zip.file(`xl/drawings/_rels/drawing${si + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/></Relationships>`);
    }
  });
  if (logo) zip.file('xl/media/logo.png', logo);
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${logo ? `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : ''}`).join('')}</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${X(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', done());
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Turn a module's stored rows into a sheet definition. */
export function moduleSheet(m, rows) {
  const fields = m.fields.filter(f => !f.virtual && f.type !== 'stages');
  const stageKeys = m.special === 'flip' ? [...new Set(rows.flatMap(r => Object.keys(r.stage_days || {})))] : [];
  const cols = fields.map(f => ({ label: f.label, calc: !!(f.derived || f.excel_formula), f, kind: 'text' })), data = rows.map(r => fields.map(f => { const v = r[f.name]; return typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v; }));
  cols.forEach((c, i) => { c.kind = kind(c.f, data.map(r => r[i])); });
  stageKeys.forEach(k => { cols.push({ label: `${k} (days)`, calc: false, kind: 'int' }); rows.forEach((r, i) => data[i].push(r.stage_days?.[k] ?? null)); });
  const di = m.dateField ? fields.findIndex(f => f.name === m.dateField) : -1;
  if (di >= 0) data.sort((a, b) => String(b[di] || '').localeCompare(String(a[di] || '')));
  return { name: m.label, title: m.label, banner: `${m.label} - ${rows.length.toLocaleString()} records, latest first`, cols, rows: data };
}
