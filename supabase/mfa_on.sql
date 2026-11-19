-- Re-enable two-step verification (run in the Supabase SQL editor), then set MFA_REQUIRED: true in web/config.js.
update public.bpm_thresholds set value = 1 where key = 'mfa_required';
create or replace function public.bpm_mfa_ok() returns boolean
language sql stable security definer set search_path = public
as $$ select (auth.jwt()->>'aal') = 'aal2' or coalesce((select value from public.bpm_thresholds where key = 'mfa_required'), 1) = 0 $$;
