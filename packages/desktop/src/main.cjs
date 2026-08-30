/**
 * Electron desktop shell.
 *
 * Deliberately thin. It opens a window on the built web UI and does nothing
 * else — no game logic, no scenario data, no simulation. Master Prompt §48
 * requires desktop and Android to share the core rather than duplicate it, and
 * the cheapest way to guarantee that is for the platform shells to contain
 * nothing worth duplicating.
 *
 * Offline by construction (§49, §78): the app loads from the local filesystem
 * and makes no network requests.
 */
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

/**
 * The built UI lives in game-ui/dist during development and in the packaged
 * resources directory after electron-builder has run.
 */
function resolveAppRoot() {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'app'),
    path.join(__dirname, '..', '..', 'game-ui', 'dist'),
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return null;
}

function createWindow() {
  const root = resolveAppRoot();

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    title: 'Vietnam Historical Battles',
    webPreferences: {
      // The UI needs no privileged APIs, so it gets none. Nothing here should
      // ever require nodeIntegration; if it seems to, the logic belongs in
      // sim-core instead.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // External links open in the real browser, not inside the game window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (root) {
    win.loadFile(path.join(root, 'index.html'));
  } else {
    win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          '<body style="font:14px system-ui;background:#0d1117;color:#e8e4dc;padding:40px">' +
            '<h2>UI not built</h2>' +
            '<p>Run <code>npm run build -w @vhbs/game-ui</code> first.</p></body>',
        ),
    );
  }

  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
