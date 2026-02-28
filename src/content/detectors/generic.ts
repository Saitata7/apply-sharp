import type { JobDetector } from './index';
import type { ExtractedJob } from '@shared/types/job.types';

export class GenericDetector implements JobDetector {
  platform = 'generic' as const;

  getMainSelector(): string {
    // Include BambooHR, Workable, and other common ATS selectors
    return 'main, article, .job-description, #job-description, .job-details, .ResumableJob, .ResumableJob__body, [class*="JobDetails"], [class*="job-content"], .posting-page, .job-post';
  }

  isJobPage(): boolean {
    // Generic detector always returns true as a fallback
    return true;
  }

  getJobId(): string | null {
    // Use URL hash as ID
    try {
      return `generic-${btoa(encodeURIComponent(window.location.href)).slice(0, 20)}`;
    } catch {
      // Fallback for any encoding edge cases
      return `generic-${window.location.pathname.replace(/\W/g, '').slice(0, 20)}`;
    }
  }

  async extract(): Promise<ExtractedJob> {
    // For sites that load content dynamically, wait for content
    const isDynamicSite = this.isDynamicContentSite();
    if (isDynamicSite) {
      console.debug('[ApplySharp] Detected dynamic content site, waiting for content to load...');
      await this.waitForDynamicContent();
    }

    // Try JSON-LD first
    const jsonLdJob = this.extractFromJsonLd();
    if (jsonLdJob) return jsonLdJob;

    // Fall back to heuristic extraction
    return this.extractFromDOM();
  }

  /**
   * Check if current site loads job content dynamically
   */
  private isDynamicContentSite(): boolean {
    const hostname = window.location.hostname;
    return (
      hostname.includes('.bamboohr.com') ||
      hostname.includes('.greenhouse.io') ||
      hostname.includes('.lever.co') ||
      hostname.includes('.ashbyhq.com') ||
      hostname.includes('.workable.com') ||
      hostname.includes('.smartrecruiters.com')
    );
  }

  /**
   * Wait for dynamic content to load by monitoring text content
   */
  private waitForDynamicContent(timeout = 8000): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      // Check if content is already loaded
      if (this.hasJobContent()) {
        console.debug('[ApplySharp] Content already loaded');
        resolve();
        return;
      }

      const observer = new MutationObserver(() => {
        if (this.hasJobContent()) {
          console.debug('[ApplySharp] Dynamic content loaded after', Date.now() - startTime, 'ms');
          observer.disconnect();
          // Small delay to let any final rendering complete
          setTimeout(resolve, 200);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      // Timeout fallback
      setTimeout(() => {
        observer.disconnect();
        console.debug('[ApplySharp] Dynamic content wait timed out after', timeout, 'ms');
        setTimeout(resolve, 200); // Match mutation settle delay
      }, timeout);
    });
  }

  /**
   * Check if page has meaningful job content
   */
  private hasJobContent(): boolean {
    const bodyText = document.body.innerText || '';

    // Need minimum content length
    if (bodyText.length < 300) return false;

    // Check for job-related keywords
    const lowerText = bodyText.toLowerCase();
    const jobKeywords = [
      'responsibilities',
      'requirements',
      'qualifications',
      'experience',
      'skills',
      'about the role',
      "what you'll do",
      "what we're looking for",
      'job description',
      'apply now',
      'apply for this job',
    ];

    const matchCount = jobKeywords.filter((kw) => lowerText.includes(kw)).length;

    // Need at least 2 job-related keywords
    return matchCount >= 2;
  }

  private extractFromJsonLd(): ExtractedJob | null {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');

    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent || '');

