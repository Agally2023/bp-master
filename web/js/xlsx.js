// Minimal, dependency-light .xlsx reader (JSZip only). Streams rows and stops after a run of blank rows,
// so sheets that declare a million formatted rows do not freeze the browser.
const dec = s => s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (m, g) => {
  if (g[0] === '#') return String.fromCodePoint(g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10));
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[g];
});
const attr = (s, n) => { const m = new RegExp('\\b' + n + '="([^"]*)"').exec(s); return m ? dec(m[1]) : null; };
const colIdx = ref => { let n = 0; for (const c of ref.replace(/[0-9]/g, '')) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
const BUILTIN_DATE = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57, 58, 59]);
const BUILTIN_TIME = new Set([18, 19, 20, 21]);

function fmtKind(code) {
  const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  const hasD = /[dy]/i.test(c), hasT = /[hs]/i.test(c) || /AM\/PM/i.test(c), hasM = /m/i.test(c);
  if (hasD) return 'date'; if (hasT) return 'time'; if (hasM && !/[0#]/.test(c)) return 'date'; return null;
}

export async function openWorkbook(buf) {
  const zip = await JSZip.loadAsync(buf);
  const get = async p => { const f = zip.file(p); return f ? f.async('string') : null; };
  const wb = await get('xl/workbook.xml'); if (!wb) throw new Error('Not a valid .xlsx file');
  const rels = await get('xl/_rels/workbook.xml.rels') || '';
  const date1904 = /date1904="(1|true)"/.test(wb);
  const relMap = {}; for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) relMap[attr(m[0], 'Id')] = attr(m[0], 'Target');
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const t = relMap[attr(m[0], 'r:id')]; if (!t) continue;
    sheets.push({ name: attr(m[0], 'name'), path: t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '') });
  }
  const sst = []; const ss = await get('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) sst.push(dec([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')));
  const styles = await get('xl/styles.xml') || '';
  const custom = {}; for (const m of styles.matchAll(/<numFmt\b[^>]*>/g)) custom[attr(m[0], 'numFmtId')] = attr(m[0], 'formatCode');
  const xfs = []; const cx = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles);
  if (cx) for (const m of cx[1].matchAll(/<xf\b[^>]*>/g)) {
    const id = parseInt(attr(m[0], 'numFmtId') || '0', 10);
    xfs.push(BUILTIN_DATE.has(id) ? 'date' : BUILTIN_TIME.has(id) ? 'time' : custom[id] ? fmtKind(custom[id]) : null);
  }
  const serial = (v, kind) => {
    if (kind === 'time' || (kind === 'date' && v < 1 && v >= 0)) {
      const secs = Math.round((v % 1) * 86400); const p = n => String(n).padStart(2, '0');
      return `${p(Math.floor(secs / 3600) % 24)}:${p(Math.floor(secs / 60) % 60)}:${p(secs % 60)}`;
    }
    return new Date(Math.round((v - (date1904 ? 24107 : 25569)) * 86400000));
  };
  return {
    sheetNames: sheets.map(s => s.name),
    async rows(name, { maxBlank = 60, maxRows = 200000 } = {}) {
      const sh = sheets.find(s => s.name === name); if (!sh) return null;
      const xml = await get(sh.path); if (!xml) return null;
      const out = []; let last = 0, blank = 0;
      for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const rn = parseInt(attr(rm[1], 'r') || String(out.length + 1), 10);
        if (rn - last - 1 >= maxBlank && out.length > 0) break;      // long gap of empty rows -> end of data
        while (out.length < rn - 1) out.push([]);
        const row = [];
        for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const a = cm[1], body = cm[2] || ''; const t = attr(a, 't'); const ci = colIdx(attr(a, 'r') || 'A1');
          const s = parseInt(attr(a, 's') || '0', 10); let val = null;
          const v = /<v>([\s\S]*?)<\/v>/.exec(body);
          if (t === 's') val = v ? sst[parseInt(v[1], 10)] : null;
          else if (t === 'inlineStr') val = dec([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
          else if (t === 'str') val = v ? dec(v[1]) : null;
          else if (t === 'b') val = v ? v[1] === '1' : null;
          else if (t === 'e') val = v ? dec(v[1]) : null;
          else if (v && v[1] !== '') { const n = parseFloat(v[1]); val = xfs[s] ? serial(n, xfs[s]) : n; }
          if (val !== null && val !== '') row[ci] = val;
        }
        const empty = row.every(x => x == null || (typeof x === 'string' && (x.trim() === '' || /^#(REF!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!|NULL!)$/.test(x.trim()))));
        out.push(row); last = rn; blank = empty ? blank + 1 : 0;
        if (blank >= maxBlank || out.length >= maxRows) break;
      }
      return out;
    }
  };
}
