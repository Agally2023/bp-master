

alter table public.bpm_workstation_audits add column if not exists row_hash text;
create unique index if not exists workstation_audits_row_hash_uq on public.bpm_workstation_audits(row_hash);
alter table public.bpm_bottom_rope_audits add column if not exists row_hash text;
create unique index if not exists bottom_rope_audits_row_hash_uq on public.bpm_bottom_rope_audits(row_hash);
alter table public.bpm_day3_recounts add column if not exists row_hash text;
create unique index if not exists day3_recounts_row_hash_uq on public.bpm_day3_recounts(row_hash);

create table public.bpm_biosecurity_audits (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  audit_date date,
  location text,
  category text,
  metric text,
  reported_pct numeric,
  rating text,
  rating_value numeric,
  analysis_category text,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index biosecurity_audits_row_hash_uq on public.bpm_biosecurity_audits(row_hash);
create index on public.bpm_biosecurity_audits (iso_year, iso_week);

create table public.bpm_parasitology_samples (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  sample_date date,
  ras text,
  stage text,
  location text,
  island text,
  parasite text,
  samples_collected integer,
  infected_samples integer,
  total_parasites integer,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index parasitology_samples_row_hash_uq on public.bpm_parasitology_samples(row_hash);
create index on public.bpm_parasitology_samples (iso_year, iso_week);

create table public.bpm_ras_water_volume (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  used_date date,
  shift text,
  tank text,
  volume_l numeric,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index ras_water_volume_row_hash_uq on public.bpm_ras_water_volume(row_hash);
create index on public.bpm_ras_water_volume (iso_year, iso_week);

create table public.bpm_ras_parasite_prevalence (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  sample_date date,
  stage_group text,
  prevalence numeric,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index ras_parasite_prevalence_row_hash_uq on public.bpm_ras_parasite_prevalence(row_hash);
create index on public.bpm_ras_parasite_prevalence (iso_year, iso_week);

create table public.bpm_stocking_audits (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  audit_date date,
  ras text,
  abw numeric,
  req numeric,
  actual numeric,
  auditor text,
  remarks text,
  target numeric,
  est numeric,
  variance numeric,
  diff numeric,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index stocking_audits_row_hash_uq on public.bpm_stocking_audits(row_hash);
create index on public.bpm_stocking_audits (iso_year, iso_week);

create table public.bpm_fry_transfers (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  date date,
  origin text,
  load_time text,
  stock_time text,
  pond text,
  hapa text,
  aerators text,
  tray_do numeric,
  tray_temp numeric,
  bucket_do_wo numeric,
  bucket_temp_wo numeric,
  bucket_do_w numeric,
  bucket_temp_w numeric,
  pond_do numeric,
  pond_temp numeric,
  activeness text,
  handling text,
  auditor text,
  temp_var numeric,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index fry_transfers_row_hash_uq on public.bpm_fry_transfers(row_hash);
create index on public.bpm_fry_transfers (iso_year, iso_week);

create table public.bpm_egg_separation_ratings (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  date date,
  incubation_rating numeric,
  abp_rating numeric,
  comments text,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index egg_separation_ratings_row_hash_uq on public.bpm_egg_separation_ratings(row_hash);
create index on public.bpm_egg_separation_ratings (iso_year, iso_week);

create table public.bpm_egg_volumetric_jars (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  date date,
  pond text,
  incubator text,
  total_h numeric,
  mixed_h numeric,
  pct12 numeric,
  overall numeric,
  star integer,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index egg_volumetric_jars_row_hash_uq on public.bpm_egg_volumetric_jars(row_hash);
create index on public.bpm_egg_volumetric_jars (iso_year, iso_week);

create table public.bpm_hapa_exchanges (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  kind text,
  scheduled date,
  pond text,
  to_exchange integer,
  exchanged integer,
  actual_date date,
  days_delayed numeric,
  compliant text,
  comments text,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index hapa_exchanges_row_hash_uq on public.bpm_hapa_exchanges(row_hash);
create index on public.bpm_hapa_exchanges (iso_year, iso_week);

create table public.bpm_pond_flips (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  kind text,
  pond text,
  scheduled date,
  stage_days jsonb,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index pond_flips_row_hash_uq on public.bpm_pond_flips(row_hash);
create index on public.bpm_pond_flips (iso_year, iso_week);

create table public.bpm_do_temp_drone (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  date date,
  bowl_id text,
  do_before_first_use numeric,
  temp_before_first_use numeric,
  do_first_use numeric,
  temp_first_use numeric,
  do_before_second_use numeric,
  temp_before_second_use numeric,
  do_second_use numeric,
  temperature_second_use numeric,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index do_temp_drone_row_hash_uq on public.bpm_do_temp_drone(row_hash);
create index on public.bpm_do_temp_drone (iso_year, iso_week);

create table public.bpm_do_temp_mis_truck (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  date date,
  bowl_id2 text,
  do_before_first_use numeric,
  temp_before_first_use numeric,
  do_first_use numeric,
  temp_first_use numeric,
  do_before_second_use numeric,
  temp_before_second_use numeric,
  do_before_second_use_2 numeric,
  temp_before_second_use_2 numeric,
  do_second_use numeric,
  temperature_second_use numeric,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index do_temp_mis_truck_row_hash_uq on public.bpm_do_temp_mis_truck(row_hash);
create index on public.bpm_do_temp_mis_truck (iso_year, iso_week);

create table public.bpm_egg_disinfection (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  date date,
  ras text,
  pond text,
  stage text,
  "do" numeric,
  temp numeric,
  chloramine_t_conc numeric,
  contact_time numeric,
  eggs_sampled integer,
  parasite_found_before text,
  parasite_count_before integer,
  parasite_found_after text,
  parasite_count_after integer,
  water_egg_condition text,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index egg_disinfection_row_hash_uq on public.bpm_egg_disinfection(row_hash);
create index on public.bpm_egg_disinfection (iso_year, iso_week);

create table public.bpm_egg_viability (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  date date,
  pond_origin text,
  batch_code text,
  sample integer,
  unfertilized_eggs_before_disinfection integer,
  fertilized_but_dead_eggs_before_disinfec integer,
  fertilized_egg_before_disinfection integer,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index egg_viability_row_hash_uq on public.bpm_egg_viability(row_hash);
create index on public.bpm_egg_viability (iso_year, iso_week);

create table public.bpm_fry_culling (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  date date,
  calculated_abw numeric,
  calculated_required_weight_per_tray numeric,
  actual_weight_per_tray integer,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index fry_culling_row_hash_uq on public.bpm_fry_culling(row_hash);
create index on public.bpm_fry_culling (iso_year, iso_week);

create table public.bpm_broodstock_density (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  date date,
  pond text,
  hapa_no integer,
  unit_id text,
  female_count integer,
  male_count integer,
  female_biomass numeric,
  male_biomass numeric,
  target_biomass integer,
  target_stocking_density_range numeric,
  sex_ratio_compliant text,
  stocking_density_compliant text,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index broodstock_density_row_hash_uq on public.bpm_broodstock_density(row_hash);
create index on public.bpm_broodstock_density (iso_year, iso_week);

create table public.bpm_pond_feeding (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  date date,
  pond_id text,
  hapa_size integer,
  stocking_density_m2 integer,
  feed_type text,
  feed_quantity_issued text,
  feed_quantity_consumed numeric,
  start_feeding_time text,
  end_feeding_time text,
  number_of_sessions_fed integer,
  fish_feeding_response text,
  leftover_feed_observed text,
  feed_quality_status text,
  time_taken_per_hapa numeric,
  staff_compliance text,
  auditor_name text,
  comments text,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index pond_feeding_row_hash_uq on public.bpm_pond_feeding(row_hash);
create index on public.bpm_pond_feeding (iso_year, iso_week);

create table public.bpm_hapa_cov_unaerated (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  date date,
  pond_id text,
  number_of_active_hapas integer,
  active_hapa_area integer,
  new_water_surface_area numeric,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index hapa_cov_unaerated_row_hash_uq on public.bpm_hapa_cov_unaerated(row_hash);
create index on public.bpm_hapa_cov_unaerated (iso_year, iso_week);

create table public.bpm_hapa_cov_aerated (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.bpm_import_batches(id) on delete restrict,
  row_hash text,
  date date,
  pond_id text,
  number_of_active_hapas integer,
  active_hapa_area integer,
  new_water_surface_area numeric,
  iso_year integer,
  iso_week integer,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index hapa_cov_aerated_row_hash_uq on public.bpm_hapa_cov_aerated(row_hash);
create index on public.bpm_hapa_cov_aerated (iso_year, iso_week);

do $$
declare t text;
begin
  foreach t in array array['bpm_biosecurity_audits','bpm_parasitology_samples','bpm_ras_water_volume','bpm_ras_parasite_prevalence','bpm_stocking_audits','bpm_fry_transfers','bpm_egg_separation_ratings','bpm_egg_volumetric_jars','bpm_hapa_exchanges','bpm_pond_flips','bpm_do_temp_drone','bpm_do_temp_mis_truck','bpm_egg_disinfection','bpm_egg_viability','bpm_fry_culling','bpm_broodstock_density','bpm_pond_feeding','bpm_hapa_cov_unaerated','bpm_hapa_cov_aerated'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format($p$create policy %I on public.%I as restrictive to authenticated using ((auth.jwt()->>'aal') = 'aal2')$p$, t||'_mfa', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.app_role() is not null)', t||'_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write())', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t||'_del', t);
  end loop;
end $$;

alter table public.bpm_import_batches alter column module type text using module::text;
