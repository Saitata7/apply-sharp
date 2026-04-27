/**
 * Self-contained LinkedIn JOB extractor.
 *
 * Runs via chrome.scripting.executeScript({ func, args }) inside the
 * LinkedIn page's isolated world. Cannot reference imports or outer-scope
 * variables - everything must be inlined inside the function body because
 * Chrome serializes ONLY the function body when injecting it.
 *
 * Lives in src/shared/ so the popup, the background tab.onUpdated
 * listener, and any future caller can all import the same function. The
 * import path is irrelevant to chrome.scripting; only the function body
 * crosses the page boundary.
 *
 * Why this exists: ApplySharp deliberately does NOT register a content
 * script on linkedin.com to avoid LinkedIn's BrowserGate / Spectroscopy
 * extension fingerprinter (Feb 2026 onwards). Click-driven and tab-event
 * extraction via activeTab + chrome.scripting is the standard "minimum
 * surface" pattern (1Password, Bitwarden, and others use the same).
 */

export interface LinkedInJobExtraction {
  title: string;
  company: string;
  location: string;
  description: string;
  jobId: string;
  url: string;
}

/**
 * Extractor function. Pass this directly to chrome.scripting.executeScript
 * via the `func` option. Returns LinkedInJobExtraction when run on a
 * LinkedIn job page; returns null on any other URL or when the page does
 * not have a job rendered yet (the user is on /jobs/search/ with no
 * currentJobId, for example).
 */
export function extractLinkedInJobInPage(): LinkedInJobExtraction | null {
  const url = window.location.href;
  const isJobUrl = /linkedin\.com\/jobs\/(view|search|collections)/.test(url);
  if (!isJobUrl) return null;

  const titleSelectors = [
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title',
    '.t-24.job-details-jobs-unified-top-card__job-title',
    'h1.t-24',
    '[data-test-job-title]',
  ];
  const companySelectors = [
    '.job-details-jobs-unified-top-card__company-name a',
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name a',
    '.jobs-unified-top-card__company-name',
    '[data-test-job-company-name]',
  ];
  const locationSelectors = [
    '.job-details-jobs-unified-top-card__primary-description-container',
    '.jobs-unified-top-card__primary-description',
    '.jobs-unified-top-card__bullet',
  ];
  const descriptionSelectors = [
    '.jobs-description__content .jobs-box__html-content',
    '.jobs-description-content__text',
    '.jobs-description__content',
    '#job-details',
  ];

  const readFirst = (selectors: string[]): string => {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim();
      if (text) return text;
    }
    return '';
  };

  const title = readFirst(titleSelectors);
  const company = readFirst(companySelectors);
  const location = readFirst(locationSelectors);
  const description = readFirst(descriptionSelectors);

  if (!title || !description) return null;

  const idMatch = url.match(/jobs\/view\/(\d+)/);
  const queryParam = new URL(url).searchParams.get('currentJobId');
  const jobId = idMatch ? `linkedin-${idMatch[1]}` : queryParam ? `linkedin-${queryParam}` : '';

  return { title, company, location, description, jobId, url };
}
