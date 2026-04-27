/**
 * Global setup for Playwright extension tests (CommonJS).
 *
 * Verifies that npm run build has been run and dist/manifest.json exists.
 * Without this, the extension load tests would fail with a confusing
 * "extension does not exist" error from Chromium.
 */

const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { execSync } = require('node:child_process');

module.exports = async function globalSetup() {
  const distManifest = resolve(__dirname, '../..', 'dist/manifest.json');
  if (!existsSync(distManifest)) {
    console.log('[e2e setup] dist/manifest.json missing, running npm run build...');
    execSync('npm run build', { stdio: 'inherit', cwd: resolve(__dirname, '../..') });
  }
  if (!existsSync(distManifest)) {
    throw new Error(
      'Extension build did not produce dist/manifest.json. Run "npm run build" manually and inspect the output.'
    );
  }
  console.log('[e2e setup] dist/manifest.json present, ready to run extension tests');
};
