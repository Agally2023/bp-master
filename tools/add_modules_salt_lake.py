#!/usr/bin/env python3
"""Adds the Pond Fingerlings salt bath module and the Transfer to Lake (Fingerling Transfer Worksheet of the VF Hatchery Data Masterfile) module.
Writes web/modules.json entries and supabase/migrations/0015_salt_bath_transfer_lake.bpm.sql. Safe to re-run."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from add_modules import F, D, ISO, sql, ROOT
SITES = [('tricho_skin', 'Trichodina skin'), ('mono_skin', 'Monogenea skin'), ('tricho_gill', 'Trichodina gills'), ('mono_gill', 'Monogenea gills')]
PAR = [F(f'{t}_{s}_{k}', f'{"Before" if t == "before" else "After"} bath: {lab} {"prevalence" if k == "prev" else "intensity score"}', 'num') for t in ('before', 'after') for s, lab in SITES for k in ('prev', 'int')]
XL = ['Tricho(Skin)', 'Column1', 'Mono(Skin)', 'Column2', 'Tricho(Gills)', 'Column3', 'Mono(Gills)', 'Column4', 'Tricho(Skin)6', 'Column7', 'Mono(Skin)8', 'Column9', 'Tricho(Gills)10', 'Column11', 'Mono(Gills)12', 'Column13']
MAP_PAR = {f['name']: x.lower() for f, x in zip(PAR, XL)}
SALT = dict(key='salt_bath', label='Pond Fingerlings Salt Bath', group='Nursery', dateField='date_treated',
  fields=[F('pond', 'Pond', 'text', True), F('hapa_no', 'Hapa no.', 'int', True), F('stocking_date', 'Stocking date', 'date'), F('date_treated', 'Date treated', 'date', True),
          F('do_before', 'DO before salt (mg/l)', 'num'), F('do_in_bath', 'DO in the bath (mg/l)', 'num'), F('bath_salinity', 'Bath salinity / salt concentration', 'num'), F('bath_time_min', 'Bath time (min)', 'num'),
          F('doc', 'Days of culture (DOC)', 'int'), F('transfer_date', 'Transfer date', 'date'), F('terminal_survival', 'Terminal survival (22-day)', 'num'), *PAR, *ISO],
  derive=[dict(fn='isoweek', date='date_treated')],
  imports=[dict(sheet='Sheet1', header='Pond', exact=True, map={'pond': 'pond', 'hapa_no': 'hapa no.', 'stocking_date': 'stockingdate', 'date_treated': 'date treated', 'do_before': 'd.o before salt', 'do_in_bath': 'd.o in the bath',
           'bath_salinity': 'bath salinity', 'bath_time_min': 'bath time(min)', 'doc': 'doc', 'transfer_date': 'transfer date', 'terminal_survival': 'terminal survival', **MAP_PAR})])
LAKE = dict(key='transfer_to_lake', label='Transfer to Lake (Fingerling Transfer)', group='Nursery', dateField='date_stocked_to_lake',
  fields=[F('batch_code', 'Batch code'), F('date_stocked_to_lake', 'Date stocked to lake', 'date', True), F('pond', 'Pond', 'text', True), F('hapa_no', 'Hapa', 'int'), F('sample_size', 'Sample size (pcs)', 'int'), F('sample_weight_g', 'Sample weight (g)', 'num'),
          F('bulk_weight_g', 'Bulk weight (g)', 'num'), F('destination_cage', 'Destination cage'), F('transfer_type', 'Transfer type'), F('avg_weight_g', 'Average weight (g)', 'num'), F('pcs_to_lake', 'Stocked to lake (pcs)', 'num'),
          F('pcs_stocked', 'Pcs stocked (initial)', 'num'), F('date_stocked', 'Date stocked', 'date'), F('pns2_date', 'PNS 2 date', 'date'), F('overall_doc', 'Overall DOC', 'int'), F('pond_stage_doc', 'Pond stage DOC', 'int'),
          F('survival', 'Survival (terminal, 22-day)', 'num'), F('days_overstayed', 'Days overstayed', 'num'), F('gpd', 'GPD', 'num'), F('source_pond', 'Source pond'), F('hatch_rate', 'Hatch rate', 'num'), *ISO],
  derive=[dict(fn='isoweek', date='date_stocked_to_lake')],
  imports=[dict(sheet='Fingerling Transfer Worksheet', header='Batch Code', exact=True, map={'batch_code': 'batch code', 'date_stocked_to_lake': 'date stocked to lake', 'pond': 'pond', 'hapa_no': 'hapa', 'sample_size': 'sample size, pcs',
           'sample_weight_g': 'sample weight, g', 'bulk_weight_g': 'bulk weight, g', 'destination_cage': 'destination cage', 'transfer_type': 'transfer type', 'avg_weight_g': 'average weight, g', 'pcs_to_lake': 'stoked to lake',
           'pcs_stocked': 'pcs stocked', 'date_stocked': 'date stocked', 'pns2_date': 'pns 2 date', 'overall_doc': 'overal doc', 'pond_stage_doc': 'pond stage doc', 'survival': 'survival', 'days_overstayed': 'days overstayed',
           'gpd': 'gpd', 'source_pond': 'source pond', 'hatch_rate': 'hatch rate'})])
MODS = [SALT, LAKE]
if __name__ == '__main__':
    p = os.path.join(ROOT, 'web', 'modules.json'); reg = json.load(open(p)); keys = {m['key'] for m in MODS}
    reg['modules'] = [m for m in reg['modules'] if m['key'] not in keys] + MODS
    json.dump(reg, open(p, 'w'), indent=1, ensure_ascii=False)
    open(os.path.join(ROOT, 'supabase', 'migrations', '0015_salt_bath_transfer_lake.bpm.sql'), 'w').write('-- New modules: pond fingerlings salt bath (parasite before/after) and transfer to lake (22-day terminal survival)\n' + '\n'.join(sql(m) for m in MODS))
    print('ok', [m['key'] for m in MODS])
