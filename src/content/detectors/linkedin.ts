import type { JobDetector } from './index';
import type { ExtractedJob, JobSalary } from '@shared/types/job.types';

export class LinkedInDetector implements JobDetector {
  platform = 'linkedin' as const;

  getMainSelector(): string {
    return '.jobs-description__content, .job-view-layout, .jobs-unified-top-card, .jobs-details, .job-details-jobs-unified-top-card, #job-details, .jobs-search__job-details, .jobs-search__job-details--wrapper, .scaffold-layout__detail, .jobs-details__main-content';
  }

  isJobPage(): boolean {
    // Check URL pattern first
    const isJobUrl = /linkedin\.com\/jobs\/(view|search|collections)/.test(window.location.href);

    // For direct job view pages, URL is enough
    if (/linkedin\.com\/jobs\/view\/\d+/.test(window.location.href)) {
      return true;
    }

    // For search/collections pages, check if a job is selected (currentJobId in URL or job panel visible)
    const hasCurrentJobId = /currentJobId=\d+/.test(window.location.href);

    // Check for job-related elements (job details panel)
    const hasJobElements =
      document.querySelector('.jobs-description__content') !== null ||
      document.querySelector('.job-view-layout') !== null ||
      document.querySelector('.jobs-unified-top-card') !== null ||
      document.querySelector('.jobs-details') !== null ||
      document.querySelector('.job-details-jobs-unified-top-card') !== null ||
      document.querySelector('#job-details') !== null ||
      document.querySelector('.jobs-search__job-details') !== null ||
      document.querySelector('.scaffold-layout__detail') !== null ||
      document.querySelector('.jobs-details__main-content') !== null;

    return isJobUrl && (hasJobElements || hasCurrentJobId);
  }

  getJobId(): string | null {
    // Try URL first
    const urlMatch = window.location.href.match(/jobs\/view\/(\d+)/);
    if (urlMatch) return `linkedin-${urlMatch[1]}`;

    // Try query param
    const url = new URL(window.location.href);
    const currentJobId = url.searchParams.get('currentJobId');
    if (currentJobId) return `linkedin-${currentJobId}`;

    return null;
  }

  async extract(): Promise<ExtractedJob> {
    // Try JSON-LD first (most reliable)
    const jsonLdJob = this.extractFromJsonLd();
    if (jsonLdJob) return jsonLdJob;

    // Fall back to DOM scraping
    return this.extractFromDOM();
  }

