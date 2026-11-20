#!/usr/bin/env python3
"""Single source of truth for BP Master modules.
Generates: web/modules.json (forms, import mapping, derivations) and supabase/migrations/0002_modules.sql.
Run: python tools/registry.py   (reads the sample Excel files only to learn headers/stage lists; no data is written out)"""
import json, os, re, sys, glob
ROOT = os.path.join(os.path.dirname(__file__), '..')
sys.path.insert(0, os.path.join(ROOT, 'engine'))
A = os.environ.get('BPM_FILES', '/mnt/user-data/attachments/cb1caadd-3e86-5118-8d81-c9eb497e3727')
fp = lambda prefix: glob.glob(f'{A}/{prefix}*.xlsx')[0]

ISLANDS = ['Mbasa South', 'Kibuogi North', 'Remba South', 'Ringiti East', 'Mfangano East', 'Kibuogi South', 'Takawiri West', 'Takawiri East', 'Mfangano West', 'Mbasa North', 'Ringiti West', 'Remba North']
STAGES = ['Stage 1', 'Stage 2', 'Stage 3', 'Early Stage 4', 'Late Stage 4', 'Fry']

def F(name, label, type='text', req=False, **kw):
    d = dict(name=name, label=label, type=type, req=req); d.update(kw); return d
def D(name, label, type='num'):
    return dict(name=name, label=label, type=type, derived=True)

