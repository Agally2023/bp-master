-- Hygiene & biosecurity photos uploaded from the Data entry tab (area/item, status, date); they go into the report's biosecurity picture grid.
create table if not exists public.bpm_hygiene_photos (
  id uuid primary key default gen_random_uuid(),
  area text not null, item text, status text, photo_date date not null default current_date,
  storage_path text not null,
  uploaded_by uuid references auth.users(id) default auth.uid(), created_at timestamptz not null default now()
);
create index if not exists bpm_hygiene_photos_date_idx on public.bpm_hygiene_photos (photo_date desc);
alter table public.bpm_hygiene_photos enable row level security;
alter table public.bpm_hygiene_photos force row level security;
create policy bpm_hygiene_photos_mfa on public.bpm_hygiene_photos as restrictive to authenticated using ((select public.bpm_mfa_ok()));
create policy bpm_hygiene_photos_sel on public.bpm_hygiene_photos for select to authenticated using ((select public.app_role()) is not null);
create policy bpm_hygiene_photos_ins on public.bpm_hygiene_photos for insert to authenticated with check ((select public.can_write()));
create policy bpm_hygiene_photos_del on public.bpm_hygiene_photos for delete to authenticated using ((select public.is_admin()));
