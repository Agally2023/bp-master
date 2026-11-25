# BP Master as a Windows and Android app

Both apps are installed apps (own icon and window) that open the live BP Master, so every update to the website reaches them without reinstalling.
Folders: `desktop/` (Windows, Electron) and `mobile/` (Android, Capacitor). They are built by GitHub: Actions > **build-apps** > Run workflow, then download
**BP-Master-Windows** (`BP Master Setup 1.0.0.exe`) and **BP-Master-Android** (`BP-Master.apk`) from the run's Artifacts.

- Windows: double-click the .exe (Windows may show "Windows protected your PC": More info > Run anyway; the installer is not code-signed yet). Folder sync and the Microsoft sign-in work as in Chrome.
- Android: copy the .apk to the phone, open it and allow "Install unknown apps" for the app you opened it from. It is a debug-signed build for your team; Google Play needs a signing key and a developer account.
- On Android, local-folder sync is not available (phones cannot grant folder access to a web page); the SharePoint sign-in sync and all dashboards, forms and reports work.
