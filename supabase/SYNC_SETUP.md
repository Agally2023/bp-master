# Quality Control auto-sync (SharePoint -> BP Master)

Edge Function `qc-sync` (project gtokqbahkdjwyasagosi) reads the Quality Control workbooks straight from SharePoint
with a **read-only app registration** and loads new rows into Supabase. Sources are listed in `bpm_sync_sources`
(3-Day Pond Survival, Egg Volumetric Data and Egg Separation Ratings are registered). Re-running is safe: rows are matched by the same `row_hash` the Import page uses,
and a file is only downloaded when SharePoint says it changed. Status shows in Settings > Automatic updates.

## 1. IT admin: register the Microsoft app (about 10 min)
1. Entra admin centre > App registrations > New registration, name `BP Master Sync`, single tenant.
2. API permissions > Microsoft Graph > **Application** permissions > `Sites.Selected` (preferred) or `Files.Read.All`; Grant admin consent.
   - For `Sites.Selected`, grant read on the AquaData site: `POST /sites/{site-id}/permissions` with `{"roles":["read"],"grantedToIdentities":[{"application":{"id":"<client id>","displayName":"BP Master Sync"}}]}`.
3. Certificates & secrets > New client secret (24 months). Copy the value.
4. Send Steve: Tenant ID, Client (application) ID, Client secret value.
5. The workbooks must not carry a sensitivity label that blocks app access (the Masterfile does; the 3-Day file is readable).

## 2. Set the secrets (Supabase > Edge Functions > qc-sync > Secrets)
`MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, and `SYNC_KEY` (any long random string).

## 3. Test, then schedule hourly (SQL editor)
```sql
-- test once (force reload):
select net.http_post('https://gtokqbahkdjwyasagosi.supabase.co/functions/v1/qc-sync?force=1',
  headers := jsonb_build_object('x-sync-key','<SYNC_KEY>'));
-- hourly:
create extension if not exists pg_cron; create extension if not exists pg_net;
select cron.schedule('bpm-qc-sync', '7 * * * *', $$select net.http_post('https://gtokqbahkdjwyasagosi.supabase.co/functions/v1/qc-sync',
  headers := jsonb_build_object('x-sync-key','<SYNC_KEY>'))$$);
```
Adding more files: insert a row in `bpm_sync_sources` (drive_id + item_id) and add its parser to `MODULES` in `functions/qc-sync/index.ts`.
