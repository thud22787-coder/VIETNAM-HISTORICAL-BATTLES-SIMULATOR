/**
 * Responsive layout, measured in a real browser.
 *
 * §77: mobile is not a shrunken desktop. That claim is only meaningful if the
 * layout actually differs, so this measures the rendered geometry rather than
 * asserting that a media query exists.
 *
 * The properties that matter:
 *   - on a narrow screen the controls sit BELOW the battlefield, within thumb
 *     reach, instead of at the top where a one-handed grip cannot reach them
 *   - on a wide screen they stay above it, as a desktop user expects
 *   - every button meets the 44px touch-target minimum on both
 *   - the canvas does not scroll the page under a finger
 *
 * Skips visibly when no Chromium is present.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const uiRoot = join(here, '..');
const dist = join(uiRoot, 'dist');

const CHROME = [
  process.env['CHROME_PATH'],
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && existsSync(p));

const skip = !CHROME
  ? 'no Chromium found (set CHROME_PATH to run this)'
  : !existsSync(join(dist, 'index.html'))
    ? 'UI not built — run: npm run build -w @vhbs/game-ui'
    : false;

const MEASURE = `
setTimeout(() => {
  const r = (id) => { const e = document.getElementById(id); if (!e) return 'none';
    const b = e.getBoundingClientRect(); return Math.round(b.top) + '/' + Math.round(b.height); };
  const btns = [...document.querySelectorAll('button')]
    .filter(b => b.getBoundingClientRect().height > 0)
    .map(b => (b.id || 'btn') + ':' + Math.round(b.getBoundingClientRect().width)
      + 'x' + Math.round(b.getBoundingClientRect().height));
  const el = document.createElement('div');
  el.id = 'MEASURED';
  el.textContent = JSON.stringify({
    vw: innerWidth,
    canvas: r('canvasWrap'), topbar: r('topbar'),
    touchAction: getComputedStyle(document.getElementById('battlefield')).touchAction,
    buttons: btns,
  });
  document.body.appendChild(el);
}, 1800);
`;

/** Serve dist, load the page at a given window size, return the measurements. */
async function measure(windowSize) {
  // A separate script file, not an inline one: the app declares a CSP with
  // script-src 'self', and inline injection is correctly blocked by it.
  writeFileSync(join(dist, '__measure.js'), MEASURE, 'utf8');
  const html = readFileSync(join(dist, 'index.html'), 'utf8').replace(
    '</body>',
    '<script src="./__measure.js"></script></body>',
  );
  writeFileSync(join(dist, '__probe.html'), html, 'utf8');

  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const server = createServer((req, res) => {
    let body, file;
    try {
      const url = (req.url ?? '/').split('?')[0];
      file = join(dist, url === '/' ? 'index.html' : decodeURIComponent(url));
      body = readFileSync(file);
    } catch {
      res.writeHead(404);
      res.end('nf');
      return;
    }
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  });

  const port = await new Promise((r) => server.listen(0, () => r(server.address().port)));

  try {
    const dom = await new Promise((resolve, reject) => {
      const proc = spawn(
        CHROME,
        [
          '--headless=new', '--disable-gpu', '--no-sandbox',
          `--window-size=${windowSize}`,
          '--virtual-time-budget=12000', '--dump-dom',
          `http://127.0.0.1:${port}/__probe.html`,
        ],
        { stdio: ['ignore', 'pipe', 'ignore'] },
      );
      let out = '';
      proc.stdout.on('data', (d) => (out += d));
      proc.on('error', reject);
      proc.on('close', () => resolve(out));
    });

    const m = dom.match(/id="MEASURED">([^<]*)</);
    assert.ok(m, `could not measure the layout at ${windowSize}`);
    return JSON.parse(m[1].replace(/&quot;/g, '"'));
  } finally {
    server.close();
    rmSync(join(dist, '__probe.html'), { force: true });
    rmSync(join(dist, '__measure.js'), { force: true });
  }
}

describe('responsive layout', { skip }, () => {
  test('on a wide screen the controls sit above the battlefield', async () => {
    const m = await measure('1400,900');
    const [topbarTop] = m.topbar.split('/').map(Number);
    const [canvasTop] = m.canvas.split('/').map(Number);

    assert.ok(m.vw > 820, `expected a wide viewport, got ${m.vw}`);
    assert.ok(
      topbarTop < canvasTop,
      `desktop should keep controls above the map (topbar ${topbarTop}, canvas ${canvasTop})`,
    );
  });

  test('on a narrow screen the controls move below it, within thumb reach', async () => {
    // The actual §77 claim: this is a different layout, not a smaller one.
    const m = await measure('700,900');
    const [topbarTop] = m.topbar.split('/').map(Number);
    const [canvasTop] = m.canvas.split('/').map(Number);

    assert.ok(m.vw <= 820, `expected a narrow viewport, got ${m.vw}`);
    assert.ok(
      topbarTop > canvasTop,
      `mobile should put controls below the map (topbar ${topbarTop}, canvas ${canvasTop})`,
    );
    assert.equal(canvasTop, 0, 'the battlefield should start at the top of the screen');
  });

  test('every visible button meets the 44px touch-target minimum', async () => {
    for (const size of ['1400,900', '700,900']) {
      const m = await measure(size);
      const tooSmall = m.buttons.filter((b) => {
        const [w, h] = b.split(':')[1].split('x').map(Number);
        return h < 44 || w < 36;
      });
      assert.deepEqual(tooSmall, [], `buttons below the touch minimum at ${size}`);
    }
  });

  test('the battlefield does not scroll the page under a finger', async () => {
    const m = await measure('700,900');
    assert.equal(
      m.touchAction,
      'none',
      'touch-action must be none, or dragging a selection box pans the page instead',
    );
  });
});
