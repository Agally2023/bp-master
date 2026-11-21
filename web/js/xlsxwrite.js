// Excel export in the Victory Farms template style: title in navy, "Victory Farms" + export date, light-navy header row with a thin rule,
// entered values blue (0000FF), calculated values black, dates dd/mm/yyyy, numbers right-aligned with () for negatives, fish logo top right.
const X = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const colName = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const serial = iso => { const d = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); return d / 864e5 + 25569; };
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0;\\(#,##0\\)"/><numFmt numFmtId="165" formatCode="#,##0.00;\\(#,##0.00\\)"/><numFmt numFmtId="166" formatCode="0.0%"/><numFmt numFmtId="167" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="6"><font><sz val="12"/><color rgb="FF000000"/><name val="Calibri"/></font><font><b/><sz val="22"/><color rgb="FF002060"/><name val="Calibri"/></font><font><b/><sz val="12"/><color rgb="FF002060"/><name val="Calibri"/></font><font><sz val="12"/><color rgb="FF0000FF"/><name val="Calibri"/></font><font><sz val="12"/><color rgb="FF262626"/><name val="Calibri"/></font><font><i/><sz val="11"/><color rgb="FF595959"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD6E3FF"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF002060"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment horizontal="left"/></xf>
<xf numFmtId="164" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
<xf numFmtId="165" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
<xf numFmtId="167" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
<xf numFmtId="166" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment horizontal="left"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
// style ids: blue (entered) 4 text, 5 int, 6 decimal, 7 date, 8 pct;  black (calculated) 9 text, 10 int, 11 decimal, 7->date stays blue; 12 pct
const PCT = /pct|percent|score|survival|compliance|prevalence|rate\b|ratio|fail/i;
function kind(f, vals) {
  if (f.type === 'date') return 'date';
  if (f.type === 'int' || f.type === 'num') {
    const nums = vals.filter(v => typeof v === 'number'); if (PCT.test(f.name) && nums.length && nums.every(v => v >= 0 && v <= 1.5)) return 'pct';
    return nums.every(Number.isInteger) ? 'int' : 'dec';
  }
  return 'text';
}
const STYLE = { text: [4, 9], int: [5, 10], dec: [6, 11], date: [7, 7], pct: [8, 12] };

/** sheets: [{ name, title, note, cols: [{label, calc, kind}], rows: [[value...]] }] -> Blob */
export async function buildXlsx(JSZip, sheets, logo) {
  const zip = new JSZip(), today = new Date().toLocaleDateString('en-GB');
  const used = new Set(), nm = s => { let n = String(s).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet', k = 2; while (used.has(n.toLowerCase())) n = n.slice(0, 28) + ' ' + k++; used.add(n.toLowerCase()); return n; };
  const names = sheets.map(s => nm(s.name));
  sheets.forEach((s, si) => {
    const hdr = 6, first = 7, nc = s.cols.length, last = first + s.rows.length - 1;
    const widths = s.cols.map((c, i) => Math.min(48, Math.max(11, c.label.length + 3, ...s.rows.slice(0, 200).map(r => String(r[i] ?? '').length + 2))));
    let rowsXml = `<row r="2"><c r="C2" s="1" t="inlineStr"><is><t>${X(s.title)}</t></is></c></row><row r="3"><c r="C3" s="0" t="inlineStr"><is><t>Victory Farms</t></is></c></row>`
      + `<row r="4"><c r="C4" s="13" t="inlineStr"><is><t>${X(s.note || '')} Exported ${today}. Blue = entered values, black = calculated.</t></is></c></row>`
      + `<row r="${hdr}" ht="32" customHeight="1">${s.cols.map((c, i) => `<c r="${colName(i + 2)}${hdr}" s="${c.kind === 'text' ? 2 : 3}" t="inlineStr"><is><t>${X(c.label)}</t></is></c>`).join('')}</row>`;
    s.rows.forEach((r, ri) => {
      rowsXml += `<row r="${first + ri}">` + s.cols.map((c, i) => {
        const v = r[i], ref = `${colName(i + 2)}${first + ri}`, st = STYLE[c.kind][c.calc ? 1 : 0];
        if (v == null || v === '') return '';
        if (c.kind === 'date') return /^\d{4}-\d{2}-\d{2}/.test(v) ? `<c r="${ref}" s="${st}"><v>${serial(String(v))}</v></c>` : `<c r="${ref}" s="${c.calc ? 9 : 4}" t="inlineStr"><is><t>${X(v)}</t></is></c>`;
        if (c.kind !== 'text' && typeof v === 'number' && isFinite(v)) return `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
        return `<c r="${ref}" s="${c.calc ? 9 : 4}" t="inlineStr"><is><t>${X(v)}</t></is></c>`;
      }).join('') + '</row>';
    });
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
      + `<sheetPr><tabColor rgb="FF0E812E"/></sheetPr><dimension ref="C2:${colName(nc + 1)}${Math.max(last, hdr)}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"${si ? '' : ' tabSelected="1"'}><pane ySplit="${hdr}" topLeftCell="A${first}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      + `<sheetFormatPr defaultRowHeight="16"/><cols><col min="1" max="2" width="3.2" customWidth="1"/>${widths.map((w, i) => `<col min="${i + 3}" max="${i + 3}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rowsXml}</sheetData>`
      + `<autoFilter ref="C${hdr}:${colName(nc + 1)}${Math.max(last, hdr)}"/><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToHeight="0"/>${logo ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
    zip.file(`xl/worksheets/sheet${si + 1}.xml`, xml.replace('<sheetPr>', '<sheetPr>').replace('</sheetPr>', '<pageSetUpPr fitToPage="1"/></sheetPr>'));
    if (logo) {
      zip.file(`xl/worksheets/_rels/sheet${si + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${si + 1}.xml"/></Relationships>`);
      const col = Math.max(nc + 1, 3);   // fish logo at the top right of the table, not distorted (square)
      zip.file(`xl/drawings/drawing${si + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="720000" cy="720000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Victory Farms logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="720000" cy="720000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
      zip.file(`xl/drawings/_rels/drawing${si + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/></Relationships>`);
    }
  });
  if (logo) zip.file('xl/media/logo.png', logo);
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${logo ? `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : ''}`).join('')}</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${X(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${names.map((n, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${X(n.replace(/'/g, "''"))}'!$C$6:$${colName(sheets[i].cols.length + 1)}$${Math.max(7 + sheets[i].rows.length - 1, 6)}</definedName>`).join('').replace(/^/, '<definedNames>').concat('</definedNames>')}</workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', STYLES);
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
  return { name: m.label, title: m.label, note: `${rows.length.toLocaleString()} records.`, cols, rows: data };
}
