import type { JobDetector } from './index';
import type { ExtractedJob, JobSalary, EmploymentType } from '@shared/types/job.types';

/** Maximum time (ms) to wait for Workday's React SPA to render job content. */
const CONTENT_LOAD_TIMEOUT = 8_000;

export class WorkdayDetector implements JobDetector {
  platform = 'workday' as const;

  getMainSelector(): string {
    return [
      '[data-automation-id="jobPostingHeader"]',
      '[data-automation-id="jobPostingDescription"]',
      '.css-req5ce',
      '.css-kyg8or',
    ].join(', ');
  }

  isJobPage(): boolean {
    const { hostname, pathname } = window.location;

    // *.myworkdayjobs.com/*/job/*
    if (hostname.endsWith('myworkdayjobs.com') && /\/job\//i.test(pathname)) {
      return true;
    }

    // workday.com/*/job/*
    if (hostname.includes('workday.com') && /\/job\//i.test(pathname)) {
      return true;
    }

    // Fallback: check for known Workday DOM markers
    return (
      document.querySelector('[data-automation-id="jobPostingHeader"]') !== null ||
      document.querySelector('[data-automation-id="jobPostingDescription"]') !== null
    );
  }

  getJobId(): string | null {
    const company = this.getCompanyFromUrl();

    // Try to extract a numeric or GUID-style job id from the URL path
    // e.g. /en-US/job/Senior-Engineer/JR-12345  or  /job/12345
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    const jobIndex = pathSegments.findIndex((s) => s.toLowerCase() === 'job');

    if (jobIndex !== -1) {
      // The last segment after "job" is typically the most specific identifier
      const idSegment = pathSegments[pathSegments.length - 1];
      if (idSegment && idSegment.toLowerCase() !== 'job') {
        return `workday-${company}-${idSegment}`;
      }
    }

    // Fallback: hash the full path
    return `workday-${company}-${this.hashPath(window.location.pathname)}`;
  }

  // ---------------------------------------------------------------------------
  // Main extraction — waits for SPA content, then tries JSON-LD before DOM
  // ---------------------------------------------------------------------------

  async extract(): Promise<ExtractedJob> {
    await this.waitForContent();

    // Prefer structured data when available
    const jsonLdJob = this.extractFromJsonLd();
    if (jsonLdJob) return jsonLdJob;

    // Fall back to DOM scraping
    return this.extractFromDOM();
  }

  // ---------------------------------------------------------------------------
  // JSON-LD extraction
  // ---------------------------------------------------------------------------