CORE = [
 dict(key='workstation_audits', label='Incubation Workstation Compliance', group='Incubation', existing=True, dateField='audit_date',
  fields=[F('audit_date', 'Date', 'date', True), F('audit_time', 'Time'), F('ras', 'RAS', 'text', True), F('total_islands', 'Total islands in operation', 'int', True),
          F('compliant_islands', 'Compliant islands', 'int', True), F('noncompliance_location', 'Location of non-compliance'), F('noncompliant_island', 'Name of non-compliant island'),
          F('employee_responsible', 'Employee responsible'), F('reason', 'Reason for non-compliance'), F('auditor', 'Auditor'),
          D('noncompliant_islands', 'Non-compliant islands', 'int'), D('score', 'Score'), D('iso_year', 'ISO year', 'int'), D('iso_week', 'ISO week', 'int')],
  derive=[dict(fn='minus', out='noncompliant_islands', a='total_islands', b='compliant_islands'), dict(fn='ratio', out='score', num='compliant_islands', den='total_islands', round=4),
          dict(fn='isoweek', date='audit_date')],
  imports=[dict(sheet='Audit Data', header='Date', map={'audit_date': 'date', 'audit_time': 'time', 'ras': 'department', 'total_islands': 'total number', 'compliant_islands': 'number of compliant',
           'noncompliant_islands': 'number of non compliant', 'noncompliance_location': 'location of non', 'noncompliant_island': 'name of non', 'employee_responsible': 'employee', 'reason': 'reason', 'auditor': 'auditor'})]),
 dict(key='bottom_rope_audits', label='Hapa Bottom Rope Checks', group='Broodstock', existing=True, dateField='audit_date', natural=['unit_type', 'audit_date', 'pond_id', 'hapa_no'],
  fields=[F('unit_type', 'Unit', 'select', True, options=['nursery', 'broodstock']), F('audit_date', 'Date', 'date', True), F('pond_id', 'Pond ID', 'text', True), F('hapa_no', 'Hapa no.', 'int', True),
          F('top_position', 'Top position', 'int'), F('middle_position', 'Middle position', 'int'), F('bottom_position', 'Bottom position', 'int'), F('not_tied', 'Not tied', 'int'),
          F('missing_hook', 'Missing hook', 'int'), F('total_ropes', 'Total ropes checked', 'int'), F('missing_posts', 'Missing posts', 'int'), F('wrong_position_ropes', 'Wrong position ropes', 'int'), F('comment', 'Comment'),
          D('non_conformances', 'Non-conformances', 'int'), D('hapa_failed', 'Hapa failed', 'bool'), D('iso_year', 'ISO year', 'int'), D('iso_week', 'ISO week', 'int')],
  derive=[dict(fn='sum', out='non_conformances', of=['not_tied', 'missing_hook', 'missing_posts', 'wrong_position_ropes']), dict(fn='gt0', out='hapa_failed', of='non_conformances'), dict(fn='isoweek', date='audit_date')],
  imports=[dict(sheet=s, header='Date', const={'unit_type': u}, map={'audit_date': 'date', 'pond_id': 'pond id', 'hapa_no': 'hapa no', 'top_position': 'top position', 'middle_position': 'middle position',
           'bottom_position': 'bottom position', 'not_tied': 'not tied', 'missing_hook': 'missing hook', 'total_ropes': 'total ropes', 'missing_posts': 'missing posts', 'wrong_position_ropes': 'wrong position', 'comment': 'comment'})
           for s, u in (('Nursery', 'nursery'), ('Broodstock', 'broodstock'))]),
 dict(key='day3_recounts', label='3-Day Pond Survival (Recounts)', group='Nursery', existing=True, dateField='recount_date', natural=['stocking_date', 'pond', 'hapa'],
  fields=[F('stocking_date', 'Stocking date', 'date'), F('pond', 'Pond', 'text', True), F('hapa', 'Hapa', 'text', True), F('batch_code', 'Batch / RAS'), F('in_abw', 'In ABW (g)', 'num'), F('in_fish_no', 'Fish stocked', 'int', True),
          F('recount_date', 'Day-3 recount date', 'date', True), F('recount_pcs', 'Day-3 recount (pcs)', 'int', True), F('recount_abw', 'Day-3 ABW (g)', 'num'),
          D('unit', 'Unit', 'text'), D('survival', 'Survival'), D('iso_year', 'ISO year', 'int'), D('iso_week', 'ISO week', 'int')],
  derive=[dict(fn='concat', out='unit', parts=['pond', 'hapa'], sep='-'), dict(fn='ratio', out='survival', num='recount_pcs', den='in_fish_no', round=4), dict(fn='isoweek', date='recount_date')],
  imports=[dict(sheet='Data', header='Stocking Date', map={'stocking_date': 'stocking date', 'pond': 'pond', 'hapa': 'hapa', 'batch_code': 'ras', 'in_abw': 'in abw', 'in_fish_no': 'in fish no',
           'recount_date': 'day 3 recount date', 'recount_pcs': 'day 3 recount pcs', 'recount_abw': 'day 3 recount abw'})]),
 dict(key='biosecurity_audits', label='Biosecurity & Hygiene', group='Nursery', dateField='audit_date',
  fields=[F('audit_date', 'Date', 'date', True), F('location', 'Location', 'text', True), F('category', 'Category'), F('metric', 'Metric'), F('reported_pct', 'Reported %', 'num'), F('rating', 'Mapped rating', 'select', options=['Good', 'Above Average', 'Average', 'Bad']),
          F('rating_value', 'Rating value (0-1)', 'num'), F('analysis_category', 'Analysis category', 'select', options=['Floor Cleanliness', 'Organisation', 'Footbath Condition', 'Hand Washing Compliance', 'Not scored']),
          D('iso_year', 'ISO year', 'int'), D('iso_week', 'ISO week', 'int')],
  derive=[dict(fn='isoweek', date='audit_date')],
  imports=[dict(sheet='Raw Audit Log', header='Date', map={'audit_date': 'date', 'location': 'location', 'category': 'category', 'metric': 'metric', 'reported_pct': 'reported', 'rating': 'mapped rating', 'rating_value': 'rating value', 'analysis_category': 'analysis category'})]),
 dict(key='parasitology_samples', label='Incubation Parasitology', group='Incubation', dateField='sample_date',
  fields=[F('sample_date', 'Date', 'date', True), F('ras', 'RAS', 'select', True, options=['RAS1', 'RAS2']), F('stage', 'Sample type / stage', 'select', True, options=STAGES), F('location', 'Location'), F('island', 'Island / tray', 'text'),
          F('parasite', 'Parasite observed'), F('samples_collected', 'Samples collected', 'int', True)] + [F(f'sample_{i}', f'Sample {i} (parasites)', 'int', virtual=True) for i in range(1, 11)] +
          [D('infected_samples', 'Infected samples', 'int'), D('total_parasites', 'Total parasites', 'int'), D('iso_year', 'ISO year', 'int'), D('iso_week', 'ISO week', 'int')],
  derive=[dict(fn='countpos', out='infected_samples', of=[f'sample_{i}' for i in range(1, 11)]), dict(fn='sumcols', out='total_parasites', of=[f'sample_{i}' for i in range(1, 11)]), dict(fn='isoweek', date='sample_date')],
  normalize={'ras': 'ras', 'stage': STAGES, 'island': ISLANDS},
  imports=[dict(sheet='Parasitology Data Input', header='DATE', map=dict({'sample_date': 'date', 'ras': 'ras', 'stage': 'sample type', 'location': 'location', 'island': 'island', 'parasite': 'name of parasites', 'samples_collected': 'number of samples'},
           **{f'sample_{i}': f'sample {i}' for i in range(1, 11)}))]),
 dict(key='ras_water_volume', label='RAS Water Volume Added', group='Incubation', dateField='used_date',
  fields=[F('used_date', 'Date used', 'date', True), F('shift', 'Shift'), F('tank', 'Tank'), F('volume_l', 'Volume added (L)', 'num', True), D('iso_year', 'ISO year', 'int'), D('iso_week', 'ISO week', 'int')],
  derive=[dict(fn='isoweek', date='used_date')],
  imports=[dict(sheet='Water Data', header='Logged Date', map={'used_date': 'date used', 'shift': 'shift', 'tank': 'tank', 'volume_l': 'volume added'})]),
 dict(key='ras_parasite_prevalence', label='RAS Parasite Prevalence (daily)', group='Incubation', dateField='sample_date',
  fields=[F('sample_date', 'Date', 'date', True), F('stage_group', 'Stage group', 'select', True, options=['Eggs', 'Fry']), F('prevalence', 'Prevalence (0-1)', 'num', True), D('iso_year', 'ISO year', 'int'), D('iso_week', 'ISO week', 'int')],
  derive=[dict(fn='isoweek', date='sample_date')],
  imports=[dict(sheet='Parasite Data', header='Date', map={'sample_date': 'date', 'stage_group': 'stage group', 'prevalence': 'prevalence'})]),
 dict(key='stocking_audits', label='Fry-to-Pond Stocking Numbers', group='Fry', dateField='audit_date',
  fields=[F('audit_date', 'Date', 'date', True), F('ras', 'RAS'), F('abw', 'Calculated ABW (g)', 'num', True), F('req', 'Required weight (g)', 'num', True), F('actual', 'Actual weight measured (g)', 'num', True),
          F('auditor', 'Auditor'), F('remarks', 'Remarks'), D('target', 'Target stocking number', 'num'), D('est', 'Estimated number', 'num'), D('variance', 'Variance'), D('diff', 'Difference', 'num'),
          D('iso_year', 'ISO year', 'int'), D('iso_week', 'ISO week', 'int')],
  derive=[dict(fn='ratio', out='target', num='req', den='abw'), dict(fn='ratio', out='est', num='actual', den='abw'), dict(fn='ratio_m1', out='variance', num='actual', den='req', round=4),
          dict(fn='minus', out='diff', a='est', b='target'), dict(fn='isoweek', date='audit_date')],
  imports=[dict(sheet='Data', header='Date', map={'audit_date': 'date', 'ras': 'ras', 'abw': 'calculated abw', 'req': 'calculated required', 'actual': 'actual weight', 'auditor': 'auditor', 'remarks': 'remarks'})]),
 dict(key='fry_transfers', label='Incubation to Pond Transfer Audit', group='Fry', dateField='date',
  fields=[F('date', 'Date', 'date', True), F('origin', 'Origin'), F('load_time', 'Truck loading time'), F('stock_time', 'Pond stocking time'), F('pond', 'Destination pond', 'text', True), F('hapa', 'Hapa stocked'), F('aerators', 'Aerators'),
          F('tray_do', 'Tray DO (mg/l)', 'num'), F('tray_temp', 'Tray temp (°C)', 'num'), F('bucket_do_wo', 'Bucket DO, no fish', 'num'), F('bucket_temp_wo', 'Bucket temp, no fish (°C)', 'num'),
          F('bucket_do_w', 'Bucket DO, with fish', 'num'), F('bucket_temp_w', 'Bucket temp, with fish (°C)', 'num'), F('pond_do', 'Pond DO (mg/l)', 'num'), F('pond_temp', 'Pond temp (°C)', 'num'),
          F('activeness', 'Fish activeness'), F('handling', 'Handling'), F('auditor', 'Auditor'), D('temp_var', 'Temp variance (°C)'), D('iso_year', 'ISO year', 'int'), D('iso_week', 'ISO week', 'int')],
  derive=[dict(fn='minus', out='temp_var', a='tray_temp', b='bucket_temp_wo'), dict(fn='isoweek', date='date')],
  imports=[dict(sheet='Fry Transfer Data', header='Date', map={'date': 'date', 'origin': 'origin', 'load_time': 'truck loading', 'stock_time': 'pond stocking', 'pond': 'destination', 'hapa': 'hapa stocked', 'aerators': 'aerators',
           'tray_do': 'tray do', 'tray_temp': 'tray temp', 'bucket_do_wo': 'bucket do(mg/l) without', 'bucket_temp_wo': 'bucket temp (0c) without', 'bucket_do_w': 'bucket do(mg/l) with ', 'bucket_temp_w': 'bucket temp  (0c) with',
           'pond_do': 'pond do', 'pond_temp': 'pond temp', 'activeness': 'fish activeness', 'handling': 'handling', 'auditor': 'auditor'})]),
 dict(key='egg_separation_ratings', label='Egg Stage Separation Rating', group='Eggs', dateField='date',
  fields=[F('date', 'Egg collection date', 'date', True), F('incubation_rating', 'Incubation rating (1-5)', 'num'), F('abp_rating', 'Aqua Best Practice rating (1-5)', 'num', True, min=1, max=5), F('comments', 'Comments'),
          D('iso_year', 'ISO year', 'int'), D('iso_week', 'ISO week', 'int')],
  derive=[dict(fn='isoweek', date='date')],
  imports=[dict(sheet='Egg Separation Ratings', header='Egg Collection Date', map={'date': 'egg collection date', 'incubation_rating': 'incubation rating', 'abp_rating': 'aqua best practice', 'comments': 'comments'})]),
 dict(key='egg_volumetric_jars', label='Egg Volumetric (jar star ratings)', group='Eggs', dateField='date', minDate='2025-01-01',
  fields=[F('date', 'Date', 'date', True), F('pond', 'Pond ID', 'text', True), F('incubator', 'Incubator no.'), F('total_h', 'Total egg height (cm)', 'num'), F('mixed_h', 'Mixed stages height (cm)', 'num'),
          F('pct12', '% Stage 1 & 2', 'num'), F('overall', '% Overall score', 'num'), F('star', 'Star rating (0-5)', 'int', True, min=0, max=5), D('iso_year', 'ISO year', 'int'), D('iso_week', 'ISO week', 'int')],
  derive=[dict(fn='isoweek', date='date')],
  imports=[dict(sheet='Egg Volumetric Data', header='Date', map={'date': 'date', 'pond': 'pond id', 'incubator': 'incubator', 'total_h': 'total egg height', 'mixed_h': 'mixed stages', 'pct12': '% stage 1', 'overall': '% overall', 'star': 'star rating'})]),
 dict(key='hapa_exchanges', label='Hapa Exchange Compliance', group='Broodstock', dateField='scheduled', natural=['kind', 'scheduled', 'pond'],
  fields=[F('kind', 'Unit', 'select', True, options=['nursery', 'broodstock']), F('scheduled', 'Scheduled exchange date', 'date', True), F('pond', 'Pond', 'text', True), F('to_exchange', 'Hapas to exchange', 'int', True),
          F('exchanged', 'Number exchanged', 'int'), F('actual_date', 'Actual exchange date', 'date'), F('days_delayed', 'Days delayed', 'num'), F('compliant', 'On time (Yes/No)', 'select', options=['Yes', 'No']), F('comments', 'Comments'),
          D('iso_year', 'ISO year', 'int'), D('iso_week', 'ISO week', 'int')],
  derive=[dict(fn='isoweek', date='scheduled')],
  imports=[dict(sheet=s, header=h, const={'kind': k}, map={'scheduled': 'scheduled exchange', 'pond': 'pond', 'to_exchange': 'number of hapas', 'exchanged': 'number exchanged', 'actual_date': 'actual exchange',
           'days_delayed': 'days delayed', 'compliant': ['compliant', 'exchanged on time'], 'comments': 'comments'}) for s, h, k in (('Nursery Exchange', 'Week', 'nursery'), ('Broodstock Exchange', 'Scheduled Exchange Date', 'broodstock'))]),
]

