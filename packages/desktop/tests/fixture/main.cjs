/**
 * Headless probe used by desktop.test.mjs.
 *
 * Loads the real built UI in a real Electron window, inspects the rendered DOM,
 * and prints machine-readable results. Kept separate from the shipped
 * src/main.cjs so the shell itself stays free of test scaffolding.
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const distDir = path.join(__dirname, '..', '..', '..', 'game-ui', 'dist');

app.whenReady().then(async () => {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    console.log('SMOKE-FAIL: built UI not found at ' + distDir);
    app.exit(0);
    return;
  }

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  const errors = [];
  win.webContents.on('console-message', (_e, level, msg) => {
    if (level >= 2) errors.push(msg);
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    errors.push(`load failed ${code} ${desc}`);
  });

  await win.loadFile(path.join(distDir, 'index.html'));
  await new Promise((r) => setTimeout(r, 2500));

  const js = (expr) => win.webContents.executeJavaScript(expr);
  const brief = await js('document.getElementById("briefTitle")?.textContent ?? ""');
  const battles = await js('document.getElementById("battleList")?.innerHTML ?? ""');
  const canvasW = await js('document.getElementById("battlefield")?.width ?? 0');

  console.log('SMOKE-BRIEF:' + brief);
  console.log('SMOKE-BATTLES:' + (/BACH_DANG_1288/.test(battles) && /CHI_LANG_1427/.test(battles)));
  console.log('SMOKE-CANVAS-W:' + canvasW);
  console.log('SMOKE-ERRORS:' + (errors.length ? errors.join(' | ') : 'none'));
  console.log(brief.length > 1 && canvasW > 400 && errors.length === 0 ? 'SMOKE-PASS' : 'SMOKE-FAIL');
  app.exit(0);
});
