/**
 * Discovery handlers tests (Workstream 9, iter-2 coverage gap fix).
 *
 * Mocks chrome.permissions and the HN fetcher to verify the three
 * handlers' permission lifecycle, error tolerance, and payload validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchHNWhosHiring = vi.fn();
vi.mock('@core/discovery/hn-whos-hiring', () => ({
  fetchHNWhosHiring: (...args: unknown[]) => fetchHNWhosHiring(...args),
}));

import {
  handleGetPortalRecommendations,
  handleFetchHNWhosHiring,
  handleGetYCATSLinks,
} from './discovery-handlers';

const permissionsContains = vi.fn();
const permissionsRequest = vi.fn();

beforeEach(() => {
  fetchHNWhosHiring.mockReset();
  permissionsContains.mockReset();
  permissionsRequest.mockReset();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    permissions: {
      contains: permissionsContains,
      request: permissionsRequest,
    },
  };
});

describe('handleGetPortalRecommendations', () => {
  it('returns recommendations + skipList for a valid profile', async () => {
    const result = await handleGetPortalRecommendations({
      profile: {
        role: 'backend',
        seniority: 'senior',
        geo: 'us',
        workType: 'remote',
      },
    });
    expect(result.success).toBe(true);
    expect(result.data?.recommendations.length).toBeGreaterThan(0);
    expect(result.data?.skipList.length).toBeGreaterThan(0);
  });

  it('rejects missing profile', async () => {
    const result = await handleGetPortalRecommendations({} as never);
    expect(result.success).toBe(false);
  });

  it('returns empty recommendations for an unknown role wildcard fallback', async () => {
    const result = await handleGetPortalRecommendations({
      profile: {
        role: 'qa',
        seniority: 'mid',
        geo: 'us',
        workType: 'remote',
      },
    });
    expect(result.success).toBe(true);
    // Wildcard fallback should still produce at least LinkedIn
    expect(result.data?.recommendations.some((r) => r.sourceName.includes('LinkedIn'))).toBe(true);
  });
});

describe('handleFetchHNWhosHiring', () => {
  it('returns permission_denied when chrome.permissions.contains is false and no request', async () => {
    permissionsContains.mockResolvedValue(false);
    const result = await handleFetchHNWhosHiring({
      keywords: ['backend'],
      requestPermission: false,
    });
    expect(result.success).toBe(true);
    expect(result.data?.permission).toBe('denied');
    expect(result.data?.result).toBeNull();
    expect(fetchHNWhosHiring).not.toHaveBeenCalled();
  });

  it('fetches when permission already granted', async () => {
    permissionsContains.mockResolvedValue(true);
    fetchHNWhosHiring.mockResolvedValue({
      threadId: 1,
      threadTitle: 'Ask HN: Who is hiring',
      threadUrl: 'https://news.ycombinator.com/item?id=1',
      totalComments: 5,
      matches: [],
      fetchedAt: '2026-04-01T00:00:00Z',
      fromCache: false,
    });
    const result = await handleFetchHNWhosHiring({ keywords: ['backend'] });
    expect(result.success).toBe(true);
    expect(result.data?.permission).toBe('granted');
    expect(fetchHNWhosHiring).toHaveBeenCalledWith(['backend']);
  });

  it('requests permission when missing and requestPermission is true', async () => {
    permissionsContains.mockResolvedValue(false);
    permissionsRequest.mockResolvedValue(true);
    fetchHNWhosHiring.mockResolvedValue({
      threadId: 1,
      threadTitle: 'Ask HN',
      threadUrl: 'https://news.ycombinator.com/item?id=1',
      totalComments: 0,
      matches: [],
      fetchedAt: '2026-04-01T00:00:00Z',
      fromCache: false,
    });
    const result = await handleFetchHNWhosHiring({
      keywords: ['backend'],
      requestPermission: true,
    });
    expect(permissionsRequest).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.data?.permission).toBe('granted');
  });

  it('returns permission denied when user rejects the request prompt', async () => {
    permissionsContains.mockResolvedValue(false);
    permissionsRequest.mockResolvedValue(false);
    const result = await handleFetchHNWhosHiring({
      keywords: ['backend'],
      requestPermission: true,
    });
    expect(result.success).toBe(true);
    expect(result.data?.permission).toBe('denied');
    expect(fetchHNWhosHiring).not.toHaveBeenCalled();
  });

  it('rejects missing keywords array', async () => {
    const result = await handleFetchHNWhosHiring({} as never);
    expect(result.success).toBe(false);
  });

  it('survives a fetcher exception', async () => {
    permissionsContains.mockResolvedValue(true);
    fetchHNWhosHiring.mockRejectedValue(new Error('Algolia down'));
    const result = await handleFetchHNWhosHiring({ keywords: ['backend'] });
    expect(result.success).toBe(false);
  });
});

describe('handleGetYCATSLinks', () => {
  it('returns the full set when no role/sector', async () => {
    const result = await handleGetYCATSLinks({});
    expect(result.success).toBe(true);
    expect(result.data?.links.length).toBeGreaterThan(0);
    expect(result.data?.appliedSector).toBeNull();
  });

  it('filters by role-derived sector for ml-engineering -> ai', async () => {
    const result = await handleGetYCATSLinks({ role: 'ml-engineering' });
    expect(result.success).toBe(true);
    expect(result.data?.appliedSector).toBe('ai');
    for (const link of result.data?.links ?? []) {
      expect(link.sector).toBe('ai');
    }
  });

  it('respects an explicit sector override', async () => {
    const result = await handleGetYCATSLinks({ sector: 'devtools' });
    expect(result.success).toBe(true);
    expect(result.data?.appliedSector).toBe('devtools');
    for (const link of result.data?.links ?? []) {
      expect(link.sector).toBe('devtools');
    }
  });
});