def flip_module():
    from bpm import importers as I
    p = fp('3a70d6bb')
    stages = {}
    for kind, sheet in (('nursery', 'Nursery Ponds Data'), ('broodstock', 'Broodstock Ponds Data')):
        df, _ = I.flipping(p, sheet, kind, '2099-01-01')
        s = df.drop_duplicates('stage').sort_values('order')
        stages[kind] = [dict(name=r.stage, expected=int(r.expected_days)) for r in s.itertuples()]
    return dict(key='pond_flips', label='Pond Flipping Compliance', group='Nursery', special='flip', dateField='scheduled', stages=stages,
                fields=[F('kind', 'Unit', 'select', True, options=['nursery', 'broodstock']), F('pond', 'Pond ID', 'text', True), F('scheduled', 'Scheduled flipping date', 'date', True),
                        F('stage_days', 'Days taken per stage', 'stages'), D('iso_year', 'ISO year', 'int'), D('iso_week', 'ISO week', 'int')],
                derive=[dict(fn='isoweek', date='scheduled')],
                imports=[dict(sheet='Nursery Ponds Data', header='Pond ID', const={'kind': 'nursery'}), dict(sheet='Broodstock Ponds Data', header='Pond ID', const={'kind': 'broodstock'})])

# ---- auto-generated modules for the remaining files (forms + import; dashboards/reports defined later with the user)
AUTO = [('0df203e3', 'Drone', 'do_temp_drone', 'DO & Temp Before/After Disinfection - Drone', 'Eggs'), ('0df203e3', 'MIS Truck', 'do_temp_mis_truck', 'DO & Temp Before/After Disinfection - MIS Truck', 'Eggs'),
        ('7a34e640', 'Raw Data', 'egg_disinfection', 'Egg Disinfection Audit', 'Eggs'), ('6578a319', 'Data', 'egg_viability', 'Egg Viability Before Disinfection', 'Eggs'),
        ('ef92fa54', 'Culling Number Audit', 'fry_culling', 'Fry Culling Numbers Audit', 'Fry'), ('a4d29050', 'Data', 'broodstock_density', 'Broodstock Stocking Density & Sex Ratio', 'Broodstock'),
        ('2fd6849e', 'Pond Audit Log', 'pond_feeding', 'Pond Feeding Audit', 'Nursery'), ('85dd27c0', 'Unaerated Ponds', 'hapa_cov_unaerated', 'Hapa Coverage - Unaerated Ponds', 'Broodstock'),
        ('85dd27c0', 'Aerated Ponds', 'hapa_cov_aerated', 'Hapa Coverage - Aerated Ponds', 'Broodstock'),
        ('10506b0a', 'IBC Method Survival Combined', 'ibc_method_survival', 'IBC Method Survival (Combined)', 'Nursery')]

