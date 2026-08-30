/**
 * The desktop shell must actually launch and load the game.
 *
 * This is the test that would have caught the packaging bug it was written
 * after: Vite defaulted to absolute asset paths (`/assets/...`), which resolve
 * to the filesystem root under `file://`. Every browser test passed, because a
 * dev server happily serves absolute paths — but the desktop app rendered an
 * empty shell. Only launching it revealed that.
 *
 * Skips (visibly) when Electron is not installed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const electronBin = join(
  repoRoot,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
);
const uiBuilt = existsSync(join(repoRoot, 'packages', 'game-ui', 'dist', 'index.html'));

const skip = !existsSync(electronBin)
  ? 'Electron not installed'
  : !uiBuilt
    ? 'UI not built — run: npm run build -w @vhbs/game-ui'
    : false;

test('the desktop shell launches and renders the game', { skip }, () => {
  // Claude Code and other Electron hosts set ELECTRON_RUN_AS_NODE=1, which
  // makes the binary behave as plain Node and silently skip the app entirely.
  const env = { ...process.env };
  delete env['ELECTRON_RUN_AS_NODE'];

  const out = execFileSync(electronBin, [join(here, 'fixture')], {
    env,
    encoding: 'utf8',
    timeout: 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert.match(out, /SMOKE-BRIEF:.+/, 'the briefing title did not render');
  assert.match(out, /SMOKE-BATTLES:true/, 'the battle list did not render both battles');
  assert.match(out, /SMOKE-ERRORS:none/, `console errors in the desktop window:\n${out}`);
  assert.match(out, /SMOKE-PASS/, `desktop smoke test failed:\n${out}`);
});

test('the built UI uses relative asset paths', { skip: uiBuilt ? false : 'UI not built' }, async () => {
  // The root cause of the bug above, asserted directly so a config regression
  // fails fast rather than waiting for the slower Electron launch.
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(join(repoRoot, 'packages', 'game-ui', 'dist', 'index.html'), 'utf8');

  const srcs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  const absolute = srcs.filter((s) => s.startsWith('/'));

  assert.deepEqual(
    absolute,
    [],
    `absolute asset paths break file:// loading in the desktop and Android shells: ${absolute.join(', ')}`,
  );
});
