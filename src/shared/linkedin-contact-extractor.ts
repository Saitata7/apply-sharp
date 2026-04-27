/**
 * Self-contained LinkedIn CONTACT extractor (WS10.5).
 *
 * Runs in the LinkedIn page via chrome.scripting.executeScript on user
 * click only. Cannot reference outer-scope imports or module-level state -
 * everything must be inlined inside the function body because Chrome
 * serializes only the function body when injecting it into the page's
 * isolated world.
 *
 * Lives in src/shared/ so both the popup AND the side panel can import
 * the same extractor without duplicating ~150 LOC. Both call sites pass
 * the function reference to chrome.scripting.executeScript({ func, args });
 * the import path does not affect the serialized body.
 *
 * Strategy:
 *   - Profile pages (/in/{username}): pull name + headline + visible email
 *   - Job pages   (/jobs/view/...):  pull recruiter card if present + any
 *                                    visible @-anchored emails in the JD
 *   - Skip personal webmail domains and noreply addresses (the dedupe pass
 *     in the background does the same, but skipping early avoids noisy
 *     SAVE_CONTACTS messages)
 */

export interface LinkedInContactExtraction {
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  emailKind?: 'personal' | 'role' | 'noreply';
  sourceUrl: string;
}

/**
 * Extractor function. Pass this directly to chrome.scripting.executeScript
 * via the `func` option. Returns LinkedInContactExtraction[] when run on a
 * LinkedIn profile or job page; returns [] on any other URL.
 */
export function extractLinkedInContactInPage(): LinkedInContactExtraction[] {
  const url = window.location.href;
  const out: Array<{
    name?: string;
    title?: string;
    company?: string;
    email?: string;
    emailKind?: 'personal' | 'role' | 'noreply';
    sourceUrl: string;
  }> = [];

  // Inline minimal email regex (RFC-ish, bounded to prevent ReDoS).
  const EMAIL_RE =
    /\b[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9-]{1,63}(?:\.[a-zA-Z0-9-]{1,63}){0,4}\.[a-zA-Z]{2,24}\b/g;
  const PERSONAL_WEBMAIL = new Set([
    'gmail.com',
    'googlemail.com',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'yahoo.com',
    'proton.me',
    'protonmail.com',
    'icloud.com',
    'me.com',
    'aol.com',
  ]);
  const ROLE_LOCAL_PARTS = new Set([
    'info',
    'careers',
    'hiring',
    'jobs',
    'recruiting',
    'recruiter',
    'hello',
    'contact',
    'team',
    'people',
    'talent',
    'hr',
  ]);
  const NOREPLY_LOCAL_PARTS = new Set([
    'noreply',
    'no-reply',
    'donotreply',
    'do-not-reply',
    'mailer-daemon',
    'postmaster',
    'support',
  ]);

  function classifyEmail(email: string): {
    kind: 'personal' | 'role' | 'noreply';
    isWebmail: boolean;
  } {
    const [local, domain] = email.toLowerCase().split('@');
    const isWebmail = PERSONAL_WEBMAIL.has(domain || '');
    if (NOREPLY_LOCAL_PARTS.has(local)) return { kind: 'noreply', isWebmail };
    if (ROLE_LOCAL_PARTS.has(local)) return { kind: 'role', isWebmail };
    return { kind: 'personal', isWebmail };
  }

  function readFirst(selectors: string[]): string {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim();
      if (text) return text;
    }
    return '';
  }

  function harvestEmails(scope: Element | Document): string[] {
    const text = (scope.textContent || '').slice(0, 200_000);
    const seen = new Set<string>();
    const found: string[] = [];
    for (const m of text.matchAll(EMAIL_RE)) {
      const e = m[0].toLowerCase();
      if (seen.has(e)) continue;
      seen.add(e);
      found.push(e);
    }
    return found;
  }

  // ── Profile page (/in/{username}) ────────────────────────────────────
  if (/linkedin\.com\/in\//.test(url)) {
    const name = readFirst(['h1.text-heading-xlarge', 'h1.inline.t-24', 'main h1']);
    const headline = readFirst([
      '.text-body-medium.break-words',
      '.pv-text-details__left-panel .text-body-medium',
      'main .text-body-medium',
    ]);
    // LinkedIn shows the company in the experience section's first item
    const company = readFirst([
      '.pv-text-details__right-panel-item-text',
      '[data-field="experience_company_logo"] + div',
    ]);

    const emails = harvestEmails(document.body);
    if (emails.length === 0) {
      // No email visible (most LinkedIn profiles hide it). Still emit a
      // partial contact - the dedupe key falls back to name+company.
      if (name) {
        out.push({
          name,
          title: headline || undefined,
          company: company || undefined,
          sourceUrl: url,
        });
      }
    } else {
      for (const email of emails) {
        const { kind, isWebmail } = classifyEmail(email);
        if (isWebmail) continue; // skip personal webmail
        out.push({
          name: name || undefined,
          title: headline || undefined,
          company: company || undefined,
          email,
          emailKind: kind,
          sourceUrl: url,
        });
      }
    }
    return out;
  }

  // ── Job page (/jobs/view/... or /jobs/collections/...) ───────────────
  if (/linkedin\.com\/jobs\/(view|search|collections)/.test(url)) {
    const recruiterName = readFirst([
      '.hirer-card__hirer-information a',
      '.jobs-poster__name',
      '[data-test-job-poster-name]',
    ]);
    const recruiterTitle = readFirst([
      '.hirer-card__hirer-information .t-14',
      '.jobs-poster__subtitle',
    ]);
    const company = readFirst([
      '.job-details-jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name a',
    ]);

    const jdScope =
      document.querySelector('.jobs-description__content') ||
      document.querySelector('#job-details') ||
      document.body;
    const emails = harvestEmails(jdScope);

    if (recruiterName) {
      out.push({
        name: recruiterName,
        title: recruiterTitle || undefined,
        company: company || undefined,
        sourceUrl: url,
      });
    }

    for (const email of emails) {
      const { kind, isWebmail } = classifyEmail(email);
      if (isWebmail) continue;
      out.push({
        company: company || undefined,
        email,
        emailKind: kind,
        sourceUrl: url,
      });
    }
    return out;
  }

  // Other LinkedIn pages: not supported
  return [];
}