def snake(s, used):
    s = re.sub(r'\(.*?\)', ' ', s); s = re.sub(r'[^A-Za-z0-9]+', '_', s).strip('_').lower() or 'col'
    s = s[:40]; n, base = 1, s
    while s in used or s in ('id', 'row_hash', 'batch_id', 'created_at', 'created_by', 'iso_year', 'iso_week'):
        n += 1; s = f'{base}_{n}'
    used.add(s); return s

RENAME = {'3_day_survival': 'day3_survival', '22_day_survival': 'day22_survival'}   # identifiers must not start with a digit

def auto_module(prefix, sheet, key, label, group):
    import openpyxl, datetime as dt
    p = fp(prefix)
    wbv = openpyxl.load_workbook(p, read_only=True, data_only=True); wbf = openpyxl.load_workbook(p, read_only=True)
    rv = list(wbv[sheet].iter_rows(min_row=1, max_row=260, values_only=True)); rf = list(wbf[sheet].iter_rows(min_row=1, max_row=260, values_only=True))
    hi = next(i for i, r in enumerate(rv) if sum(isinstance(v, str) and v.strip() != '' for v in r) >= 5)
    hdr = rv[hi]; cols = [j for j, v in enumerate(hdr) if isinstance(v, str) and v.strip()]
    used, fields, mp, formulas = set(), [], {}, []
    body_v, body_f = rv[hi + 1:], rf[hi + 1:]
    for j in cols:
        label_ = re.sub(r'\s+', ' ', hdr[j]).strip()
        vals = [r[j] for r in body_v if j < len(r) and r[j] not in (None, '')]
        fv = [r[j] for r in body_f if j < len(r) and isinstance(r[j], str) and r[j].startswith('=')]
        name = snake(label_, used); name = RENAME.get(name, name)
        if len(vals) >= 3 and len(fv) > 0.5 * len(vals):
            fields.append(dict(name=name, label=label_, type='num', derived=True, excel_formula=True)); continue
        if vals and (all(isinstance(v, (dt.datetime, dt.date)) for v in vals) or name in ('date', 'lake_transfer_date')): t = 'date'
        elif vals and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in vals): t = 'int' if all(float(v).is_integer() for v in vals) else 'num'
        else: t = 'text'
        fields.append(F(name, label_, t)); mp[name] = re.sub(r'\s+', ' ', hdr[j]).strip().lower()
    date_f = next((f['name'] for f in fields if f['type'] == 'date' and not f.get('derived')), None)
    if date_f:
        next(f for f in fields if f['name'] == date_f)['req'] = True
        fields += [D('iso_year', 'ISO year', 'int'), D('iso_week', 'ISO week', 'int')]
    first = re.sub(r'\s+', ' ', str(hdr[cols[0]])).strip()
    return dict(key=key, label=label, group=group, auto=True, dateField=date_f, fields=fields, derive=[dict(fn='isoweek', date=date_f)] if date_f else [],
                imports=[dict(sheet=sheet, header=first, map=mp, exact=True)])

