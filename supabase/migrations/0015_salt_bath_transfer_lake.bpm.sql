-- New modules: pond fingerlings salt bath (parasite before/after) and transfer to lake (22-day terminal survival)
create table if not exists public.bpm_salt_bath (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  "pond" text,
  "hapa_no" integer,
  "stocking_date" date,
  "date_treated" date,
  "do_before" numeric,
  "do_in_bath" numeric,
  "bath_salinity" numeric,
  "bath_time_min" numeric,
  "doc" integer,
  "transfer_date" date,
  "terminal_survival" numeric,
  "before_tricho_skin_prev" numeric,
  "before_tricho_skin_int" numeric,
  "before_mono_skin_prev" numeric,
  "before_mono_skin_int" numeric,
  "before_tricho_gill_prev" numeric,
  "before_tricho_gill_int" numeric,
  "before_mono_gill_prev" numeric,
  "before_mono_gill_int" numeric,
  "after_tricho_skin_prev" numeric,
  "after_tricho_skin_int" numeric,
  "after_mono_skin_prev" numeric,
  "after_mono_skin_int" numeric,
  "after_tricho_gill_prev" numeric,
  "after_tricho_gill_int" numeric,
  "after_mono_gill_prev" numeric,
  "after_mono_gill_int" numeric,
  "iso_year" integer,
  "iso_week" integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists salt_bath_row_hash_uq on public.bpm_salt_bath(row_hash);
create index if not exists bpm_salt_bath_wk_idx on public.bpm_salt_bath (iso_year, iso_week);
alter table public.bpm_salt_bath enable row level security;
alter table public.bpm_salt_bath force row level security;
revoke all on public.bpm_salt_bath from anon;
create policy bpm_salt_bath_mfa on public.bpm_salt_bath as restrictive for all to authenticated using ((select public.bpm_mfa_ok())) with check ((select public.bpm_mfa_ok()));
create policy bpm_salt_bath_sel on public.bpm_salt_bath for select to authenticated using ((select public.app_role()) is not null);
create policy bpm_salt_bath_ins on public.bpm_salt_bath for insert to authenticated with check (public.can_write());
create policy bpm_salt_bath_upd on public.bpm_salt_bath for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy bpm_salt_bath_del on public.bpm_salt_bath for delete to authenticated using ((select public.is_admin()));

create table if not exists public.bpm_transfer_to_lake (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  "batch_code" text,
  "date_stocked_to_lake" date,
  "pond" text,
  "hapa_no" integer,
  "sample_size" integer,
  "sample_weight_g" numeric,
  "bulk_weight_g" numeric,
  "destination_cage" text,
  "transfer_type" text,
  "avg_weight_g" numeric,
  "pcs_to_lake" numeric,
  "pcs_stocked" numeric,
  "date_stocked" date,
  "pns2_date" date,
  "overall_doc" integer,
  "pond_stage_doc" integer,
  "survival" numeric,
  "days_overstayed" numeric,
  "gpd" numeric,
  "source_pond" text,
  "hatch_rate" numeric,
  "iso_year" integer,
  "iso_week" integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists transfer_to_lake_row_hash_uq on public.bpm_transfer_to_lake(row_hash);
create index if not exists bpm_transfer_to_lake_wk_idx on public.bpm_transfer_to_lake (iso_year, iso_week);
alter table public.bpm_transfer_to_lake enable row level security;
alter table public.bpm_transfer_to_lake force row level security;
revoke all on public.bpm_transfer_to_lake from anon;
create policy bpm_transfer_to_lake_mfa on public.bpm_transfer_to_lake as restrictive for all to authenticated using ((select public.bpm_mfa_ok())) with check ((select public.bpm_mfa_ok()));
create policy bpm_transfer_to_lake_sel on public.bpm_transfer_to_lake for select to authenticated using ((select public.app_role()) is not null);
create policy bpm_transfer_to_lake_ins on public.bpm_transfer_to_lake for insert to authenticated with check (public.can_write());
create policy bpm_transfer_to_lake_upd on public.bpm_transfer_to_lake for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy bpm_transfer_to_lake_del on public.bpm_transfer_to_lake for delete to authenticated using ((select public.is_admin()));
