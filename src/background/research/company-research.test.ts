/**
 * Tests for company-research.
 *
 * Network calls (Defuddle / Jina) and chrome.storage.local are mocked. We focus
 * on the deriveDomain heuristic and the tier-fallback decision logic, since
 * those are the parts that are easy to get wrong and produce silent quality
 * regressions in autofill answers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deriveDomain, researchCompany } from './company-research';

describe('deriveDomain', () => {
  it('strips common ATS subdomains and returns the apex', () => {
    expect(deriveDomain('Acme', 'https://careers.acme.com/jobs/1')).toBe('acme.com');
    expect(deriveDomain('Acme', 'https://jobs.acme.com/jobs/1')).toBe('acme.com');
    expect(deriveDomain('Acme', 'https://apply.acme.com/jobs/1')).toBe('acme.com');
    expect(deriveDomain('Acme', 'https://www.acme.com/jobs/1')).toBe('acme.com');
  });

  it('does NOT return ATS hosts even if the JD url is hosted on one', () => {
    // boards.greenhouse.io is the ATS, not the company. Falls through to name guess.
    expect(deriveDomain('Acme', 'https://boards.greenhouse.io/acme/jobs/1')).toBe('acme.com');
    expect(deriveDomain('Acme', 'https://jobs.lever.co/acme/uuid')).toBe('acme.com');
    expect(deriveDomain('Acme', 'https://wellfound.com/company/acme/jobs/1')).toBe('acme.com');
    expect(deriveDomain('Acme', 'https://acme.workable.com/jobs/1')).toBe('acme.com');
    expect(deriveDomain('Acme', 'https://acme.myworkdayjobs.com/careers')).toBe('acme.com');
  });

  it('falls back to name-based guess when JD url is missing', () => {
    expect(deriveDomain('Acme', undefined)).toBe('acme.com');
    expect(deriveDomain('Stripe Inc', undefined)).toBe('stripe.com');
    expect(deriveDomain('OpenAI, LLC', undefined)).toBe('openai.com');
  });

  it('strips legal suffixes like Inc, LLC, GmbH', () => {
    expect(deriveDomain('Acme Inc', undefined)).toBe('acme.com');
    expect(deriveDomain('Acme, LLC', undefined)).toBe('acme.com');
    expect(deriveDomain('Acme Corp', undefined)).toBe('acme.com');
    expect(deriveDomain('Acme GmbH', undefined)).toBe('acme.com');
  });

  it('returns null for empty or too-short names with no url', () => {
    expect(deriveDomain('', undefined)).toBe(null);
    expect(deriveDomain('A', undefined)).toBe(null);
    expect(deriveDomain('', '')).toBe(null);
  });

  it('handles invalid url gracefully and falls back to name', () => {
    expect(deriveDomain('Acme', 'not a url')).toBe('acme.com');
  });
});

describe('researchCompany tier fallback', () => {
  beforeEach(() => {
    // Mock chrome.storage.local for cache reads/writes
    const store = new Map<string, unknown>();
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        local: {
          get: vi.fn(async (key: string) => {
            const value = store.get(key);
            return value !== undefined ? { [key]: value } : {};
          }),
          set: vi.fn(async (obj: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(obj)) store.set(k, v);
          }),
        },
      },
    };
  });

  it('returns tier 1 with a do-not-invent instruction when no domain can be derived', async () => {
    const result = await researchCompany('', undefined);
    expect(result.tier).toBe(1);
    expect(result.domain).toBe(null);
    expect(result.text).toMatch(/do not invent/i);
  });

  it('returns a tier 1 fallback when fetch fails (network mocked to throw)', async () => {
    // Replace fetch with a failing one. Both Defuddle and Jina fall through.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    });
    try {
      const result = await researchCompany('Acme Inc', 'https://careers.acme.com/jobs/1');
      expect(result.tier).toBe(1);
      expect(result.domain).toBe('acme.com');
      expect(result.text).toMatch(/Could not fetch/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does not throw when chrome.storage cache write fails', async () => {
    // Make the cache write throw so we exercise the catch path.
    (globalThis as { chrome?: { storage: { local: unknown } } }).chrome = {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => {
            throw new Error('quota');
          }),
        },
      },
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error('also down');
    });
    try {
      // Should not throw despite both fetch and cache failing.
      const result = await researchCompany('Acme', undefined);
      expect(result).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
