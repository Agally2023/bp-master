import fs from 'node:fs'; import { createRequire } from 'node:module';
globalThis.JSZip = createRequire(import.meta.url)('/opt/npm-tools/node_modules/jszip');
const { openWorkbook } = await import('../web/js/xlsx.js'); const E = await import('../web/js/engine.js');
const reg = JSON.parse(fs.readFileSync('../web/modules.json', 'utf8')); const dir = process.argv[2];
const out = {}; const seen = new Set();
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.xlsx')).sort()) {
  const wb = await openWorkbook(fs.readFileSync(dir + '/' + f));
  for (const { m, spec } of await E.detectModules(wb, reg)) {
    const p = E.parseSheet(m, spec, await wb.rows(spec.sheet)); const v = E.validate(m, spec, p, { today: '2026-11-18' });
    const recs = await E.withHashes(m, v.valid); const t = (out[m.key] ||= []);
    for (const r of recs) { if (seen.has(r.row_hash)) continue; seen.add(r.row_hash); t.push({ id: r.row_hash.slice(0, 16), ...r }); }
  }
}
fs.writeFileSync('../web/demo-data.json', JSON.stringify(out));
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(26), v.length);
