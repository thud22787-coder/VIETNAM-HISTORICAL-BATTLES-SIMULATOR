/**
 * Copy the built web UI into the Capacitor web directory.
 *
 * Capacitor expects a `webDir` it can package. Rather than building the UI a
 * second time with different settings, we copy the same artefact the desktop
 * shell uses — so all three platforms ship byte-identical application code,
 * which is what makes the shared-determinism guarantee meaningful (§48).
 */
import { cpSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'game-ui', 'dist');
const dest = join(here, '..', 'www');

if (!existsSync(src)) {
  console.error(`Built UI not found at ${src}. Run: npm run build -w @vhbs/game-ui`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Copied ${src} -> ${dest}`);
