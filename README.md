# BP Master

Weekly Best Practice report generator for Victory Farms hatchery audits.
Excel (raw or analysed) -> validated tables in Supabase -> dashboard + PPT filled from the Week 46 template.

## Layout
- `supabase/migrations/0001_core.sql` - schema, roles (admin / reviewer / auditor), RLS, MFA (aal2) enforced on every table, append-only audit log, private image bucket.
- `engine/` - Python report engine (importers + validation, analytics, draft comments, template-filled deck).
- `templates/` - put `VF_BP_Weekly_Template.pptx` here (git-ignored: confidential).
- `data/`, `out/` - git-ignored.

## Run (local test)
    python engine/build_report.py --year 2026 --week 46 --as-of 2026-11-18 \
      --workstation <Workstation_Compliance.xlsx> --bottom-rope <Bottom_Rope.xlsx> --day3 <3-Day_Survival.xlsx> \
      --out out/VF_BP_Week_46.pptx
Also writes `<out>_import_report.json` (validation issues + draft comments).

## Modules done (all Excel-driven slides): workstation compliance, bottom rope, Day-3, biosecurity, RAS water, parasitology, stocking audit, fry transfer audit, egg separation + jars rated 0-2, pond flipping, hapa exchange. Run `./run_w46.sh` for a full Week 46 deck.
## Next: photo 4-grids (slides 5 and 11), analysed-graph uploads, web app (data entry, import, comments, dashboard), Cloudflare deploy.

## Security rules
Private repo; secrets only in GitHub/Cloudflare secrets; service-role key never in browser; Cloudflare Access + Supabase MFA; no-store caching on report pages.

## Web app (web/) – built
Static, dependency-free site (host on Cloudflare Pages). Sidebar (collapsible): **Dashboard**, **Data Entry** (form + records + Excel import for every module, plus "Import all Excel files"), **Reports** (slide-ordered preview in VF theme, editable comments, photo 4-grids, analysed-graph upload, draft → review → approve → export workflow).
- `config.js`: leave SUPABASE_URL empty for DEMO mode (in-memory). Fill SUPABASE_URL / SUPABASE_ANON_KEY for live.
- Demo data: `node tests/export_demo.mjs <folder-of-xlsx>` writes git-ignored `web/demo-data.json`.
- Tests: `tests/engine_node.mjs`, `tests/ui_test.py` (Playwright, needs `python3 -m http.server` in web/).
- Re-imports are idempotent (row hash). Modules with a natural key (bottom rope, 3-day recounts, hapa exchange) are updated in place when an admin re-imports a newer file; auditors' re-imports skip existing rows.
- Not yet: `engine/server.py` (PPT generation service, set REPORT_API_URL), photo/graph embedding in the deck builder, live Supabase test.

## PPT report service (engine/server.py)
`POST /report {year, week}` with the user's Supabase JWT. It checks the caller is an active **admin**, the report is **approved**, loads tables with the caller's own token (RLS + MFA still apply), applies edited comments, excluded slides, analysed graphs (replace the native chart) and photo 4-grids (new slides after biosecurity / flipping), and returns the .pptx.
- Run: `docker build -t bpm-report .` then run with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_ORIGIN=https://<your-pages-domain>` and the template mounted at `/secrets/VF_BP_Weekly_Template.pptx`. Host on any container platform (Cloud Run, Fly.io, Railway). Put it behind HTTPS only; set `REPORT_API_URL` in `web/config.js` to `https://<service>/report`.
- Local test without Supabase: `python3 -I engine/server.py --local web/demo-data.json`.
- Limits: shared slide 8 (stocking + transfers) cannot be excluded half-way; excluding drops whole slides only for sections with their own slide.

## Live deployment status
- **Supabase** project `gtokqbahkdjwyasagosi` (shared with the Biosecurity dashboard): BP Master tables are all prefixed `bpm_`, bucket `bpm-report-images`, migrations `supabase/migrations/*.bpm.sql` applied. Other apps' tables were not touched.
- Admin profile seeded for steve.okongo@victoryfarmskenya.com. Everyone else needs a row in `bpm_profiles` (auditor/reviewer/admin); other apps' users in the same auth pool get no access.
- `web/config.js` holds the project URL and publishable key (public by design).
- **Cloudflare Pages**: Framework none, build command empty, output directory `web`. Add a Cloudflare Access policy (email allow-list) in front of the site. Keep `web/demo-data.json` out of git (.gitignore).

## PPT report service (Render)
`render.yaml` is a Render Blueprint for `engine/server.py` (service name `bp-master-report`, URL `https://bp-master-report.onrender.com`).
1. Render dashboard → New → Blueprint → pick this (private) repo → Apply. The weekly template ships in `engine/templates/` (keep the repo private).
2. If Render gives the service another URL, set it in `web/config.js` (`REPORT_API_URL`, ending `/report`) and in the `connect-src` of `web/_headers`.
3. Only an admin can export, and only an approved report. The free plan sleeps when idle: the first export after idle can take about a minute.

## Performance notes
Migration `0005_rls_initplan.bpm.sql` evaluates RLS helper functions once per query instead of once per row and adds (iso_year, iso_week) indexes. The dashboard and reports load only the selected year and the year before.

## Phone layout
Below 900px the menu becomes a drawer (hamburger button), grids and forms go single-column, tables scroll inside their own box. Test: `python3 tests/ui_mobile.py` (serve `web/` on port 8765 first).

## Biosecurity dashboard link
BP Master reads the Biosecurity dashboard's data from the shared Supabase project (`bio_log`). Migration `0008_biosecurity_link.bpm.sql` mirrors every entry into `bpm_biosecurity_audits` (`source = 'bio_log'`) with the same scoring and six core categories, and keeps it in sync on insert, edit and delete. Excel-imported rows for dates the Biosecurity dashboard already covers are kept but flagged `superseded` and not scored. The overall % typed by hand in the Excel (weeks 34, 36-40, `OVERALL_TYPED` in that dashboard) is stored as `source = 'typed'` rows and shown instead of the calculated value, so the weekly overall matches in both apps. If you change `OVERALL_TYPED` there, update those rows here.

## Picture grids (automatic)
- **Biosecurity Images**: the report takes up to 4 photos taken in the Biosecurity dashboard during the report week (`bio_photos`), newest first, one per item/location before any repeat, captioned "item, location, date".
- **Images of Flipped Ponds Progress**: upload pond photos once on Entry > Pond Flipping > Pond photos. The report shows the latest photo of every pond still in progress (any week), captioned "pond, stage, date". A new 2x2 slide is added for every 4 ponds; a pond drops off when its flipping completes.
- A photo uploaded by hand into a slot on the Reports page overrides the automatic ones for that grid. With no photos at all the slide is left out, so last week's pictures never reappear.

## Excel export
Entry > any module > Records > "Export all to Excel" downloads every stored record of that module; Entry > "Import all" page > "Export all data to Excel" downloads one workbook with a sheet per module. Files follow the Victory Farms Excel template: navy title, light-navy header with a thin rule, entered values blue, calculated values black, dates dd/mm/yyyy, logo top right. Everything is built in the browser (`web/js/xlsxwrite.js`), so no data leaves the app.
