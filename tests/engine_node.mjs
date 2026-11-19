import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.JSZip = require('/opt/npm-tools/node_modules/jszip');
const { openWorkbook } = await import('../web/js/xlsx.js');
const E = await import('../web/js/engine.js');
const reg = JSON.parse(fs.readFileSync('../web/modules.json', 'utf8'));
const dir = process.argv[2]; const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx'));
const only = process.argv[3];
for (const f of files) {
  if (only && !f.includes(only)) continue;
  const t0 = Date.now(); let wb;
  try { wb = await openWorkbook(fs.readFileSync(dir + '/' + f)); } catch (e) { console.log('ERR open', f, e.message); continue; }
  const det = await E.detectModules(wb, reg);
  console.log('\n##', f.slice(9, 60), '| detected:', det.map(d => d.m.key + ':' + d.spec.sheet).join(', ') || '-');
  for (const { m, spec } of det) {
    const rows = await wb.rows(spec.sheet); const p = E.parseSheet(m, spec, rows);
    const v = E.validate(m, spec, p, { today: '2026-11-18' });
    console.log(`  ${m.key.padEnd(24)} ${spec.sheet.padEnd(20)} read ${String(p.read).padStart(5)} valid ${String(v.valid.length).padStart(5)} rejected ${String(v.rejected).padStart(4)} pending ${v.pending || 0}  ${Date.now() - t0}ms`);
    for (const i of v.issues.slice(0, 4)) console.log('     -', i.severity, i.message.slice(0, 120));
  }
}
