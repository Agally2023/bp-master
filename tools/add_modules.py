#!/usr/bin/env python3
"""Adds the SR efficiency, sex reversal feed audit and hapa received/washed/dispatched modules to web/modules.json and writes
supabase/migrations/0012_sr_feed_hapa_wash.bpm.sql. Safe to re-run (modules are replaced by key)."""
import json, os
ROOT = os.path.join(os.path.dirname(__file__), '..')
def F(name, label, type='text', req=False, **kw): d = dict(name=name, label=label, type=type, req=req); d.update(kw); return d
def D(name, label, type='num'): return dict(name=name, label=label, type=type, derived=True)
ISO = [D('iso_year', 'ISO year', 'int'), D('iso_week', 'ISO week', 'int')]
MODS = [
 dict(key='sr_efficiency', label='Sex Reversal (Male Conversion) Efficiency', group='Broodstock', dateField='sampling_date',
  fields=[F('stocking_date', 'Stocking date', 'date'), F('sampling_date', 'Sampling date', 'date', True), F('cage_no', 'Cage no.', 'text', True), F('batch_code', 'Batch code'), F('abw_g', 'ABW (g)', 'num'),
          F('doc', 'Days of culture (DOC)', 'int'), F('source_hapa_size', 'Source pond hapa size'), F('samples', 'No. of samples', 'int', True), F('females', 'Females', 'int', True),
          F('origin_pond', 'Origin pond'), F('feeder_name', "Pond feeder's name"), F('origin', 'Origin'), F('comment', 'Comment'),
          D('males', 'Males', 'int'), D('pct_males', '% males'), *ISO],
  derive=[dict(fn='minus', out='males', a='samples', b='females'), dict(fn='ratio', out='pct_males', num='males', den='samples', round=4), dict(fn='isoweek', date='sampling_date')],
  imports=[dict(sheet='SR Efficiency', header='Week', exact=True, map={'stocking_date': 'stocking date', 'sampling_date': 'sampling date', 'cage_no': 'cage no.', 'batch_code': 'batch code', 'abw_g': 'abw(g)', 'doc': 'doc',
           'source_hapa_size': 'source pond hapa size', 'samples': 'no. of samples', 'females': 'females', 'origin_pond': 'origin pond', 'feeder_name': "pond feeder's name", 'origin': 'origin', 'comment': 'comment'})]),
 dict(key='sex_reversal_feed', label='Sex Reversal Feed Audit', group='Broodstock', dateField='date',
  fields=[F('date', 'Date', 'date', True), F('feed_type', 'Feed type', 'text', True), F('feed_prepared_kg', 'Total feed prepared (kg)', 'num'), F('hormone_qty', 'Quantity of hormone used', 'num'),
          F('hygiene', 'Hygiene', 'select', True, options=['Good', 'Medium', 'Bad']), F('feed_quality', 'Feed quality after mixing', 'select', options=['Good', 'Medium', 'Bad']),
          F('sop_followed', 'SOP followed', 'select', True, options=['Yes', 'No']), *ISO],
  derive=[dict(fn='isoweek', date='date')],
  imports=[dict(sheet='Raw Data', header='Date', map={'date': 'date', 'feed_type': 'feed type', 'feed_prepared_kg': 'total feed prepared', 'hormone_qty': 'quantity of hormone', 'hygiene': 'hygiene',
           'feed_quality': 'feed quality', 'sop_followed': 'sop followed'})]),
 dict(key='hapa_wash_dispatch', label='Hapas Received, Washed & Dispatched', group='Nursery', dateField='date',
  fields=[F('date', 'Date', 'date', True), F('hapa_size', 'Hapa size', 'text', True), F('received', 'Number received', 'int'), F('washed', 'Number washed', 'int'), F('rate_per_hapa', 'Rate per hapa', 'num'),
          F('orders', 'Orders', 'int'), F('dispatched', 'Number dispatched', 'int'), F('exchanged', 'Number exchanged', 'int'), F('new_stocking', 'New stocking', 'int'),
          D('cost', 'Cost'), *ISO],
  derive=[dict(fn='product', out='cost', a='washed', b='rate_per_hapa', round=2), dict(fn='isoweek', date='date')],
  imports=[dict(sheet=s, header='Date', map={'date': 'date', 'hapa_size': 'hapa size', 'received': 'number received', 'washed': 'number washed', 'rate_per_hapa': 'rate per hapa', 'orders': 'orders',
           'dispatched': 'number dispatched', 'exchanged': 'number exchanged', 'new_stocking': 'new stocking'}) for s in ('Data', 'Sheet1')]),
]
SQLT = dict(date='date', int='integer', num='numeric', text='text', select='text')
def sql(m):
    k = 'bpm_' + m['key']
    cols = ',\n'.join(f'  "{f["name"]}" {SQLT[f["type"]]}' for f in m['fields'])
    return f"""create table if not exists public.{k} (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
{cols},
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists {m['key']}_row_hash_uq on public.{k}(row_hash);
create index if not exists {k}_wk_idx on public.{k} (iso_year, iso_week);
alter table public.{k} enable row level security;
alter table public.{k} force row level security;
revoke all on public.{k} from anon;
create policy {k}_mfa on public.{k} as restrictive for all to authenticated using ((select public.bpm_mfa_ok())) with check ((select public.bpm_mfa_ok()));
create policy {k}_sel on public.{k} for select to authenticated using ((select public.app_role()) is not null);
create policy {k}_ins on public.{k} for insert to authenticated with check (public.can_write());
create policy {k}_upd on public.{k} for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy {k}_del on public.{k} for delete to authenticated using ((select public.is_admin()));
"""
if __name__ == '__main__':
    p = os.path.join(ROOT, 'web', 'modules.json'); reg = json.load(open(p)); keys = {m['key'] for m in MODS}
    reg['modules'] = [m for m in reg['modules'] if m['key'] not in keys] + MODS
    json.dump(reg, open(p, 'w'), indent=1, ensure_ascii=False)
    open(os.path.join(ROOT, 'supabase', 'migrations', '0012_sr_feed_hapa_wash.bpm.sql'), 'w').write('-- New modules: SR efficiency, sex reversal feed audit, hapas received/washed/dispatched\n' + '\n'.join(sql(m) for m in MODS))
    print('ok', [m['key'] for m in MODS])
