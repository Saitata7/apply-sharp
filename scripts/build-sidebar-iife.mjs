/**
 * Build the sidebar as a self-contained IIFE bundle for LinkedIn injection.
 *
 * Why this exists: ApplySharp does NOT register a content script for
 * linkedin.com in manifest.json (per the Apr 2026 fingerprint commit
 * 25d9ba2). The legacy content script bundle (built by crxjs/Vite) uses
 * a loader pattern that does `await import(chrome.runtime.getURL(...))`,
 * which requires the bundled chunk to be in web_accessible_resources
 * matched for the host. Adding LinkedIn to WAR would re-leak the
 * fingerprint surface for default-install users.
 *
 * Solution: bundle src/content/index.ts as a SELF-CONTAINED IIFE here
 * (using esbuild directly, bypassing crxjs's loader pattern). The output
 * has no dynamic imports, no module imports, just a single IIFE that
 * can be injected via chrome.scripting.executeScript({ files: [...] })
 * on user-opt-in only. Default-install users still have ZERO LinkedIn
 * surface; only opted-in users get the bundle injected.
 *
 * Output: dist/assets/sidebar-iife.js (stable filename, no hash)
 *
 * Run as part of `npm run build` after the main Vite build.
 */

import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Mirror the path aliases from vite.config.ts so the bundler can resolve
// @core, @storage, @ai, @shared the same way the rest of the codebase
// does. esbuild doesn't read tsconfig.json paths, so we configure
// explicitly via alias.
const alias = {
  '@': resolve(root, 'src'),
  '@core': resolve(root, 'src/core'),
  '@storage': resolve(root, 'src/storage'),
  '@ai': resolve(root, 'src/ai'),
  '@shared': resolve(root, 'src/shared'),
};

// Ensure dist/assets exists (the main Vite build creates it, but we want
// this script to also work standalone for debugging).
const outDir = resolve(root, 'dist', 'assets');
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

console.log('[build-sidebar-iife] Bundling src/content/index.ts as IIFE...');

try {
  const result = await build({
    entryPoints: [resolve(root, 'src/content/index.ts')],
    outfile: resolve(outDir, 'sidebar-iife.js'),
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: true,
    sourcemap: false,
    platform: 'browser',
    // CRITICAL: no dynamic imports, no code splitting. Single self-contained
    // IIFE so chrome.scripting.executeScript({files}) can run it directly
    // in the page's isolated world without needing web_accessible_resources.
    splitting: false,
    metafile: true,
    alias,
    // Inline any tiny dependencies. Tree-shake the rest.
    treeShaking: true,
    // Suppress warnings for unused imports etc - the source is shared
    // with the main content script bundle and we don't want to fail the
    // build on warnings that don't affect the LinkedIn output.
    logLevel: 'warning',
    // Mark chrome.* APIs as external "globals" so they aren't bundled
    // (they're provided by the extension runtime in the isolated world).
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });

  const out = result.metafile?.outputs[`dist/assets/sidebar-iife.js`];
  if (out) {
    const sizeKB = (out.bytes / 1024).toFixed(1);
    console.log(`[build-sidebar-iife] OK - dist/assets/sidebar-iife.js (${sizeKB} KB)`);
  } else {
    console.log('[build-sidebar-iife] OK - dist/assets/sidebar-iife.js');
  }
} catch (err) {
  console.error('[build-sidebar-iife] FAILED:', err);
  process.exit(1);
}
