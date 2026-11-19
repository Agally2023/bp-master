-- Applied to project gtokqbahkdjwyasagosi as bpm_0003_account_approval.
-- Adds email/status to bpm_profiles, bpm_request_access() RPC (MFA-verified users only, always created pending/inactive),
-- and a guard trigger: no self-changes, never remove the last active administrator.
alter table public.bpm_profiles add column if not exists email text,
  add column if not exists status text not null default 'active' check (status in ('pending','active','disabled')),
  add column if not exists requested_at timestamptz default now();
alter table public.bpm_profiles add constraint bpm_profiles_status_active check ((status = 'active') = active);
-- see the project migration history for the function bodies (bpm_request_access, bpm_guard_profiles)
