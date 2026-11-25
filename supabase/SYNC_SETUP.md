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

## Option B: Node.js folder watcher (no IT app registration needed)
Use this when the Microsoft app cannot be registered. A small Node.js program on an always-on Windows PC watches the OneDrive-synced
Quality Control folder and pushes changed workbooks to `qc-sync` (push mode). Same parsers and `row_hash` as the importer, so re-sending is safe.

1. In SharePoint open the Quality Control library and click **Sync** (OneDrive then keeps a local copy, e.g. `C:\Users\<you>\Victory Farms Kenya\Quality Control`).
2. Install Node.js 18 or later (nodejs.org). Download this repo (or just the `tools/node-sync` folder).
3. In `tools/node-sync` copy `.env.example` to `.env` and set `WATCH_DIR` to the synced folder and `SYNC_KEY` to the value of the `SYNC_KEY` secret in Supabase (Edge Functions > qc-sync > Secrets).
4. Test once: `node sync.mjs --once` (add `--force` to re-send every file). Expect lines like `VF_3-Day_pond_Survival.xlsx -> day3_recounts: Watcher push: ...`.
5. Run it permanently: `npm i -g pm2`, `pm2 start sync.mjs --name bp-sync`, `pm2 save`, `pm2 startup` (or a Windows Task Scheduler task running `node sync.mjs --once` every 5 minutes).

Files handled: `VF 3-Day pond Survival.xlsx` (3-day recounts) and `VF Egg Collection Monitoring Data.xlsx` (jars and ABP ratings). To add a file, add its parser to `MODULES` in `functions/qc-sync/index.ts` and its name to `SOURCES` in `tools/node-sync/sync.mjs`.
Result and any error show in Settings > Automatic updates. `.env` and `.sync-state.json` are git-ignored.

## Option C: sign in with your own Microsoft account (fully automatic, no folder or file picking)
No IT secret needed if your tenant lets users register apps. In the app: Data entry > **Sync setup** and follow the 4 steps (Entra app registration, SPA redirect `https://<your-site>/ms-callback.html`,
delegated `Files.Read.All`). Paste the client ID, press Sync once and sign in; the app then renews access silently and syncs every 10 minutes while it is open.
To make every device work without setup, put `msClientId` / `msTenant` in `web/config.js`. If the tenant blocks user app registration or consent, ask IT for the delegated consent or use Option A/B.
