-- BP Master core schema. Every table: RLS on, MFA (aal2) required, no public access.
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin','reviewer','auditor');
create type public.report_status as enum ('draft','in_review','approved','exported');
create type public.module_key as enum (
  'workstation_compliance','biosecurity_hygiene','ras_water','parasitology',
  'day3_recounts','stocking_audit','egg_separation','pond_flipping',
  'bottom_rope_nursery','bottom_rope_broodstock','hapa_exchange');

-- ---------- users ----------
create table public.bpm_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'auditor',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.app_role() returns public.app_role
language sql stable security definer set search_path = public as
$$ select role from public.bpm_profiles where id = auth.uid() and active $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.app_role() = 'admin', false) $$;

create or replace function public.can_write() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.app_role() in ('admin','auditor'), false) $$;

-- ---------- import tracking ----------
create table public.bpm_import_batches (
  id uuid primary key default gen_random_uuid(),
  module public.module_key not null,
  filename text not null,
  file_sha256 text not null,
  rows_read int not null default 0,
  rows_loaded int not null default 0,
  rows_rejected int not null default 0,
  issues jsonb not null default '[]',          -- validation findings (future dates, #REF!, duplicates ...)
  uploaded_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (module, file_sha256)                 -- same file cannot be loaded twice
);

-- ---------- module data ----------
create table public.bpm_workstation_audits (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  audit_date date not null,
  iso_year int not null, iso_week int not null,
  audit_time text,
  ras text not null,
  total_islands int not null check (total_islands >= 0),
  compliant_islands int not null check (compliant_islands >= 0),
  noncompliant_islands int not null check (noncompliant_islands >= 0),
  score numeric(6,4) not null check (score between 0 and 1),
  noncompliance_location text, noncompliant_island text,
  employee_responsible text, reason text, auditor text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (compliant_islands + noncompliant_islands = total_islands)
);
create index on public.bpm_workstation_audits (iso_year, iso_week);

create table public.bpm_bottom_rope_audits (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  unit_type text not null check (unit_type in ('nursery','broodstock')),
  audit_date date not null,
  iso_year int not null, iso_week int not null,
  pond_id text not null, hapa_no int not null,
  top_position int not null default 0, middle_position int not null default 0,
  bottom_position int not null default 0,
  not_tied int not null default 0, missing_hook int not null default 0,
  total_ropes int not null default 0,
  missing_posts int not null default 0, wrong_position_ropes int not null default 0,
  non_conformances int not null default 0,
  hapa_failed boolean not null,                -- rule: 1 failed rope = hapa fails
  comment text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.bpm_bottom_rope_audits (unit_type, iso_year, iso_week);

create table public.bpm_day3_recounts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  stocking_date date, unit text not null, pond text, hapa text, batch_code text,
  in_abw numeric, in_fish_no int,
  recount_date date not null,
  iso_year int not null, iso_week int not null,
  recount_pcs int, recount_abw numeric,
  survival numeric(8,4) check (survival >= 0 and survival < 3),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.bpm_day3_recounts (iso_year, iso_week);

-- ---------- thresholds (editable, not hard-coded) ----------
create table public.bpm_thresholds (
  key text primary key, value numeric not null, unit text, note text,
  updated_by uuid references auth.users(id), updated_at timestamptz default now()
);
insert into public.bpm_thresholds(key,value,unit,note) values
  ('day3_survival_target',0.97,'fraction','Day-3 recount survival target'),
  ('workstation_compliance_target',1.0,'fraction','Compliance goal per audit'),
  ('bottom_rope_pass_target',1.0,'fraction','Hapa passes only at 100% rope conformance'),
  ('hapa_coverage_unaerated',0.45,'fraction','Target hapa coverage, unaerated ponds'),
  ('hapa_coverage_aerated',0.50,'fraction','Target hapa coverage, aerated ponds'),
  ('culling_stocking_variance',0.05,'fraction','Allowed variance for culling/stocking numbers');

-- ---------- reports ----------
create table public.bpm_reports (
  id uuid primary key default gen_random_uuid(),
  iso_year int not null, iso_week int not null,
  status public.report_status not null default 'draft',
  created_by uuid references auth.users(id) default auth.uid(),
  approved_by uuid references auth.users(id), approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (iso_year, iso_week)
);
create table public.bpm_report_sections (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.bpm_reports(id) on delete cascade,
  section_key text not null,                   -- e.g. 'workstation', 'bottom_rope_nursery'
  comment text not null default '',            -- auto-draft, edited by a person
  include boolean not null default true,
  updated_by uuid references auth.users(id), updated_at timestamptz default now(),
  unique (report_id, section_key)
);
create table public.bpm_report_images (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.bpm_reports(id) on delete cascade,
  section_key text not null,
  slot int not null default 1,                 -- position in the 4-grid or the graph slot
  kind text not null check (kind in ('photo','analysed_graph')),
  storage_path text not null,                  -- private bucket 'bpm-report-images'
  caption text,
  uploaded_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (report_id, section_key, slot)
);

-- ---------- append-only audit log ----------
create table public.bpm_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  action text not null,                        -- import, view, edit, approve, export, delete
  entity text, entity_id text, meta jsonb default '{}'
);

-- ---------- row level security ----------
do $$
declare t text;
begin
  foreach t in array array['bpm_profiles','bpm_import_batches','bpm_workstation_audits','bpm_bottom_rope_audits',
    'bpm_day3_recounts','bpm_thresholds','bpm_reports','bpm_report_sections','bpm_report_images','bpm_audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    -- every request must be an MFA-verified session
    execute format($p$create policy %I on public.%I as restrictive to authenticated
                      using ((auth.jwt()->>'aal') = 'aal2')$p$, t||'_mfa', t);
  end loop;
end $$;

-- data tables: members read; admin+auditor insert; only admin update/delete
do $$
declare t text;
begin
  foreach t in array array['bpm_workstation_audits','bpm_bottom_rope_audits','bpm_day3_recounts','bpm_import_batches'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.app_role() is not null)', t||'_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write())', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t||'_del', t);
  end loop;
end $$;

create policy profiles_self  on public.bpm_profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_admin on public.bpm_profiles for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy thresholds_sel on public.bpm_thresholds for select to authenticated using (public.app_role() is not null);
create policy thresholds_adm on public.bpm_thresholds for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy reports_sel on public.bpm_reports for select to authenticated using (public.app_role() is not null);
create policy reports_ins on public.bpm_reports for insert to authenticated with check (public.can_write());
-- anyone who can write may edit a draft; only admin may change status to approved/exported
create policy reports_upd on public.bpm_reports for update to authenticated
  using (public.can_write() and (status in ('draft','in_review') or public.is_admin()))
  with check (public.is_admin() or status in ('draft','in_review'));
create policy reports_del on public.bpm_reports for delete to authenticated using (public.is_admin());

create policy sections_sel on public.bpm_report_sections for select to authenticated using (public.app_role() is not null);
create policy sections_wr  on public.bpm_report_sections for all    to authenticated
  using (public.can_write() and exists (select 1 from public.bpm_reports r where r.id = report_id and (r.status in ('draft','in_review') or public.is_admin())))
  with check (public.can_write());

create policy images_sel on public.bpm_report_images for select to authenticated using (public.app_role() is not null);
create policy images_wr  on public.bpm_report_images for all    to authenticated
  using (public.can_write()) with check (public.can_write());

-- audit log: insert only; admin reads; nobody updates or deletes
create policy log_ins on public.bpm_audit_log for insert to authenticated with check (user_id = auth.uid());
create policy log_sel on public.bpm_audit_log for select to authenticated using (public.is_admin());

-- ---------- storage: private bucket for photos and analysed graphs ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bpm-report-images','bpm-report-images', false, 10485760, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy bpm_rimg_read  on storage.objects for select to authenticated
  using (bucket_id='bpm-report-images' and public.app_role() is not null and (auth.jwt()->>'aal')='aal2');
create policy bpm_rimg_write on storage.objects for insert to authenticated
  with check (bucket_id='bpm-report-images' and public.can_write() and (auth.jwt()->>'aal')='aal2');
create policy bpm_rimg_del   on storage.objects for delete to authenticated
  using (bucket_id='bpm-report-images' and public.is_admin() and (auth.jwt()->>'aal')='aal2');

-- the public (anon) role gets nothing
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname='public' and tablename like 'bpm\_%' loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
