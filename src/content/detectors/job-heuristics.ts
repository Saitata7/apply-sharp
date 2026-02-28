/**
 * Job Page Heuristics
 *
 * Detects if a page is likely a job posting using various signals:
 * - Schema.org JobPosting structured data
 * - Apply buttons
 * - Job-related keywords in title/headers
 * - Common job page elements
 */

export interface JobPageSignals {
  isJobPage: boolean;
  confidence: number; // 0-100
  signals: string[];
  schemaData?: JobPostingSchema;
}

export interface JobPostingSchema {
  title?: string;
  description?: string;
  company?: string;
  location?: string;
  salary?: string;
  employmentType?: string;
  datePosted?: string;
}

/**
 * Detect if current page is a job posting
 */
export function detectJobPage(): JobPageSignals {
  const signals: string[] = [];
  let score = 0;

  // Signal 1: Schema.org JobPosting (strongest signal)
  const schemaData = extractSchemaJobPosting();
  if (schemaData) {
    signals.push('Schema.org JobPosting found');
    score += 50;
  }

  // Signal 2: URL patterns
  const url = window.location.href.toLowerCase();
  const urlPatterns = [
    { pattern: /\/jobs?\//, weight: 15 },
    { pattern: /\/careers?\//, weight: 15 },
    { pattern: /\/positions?\//, weight: 15 },
    { pattern: /\/openings?\//, weight: 15 },
    { pattern: /\/apply/, weight: 20 },
    { pattern: /jobid=|job_id=|positionid=/i, weight: 20 },
    { pattern: /\/job-|\/career-/, weight: 10 },
  ];

  for (const { pattern, weight } of urlPatterns) {
    if (pattern.test(url)) {
      signals.push(`URL pattern: ${pattern.source}`);
      score += weight;
      break; // Only count one URL signal
    }
  }

  // Signal 3: Apply button
  const applyButton = findApplyButton();
  if (applyButton) {
    signals.push('Apply button found');
    score += 25;
  }

  // Signal 4: Job title patterns in page title or h1
  const pageTitle = document.title.toLowerCase();
  const h1Text = document.querySelector('h1')?.textContent?.toLowerCase() || '';
  const titlePatterns = [
    /engineer/i,
    /developer/i,
    /designer/i,
    /manager/i,
    /analyst/i,
    /specialist/i,
    /coordinator/i,
    /director/i,
    /lead/i,
    /architect/i,
    /consultant/i,
    /administrator/i,
    /scientist/i,
    /researcher/i,
    /associate/i,
    /intern/i,
    /senior/i,
    /junior/i,
    /staff/i,
  ];

  for (const pattern of titlePatterns) {
    if (pattern.test(pageTitle) || pattern.test(h1Text)) {
      signals.push('Job title pattern in heading');
      score += 15;
      break;
    }
  }

  // Signal 5: Job-related sections
  const bodyText = document.body.innerText.toLowerCase();
  const sectionKeywords = [
    { keywords: ['requirements', 'qualifications', 'what you need'], weight: 10 },
    { keywords: ['responsibilities', "what you'll do", 'you will'], weight: 10 },
    { keywords: ['benefits', 'perks', 'what we offer'], weight: 5 },
    { keywords: ['about the role', 'about this position', 'job description'], weight: 10 },
    { keywords: ['years of experience', 'years experience'], weight: 10 },
  ];

  for (const { keywords, weight } of sectionKeywords) {
    if (keywords.some((kw) => bodyText.includes(kw))) {
      signals.push(`Section keyword found: ${keywords[0]}`);
      score += weight;
    }
  }

  // Signal 6: Company name pattern (e.g., "at Company" or "Company is hiring")
  const companyPatterns = [
    /join\s+(our|the)\s+team/i,
    /we('re| are)\s+(hiring|looking)/i,
    /about\s+(the\s+)?company/i,
    /who\s+we\s+are/i,
  ];

  for (const pattern of companyPatterns) {
    if (pattern.test(bodyText)) {
      signals.push('Company hiring pattern found');
      score += 5;
      break;
    }
  }

  // Cap the score at 100
  const confidence = Math.min(score, 100);

  return {
    isJobPage: confidence >= 40, // Threshold for considering it a job page
    confidence,
    signals,
    schemaData: schemaData || undefined,
  };
}

/**
 * Extract Schema.org JobPosting structured data
 */
function extractSchemaJobPosting(): JobPostingSchema | null {
  // Try JSON-LD first
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');

  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      const jobPosting = findJobPosting(data);
      if (jobPosting) {
        const hiringOrg = jobPosting.hiringOrganization as
          | Record<string, unknown>
          | string
          | undefined;
        const companyName =
          typeof hiringOrg === 'object' && hiringOrg
            ? (hiringOrg.name as string)
            : (hiringOrg as string | undefined);

        const empType = jobPosting.employmentType;
        const employmentTypeStr = Array.isArray(empType)
          ? empType.join(', ')
          : (empType as string | undefined);

        return {
          title: jobPosting.title as string | undefined,
          description: jobPosting.description as string | undefined,
          company: companyName,
          location: extractLocation(jobPosting.jobLocation),
          salary: extractSalary(jobPosting.baseSalary),
          employmentType: employmentTypeStr,
          datePosted: jobPosting.datePosted as string | undefined,
        };
      }
    } catch (error) {
      console.debug('[Heuristics] JSON-LD parse failed:', (error as Error).message);
    }
  }

  // Try microdata
  const jobPostingEl = document.querySelector('[itemtype*="JobPosting"]');
  if (jobPostingEl) {
    return {
      title: getMicrodataValue(jobPostingEl, 'title'),
      description: getMicrodataValue(jobPostingEl, 'description'),
      company: getMicrodataValue(jobPostingEl, 'hiringOrganization'),
      location: getMicrodataValue(jobPostingEl, 'jobLocation'),
    };
  }

  return null;
}

/**
 * Find JobPosting in potentially nested JSON-LD data
 */
function findJobPosting(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  // Direct JobPosting
  if (obj['@type'] === 'JobPosting') {
    return obj;
  }

  // Array of items
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findJobPosting(item);
      if (found) return found;
    }
  }

  // Nested in @graph
  if (obj['@graph'] && Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) {
      const found = findJobPosting(item);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Extract location from schema
 */
function extractLocation(jobLocation: unknown): string | undefined {
  if (!jobLocation) return undefined;

  if (typeof jobLocation === 'string') return jobLocation;

  if (Array.isArray(jobLocation)) {
    return jobLocation
      .map((loc) => extractLocation(loc))
      .filter(Boolean)
      .join(', ');
  }

  const loc = jobLocation as Record<string, unknown>;
  if (loc.address) {
    const addr = loc.address as Record<string, unknown>;
    return [addr.addressLocality, addr.addressRegion, addr.addressCountry]
      .filter(Boolean)
      .join(', ');
  }

  return (loc.name as string) || undefined;
}

/**
 * Extract salary from schema
 */
function extractSalary(baseSalary: unknown): string | undefined {
  if (!baseSalary) return undefined;

  if (typeof baseSalary === 'string') return baseSalary;

  const salary = baseSalary as Record<string, unknown>;
  const value = salary.value as Record<string, unknown>;

  if (value) {
    const min = value.minValue;
    const max = value.maxValue;
    const currency = salary.currency || 'USD';

    if (min && max) {
      return `${currency} ${min} - ${max}`;
    } else if (min || max) {
      return `${currency} ${min || max}`;
    }
  }

  return undefined;
}

/**
 * Get microdata value
 */
function getMicrodataValue(container: Element, prop: string): string | undefined {
  const el = container.querySelector(`[itemprop="${prop}"]`);
  if (!el) return undefined;

  return el.getAttribute('content') || el.textContent?.trim() || undefined;
}

/**
 * Find apply button on page
 */
function findApplyButton(): HTMLElement | null {
  // Common apply button selectors
  const selectors = [
    'button[class*="apply"]',
    'a[class*="apply"]',
    'button[id*="apply"]',
    'a[id*="apply"]',
    '[data-testid*="apply"]',
    '[data-qa*="apply"]',
    '.apply-button',
    '.btn-apply',
    '#apply-button',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el as HTMLElement;
  }

  // Text-based search
  const buttons = document.querySelectorAll('button, a[role="button"], a.btn, a.button');
  for (const btn of buttons) {
    const text = btn.textContent?.toLowerCase() || '';
    if (
      text.includes('apply now') ||
      text.includes('apply for') ||
      text.includes('apply to') ||
      text.includes('submit application') ||
      text === 'apply'
    ) {
      return btn as HTMLElement;
    }
  }

  return null;
}
