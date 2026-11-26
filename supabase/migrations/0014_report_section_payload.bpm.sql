-- Statistics tab: an analysis ticked for the report is stored as a report section (key stat_<id>) with its slide spec in payload
alter table public.bpm_report_sections add column if not exists payload jsonb;
