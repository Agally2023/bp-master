-- Re-enable two-step verification (run in the Supabase SQL editor), then set MFA_REQUIRED: true in web/config.js.
-- Restores the original rule: only MFA-verified (aal2) sessions pass every policy.
create or replace function public.bpm_mfa_ok() returns boolean
language sql stable
as $$ select (auth.jwt()->>'aal') = 'aal2' $$;
