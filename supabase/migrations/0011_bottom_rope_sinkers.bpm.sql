-- Sinkers counted per hapa at the bottom rope check (standard: broodstock 20, nursery 4)
alter table public.bpm_bottom_rope_audits add column if not exists sinkers integer;
