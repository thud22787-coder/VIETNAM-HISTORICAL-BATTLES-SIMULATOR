/**
 * Cross-platform determinism: does the simulation produce identical results in
 * a browser engine and in Node?
 *
 * ADR-001 chose uint32 arithmetic for the RNG specifically so desktop and
 * Android would agree bit-for-bit. Every handoff up to now recorded that as
 * "designed for but unverified on a device". This verifies it against a real
 * Chromium engine — which is what Android WebView runs, so it is the closest
 * check available without a handset.
 *
 * The test builds the fingerprint module for the browser, serves it, runs it in
 * headless Chrome, and compares the output byte-for-byte against the same
 * golden file that `sim-core`'s own fingerprint test uses.
 *
 * It SKIPS rather than fails when no Chromium is installed, because a developer
 * without one should still be able to run the suite. A skip is visible in the
 * output; a silent pass would not be.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const uiRoot = join(here, '..');
const goldenPath = join(uiRoot, '..', 'sim-core', 'tests', 'fingerprint.golden.txt');

/** Chromium candidates, in preference order. */
const CHROME_CANDIDATES = [
  process.env['CHROME_PATH'],
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const chrome = CHROME_CANDIDATES.find((p) => p && existsSync(p));

test(
  'the simulation is bit-identical in a browser engine and in Node',
  { skip: chrome ? false : 'no Chromium found (set CHROME_PATH to run this)' },
  async () => {
    const work = join(uiRoot, '.determinism');
    rmSync(work, { recursive: true, force: true });
    mkdirSync(join(work, 'src'), { recursive: true });

    // A page that computes the fingerprint and puts it in the DOM.
    writeFileSync(
      join(work, 'src', 'entry.ts'),
      [
        `import { computeFingerprint } from '@vhbs/sim-core';`,
        `document.body.textContent = computeFingerprint();`,
        `document.title = 'READY';`,
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(work, 'index.html'),
      `<!doctype html><meta charset="utf-8"><title>x</title><body style="white-space:pre"></body>` +
        `<script type="module" src="./src/entry.ts"></script>`,
      'utf8',
    );

    // Build it the way the shipped app is built, so the comparison covers the
    // bundler and its transforms too, not just the source.
    // Invoke Vite's JS entry with the current Node rather than going through
    // the npx shim: spawning a .cmd wrapper fails with EINVAL on Windows.
    const viteBin = join(uiRoot, '..', '..', 'node_modules', 'vite', 'bin', 'vite.js');
    execFileSync(
      process.execPath,
      [viteBin, 'build', work, '--outDir', join(work, 'dist'), '--emptyOutDir', '--logLevel', 'error'],
      { cwd: uiRoot, stdio: 'pipe' },
    );

    const dist = join(work, 'dist');
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    const server = createServer((req, res) => {
      // Read BEFORE writing headers: a throw after writeHead produces
      // ERR_HTTP_HEADERS_SENT and masks the real 404.
      let body;
      let file;
      try {
        const url = (req.url ?? '/').split('?')[0];
        file = join(dist, url === '/' ? 'index.html' : decodeURIComponent(url));
        body = readFileSync(file);
      } catch {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    });

    const port = await new Promise((resolve) => {
      server.listen(0, () => resolve(server.address().port));
    });

    try {
      const dom = await new Promise((resolve, reject) => {
        const proc = spawn(
          chrome,
          [
            '--headless=new',
            '--disable-gpu',
            '--no-sandbox',
            '--dump-dom',
            '--virtual-time-budget=20000',
            `http://127.0.0.1:${port}/`,
          ],
          { stdio: ['ignore', 'pipe', 'ignore'] },
        );
        let out = '';
        proc.stdout.on('data', (d) => (out += d));
        proc.on('error', reject);
        proc.on('close', () => resolve(out));
      });

      const match = dom.match(/<body[^>]*>([\s\S]*?)<\/body>/);
      assert.ok(match, 'could not read the fingerprint out of the rendered page');

      const browser = match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\r/g, '')
        .trim();

      assert.ok(
        browser.startsWith('version='),
        `the page did not produce a fingerprint. First 200 chars:\n${browser.slice(0, 200)}`,
      );

      const golden = readFileSync(goldenPath, 'utf8').trimEnd();

      if (browser !== golden) {
        const b = browser.split('\n');
        const g = golden.split('\n');
        const i = b.findIndex((line, idx) => line !== g[idx]);
        assert.fail(
          `Browser and Node disagree at line ${i + 1}. Replays are NOT portable.\n` +
            `  node:    ${g[i]?.slice(0, 160)}\n` +
            `  browser: ${b[i]?.slice(0, 160)}`,
        );
      }
    } finally {
      server.close();
      rmSync(work, { recursive: true, force: true });
    }
  },
);
