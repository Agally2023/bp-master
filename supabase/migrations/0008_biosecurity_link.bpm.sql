-- Link BP Master to the Biosecurity dashboard (public.bio_log, same Supabase project).
-- Every audit entered in that dashboard is mirrored into bpm_biosecurity_audits with the SAME scoring rules
-- (Good 1 / Average .67 / Bad 0 / Yes 1 / No 0, compliance % / 100, six core categories, "Water Accumulation on Floors" inverted).
-- For any audit date that exists in bio_log, the Excel-imported rows of that date are marked superseded (kept, but not scored).
alter table public.bpm_biosecurity_audits add column if not exists source text not null default 'excel';
alter table public.bpm_biosecurity_audits add column if not exists superseded boolean not null default false;

create or replace function public.bpm_bio_group(p_item text, p_cat text) returns text language sql immutable set search_path = '' as $$
  select case
    when p_item in ('Cleanliness of Floors','Floor around footbath') then 'Floor Cleanliness'
    when p_item in ('Organization of Tools','Shelves organisation','Equipment organisation','PPE organisation') then 'Organisation'
    when p_item in ('Chemical storage','Waste disposal') then 'Chemical Storage & Waste Disposal'
    when p_item = 'Footbath Condition' then 'Footbath Condition'
    when p_item = 'Foot dipping Compliance' then 'Foot Dipping Compliance'
    when p_item = 'Hand washing compliance' then 'Hand Washing Compliance'
    when p_item in ('Water Accumulation on Floors','Walk ways Clear','Weekly RAS Flushing','Footbath filled','Disinfectant added','Hand washing station present','Equipment disinfected') then 'Not scored'
    when lower(coalesce(p_item,'')) like '%chemical%' or lower(coalesce(p_item,'')) like '%waste%' then 'Chemical Storage & Waste Disposal'
    when p_cat = 'Organisation (5S)' then 'Organisation'
    when p_cat = 'Hygiene' then 'Floor Cleanliness'
    when lower(coalesce(p_item,'')) like '%foot dipping%' then 'Foot Dipping Compliance'
    when lower(coalesce(p_item,'')) like '%footbath%' then 'Footbath Condition'
    when lower(coalesce(p_item,'')) like '%hand washing compliance%' then 'Hand Washing Compliance'
    else 'Not scored' end $$;

create or replace function public.bpm_bio_value(p_comp numeric, p_rating text, p_item text) returns numeric language sql immutable set search_path = '' as $$
  select case when p_comp is not null then p_comp / 100
    when p_rating in ('Good','Yes') then (case when p_item = 'Water Accumulation on Floors' and p_rating = 'Yes' then 0 else 1 end)
    when p_rating = 'Average' then 0.67
    when p_rating in ('Bad','No') then (case when p_item = 'Water Accumulation on Floors' and p_rating = 'No' then 1 else 0 end)
    end $$;

create or replace function public.bpm_bio_mirror() returns trigger language plpgsql security definer set search_path = public as $$
declare d date;
begin
  if tg_op = 'DELETE' then
    delete from public.bpm_biosecurity_audits where row_hash = 'biolog:' || old.id; d := old.log_date;
  else
    insert into public.bpm_biosecurity_audits (row_hash, audit_date, location, category, metric, reported_pct, rating, rating_value, analysis_category, iso_year, iso_week, created_by, source)
    values ('biolog:' || new.id, new.log_date, new.location, new.category, new.item, new.compliance / 100, new.rating, public.bpm_bio_value(new.compliance, new.rating, new.item),
            public.bpm_bio_group(new.item, new.category), extract(isoyear from new.log_date)::int, extract(week from new.log_date)::int, new.created_by, 'bio_log')
    on conflict (row_hash) do update set audit_date = excluded.audit_date, location = excluded.location, category = excluded.category, metric = excluded.metric,
      reported_pct = excluded.reported_pct, rating = excluded.rating, rating_value = excluded.rating_value, analysis_category = excluded.analysis_category,
      iso_year = excluded.iso_year, iso_week = excluded.iso_week;
    d := new.log_date;
  end if;
  update public.bpm_biosecurity_audits set superseded = exists (select 1 from public.bio_log b where b.log_date = d) where source = 'excel' and audit_date = d;
  return null;
end $$;
drop trigger if exists bpm_bio_mirror on public.bio_log;
create trigger bpm_bio_mirror after insert or update or delete on public.bio_log for each row execute function public.bpm_bio_mirror();

-- Excel imports for a date the Biosecurity dashboard already covers are stored but not scored.
create or replace function public.bpm_bio_excel_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'excel' and exists (select 1 from public.bio_log b where b.log_date = new.audit_date) then new.superseded := true; end if;
  return new;
end $$;
drop trigger if exists bpm_bio_excel_guard on public.bpm_biosecurity_audits;
create trigger bpm_bio_excel_guard before insert on public.bpm_biosecurity_audits for each row execute function public.bpm_bio_excel_guard();

-- Overall % typed by hand in the Excel ('Category Averages' row 47), as OVERALL_TYPED in the Biosecurity dashboard: the weekly overall shows this value.
insert into public.bpm_biosecurity_audits (row_hash, audit_date, location, category, metric, rating_value, analysis_category, iso_year, iso_week, source)
select 'typed:2026-' || w, (date '2026-07-13' + (w - 29) * 7), 'Farm', 'Overall', 'Overall (typed in Excel)', v, 'Overall (typed)', 2026, w, 'typed'
from (values (34, .59), (36, .73), (37, .75), (38, .65), (39, .59), (40, .89)) t(w, v)
on conflict (row_hash) do nothing;

-- backfill everything already in the Biosecurity dashboard
insert into public.bpm_biosecurity_audits (row_hash, audit_date, location, category, metric, reported_pct, rating, rating_value, analysis_category, iso_year, iso_week, created_by, source)
select 'biolog:' || id, log_date, location, category, item, compliance / 100, rating, public.bpm_bio_value(compliance, rating, item), public.bpm_bio_group(item, category),
       extract(isoyear from log_date)::int, extract(week from log_date)::int, created_by, 'bio_log' from public.bio_log
on conflict (row_hash) do nothing;
update public.bpm_biosecurity_audits x set superseded = true where source = 'excel' and exists (select 1 from public.bio_log b where b.log_date = x.audit_date);
