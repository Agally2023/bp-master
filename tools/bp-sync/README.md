# BP Master local folder sync (no Microsoft account needed)

Imports your audit workbooks automatically from a folder on your PC, using exactly the same rules as **Data entry → Import from Excel** (sheet detection, validation, duplicates skipped, import log, audit log).
The OneDrive/SharePoint desktop app already keeps the SharePoint folders on your computer; point the sync at those folders (or any folder) and it does the rest.

## One-time setup
1. Install Node.js 18+ (https://nodejs.org).
2. Get this repo (`git clone https://github.com/Agally2023/bp-master`).
3. Copy `tools/bp-sync/bp-sync.config.example.json` to `tools/bp-sync/bp-sync.config.json` and set:
   - `folders`: the folders to watch (sub-folders are included),
   - `email` / `password`: a BP Master user with the **admin** or **auditor** role (the password can instead be set in the `BPM_PASSWORD` environment variable).
   The config file is git-ignored; keep it private.

## Run
- `node tools/bp-sync/bp-sync.mjs` keeps running and checks every `intervalSeconds`.
- `node tools/bp-sync/bp-sync.mjs --once` does one pass and exits (use with Windows Task Scheduler to run every hour).
- `node tools/bp-sync/bp-sync.mjs --dry-run` shows what it would import and writes nothing.

Each file is imported again only when its content changes (state in `.bp-sync-state.json`). Files still being saved (changed in the last 15 s) are picked up on the next pass. Results are listed under Data entry → Imports like any manual import.

## Limits
- Files locked by a **sensitivity label / encryption** (e.g. the Broodstock Masterfile) cannot be read by any script. The sync logs "cannot be read". Save an unlabelled copy of the sheet you need into a watched folder.
- Only `.xlsx`. The account must not use the two-step code (the app currently has it off).