        // Handle array of JSON-LD objects
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          if (item['@type'] === 'JobPosting') {
            return {
              title: item.title || '',
              company: item.hiringOrganization?.name || '',
              location: this.extractLocation(item.jobLocation),
              description: this.stripHtml(item.description || ''),
              descriptionHtml: item.description,
              employmentType: this.parseEmploymentType(item.employmentType),
              postedDate: item.datePosted ? new Date(item.datePosted) : undefined,
            };
          }
        }
      } catch (error) {
        console.debug('[Generic] JSON-LD parse failed:', (error as Error).message);
      }
    }

    return null;
  }

  private extractFromDOM(): ExtractedJob {
    const title = this.findTitle();
    const company = this.findCompany();
    const location = this.findLocation();
    const description = this.findDescription();

    const result = {
      title: title || document.title.split('|')[0].trim() || 'Unknown Title',
      company: company || this.extractCompanyFromDomain() || 'Unknown Company',
      location,
      description: description || '',
    };

    console.debug('[ApplySharp] Generic extraction:', {
      title: result.title,
      company: result.company,
      location: location || 'not found',
      descriptionLength: description?.length || 0,
    });

    return result;
  }

  private findTitle(): string {
    // FIRST: Try to construct title from structured fields (like TCS/ATS pages)
    // This is more reliable than generic h1 which might be a logo
    const bodyText = document.body.innerText;

    // Pattern 1: "Desired Skills: X" or "Desired Skills   X" (tabs/spaces)
    const desiredSkillsMatch = bodyText.match(
      /Desired Skills[\s:=-]*([A-Za-z][A-Za-z\s+#.]+?)(?:\n|$)/i
    );
    // Pattern 2: "Role: X" or "Role   X" - be more flexible
    const roleMatch = bodyText.match(/\bRole[\s:=-]*([A-Za-z][A-Za-z\s]+?)(?:\n|$)/i);

    if (desiredSkillsMatch && roleMatch) {
      const skill = desiredSkillsMatch[1].trim();
      const role = roleMatch[1].trim();
      if (skill && role && skill.length < 50 && role.length < 50) {
        return `${skill} ${role}`;
      }
    }
    if (desiredSkillsMatch) {
      const skill = desiredSkillsMatch[1].trim();
      if (skill && skill.length < 50 && skill.length > 1) {
        return `${skill} Developer`;
      }
    }

    // Pattern 2: Look for "Job Title: X" or "Position: X" in body text
    const jobTitleMatch = bodyText.match(/(?:Job Title|Position|Title)\s*[:=-]?\s*([^\n]+)/i);
    if (
      jobTitleMatch &&
      jobTitleMatch[1].trim().length > 3 &&
      jobTitleMatch[1].trim().length < 100
    ) {
      return jobTitleMatch[1].trim();
    }

    // SECOND: Try specific job title selectors (not generic h1)
    const titleSelectors = [
      // BambooHR specific
      '.ResumableJob__title',
      '[class*="ResumableJob"] h2',
      '.posting-headline h2',
      // Common ATS selectors
      'h1.job-title',
      '.job-title h1',
      'h1[class*="job"]',
      'h2[class*="job"]',
      '[class*="job-title"]',
      '[class*="position-title"]',
      '[class*="jobTitle"]',
      '[class*="positionTitle"]',
      '[data-testid*="title"]',
      '[data-qa*="title"]',
      // More generic
      '.posting-headline h1',
      '.job-header h1',
      '.job-header h2',
    ];

    for (const selector of titleSelectors) {
      try {
        const el = document.querySelector(selector);
        const text = el?.textContent?.trim();
        if (text && text.length > 3 && text.length < 150) {
          console.debug('[ApplySharp] Found title from selector:', selector, '=', text);
          return text;
        }
      } catch {
        // Expected: dynamic selectors may be invalid CSS
      }
    }

    // THIRD: Try generic h1, but filter out known branding/logo text
    const brandingTerms = ['ibegin', 'careers', 'jobs', 'login', 'home', 'welcome'];
    const h1Elements = document.querySelectorAll('h1');
    for (const h1 of h1Elements) {
      const text = h1.textContent?.trim() || '';
      const lowerText = text.toLowerCase();
      // Skip if it looks like branding
      if (
        text.length > 3 &&
        text.length < 150 &&
        !brandingTerms.some((term) => lowerText.includes(term))
      ) {
        console.debug('[ApplySharp] Found title from h1:', text);
        return text;
      }
    }

    // FOURTH: Try to find title from structured table data
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td, th');
        for (let i = 0; i < cells.length - 1; i++) {
          const label = cells[i].textContent?.toLowerCase().trim() || '';
          if (label === 'role' || label === 'job title' || label === 'position') {
            const value = cells[i + 1]?.textContent?.trim();
            if (value && value.length > 0 && value.length < 200) {
              console.debug('[ApplySharp] Found title from table:', value);
              return value;
            }
          }
        }
      }
    }

    // LAST: Try to extract from page title
    const pageTitle = document.title;
    const pageTitleMatch = pageTitle.match(/^([^|–—-]+)/);
    if (pageTitleMatch && pageTitleMatch[1].trim().length > 3) {
      console.debug('[ApplySharp] Using page title as fallback:', pageTitleMatch[1].trim());
      return pageTitleMatch[1].trim();
    }

    return '';
  }

  private findCompany(): string {
    // Try to extract from subdomain for BambooHR, Lever, etc.
    const hostname = window.location.hostname;
    if (hostname.includes('.bamboohr.com')) {
      const subdomain = hostname.split('.')[0];
      if (subdomain && subdomain !== 'www') {
        // Capitalize and return
        return subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
      }
    }

    const companySelectors = [
      // BambooHR specific
      '.ResumableJob__company',
      '[class*="ResumableJob"] .company',
      // Common ATS selectors
      '[class*="company-name"]',
      '[class*="companyName"]',
      '[class*="employer"]',
      '[class*="organization"]',
      '.company',
      '[itemprop="hiringOrganization"]',
      '[itemprop="name"]',
      '[class*="hiring"]',
    ];

    for (const selector of companySelectors) {
      try {
        const el = document.querySelector(selector);
        if (
          el?.textContent &&
          el.textContent.trim().length > 0 &&
          el.textContent.trim().length < 100
        ) {
          return el.textContent.trim();
        }
      } catch {
        // Expected: dynamic selectors may be invalid CSS
      }
    }

    // Try to find company from page header/logo
    const logoSelectors = ['[class*="logo"] img', 'header img', '.header img'];
    for (const selector of logoSelectors) {
      try {
        const img = document.querySelector(selector) as HTMLImageElement;
        if (img?.alt && img.alt.length > 1 && img.alt.length < 50) {
          return img.alt;
        }
      } catch {
        // Expected: dynamic selectors may be invalid CSS
      }
    }

    // Try to extract from page title (e.g., "Job Title at Company Name")
    const pageTitle = document.title;
    const atMatch = pageTitle.match(/\bat\s+([^|–—-]+)/i);
    if (atMatch && atMatch[1].trim().length > 1) {
      return atMatch[1].trim();
    }

    // Check for TCS/iBegin branding
    if (
      window.location.hostname.includes('tcsapps.com') ||
      window.location.hostname.includes('tcs.com')
    ) {
      return 'Tata Consultancy Services';
    }

    return '';
  }

  private findLocation(): string {
    const locationSelectors = [
      '[class*="location"]',
      '[itemprop="jobLocation"]',
      '[class*="address"]',
      '.location',
    ];

    for (const selector of locationSelectors) {
      const el = document.querySelector(selector);
      if (el?.textContent && el.textContent.trim().length > 0) {
        return el.textContent.trim();
      }
    }

    return '';
  }

  private findDescription(): string {
    const bodyText = document.body.innerText || '';

    // FIRST: Look for actual job requirement sentences in body text
    // This is the most reliable way to find job content regardless of HTML structure
    const requirementSentences = bodyText.match(
      /(?:^|\n)\s*[•\-*]?\s*(?:Strong|Experience|Knowledge|Understanding|Proficien|Ability|Hands)[^\n]*(?:experience|years|knowledge|Java|Python|Spring|REST|API|SQL|AWS|cloud|agile)[^\n]*/gi
    );

    if (requirementSentences && requirementSentences.length >= 3) {
      // Find the section of body that contains these requirements
      const firstReq = requirementSentences[0].trim();
      const lastReq = requirementSentences[requirementSentences.length - 1].trim();
      const startIdx = bodyText.indexOf(firstReq);
      const endIdx = bodyText.indexOf(lastReq) + lastReq.length;

      if (startIdx >= 0 && endIdx > startIdx) {
        // Expand slightly to get context
        const contextStart = Math.max(0, startIdx - 100);
        const contextEnd = Math.min(bodyText.length, endIdx + 500);
        const content = bodyText.substring(contextStart, contextEnd);
        console.debug(
          '[ApplySharp] Found job content via requirement sentences, count:',
          requirementSentences.length,
          'length:',
          content.length
        );
        return content.trim();
      }
    }

    // SECOND: Use innerText and look for bullet lists
    const getCleanText = (el: Element | null): string => {
      if (!el) return '';
      return (el as HTMLElement).innerText?.trim() || el.textContent?.trim() || '';
    };

    const lists = document.querySelectorAll('ul, ol');
    for (const list of lists) {
      const text = getCleanText(list);
      const lowerText = text.toLowerCase();
      if (
        text.length > 200 &&
        (lowerText.includes('experience') ||
          lowerText.includes('knowledge') ||
          lowerText.includes('java') ||
          lowerText.includes('python') ||
          lowerText.includes('spring'))
      ) {
        const parent = list.parentElement;
        const parentText = getCleanText(parent);
        if (parentText.length > text.length && parentText.length < 10000) {
          console.debug(
            '[ApplySharp] Found job content via bullet list, length:',
            parentText.length
          );
          return parentText;
        }
        console.debug('[ApplySharp] Found job content via bullet list, length:', text.length);
        return text;
      }
    }

    // THIRD: Score containers by job content keywords
    const allContainers = document.querySelectorAll('div, section, article, main');
    const candidates: { text: string; score: number }[] = [];

    for (const container of allContainers) {
      const text = getCleanText(container);
      if (text.length < 400 || text.length > 15000) continue;

      const letterCount = (text.match(/[a-zA-Z]/g) || []).length;
      if (letterCount / text.length < 0.4) continue; // Require at least 40% letters

      let score = 0;
      const lowerText = text.toLowerCase();

      // Strong indicators of job content
      if (lowerText.includes('experience in')) score += 4;
      if (lowerText.includes('hands on')) score += 4;
      if (lowerText.includes('knowledge of')) score += 3;
      if (lowerText.includes('understanding of')) score += 3;
      if (/java|python|javascript|spring|react|node|sql|aws/i.test(lowerText)) score += 3;
      if (lowerText.includes('responsibilities')) score += 2;
      if (lowerText.includes('requirements')) score += 2;
      if (/\d+\+?\s*years/i.test(lowerText)) score += 2;

      // Negative indicators (navigation, footer)
      if (lowerText.includes('cookie policy')) score -= 5;
      if (lowerText.includes('privacy notice')) score -= 5;
      if (lowerText.includes('terms and conditions')) score -= 5;
      if (lowerText.includes('login') && lowerText.includes('register')) score -= 3;

      if (score >= 4) {
        candidates.push({ text, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 0) {
      console.debug(
        '[ApplySharp] Found job content via scoring, score:',
        candidates[0].score,
        'length:',
        candidates[0].text.length
      );
      return candidates[0].text;
    }

    // FOURTH: Full body extraction but skip header/footer content
    // Find the "Job Description" marker and extract from there
    const jdIndex = bodyText.indexOf('Job Description');
    if (jdIndex >= 0) {
      // Get content from Job Description onwards, but limit it
      let content = bodyText.substring(jdIndex, Math.min(bodyText.length, jdIndex + 5000));

      // Try to stop at footer markers
      const footerMarkers = [
        'Cookie Policy',
        'Privacy Notice',
        'Terms And Conditions',
        'Legal',
        'Save Job',
        'Apply By',
      ];
      for (const marker of footerMarkers) {
        const markerIdx = content.indexOf(marker);
        if (markerIdx > 200) {
          // Must have some content before the marker
          content = content.substring(0, markerIdx);
          break;
        }
      }

      if (content.length > 300) {
        console.debug(
          '[ApplySharp] Found job content from Job Description marker, length:',
          content.length
        );
        return content.trim();
      }
    }

    console.debug('[ApplySharp] Using full body fallback, length:', bodyText.length);
    return bodyText.substring(0, 10000);
  }

  private extractCompanyFromDomain(): string {
    const hostname = window.location.hostname;
    // Remove www. and common TLDs
    const parts = hostname.replace(/^www\./, '').split('.');
    if (parts.length > 0) {
      // Capitalize first letter
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
    return '';
  }

  private extractLocation(jobLocation: unknown): string {
    if (!jobLocation) return '';

    if (typeof jobLocation === 'string') return jobLocation;

    if (Array.isArray(jobLocation)) {
      return jobLocation
        .map((loc) => this.extractLocation(loc))
        .filter(Boolean)
        .join(', ');
    }

    if (typeof jobLocation === 'object') {
      const loc = jobLocation as Record<string, unknown>;
      const address = loc.address as Record<string, string> | undefined;

      if (address) {
        const parts = [
          address.addressLocality,
          address.addressRegion,
          address.addressCountry,
        ].filter(Boolean);
        return parts.join(', ');
      }

      if (loc.name) return String(loc.name);
    }

    return '';
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

  private stripHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  }
}
