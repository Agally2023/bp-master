-- Applied to project gtokqbahkdjwyasagosi as bpm_0004_mfa_off.
-- TEMPORARILY switches two-step verification off without deleting any policy.
-- Every "_mfa" policy, the report-image storage policies and bpm_request_access() now call public.bpm_mfa_ok().
-- While it returns true, a normal password sign-in (aal1) is enough. Re-enable with supabase/mfa_on.sql
-- (and set MFA_REQUIRED: true in web/config.js).
create or replace function public.bpm_mfa_ok() returns boolean
language sql stable
as $$ select true $$;   -- MFA OFF (temporary)

do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public' and policyname like '%\_mfa' loop
    execute format('alter policy %I on public.%I using (public.bpm_mfa_ok())', r.policyname, r.tablename);
  end loop;
end $$;

alter policy bpm_rimg_read  on storage.objects using (bucket_id = 'bpm-report-images' and public.app_role() is not null and public.bpm_mfa_ok());
alter policy bpm_rimg_write on storage.objects with check (bucket_id = 'bpm-report-images' and public.can_write() and public.bpm_mfa_ok());
alter policy bpm_rimg_del   on storage.objects using (bucket_id = 'bpm-report-images' and public.is_admin() and public.bpm_mfa_ok());

create or replace function public.bpm_request_access(p_name text) returns text
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not public.bpm_mfa_ok() then raise exception 'Verified sign-in required'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Name required'; end if;
  insert into public.bpm_profiles(id, full_name, email, role, active, status)
  values (auth.uid(), left(trim(p_name),100), auth.jwt()->>'email', 'auditor', false, 'pending')
  on conflict (id) do nothing;
  return (select status from public.bpm_profiles where id = auth.uid());
end $function$;
