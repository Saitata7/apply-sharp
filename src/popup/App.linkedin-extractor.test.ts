/**
 * Tests for the inline LinkedIn job extractor used by the popup-driven capture.
 *
 * The function under test is serialized and injected via chrome.scripting.executeScript
 * at runtime, so it cannot reference imports or outer-scope variables. These tests
 * load a synthesized LinkedIn job DOM into jsdom and verify the function still
 * extracts title, company, location, description, and jobId correctly.
 *
 * Synthesized fixtures (not full LinkedIn HTML, just the elements with the
 * selectors the extractor cares about) keep the tests fast and self-contained.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { extractLinkedInJobInPage as extract } from '@shared/linkedin-job-extractor';

function setLinkedInJobUrl(jobId: string) {
  // jsdom doesn't allow direct assignment to window.location.href in all configs;
  // use Object.defineProperty + history.replaceState as a workaround.
  const url = `https://www.linkedin.com/jobs/view/${jobId}/`;
  Object.defineProperty(window, 'location', {
    value: new URL(url),
    writable: true,
    configurable: true,
  });
}

function setLinkedInSearchUrl(currentJobId: string) {
  const url = `https://www.linkedin.com/jobs/search/?currentJobId=${currentJobId}`;
  Object.defineProperty(window, 'location', {
    value: new URL(url),
    writable: true,
    configurable: true,
  });
}

function setNonLinkedInUrl() {
  Object.defineProperty(window, 'location', {
    value: new URL('https://example.com/'),
    writable: true,
    configurable: true,
  });
}

function buildJobDom(opts: {
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  selectors?: 'modern' | 'legacy';
}) {
  const { title, company, location, description, selectors = 'modern' } = opts;
  const titleClass =
    selectors === 'modern'
      ? 'job-details-jobs-unified-top-card__job-title'
      : 'jobs-unified-top-card__job-title';
  const companyClass =
    selectors === 'modern'
      ? 'job-details-jobs-unified-top-card__company-name'
      : 'jobs-unified-top-card__company-name';
  const locationClass =
    selectors === 'modern'
      ? 'job-details-jobs-unified-top-card__primary-description-container'
      : 'jobs-unified-top-card__primary-description';
  const descClass =
    selectors === 'modern' ? 'jobs-description__content' : 'jobs-description-content__text';

  document.body.innerHTML = `
    <div class="${titleClass}">${title ?? ''}</div>
    <div class="${companyClass}">${company ?? ''}</div>
    <div class="${locationClass}">${location ?? ''}</div>
    <div class="${descClass}">${description ?? ''}</div>
  `;
}

describe('LinkedIn job extractor (inline, popup-driven)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts title, company, location, description on a modern /jobs/view/ page', () => {
    setLinkedInJobUrl('4040793');
    buildJobDom({
      title: 'Senior AI Engineer',
      company: 'Jireh',
      location: 'San Francisco | Remote',
      description: 'Build AI tooling for B2B sales. We use Python, TypeScript, and Postgres.',
    });
    const result = extract();
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Senior AI Engineer');
    expect(result?.company).toBe('Jireh');
    expect(result?.location).toContain('San Francisco');
    expect(result?.description).toContain('Python');
    expect(result?.jobId).toBe('linkedin-4040793');
    expect(result?.url).toContain('linkedin.com/jobs/view/4040793');
  });

  it('extracts from a /jobs/search/?currentJobId= URL', () => {
    setLinkedInSearchUrl('9999');
    buildJobDom({
      title: 'Backend Engineer',
      company: 'Acme',
      description: 'Long enough description to pass the validity check on the extractor.',
    });
    const result = extract();
    expect(result).not.toBeNull();
    expect(result?.jobId).toBe('linkedin-9999');
  });

  it('falls back to legacy class names when modern ones are missing', () => {
    setLinkedInJobUrl('1234');
    buildJobDom({
      title: 'Staff Engineer',
      company: 'LegacyCorp',
      description: 'A description long enough to be valid for the extraction check.',
      selectors: 'legacy',
    });
    const result = extract();
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Staff Engineer');
    expect(result?.company).toBe('LegacyCorp');
  });

  it('returns null on a non-LinkedIn page', () => {
    setNonLinkedInUrl();
    buildJobDom({ title: 'X', company: 'Y', description: 'Z is long enough for the check.' });
    expect(extract()).toBe(null);
  });

  it('returns null when no job title is found (LinkedIn list-only page)', () => {
    setLinkedInJobUrl('4040793');
    document.body.innerHTML = '<div>No job here</div>';
    expect(extract()).toBe(null);
  });

  it('returns null when description is missing (incomplete job render)', () => {
    setLinkedInJobUrl('4040793');
    buildJobDom({ title: 'X', company: 'Y' });
    // No description provided. Should reject because description is required.
    expect(extract()).toBe(null);
  });

  it('does not throw on malformed DOM', () => {
    setLinkedInJobUrl('4040793');
    document.body.innerHTML = '<div class="job-details-jobs-unified-top-card__job-title"></div>';
    expect(() => extract()).not.toThrow();
  });
});