  private extractFromJsonLd(): ExtractedJob | null {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const data = JSON.parse(script.textContent || '');
        if (data['@type'] !== 'JobPosting') continue;

        const salary = this.parseSalaryFromJsonLd(data);
        const employmentType = this.normalizeEmploymentType(
          typeof data.employmentType === 'string'
            ? data.employmentType
            : Array.isArray(data.employmentType)
              ? data.employmentType[0]
              : undefined
        );

        return {
          title: data.title || '',
          company:
            data.hiringOrganization?.name || this.formatCompanyName(this.getCompanyFromUrl()),
          location: this.extractLocationFromJsonLd(data),
          description: typeof data.description === 'string' ? this.stripHtml(data.description) : '',
          descriptionHtml: typeof data.description === 'string' ? data.description : undefined,
          salary,
          employmentType,
          postedDate: data.datePosted ? new Date(data.datePosted) : undefined,
        };
      }
    } catch (error) {
      console.debug('[Workday] JSON-LD parse failed:', (error as Error).message);
    }
    return null;
  }

  private extractLocationFromJsonLd(data: Record<string, unknown>): string {
    const loc = data.jobLocation as Record<string, unknown> | Record<string, unknown>[] | undefined;
    if (!loc) return '';

    const locations = Array.isArray(loc) ? loc : [loc];
    return locations
      .map((l) => {
        const addr = l.address as Record<string, unknown> | undefined;
        if (!addr) return '';
        return [addr.addressLocality, addr.addressRegion, addr.addressCountry]
          .filter(Boolean)
          .join(', ');
      })
      .filter(Boolean)
      .join(' | ');
  }

  private parseSalaryFromJsonLd(data: Record<string, unknown>): JobSalary | undefined {
    const base = data.baseSalary as Record<string, unknown> | undefined;
    if (!base) return undefined;

    const value = base.value as Record<string, unknown> | undefined;
    if (!value) return undefined;

    const min = typeof value.minValue === 'number' ? value.minValue : undefined;
    const max = typeof value.maxValue === 'number' ? value.maxValue : undefined;
    if (min === undefined && max === undefined) return undefined;

    return {
      min,
      max,
      currency: (base.currency as string) || 'USD',
      period: (value.unitText as string)?.toLowerCase() === 'hour' ? 'hourly' : 'annual',
    };
  }

  // ---------------------------------------------------------------------------
  // DOM extraction
  // ---------------------------------------------------------------------------

  private extractFromDOM(): ExtractedJob {
    const title = this.getText([
      '[data-automation-id="jobPostingHeader"]',
      'h2[data-automation-id="jobTitle"]',
      '.css-req5ce',
      'h1',
      'h2',
    ]);

    const company = this.formatCompanyName(this.getCompanyFromUrl());

    const location = this.getText([
      '[data-automation-id="locations"] dd',
      '[data-automation-id="locations"]',
      '.css-cygeeu',
    ]);

    const description = this.getText([
      '[data-automation-id="jobPostingDescription"]',
      '.css-kyg8or',
    ]);

    const descriptionHtml = this.getHtml([
      '[data-automation-id="jobPostingDescription"]',
      '.css-kyg8or',
    ]);

    const salary = this.extractSalaryFromDOM();
    const employmentType = this.extractEmploymentTypeFromDOM();

    return {
      title: title || 'Unknown Title',
      company: company || 'Unknown Company',
      location,
      description: description || '',
      descriptionHtml,
      salary,
      employmentType,
    };
  }

  // ---------------------------------------------------------------------------
  // Salary extraction from page text
  // ---------------------------------------------------------------------------

  private extractSalaryFromDOM(): JobSalary | undefined {
    // Collect text from common salary containers and the full description
    const candidates = [
      this.getText(['[data-automation-id="jobPostingDescription"]', '.css-kyg8or']),
      document.body.innerText,
    ];

    for (const text of candidates) {
      if (!text) continue;

      // Match patterns like: $120,000 - $180,000  or  USD 120,000 - 180,000
      const salaryMatch =
        text.match(/\$\s?([\d,]+(?:\.\d{2})?)\s*[-–—to]+\s*\$?\s?([\d,]+(?:\.\d{2})?)/i) ||
        text.match(/USD\s?([\d,]+(?:\.\d{2})?)\s*[-–—to]+\s*([\d,]+(?:\.\d{2})?)/i);

      if (salaryMatch) {
        const min = parseFloat(salaryMatch[1].replace(/,/g, ''));
        const max = parseFloat(salaryMatch[2].replace(/,/g, ''));
        if (isNaN(min) && isNaN(max)) continue;

        // Heuristic: values under 500 likely hourly
        const period: 'hourly' | 'annual' =
          (min > 0 && min < 500) || (max > 0 && max < 500) ? 'hourly' : 'annual';

        return {
          min: isNaN(min) ? undefined : min,
          max: isNaN(max) ? undefined : max,
          currency: 'USD',
          period,
        };
      }
    }

    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Employment type extraction from page text
  // ---------------------------------------------------------------------------

  private extractEmploymentTypeFromDOM(): EmploymentType | undefined {
    // Look in the structured job-detail area first, then fall back to body text
    const text = (
      this.getText(['[data-automation-id="jobPostingDescription"]', '.css-kyg8or']) ||
      document.body.innerText
    ).toLowerCase();

    if (/\bfull[- ]?time\b/.test(text)) return 'full-time';
    if (/\bpart[- ]?time\b/.test(text)) return 'part-time';
    if (/\bcontract\b/.test(text)) return 'contract';
    if (/\bintern(ship)?\b/.test(text)) return 'internship';

    return undefined;
  }

  // ---------------------------------------------------------------------------
  // SPA content waiting via MutationObserver
  // ---------------------------------------------------------------------------

  private waitForContent(): Promise<void> {
    // If the content is already rendered, resolve immediately
    const selectors = [
      '[data-automation-id="jobPostingHeader"]',
      '[data-automation-id="jobPostingDescription"]',
      '.css-req5ce',
    ];

    if (selectors.some((s) => document.querySelector(s) !== null)) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      let settled = false;

      const settle = () => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        resolve();
      };

      const observer = new MutationObserver(() => {
        if (selectors.some((s) => document.querySelector(s) !== null)) {
          settle();
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      // Guarantee we don't wait forever
      setTimeout(settle, CONTENT_LOAD_TIMEOUT);
    });
  }

  // ---------------------------------------------------------------------------
  // URL helpers
  // ---------------------------------------------------------------------------

  private getCompanyFromUrl(): string {
    const { hostname } = window.location;

    // company.myworkdayjobs.com  or  company.wd5.myworkdayjobs.com
    const match = hostname.match(/^([\w-]+)\.(?:wd\d+\.)?myworkdayjobs\.com$/);
    if (match) return match[1];

    return 'unknown';
  }

  /**
   * Turn a URL slug like "acme-corp" into "Acme Corp".
   */
  private formatCompanyName(slug: string): string {
    if (slug === 'unknown') return '';
    return slug
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Simple string hash for fallback job IDs.
   */
  private hashPath(path: string): string {
    let hash = 0;
    for (let i = 0; i < path.length; i++) {
      hash = ((hash << 5) - hash + path.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  // ---------------------------------------------------------------------------
  // Employment type normalisation
  // ---------------------------------------------------------------------------

  private normalizeEmploymentType(raw?: string): EmploymentType | undefined {
    if (!raw) return undefined;
    const lower = raw.toLowerCase().replace(/[_\s]+/g, '-');
    if (lower.includes('full')) return 'full-time';
    if (lower.includes('part')) return 'part-time';
    if (lower.includes('contract') || lower.includes('temporary')) return 'contract';
    if (lower.includes('intern')) return 'internship';
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // DOM utility helpers
  // ---------------------------------------------------------------------------

  private getText(selectors: string[]): string {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.textContent) {
        return el.textContent.trim();
      }
    }
    return '';
  }

  private getHtml(selectors: string[]): string | undefined {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.innerHTML) {
        return el.innerHTML;
      }
    }
    return undefined;
  }

  private stripHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  }
}
