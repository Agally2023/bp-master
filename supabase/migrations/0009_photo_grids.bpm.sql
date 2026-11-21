-- Picture grids fill themselves: BP Master users may read the Biosecurity dashboard's photos; pond photos get their own table.
create policy bpm_bio_photos_sel on public.bio_photos for select to authenticated using ((select public.app_role()) is not null);
create policy bpm_bio_photos_obj on storage.objects for select to authenticated using (bucket_id = 'biosecurity-photos' and (select public.app_role()) is not null and (select public.bpm_mfa_ok()));
create table public.bpm_pond_photos (
  id uuid primary key default gen_random_uuid(),
  pond text not null, stage text, photo_date date not null default current_date,
  storage_path text not null, caption text,
  uploaded_by uuid references auth.users(id) default auth.uid(), created_at timestamptz not null default now()
);
create index bpm_pond_photos_pond_idx on public.bpm_pond_photos (pond, photo_date desc);
alter table public.bpm_pond_photos enable row level security;
alter table public.bpm_pond_photos force row level security;
create policy bpm_pond_photos_mfa on public.bpm_pond_photos as restrictive to authenticated using ((select public.bpm_mfa_ok()));
create policy bpm_pond_photos_sel on public.bpm_pond_photos for select to authenticated using ((select public.app_role()) is not null);
create policy bpm_pond_photos_ins on public.bpm_pond_photos for insert to authenticated with check ((select public.can_write()));
create policy bpm_pond_photos_del on public.bpm_pond_photos for delete to authenticated using ((select public.is_admin()));
