-- New modules: SR efficiency, sex reversal feed audit, hapas received/washed/dispatched
create table if not exists public.bpm_sr_efficiency (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  "stocking_date" date,
  "sampling_date" date,
  "cage_no" text,
  "batch_code" text,
  "abw_g" numeric,
  "doc" integer,
  "source_hapa_size" text,
  "samples" integer,
  "females" integer,
  "origin_pond" text,
  "feeder_name" text,
  "origin" text,
  "comment" text,
  "males" integer,
  "pct_males" numeric,
  "iso_year" integer,
  "iso_week" integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists sr_efficiency_row_hash_uq on public.bpm_sr_efficiency(row_hash);
create index if not exists bpm_sr_efficiency_wk_idx on public.bpm_sr_efficiency (iso_year, iso_week);
alter table public.bpm_sr_efficiency enable row level security;
alter table public.bpm_sr_efficiency force row level security;
revoke all on public.bpm_sr_efficiency from anon;
create policy bpm_sr_efficiency_mfa on public.bpm_sr_efficiency as restrictive for all to authenticated using ((select public.bpm_mfa_ok())) with check ((select public.bpm_mfa_ok()));
create policy bpm_sr_efficiency_sel on public.bpm_sr_efficiency for select to authenticated using ((select public.app_role()) is not null);
create policy bpm_sr_efficiency_ins on public.bpm_sr_efficiency for insert to authenticated with check (public.can_write());
create policy bpm_sr_efficiency_upd on public.bpm_sr_efficiency for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy bpm_sr_efficiency_del on public.bpm_sr_efficiency for delete to authenticated using ((select public.is_admin()));

create table if not exists public.bpm_sex_reversal_feed (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  "date" date,
  "feed_type" text,
  "feed_prepared_kg" numeric,
  "hormone_qty" numeric,
  "hygiene" text,
  "feed_quality" text,
  "sop_followed" text,
  "iso_year" integer,
  "iso_week" integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists sex_reversal_feed_row_hash_uq on public.bpm_sex_reversal_feed(row_hash);
create index if not exists bpm_sex_reversal_feed_wk_idx on public.bpm_sex_reversal_feed (iso_year, iso_week);
alter table public.bpm_sex_reversal_feed enable row level security;
alter table public.bpm_sex_reversal_feed force row level security;
revoke all on public.bpm_sex_reversal_feed from anon;
create policy bpm_sex_reversal_feed_mfa on public.bpm_sex_reversal_feed as restrictive for all to authenticated using ((select public.bpm_mfa_ok())) with check ((select public.bpm_mfa_ok()));
create policy bpm_sex_reversal_feed_sel on public.bpm_sex_reversal_feed for select to authenticated using ((select public.app_role()) is not null);
create policy bpm_sex_reversal_feed_ins on public.bpm_sex_reversal_feed for insert to authenticated with check (public.can_write());
create policy bpm_sex_reversal_feed_upd on public.bpm_sex_reversal_feed for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy bpm_sex_reversal_feed_del on public.bpm_sex_reversal_feed for delete to authenticated using ((select public.is_admin()));

create table if not exists public.bpm_hapa_wash_dispatch (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  "date" date,
  "hapa_size" text,
  "received" integer,
  "washed" integer,
  "rate_per_hapa" numeric,
  "orders" integer,
  "dispatched" integer,
  "exchanged" integer,
  "new_stocking" integer,
  "cost" numeric,
  "iso_year" integer,
  "iso_week" integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists hapa_wash_dispatch_row_hash_uq on public.bpm_hapa_wash_dispatch(row_hash);
create index if not exists bpm_hapa_wash_dispatch_wk_idx on public.bpm_hapa_wash_dispatch (iso_year, iso_week);
alter table public.bpm_hapa_wash_dispatch enable row level security;
alter table public.bpm_hapa_wash_dispatch force row level security;
revoke all on public.bpm_hapa_wash_dispatch from anon;
create policy bpm_hapa_wash_dispatch_mfa on public.bpm_hapa_wash_dispatch as restrictive for all to authenticated using ((select public.bpm_mfa_ok())) with check ((select public.bpm_mfa_ok()));
create policy bpm_hapa_wash_dispatch_sel on public.bpm_hapa_wash_dispatch for select to authenticated using ((select public.app_role()) is not null);
create policy bpm_hapa_wash_dispatch_ins on public.bpm_hapa_wash_dispatch for insert to authenticated with check (public.can_write());
create policy bpm_hapa_wash_dispatch_upd on public.bpm_hapa_wash_dispatch for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy bpm_hapa_wash_dispatch_del on public.bpm_hapa_wash_dispatch for delete to authenticated using ((select public.is_admin()));
