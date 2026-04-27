/**
 * Per-platform extension load tests.
 *
 * Verifies the v2 autofill content script registers and mounts the pill on
 * each of the supported ATS hosts in src/manifest.json. The wellfound case
 * is also covered in extension.spec.cjs but kept here for symmetry; this
 * file is the canonical "all platforms" smoke matrix.
 *
 * Each platform uses the same generic ATS form fixture intercepted via
 * context.route, so the test proves the extension loads on each host
 * pattern, the content script registers, the gating allows the host, the
 * mutation watcher fires, and the Shadow DOM pill mounts. Per-platform
 * DOM-quirk handling (Workday's per-step rerender, Wellfound's modal
 * mount delay, Ashby's combobox) is exercised by the unit serializer
 * tests, which is the appropriate level for those.
 */

const { test, expect, chromium } = require('@playwright/test');
const { resolve } = require('node:path');
const { readFileSync } = require('node:fs');

const EXTENSION_PATH = resolve(__dirname, '../..', 'dist');
const FIXTURE_HTML = readFileSync(
  resolve(__dirname, 'fixtures/generic-ats-apply.html'),
  'utf-8'
);

/** Each entry is one supported ATS host. The route pattern intercepts
 *  every URL on that host and serves the same fixture form. */
const PLATFORMS = [
  { name: 'wellfound', host: 'wellfound.com', url: 'https://wellfound.com/jobs/12345' },
  { name: 'workatastartup', host: 'workatastartup.com', url: 'https://workatastartup.com/jobs/12345/apply' },
  { name: 'himalayas', host: 'himalayas.app', url: 'https://himalayas.app/jobs/acme-ai-engineer' },
  { name: 'greenhouse', host: 'greenhouse.io', url: 'https://boards.greenhouse.io/acme/jobs/12345' },
  { name: 'lever', host: 'lever.co', url: 'https://jobs.lever.co/acme/abc-def/apply' },
  { name: 'ashby', host: 'ashbyhq.com', url: 'https://jobs.ashbyhq.com/acme/abc-def/application' },
  { name: 'smartrecruiters', host: 'smartrecruiters.com', url: 'https://jobs.smartrecruiters.com/Acme/12345' },
  { name: 'workable', host: 'workable.com', url: 'https://apply.workable.com/acme/j/abc/apply/' },
  { name: 'workday', host: 'myworkdayjobs.com', url: 'https://acme.wd1.myworkdayjobs.com/en-US/careers/job/12345/apply' },
];

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

  // Intercept every supported host and serve the same fixture HTML.
  for (const p of PLATFORMS) {
    await context.route(`https://**/*${p.host}/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: FIXTURE_HTML,
      });
    });
  }
});

test.afterAll(async () => {
  await context?.close();
});

for (const platform of PLATFORMS) {
  test(`v2 pill mounts on ${platform.name} (${platform.host})`, async () => {
    const page = await context.newPage();
    await page.goto(platform.url);
    await page.waitForLoadState('domcontentloaded');

    // Allow up to 5 seconds for the bootstrap → mutation observer →
    // findBestForm → gating → mountPill chain to complete.
    const pillHost = page.locator('#__applysharp_autofill_pill_host');
    await expect(pillHost).toBeAttached({ timeout: 5000 });

    // The Autofill button is rendered inside the Shadow DOM.
    const pillButton = page.locator('#__applysharp_autofill_pill_host >> css=.go');
    await expect(pillButton).toBeVisible({ timeout: 2000 });
    await expect(pillButton).toContainText('Autofill');

    await page.close();
  });
}
