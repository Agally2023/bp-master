# BP Master as a Windows and Android app

Both apps are installed apps (own icon and window) that open the live BP Master, so every update to the website reaches them without reinstalling.
Folders: `desktop/` (Windows, Electron) and `mobile/` (Android, Capacitor). They are built by GitHub: Actions > **build-apps** > Run workflow, then download
**BP-Master-Windows** (`BP Master Setup 1.0.0.exe`) and **BP-Master-Android** (`BP-Master.apk`) from the run's Artifacts.

- Windows: double-click the .exe (Windows may show "Windows protected your PC": More info > Run anyway; the installer is not code-signed yet). Folder sync and the Microsoft sign-in work as in Chrome.
- Android: copy the .apk to the phone, open it and allow "Install unknown apps" for the app you opened it from. It is a debug-signed build for your team; Google Play needs a signing key and a developer account.
- On Android, local-folder sync is not available (phones cannot grant folder access to a web page); the SharePoint sign-in sync and all dashboards, forms and reports work.

**Saving files in the apps.** Windows: Excel, PowerPoint and PNG downloads work as in Chrome. Android: the app writes the file to its cache and opens the share sheet (Save to Files, Drive, WhatsApp, Open). This needs the Filesystem and Share plugins, which are included in the Android build, so rebuild and reinstall the APK once (Actions > build-apps) to get PNG/Excel/PowerPoint saving. Web changes (cache, Sync button, dashboards) reach both apps without reinstalling.
**Sync in the apps.** Windows (Chromium) can choose a folder like Chrome. Android has no folder access: Sync opens the file picker, choose the workbook (e.g. VF Hatchery Masterfile.xlsx) from Files / OneDrive.
