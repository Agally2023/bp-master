-- Auto-sync from the Aqua Quality Control SharePoint folders. The Edge Function `qc-sync` (service role) reads these.
create table public.bpm_sync_sources (
  key text primary key,                -- module key, e.g. day3_recounts
  label text not null,
  drive_id text not null, item_id text not null, file_name text,
  enabled boolean not null default true,
  remote_modified timestamptz,         -- SharePoint lastModified of the file last loaded
  last_run timestamptz, last_status text, last_message text,
  rows_read int, rows_new int, latest_data_date date
);
create table public.bpm_sync_log (
  id bigserial primary key, run_at timestamptz not null default now(),
  source text, status text, message text, rows_read int, rows_new int
);
alter table public.bpm_sync_sources enable row level security; alter table public.bpm_sync_sources force row level security;
alter table public.bpm_sync_log enable row level security; alter table public.bpm_sync_log force row level security;
create policy bpm_sync_sources_mfa on public.bpm_sync_sources as restrictive to authenticated using ((select public.bpm_mfa_ok()));
create policy bpm_sync_log_mfa on public.bpm_sync_log as restrictive to authenticated using ((select public.bpm_mfa_ok()));
create policy bpm_sync_sources_sel on public.bpm_sync_sources for select to authenticated using ((select public.app_role()) is not null);
create policy bpm_sync_log_sel on public.bpm_sync_log for select to authenticated using ((select public.is_admin()));
insert into public.bpm_sync_sources (key, label, drive_id, item_id, file_name) values
 ('day3_recounts', '3-Day Pond Survival (Recounts)',
  'b!UKPwc-7EFUyeY6SYVQMRTn8yXaKWnAdPh-I4mvi7xlk8YSCyoEZwSJNsf9uUzmq1', '0122JKVXX7VNCSXZ626VA2B4OB2EAK4RSO', 'VF 3-Day pond Survival.xlsx');