SQLT = dict(date='date', int='integer', num='numeric', text='text', select='text', bool='boolean', stages='jsonb')

def sql_for(m):
    cols = []
    for f in m['fields']:
        if f.get('virtual') or f.get('excel_formula'): continue
        cols.append('  "' + f['name'] + '" ' + SQLT[f['type']])
    return cols

def gen_sql(mods):
    out = ["-- GENERATED by tools/registry.py - do not edit by hand. Adds row-level dedupe + the remaining module tables.", ""]
    existing = [m for m in mods if m.get('existing')]
    for m in existing:
        out.append(f"alter table public.{m['key']} add column if not exists row_hash text;\ncreate unique index if not exists {m['key']}_row_hash_uq on public.{m['key']}(row_hash);")
    new = [m for m in mods if not m.get('existing')]
    for m in new:
        out.append(f"\ncreate table public.{m['key']} (\n  id uuid primary key default gen_random_uuid(),\n  batch_id uuid references public.import_batches(id) on delete restrict,\n  row_hash text,")
        out.append(',\n'.join(sql_for(m)) + ',')
        out.append("  created_by uuid references auth.users(id) default auth.uid(),\n  created_at timestamptz not null default now()\n);")
        out.append(f"create unique index {m['key']}_row_hash_uq on public.{m['key']}(row_hash);")
        if m.get('dateField'): out.append(f"create index on public.{m['key']} (iso_year, iso_week);")
    names = [m['key'] for m in new]
    out.append("\ndo $$\ndeclare t text;\nbegin\n  foreach t in array array[" + ','.join(f"'{n}'" for n in names) + "] loop")
    out.append("""    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format($p$create policy %I on public.%I as restrictive to authenticated using ((auth.jwt()->>'aal') = 'aal2')$p$, t||'_mfa', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.app_role() is not null)', t||'_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write())', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t||'_del', t);
  end loop;
end $$;
revoke all on all tables in schema public from anon;""")
    # extend module_key enum is not needed: modules are identified by table name in import_batches.module (text)
    out.append("\nalter table public.import_batches alter column module type text using module::text;")
    return '\n'.join(out) + '\n'

if __name__ == '__main__':
    mods = CORE + [flip_module()] + [auto_module(*a) for a in AUTO]
    os.makedirs(os.path.join(ROOT, 'web'), exist_ok=True)
    json.dump(dict(modules=mods, islands=ISLANDS, stages=STAGES), open(os.path.join(ROOT, 'web', 'modules.json'), 'w'), indent=1, ensure_ascii=False)
    open(os.path.join(ROOT, 'supabase', 'migrations', '0002_modules.sql'), 'w').write(gen_sql(mods))
    for m in mods:
        print(f"{m['key']:28} {len([f for f in m['fields'] if not f.get('derived') and not f.get('virtual')]):3} entry fields | {'auto' if m.get('auto') else 'core'}")
