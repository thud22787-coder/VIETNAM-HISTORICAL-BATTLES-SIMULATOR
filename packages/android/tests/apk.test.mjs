/**
 * The Android APK must ship exactly the same application code as desktop.
 *
 * §48 requires shared game logic rather than duplicated logic, and the
 * determinism guarantee only means something across platforms if the platforms
 * are running identical bytes. This checks that directly: the bundle inside the
 * built APK must be byte-for-byte the file the desktop shell loads.
 *
 * Skips when no APK has been built, since building one needs an Android SDK.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const apk = join(here, '..', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const distDir = join(repoRoot, 'packages', 'game-ui', 'dist', 'assets');

const skip = !existsSync(apk)
  ? 'no APK built — run: npm run build:apk -w @vhbs/android'
  : !existsSync(distDir)
    ? 'UI not built'
    : false;

/** Read one entry out of a zip without a dependency, via Node's zlib. */
function readZipEntry(zipPath, wanted) {
  // Use Python if available (present on this machine and in most CI images);
  // otherwise the test skips rather than pulling in a zip library.
  const script =
    `import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);` +
    `sys.stdout.buffer.write(z.read(sys.argv[2]))`;
  return execFileSync('python', ['-c', script, zipPath, wanted], {
    maxBuffer: 32 * 1024 * 1024,
  });
}

test('the APK ships the same bundle the desktop shell loads', { skip }, () => {
  const bundleName = readdirSync(distDir).find((f) => f.endsWith('.js'));
  assert.ok(bundleName, 'no JS bundle found in the built UI');

  let inApk;
  try {
    inApk = readZipEntry(apk, `assets/public/assets/${bundleName}`);
  } catch (err) {
    // A stale APK predating the current build is a real signal, not a skip.
    assert.fail(
      `could not read assets/public/assets/${bundleName} from the APK. ` +
        `It is probably stale — rebuild with: npm run build:apk -w @vhbs/android\n${err}`,
    );
  }

  const onDisk = readFileSync(join(distDir, bundleName));
  const sha = (b) => createHash('sha256').update(b).digest('hex');

  assert.equal(
    sha(inApk),
    sha(onDisk),
    'the APK and desktop bundles differ — the platforms are not running the same code',
  );
});

test('the APK is a structurally valid Android package', { skip }, () => {
  const script =
    `import zipfile,sys;n=zipfile.ZipFile(sys.argv[1]).namelist();` +
    `print('AndroidManifest.xml' in n, any(x.endswith('.dex') for x in n))`;
  const out = execFileSync('python', ['-c', script, apk], { encoding: 'utf8' }).trim();
  assert.equal(out, 'True True', `APK is missing a manifest or dex bytecode: ${out}`);
});
