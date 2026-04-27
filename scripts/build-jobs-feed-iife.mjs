/**
 * Build the LinkedIn jobs-feed signal script as a self-contained IIFE.
 *
 * Why: src/content/linkedin/jobs-feed-iife.ts must be injected on
 * linkedin.com only when the feature flag linkedin.jobsFeedSignals is on.
 * Adding linkedin.com to manifest content_scripts.matches would expose the
 * fingerprint surface for ALL users, including default-install. Bundling
 * the script as a single IIFE that has no dynamic imports lets us inject
 * via chrome.scripting.executeScript({files}) without web_accessible_resources.
 *
 * Mirrors scripts/build-sidebar-iife.mjs intentionally so the LinkedIn
 * surface stays one bundling pattern across features.
 *
 * Output: dist/assets/jobs-feed-iife.js (stable filename, no hash).
 */

import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const alias = {
  '@': resolve(root, 'src'),
  '@core': resolve(root, 'src/core'),
  '@storage': resolve(root, 'src/storage'),
  '@ai': resolve(root, 'src/ai'),
  '@shared': resolve(root, 'src/shared'),
};

const outDir = resolve(root, 'dist', 'assets');
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

console.log('[build-jobs-feed-iife] Bundling src/content/linkedin/jobs-feed-iife.ts as IIFE...');

try {
  const result = await build({
    entryPoints: [resolve(root, 'src/content/linkedin/jobs-feed-iife.ts')],
    outfile: resolve(outDir, 'jobs-feed-iife.js'),
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: true,
    sourcemap: false,
    platform: 'browser',
    splitting: false,
    metafile: true,
    alias,
    treeShaking: true,
    logLevel: 'warning',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });

  const out = result.metafile?.outputs[`dist/assets/jobs-feed-iife.js`];
  if (out) {
    const sizeKB = (out.bytes / 1024).toFixed(1);
    console.log(`[build-jobs-feed-iife] OK - dist/assets/jobs-feed-iife.js (${sizeKB} KB)`);
  } else {
    console.log('[build-jobs-feed-iife] OK - dist/assets/jobs-feed-iife.js');
  }
} catch (err) {
  console.error('[build-jobs-feed-iife] FAILED:', err);
  process.exit(1);
}
