#!/usr/bin/env python3
"""BP Master report service. POST /report {year, week} with the signed-in user's Supabase JWT.
The JWT is forwarded to Supabase, so row level security and MFA (aal2) apply exactly as in the app.
Only an administrator can export, and only an APPROVED report.  Env: SUPABASE_URL SUPABASE_ANON_KEY ALLOWED_ORIGIN TEMPLATE PORT
Local test mode (no auth, no Supabase):  python server.py --local ../web/demo-data.json"""
import json, os, sys, tempfile, urllib.request, urllib.error, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
sys.path.insert(0, os.path.dirname(__file__))
from bpm import pipeline

HERE = os.path.dirname(os.path.abspath(__file__))
REG = json.load(open(os.path.join(HERE, '..', 'web', 'modules.json')))
STAGE_DEFS = next(m for m in REG['modules'] if m['key'] == 'pond_flips')['stages']
NEED = ['workstation_audits', 'bottom_rope_audits', 'day3_recounts', 'biosecurity_audits', 'parasitology_samples', 'ras_water_volume', 'ras_parasite_prevalence', 'stocking_audits',
        'fry_transfers', 'egg_separation_ratings', 'egg_volumetric_jars', 'pond_flips', 'hapa_exchanges', 'pond_prep_scoring']
SB, KEY = os.environ.get('SUPABASE_URL', '').rstrip('/'), os.environ.get('SUPABASE_ANON_KEY', '')
ORIGIN = os.environ.get('ALLOWED_ORIGIN', '')
TEMPLATE = os.environ.get('TEMPLATE', os.path.join(HERE, '..', 'templates', 'VF_BP_Weekly_Template.pptx'))
LOCAL = None
MAX_BODY = 4096

def sb(path, token, method='GET', raw=False, headers=None):
    req = urllib.request.Request(SB + path, method=method, headers={'apikey': KEY, 'Authorization': 'Bearer ' + token, **(headers or {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        b = r.read(); return b if raw else json.loads(b or 'null')

def load_table(t, token, year):
    out, f = [], 0
    while True:
        part = sb(f'/rest/v1/bpm_{t}?select=*&iso_year=eq.{year}', token, headers={'Range-Unit': 'items', 'Range': f'{f}-{f + 999}'})
        out += part; f += 1000
        if len(part) < 1000: return out

class H(BaseHTTPRequestHandler):
    def _cors(self):
        # ALLOWED_ORIGIN may list several addresses separated by commas (e.g. the workers.dev address and a custom domain)
        o = self.headers.get('Origin', ''); allowed = [x.strip().rstrip('/') for x in ORIGIN.split(',') if x.strip()]
        if allowed: self.send_header('Access-Control-Allow-Origin', o if o.rstrip('/') in allowed else allowed[0]); self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type'); self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
    def _err(self, code, msg):
        b = json.dumps({'error': msg}).encode(); self.send_response(code); self._cors(); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self): self.send_response(204); self._cors(); self.end_headers()
    def do_GET(self):
        b = b'ok'; self.send_response(200); self._cors(); self.send_header('Content-Length', '2'); self.end_headers(); self.wfile.write(b)
    def do_POST(self):
        try:
            n = int(self.headers.get('Content-Length', 0))
            if n > MAX_BODY: return self._err(413, 'too large')
            body = json.loads(self.rfile.read(n) or '{}'); year, week = int(body['year']), int(body['week'])
            if not (2020 <= year <= 2100 and 1 <= week <= 53): return self._err(400, 'bad week')
            tmp = tempfile.mkdtemp(prefix='bpm_'); out = os.path.join(tmp, f'VF_BP_Week_{week}.pptx'); images, overrides, exclude = [], {}, []
            if LOCAL is not None:
                T = LOCAL
            else:
                tok = (self.headers.get('Authorization') or '')[7:]
                if not tok: return self._err(401, 'sign in required')
                try: me = sb('/auth/v1/user', tok)
                except urllib.error.HTTPError: return self._err(401, 'invalid or expired session')
                prof = sb(f"/rest/v1/bpm_profiles?id=eq.{me['id']}&select=role,active", tok)
                if not prof or not prof[0]['active'] or prof[0]['role'] != 'admin': return self._err(403, 'administrator only')
                rep = sb(f'/rest/v1/bpm_reports?iso_year=eq.{year}&iso_week=eq.{week}&select=id,status', tok)
                if not rep: return self._err(404, 'no report for that week')
                if rep[0]['status'] not in ('approved', 'exported'): return self._err(409, 'report is not approved')
                T = {t: load_table(t, tok, year) for t in NEED}
                for s in sb(f"/rest/v1/bpm_report_sections?report_id=eq.{rep[0]['id']}&select=section_key,comment,include", tok):
                    if s['include'] is False: exclude.append(s['section_key'])
                    elif s['comment']: overrides[s['section_key']] = s['comment']
                for im in sb(f"/rest/v1/bpm_report_images?report_id=eq.{rep[0]['id']}&select=section_key,slot,kind,storage_path,caption", tok):
                    p = os.path.join(tmp, f"img_{im['section_key']}_{im['slot']}_{im['kind']}" + os.path.splitext(im['storage_path'])[1])
                    open(p, 'wb').write(sb('/storage/v1/object/authenticated/bpm-report-images/' + urllib.parse.quote(im['storage_path']), tok, raw=True)); images.append({**im, 'path': p})
            pipeline.build_week(T, year, week, out, TEMPLATE, STAGE_DEFS, overrides, images, exclude)
            data = open(out, 'rb').read(); self.send_response(200); self._cors()
            self.send_header('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'); self.send_header('Content-Length', str(len(data))); self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(data)
        except (KeyError, ValueError, json.JSONDecodeError): self._err(400, 'bad request')
        except Exception as e: print('ERROR', repr(e), file=sys.stderr); self._err(500, 'report build failed')

if __name__ == '__main__':
    if '--local' in sys.argv:
        LOCAL = json.load(open(sys.argv[sys.argv.index('--local') + 1]))
    elif not (SB and KEY): sys.exit('Set SUPABASE_URL and SUPABASE_ANON_KEY')
    ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', 8787))), H).serve_forever()
