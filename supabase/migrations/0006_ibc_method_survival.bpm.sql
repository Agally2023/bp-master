-- New module: IBC Method Survival (Combined) from IBC_Treatment_survivals.xlsx
create table if not exists public.bpm_ibc_method_survival (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  "pond" text,
  "hapa" integer,
  "stocking_date" date,
  "day3_survival" numeric,
  "lake_transfer_date" date,
  "day22_survival" numeric,
  "method_of_treatment" text,
  "iso_year" integer,
  "iso_week" integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists ibc_method_survival_row_hash_uq on public.bpm_ibc_method_survival(row_hash);
create index if not exists bpm_ibc_method_survival_wk_idx on public.bpm_ibc_method_survival (iso_year, iso_week);
alter table public.bpm_ibc_method_survival enable row level security;
alter table public.bpm_ibc_method_survival force row level security;
revoke all on public.bpm_ibc_method_survival from anon;
create policy bpm_ibc_method_survival_mfa on public.bpm_ibc_method_survival as restrictive for all to authenticated using ((select public.bpm_mfa_ok())) with check ((select public.bpm_mfa_ok()));
create policy bpm_ibc_method_survival_sel on public.bpm_ibc_method_survival for select to authenticated using ((select public.app_role()) is not null);
create policy bpm_ibc_method_survival_ins on public.bpm_ibc_method_survival for insert to authenticated with check (public.can_write());
create policy bpm_ibc_method_survival_upd on public.bpm_ibc_method_survival for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy bpm_ibc_method_survival_del on public.bpm_ibc_method_survival for delete to authenticated using ((select public.is_admin()));
