#!/usr/bin/env python3
"""Cache-busting: stamps every module import and the entry tags with ?v=<VER>, so a browser can never mix old and new files.
Run before each commit:  python3 tools/stamp.py [VER]   (VER defaults to the current UTC time)."""
import re, sys, glob, datetime
ver = sys.argv[1] if len(sys.argv) > 1 else datetime.datetime.utcnow().strftime('%Y%m%d%H%M')
imp = re.compile(r"""((?:\bfrom\s*|\bimport\s*\(?\s*)['"])(\.{1,2}/[^'"?]+\.js)(?:\?v=\w+)?(['"])""")
n = 0
for f in glob.glob('web/js/**/*.js', recursive=True):
    s = open(f, encoding='utf-8').read(); t = imp.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={ver}{m.group(3)}", s)
    if t != s: open(f, 'w', encoding='utf-8').write(t); n += 1
h = open('web/index.html', encoding='utf-8').read()
h2 = re.sub(r'((?:src|href)="(?:js/[^"?]+\.js|css/[^"?]+\.css))(?:\?v=\w+)?"', rf'\1?v={ver}"', h)
if h2 != h: open('web/index.html', 'w', encoding='utf-8').write(h2)
print('stamped', ver, n, 'files')
