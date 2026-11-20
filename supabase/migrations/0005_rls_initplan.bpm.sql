-- Speed: wrap RLS helper calls in (select ...) so Postgres evaluates them once per query (initplan), not once per row.
-- Also adds date/week indexes used by the dashboard's filtered loads.
do $$
declare t text; wk text;
begin
  for t in select tablename from pg_tables where schemaname='public' and tablename like 'bpm\_%' escape '\' loop
    if exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_sel') then
      execute format('drop policy %I on public.%I', t||'_sel', t);
      execute format('create policy %I on public.%I for select to authenticated using ((select public.app_role()) is not null)', t||'_sel', t);
    end if;
    if exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_mfa') then
      execute format('drop policy %I on public.%I', t||'_mfa', t);
      execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select public.bpm_mfa_ok())) with check ((select public.bpm_mfa_ok()))', t||'_mfa', t);
    end if;
    if exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_upd') then
      execute format('drop policy %I on public.%I', t||'_upd', t);
      execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t||'_upd', t);
    end if;
    if exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_del') then
      execute format('drop policy %I on public.%I', t||'_del', t);
      execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))', t||'_del', t);
    end if;
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='iso_year') then
      execute format('create index if not exists %I on public.%I (iso_year, iso_week)', t||'_wk_idx', t);
    end if;
  end loop;
end $$;
