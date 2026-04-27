/**
 * Per-platform confirmation page detection rules.
 *
 * Used by the Tier-2 passive submission watcher: when a user navigates to a
 * confirmation page on Wellfound / Greenhouse / Lever / Workday / Ashby /
 * SmartRecruiters / Workable, the watcher matches against the rule for the
 * current host and fires APPLICATION_SUBMIT_DETECTED with the matched signal.
 *
 * Each rule has:
 *   - hostPatterns: which hostnames it applies to
 *   - urlPatterns:  optional URL substring matchers (cheap, fast)
 *   - textPatterns: text content matchers (slow, only run if URL hints match
 *                   or no URL patterns are configured)
 *   - containerSelectors: optional CSS selectors to scope the MutationObserver
 *                         (avoids scanning the whole page on every mutation)
 */

import type { ApplicationSource } from '@shared/types/application.types';

export interface ConfirmationRule {
  platform: ApplicationSource;
  hostPatterns: RegExp[];
  urlPatterns?: RegExp[];
  textPatterns: RegExp[];
  containerSelectors?: string[];
}

export const CONFIRMATION_RULES: ConfirmationRule[] = [
  {
    platform: 'wellfound',
    hostPatterns: [/wellfound\.com/],
    textPatterns: [
      /(?:we['']?ve|we have) sent your application/i,
      /application sent/i,
      /thanks for applying/i,
    ],
    containerSelectors: ['[data-test="ApplyModal"]', 'div[role="dialog"]', 'main'],
  },
  {
    platform: 'workatastartup',
    hostPatterns: [/workatastartup\.com/],
    urlPatterns: [/\/jobs\/.+\/apply/],
    textPatterns: [/your application (?:has been )?submitted/i, /thanks for applying/i],
    containerSelectors: ['main', '#root'],
  },
  {
    platform: 'greenhouse',
    hostPatterns: [/boards\.greenhouse\.io/, /greenhouse\.io/],
    urlPatterns: [/confirmation/i, /thank/i],
    textPatterns: [/thank you for applying/i, /application (?:has been )?submitted/i],
    containerSelectors: ['#main', '.application-confirmation', 'main'],
  },
  {
    platform: 'lever',
    hostPatterns: [/jobs\.lever\.co/],
    urlPatterns: [/\/apply\/(thanks|confirmation|complete)/i],
    textPatterns: [/application submitted/i, /thanks for applying/i, /you['']?re all set/i],
    containerSelectors: ['.content-wrapper', '.posting-page'],
  },
  {
    platform: 'workday',
    hostPatterns: [/myworkdayjobs\.com/, /workday\.com/],
    textPatterns: [
      /you have submitted your application/i,
      /application submitted/i,
      /your application has been received/i,
    ],
    containerSelectors: [
      '[data-automation-id="applicationSubmitted"]',
      '[data-automation-id="applySuccess"]',
      'main',
    ],
  },
  {
    platform: 'ashby',
    hostPatterns: [/jobs\.ashbyhq\.com/, /ashbyhq\.com/],
    textPatterns: [
      /application received/i,
      /application submitted/i,
      /thanks for applying/i,
      /we['']?ve received your application/i,
    ],
    containerSelectors: ['[class*="_postApplication"]', '[class*="_thankYou"]', 'main'],
  },
  {
    platform: 'smartrecruiters',
    hostPatterns: [/smartrecruiters\.com/, /jobs\.smartrecruiters\.com/],
    textPatterns: [
      /application submitted/i,
      /thanks for applying/i,
      /thank you for your application/i,
    ],
    containerSelectors: ['main', '.thank-you', '[class*="confirmation"]'],
  },
  {
    platform: 'workable',
    hostPatterns: [/workable\.com/, /apply\.workable\.com/],
    textPatterns: [
      /application (?:has been )?submitted/i,
      /thanks for applying/i,
      /thank you for applying/i,
    ],
    containerSelectors: ['main', '.application-success'],
  },
  // Generic fallback. Only fires when no specific rule matched but we are on
  // a confirmation-shaped URL on any host.
  {
    platform: 'other',
    hostPatterns: [/.*/],
    urlPatterns: [/confirmation/i, /thank[-_]?you/i, /submitted/i, /\/success\b/i],
    textPatterns: [/thank you/i, /application (?:submitted|received|sent)/i],
  },
];

export interface ConfirmationMatch {
  platform: ApplicationSource;
  signal: string;
  rule: ConfirmationRule;
}

/**
 * Test the current location and DOM against the rule table. Returns the
 * first matching rule, or null. Pure function: no side effects, easy to
 * unit test against html fixtures + a fake URL.
 */
export function matchConfirmationRule(
  location: { hostname: string; pathname: string; href: string },
  doc: { body?: { innerText?: string } } | Document
): ConfirmationMatch | null {
  const text =
    (doc as Document).body?.innerText ??
    (doc as { body?: { innerText?: string } }).body?.innerText ??
    '';

  for (const rule of CONFIRMATION_RULES) {
    if (!rule.hostPatterns.some((rx) => rx.test(location.hostname))) continue;

    let urlOk = true;
    if (rule.urlPatterns && rule.urlPatterns.length > 0) {
      urlOk = rule.urlPatterns.some((rx) => rx.test(location.href) || rx.test(location.pathname));
    }

    if (!urlOk) continue;

    for (const tp of rule.textPatterns) {
      const m = tp.exec(text);
      if (m) {
        return { platform: rule.platform, signal: m[0], rule };
      }
    }
  }

  return null;
}
