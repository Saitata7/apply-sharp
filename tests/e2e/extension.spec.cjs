/**
 * End-to-end extension load test (CommonJS).
 *
 * Loads dist/ as an unpacked Chrome extension and verifies the autofill v2
 * stack actually boots in a real Chromium:
 *
 *   1. The extension loads with no console errors during init
 *   2. Navigating to a wellfound.com URL (intercepted via page.route so the
 *      real Wellfound is never hit) causes the in-page autofill pill to
 *      mount inside a Shadow DOM
 *   3. The pill exposes the expected primary action button
 *   4. The LinkedIn safety guarantee holds at runtime: navigating to a
 *      linkedin.com URL does NOT mount the pill
 *
 * Why this matters: the jsdom unit tests verify each module in isolation.
 * Only a real Chromium with the unpacked extension can verify that the
 * service worker boots, the content script registers correctly under the
 * crxjs build output, the message routing wires up, and the Shadow DOM
 * pill renders without being clobbered by host page CSS.
 *
 * The test does NOT call the real AI provider. The Autofill button is
 * verified to exist and be wired, but the click flow is not exercised
 * because the test environment has no API key. The keyboard shortcut hook
 * is verified to dispatch without throwing.
 *
 * Written as .js with require() (not .ts) to avoid Playwright's experimental
 * TypeScript ESM loader, which trips on Node 20.5 even though we exceed the
 * 18.19 minimum.
 */

const { test, expect, chromium } = require('@playwright/test');
const { resolve } = require('node:path');
const { readFileSync } = require('node:fs');

const EXTENSION_PATH = resolve(__dirname, '../..', 'dist');
const FIXTURE_HTML = readFileSync(
  resolve(__dirname, 'fixtures/wellfound-apply.html'),
  'utf-8'
);

let context;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: true,
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  });

  await context.route('https://wellfound.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: FIXTURE_HTML,
    });
  });

  await context.route('https://www.linkedin.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body:
        '<!doctype html><html><body><h1>LinkedIn job page (stubbed)</h1>' +
        '<form><input/><input/><input/></form></body></html>',
    });
  });
});

test.afterAll(async () => {
  await context?.close();
});

test('extension loads with no console errors during init', async () => {
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('https://wellfound.com/jobs/12345');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(800);

  const extensionErrors = errors.filter(
    (e) =>
      !e.includes('net::ERR') &&
      !e.includes('Content Security Policy') &&
      !e.includes('Failed to fetch')
  );

  if (extensionErrors.length > 0) {
    console.error('[e2e] Extension reported errors:', extensionErrors);
  }
  expect(extensionErrors).toEqual([]);
  await page.close();
});

test('autofill v2 pill mounts on a wellfound apply page', async () => {
  const page = await context.newPage();
  await page.goto('https://wellfound.com/jobs/12345');
  await page.waitForLoadState('domcontentloaded');

  const pillHost = page.locator('#__applysharp_autofill_pill_host');
  await expect(pillHost).toBeAttached({ timeout: 5000 });

  // The pill renders inside a Shadow DOM, query through it.
  const pillButton = page.locator('#__applysharp_autofill_pill_host >> css=.go');
  await expect(pillButton).toBeVisible({ timeout: 2000 });
  await expect(pillButton).toContainText('Autofill');

  // The dismiss button (24h hide) should also be present.
  const closeButton = page.locator('#__applysharp_autofill_pill_host >> css=.close');
  await expect(closeButton).toBeAttached();

  await page.close();
});

test('pill does NOT mount on linkedin.com (P0 safety verified at runtime)', async () => {
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/jobs/view/12345');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(800);

  const pillHost = page.locator('#__applysharp_autofill_pill_host');
  await expect(pillHost).toHaveCount(0);

  // Defense in depth: the legacy applysharp-overlay sidebar from the v1
  // path should also be absent on LinkedIn (the gating in src/content/
  // index.ts skips it).
  const overlay = page.locator('#applysharp-overlay');
  await expect(overlay).toHaveCount(0);

  await page.close();
});

test('cmd+shift+f keyboard shortcut dispatches without error', async () => {
  const page = await context.newPage();
  await page.goto('https://wellfound.com/jobs/12345');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);

  let pageError = null;
  page.on('pageerror', (e) => (pageError = e.message));

  await page.keyboard.press('Control+Shift+F');
  await page.waitForTimeout(300);
  expect(pageError).toBe(null);

  await page.close();
});
