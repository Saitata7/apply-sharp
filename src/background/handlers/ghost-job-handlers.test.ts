/**
 * Ghost job handler tests.
 *
 * Mocks the application repo and the layoff fetcher (the only network
 * surfaces) and asserts the orchestration logic:
 *   - cheap phase returns without triggering full
 *   - cheap phase auto-escalates to full when score crosses the threshold
 *   - missing job/title/company is rejected
 *   - tracker history fetch failure does NOT throw
 *   - layoff fetch failure does NOT throw, falls back to empty
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/core/outreach/recruiter-research', () => ({
  fetchRecentNews: vi.fn().mockResolvedValue([]),
  fetchWithTimeout: vi.fn(),
  readBoundedText: vi.fn(),
}));

const findByCompanyAndTitle = vi.fn().mockResolvedValue([]);
vi.mock('@storage/index', () => ({
  applicationRepo: {
    findByCompanyAndTitle: (...args: unknown[]) => findByCompanyAndTitle(...args),
  },
}));

const fetchLayoffNews = vi.fn().mockResolvedValue([]);
const refreshLayoffNews = vi.fn().mockResolvedValue([]);
vi.mock('@core/ghost-job-detector/layoff-fetcher', () => ({
  fetchLayoffNews: (...args: unknown[]) => fetchLayoffNews(...args),
  refreshLayoffNews: (...args: unknown[]) => refreshLayoffNews(...args),
}));

const detectBestProvider = vi.fn().mockResolvedValue(null);
vi.mock('@/ai', () => ({
  detectBestProvider: (...args: unknown[]) => detectBestProvider(...args),
}));

import { handleScoreGhostJob } from './ghost-job-handlers';

function makeJob(overrides = {}) {
  return {
    title: 'Senior Backend Engineer',
    company: 'Acme Corp',
    description: 'We need a backend engineer.',
    postedDate: new Date(),
    salary: { min: 150_000, max: 220_000, currency: 'USD', period: 'annual' as const },
    ...overrides,
  };
}

describe('handleScoreGhostJob', () => {
  beforeEach(() => {
    findByCompanyAndTitle.mockClear().mockResolvedValue([]);
    fetchLayoffNews.mockClear().mockResolvedValue([]);
    refreshLayoffNews.mockClear().mockResolvedValue([]);
    detectBestProvider.mockClear().mockResolvedValue(null);
  });

  describe('input validation', () => {
    it('rejects missing job', async () => {
      const result = await handleScoreGhostJob({} as never);
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing');
    });

    it('rejects missing title', async () => {
      const result = await handleScoreGhostJob({
        job: { ...makeJob(), title: '' },
        phase: 'cheap',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing company', async () => {
      const result = await handleScoreGhostJob({
        job: { ...makeJob(), company: '' },
        phase: 'cheap',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('cheap phase', () => {
    it('returns a green score for a clean job', async () => {
      const result = await handleScoreGhostJob({ job: makeJob(), phase: 'cheap' });
      expect(result.success).toBe(true);
      expect(result.data?.bucket).toBe('green');
      // Should NOT have called the layoff fetcher
      expect(fetchLayoffNews).not.toHaveBeenCalled();
    });

    it('auto-escalates to full when cheap score crosses threshold', async () => {
      // Posted 70 days ago (gt60 = 35) plus a salary spread (15) = 50, > 40 threshold
      const oldDate = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000);
      const result = await handleScoreGhostJob({
        job: makeJob({
          postedDate: oldDate,
          salary: { min: 80_000, max: 250_000, currency: 'USD', period: 'annual' },
        }),
        phase: 'cheap',
      });
      expect(result.success).toBe(true);
      expect(fetchLayoffNews).toHaveBeenCalledTimes(1);
      expect(result.data?.phase).toBe('full');
    });
  });

  describe('full phase', () => {
    it('runs the layoff fetcher and embeds news in the score', async () => {
      fetchLayoffNews.mockResolvedValueOnce([
        {
          title: 'Acme Corp lays off 50 engineers',
          source: 'techcrunch.com',
          publishedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ]);
      const result = await handleScoreGhostJob({ job: makeJob(), phase: 'full' });
      expect(result.success).toBe(true);
      const layoffSignal = result.data?.signals.find((s) => s.kind === 'layoff_news');
      expect(layoffSignal?.triggered).toBe(true);
    });

    it('uses refreshLayoffNews when refreshLayoffs is set', async () => {
      await handleScoreGhostJob({ job: makeJob(), phase: 'full', refreshLayoffs: true });
      expect(refreshLayoffNews).toHaveBeenCalledTimes(1);
      expect(fetchLayoffNews).not.toHaveBeenCalled();
    });
  });

  describe('failure tolerance', () => {
    it('survives a tracker history fetch failure', async () => {
      findByCompanyAndTitle.mockRejectedValueOnce(new Error('IDB blew up'));
      const result = await handleScoreGhostJob({ job: makeJob(), phase: 'cheap' });
      expect(result.success).toBe(true);
      expect(result.data?.bucket).toBe('green');
    });

    it('survives a layoff fetch failure', async () => {
      fetchLayoffNews.mockRejectedValueOnce(new Error('Network down'));
      const result = await handleScoreGhostJob({ job: makeJob(), phase: 'full' });
      expect(result.success).toBe(true);
      // No layoff signal triggered since fetch failed
      const layoffSignal = result.data?.signals.find((s) => s.kind === 'layoff_news');
      expect(layoffSignal?.triggered).toBe(false);
    });
  });
});
