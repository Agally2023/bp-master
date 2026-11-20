-- New module: Pond Preparation Scoring (from VF_Pond_Preparation_Scoring.xlsx)
create table if not exists public.bpm_pond_prep_scoring (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  "pond" text,
  "flipping_date" date,
  "stocking_date" date,
  "k_draining" integer,
  "k_ploughing" integer,
  "k_chlorination" integer,
  "k_drying" integer,
  "k_liming" integer,
  "k_first_fill" integer,
  "k_first_maturation" integer,
  "k_second_fill" integer,
  "k_second_maturation" integer,
  "ammonia" numeric,
  "nitrite" numeric,
  "nitrate" numeric,
  "calcium_hardness" numeric,
  "secchi" numeric,
  "ph" numeric,
  "dissolved_oxygen" numeric,
  "chlorine_residue" numeric,
  "survival_3doc" numeric,
  "mort_d7" integer,
  "mort_d14" integer,
  "parasite_d6" numeric,
  "s_draining" numeric,
  "s_ploughing" numeric,
  "s_chlorination" numeric,
  "s_drying" numeric,
  "s_liming" numeric,
  "s_first_fill" numeric,
  "s_first_maturation" numeric,
  "s_second_fill" numeric,
  "s_second_maturation" numeric,
  "prep_score" numeric,
  "wq_score" numeric,
  "post_score" numeric,
  "overall_score" numeric,
  "rating" numeric,
  "action_points" text,
  "iso_year" integer,
  "iso_week" integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists pond_prep_scoring_row_hash_uq on public.bpm_pond_prep_scoring(row_hash);
create index if not exists bpm_pond_prep_scoring_wk_idx on public.bpm_pond_prep_scoring (iso_year, iso_week);
alter table public.bpm_pond_prep_scoring enable row level security;
alter table public.bpm_pond_prep_scoring force row level security;
revoke all on public.bpm_pond_prep_scoring from anon;
create policy bpm_pond_prep_scoring_mfa on public.bpm_pond_prep_scoring as restrictive for all to authenticated using ((select public.bpm_mfa_ok())) with check ((select public.bpm_mfa_ok()));
create policy bpm_pond_prep_scoring_sel on public.bpm_pond_prep_scoring for select to authenticated using ((select public.app_role()) is not null);
create policy bpm_pond_prep_scoring_ins on public.bpm_pond_prep_scoring for insert to authenticated with check (public.can_write());
create policy bpm_pond_prep_scoring_upd on public.bpm_pond_prep_scoring for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy bpm_pond_prep_scoring_del on public.bpm_pond_prep_scoring for delete to authenticated using ((select public.is_admin()));
