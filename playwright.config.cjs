/**
 * Playwright config (CommonJS).
 *
 * Written as .cjs to avoid Playwright's ESM TypeScript loader, which on
 * Node 20.5 trips over a Node 18.19+ requirement message even though we
 * are well above the minimum. The .cjs path uses require() and bypasses
 * the loader entirely.
 *
 * Loads the built dist/ folder as an unpacked Chrome extension and runs
 * the spec against synthesized ATS form fixtures intercepted via
 * page.route. This verifies the actual built extension boots, the v2
 * content script registers on the target hosts, the autofill pill mounts,
 * and the LinkedIn safety guarantee holds at runtime in a real Chromium.
 *
 * Run: npm run e2e
 *
 * Prereqs:
 *   - npm run build (must produce dist/manifest.json)
 *   - npx playwright install chromium (one time, ~270 MB)
 */

const { defineConfig } = require('@playwright/test');
const { resolve } = require('node:path');

module.exports = defineConfig({
  testDir: './tests/e2e',
  // Match .cjs spec files (the project is "type": "module" in package.json,
  // so .js files are treated as ESM and Playwright's TS loader trips on
  // Node 20.5; .cjs sidesteps both issues).
  testMatch: '**/*.spec.cjs',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
    baseURL: 'https://wellfound.com',
  },
  globalSetup: resolve(__dirname, 'tests/e2e/global-setup.cjs'),
});
