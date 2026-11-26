// BP Master for Windows: a real installed app (own window, icon, taskbar entry) that opens the live BP Master, so every release reaches the app at once.
const { app, BrowserWindow, shell, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const START = process.env.BPM_URL || 'https://bp-master.steveochieng299.workers.dev/';
const HOME = new URL(START).hostname;
const POPUP_OK = new Set([HOME, 'login.microsoftonline.com']);       // Microsoft sign-in popup for the SharePoint sync

if (!app.requestSingleInstanceLock()) app.quit();
let win;
function create() {
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 900, minHeight: 600, backgroundColor: '#111111', icon: path.join(__dirname, 'icon.png'), title: 'BP Master',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  Menu.setApplicationMenu(null);
  win.loadURL(START);
  win.webContents.on('did-fail-load', (_e, code, _d, _u, isMain) => { if (isMain && code !== -3) win.loadFile(path.join(__dirname, 'offline.html')); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    let host = ''; try { host = new URL(url).hostname; } catch { }
    if (POPUP_OK.has(host)) return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 700, autoHideMenuBar: true, parent: win } };
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { try { if (new URL(url).hostname !== HOME && !url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } } catch { e.preventDefault(); } });
}
app.whenReady().then(() => {
  // folder sync (File System Access) and downloads (Excel/PowerPoint exports) are allowed for BP Master only
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(new URL(wc.getURL() || 'about:blank').hostname === HOME && ['fileSystem', 'clipboard-sanitized-write', 'notifications'].includes(perm)));
  // downloads (PNG graphs, Excel, PowerPoint) are saved straight to the Downloads folder, then the folder opens with the file selected
  session.defaultSession.on('will-download', (_e, item) => {
    const ext = path.extname(item.getFilename()), base = path.join(app.getPath('downloads'), path.basename(item.getFilename(), ext)); let p = base + ext, i = 1;
    while (fs.existsSync(p)) p = `${base} (${i++})${ext}`;
    item.setSavePath(p); item.once('done', (_ev, state) => { if (state === 'completed') shell.showItemInFolder(p); });
  });
  create(); app.on('activate', () => BrowserWindow.getAllWindows().length || create());
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
