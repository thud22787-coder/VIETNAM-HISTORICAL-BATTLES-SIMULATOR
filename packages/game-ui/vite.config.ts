import { defineConfig } from 'vite';
export default defineConfig({
  // Relative asset paths, not absolute.
  //
  // The desktop shell loads the built UI over file:// and the Android shell
  // packages it locally. An absolute "/assets/..." src resolves to the
  // filesystem root there, so the bundle silently never loads and the page
  // renders as an empty shell. Launching the Electron app is what caught it --
  // every browser test passed, because a dev server happily serves /assets.
  base: './',
  server: { port: 5173 },
  build: { outDir: 'dist', target: 'es2022' },
});