  private extractFromJsonLd(): ExtractedJob | null {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');

    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent || '');
        if (data['@type'] === 'JobPosting') {
          return {
            title: data.title || '',
            company: data.hiringOrganization?.name || '',
            location: data.jobLocation?.address?.addressLocality || '',
            description: this.stripHtml(data.description || ''),
            descriptionHtml: data.description,
            employmentType: this.parseEmploymentType(data.employmentType),
            salary: this.parseSalary(data.baseSalary),
            postedDate: data.datePosted ? new Date(data.datePosted) : undefined,
          };
        }
      } catch (error) {
        console.debug('[LinkedIn] JSON-LD parse failed:', (error as Error).message);
      }
    }

    return null;
  }

  private extractFromDOM(): ExtractedJob {
    const title = this.getText([
      // New LinkedIn selectors (2024-2025)
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title a',
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title a',
      '.jobs-unified-top-card__job-title',
      '.t-24.job-details-jobs-unified-top-card__job-title',
      // Job search page - job details panel (right side)
      '.jobs-search__job-details--wrapper h1',
      '.jobs-search__job-details h1',
      '.jobs-details__main-content h1',
      // Job details panel with specific class
      '.job-details-jobs-unified-top-card h1',
      '.jobs-unified-top-card h1',
      // Job card title when selected
      '.jobs-details-top-card__job-title',
      '.job-card-container__link span',
      // Older selectors
      'h1.topcard__title',
      // Try h1/h2 with specific LinkedIn typography classes
      '.jobs-details h1.t-24',
      '.jobs-details h2.t-24',
      '.job-view-layout h1.t-24',
      '.job-view-layout h2.t-24',
      // Generic job details area h1
      '.jobs-details h1',
      '.job-view-layout h1',
      '.jobs-search__job-details h1',
      // Last resort - h1 in main content area (but NOT in header/nav)
      '.scaffold-layout__detail h1',
      '.jobs-search-results-list + * h1',
    ]);

    const company = this.getText([
      // New LinkedIn selectors (2024-2025)
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      // Primary grouping link
      '.jobs-unified-top-card__subtitle-primary-grouping a',
      '.job-details-jobs-unified-top-card__primary-description-container a',
      // Older selectors
      '.topcard__org-name-link',
      '.jobs-details-top-card__company-url',
      // Try any link after job title
      '.jobs-details-top-card a[href*="/company/"]',
    ]);

    const location = this.getText([
      // New selectors
      '.job-details-jobs-unified-top-card__bullet',
      '.job-details-jobs-unified-top-card__primary-description-container .t-black--light',
      '.jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__workplace-type',
      // Older selectors
      '.topcard__flavor--bullet',
      '.jobs-details-top-card__bullet',
    ]);

    const description = this.getText([
      '.jobs-description__content',
      '.jobs-description-content__text',
      '.jobs-box__html-content',
      '.description__text',
      '#job-details',
      '.jobs-description',
    ]);

    const descriptionHtml = this.getHtml([
      '.jobs-description__content',
      '.jobs-description-content__text',
      '.jobs-box__html-content',
      '#job-details',
    ]);

    // Clean up title - remove placeholder text and invalid patterns
    let cleanTitle = title || '';
    const placeholderPatterns = [
      /^,?\s*(skill|title|company|or|keyword)/i,
      /search by title/i,
      /search jobs/i,
      /^skill,?\s*(or)?\s*(company)?/i,
      /^title,?\s*(skill)?\s*(or)?\s*(company)?/i,
      /^,\s*skill/i,
      /city,?\s*state/i,
      /enter location/i,
    ];
    for (const pattern of placeholderPatterns) {
      if (pattern.test(cleanTitle)) {
        cleanTitle = '';
        break;
      }
    }

    // Also clean if title starts with comma or is just whitespace
    cleanTitle = cleanTitle.replace(/^[,\s]+/, '').trim();
    if (cleanTitle.length < 3) {
      cleanTitle = '';
    }

    if (!description) {
      console.warn(
        '[ApplySharp/LinkedIn] description selectors all empty; ATS scoring will run on title-only and likely score low. ' +
          'Likely cause: LinkedIn changed the description container class or the description is lazy-loaded behind a "show more" gate.'
      );
    }

    return {
      title: cleanTitle || 'Unknown Title',
      company: company || 'Unknown Company',
      location,
      description: description || '',
      descriptionHtml,
    };
  }

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

  private parseEmploymentType(type: string | string[] | undefined): ExtractedJob['employmentType'] {
    if (!type) return undefined;
    const typeStr = Array.isArray(type) ? type[0] : type;
    const lower = typeStr.toLowerCase();

    if (lower.includes('full')) return 'full-time';
    if (lower.includes('part')) return 'part-time';
    if (lower.includes('contract')) return 'contract';
    if (lower.includes('intern')) return 'internship';
    return undefined;
  }

  private parseSalary(baseSalary: unknown): JobSalary | undefined {
    if (!baseSalary || typeof baseSalary !== 'object') return undefined;

    const salary = baseSalary as Record<string, unknown>;
    const value = salary.value as Record<string, unknown> | undefined;

    if (!value) return undefined;

    return {
      min: typeof value.minValue === 'number' ? value.minValue : undefined,
      max: typeof value.maxValue === 'number' ? value.maxValue : undefined,
      currency: (salary.currency as string) || 'USD',
      period: 'annual',
    };
  }
}
