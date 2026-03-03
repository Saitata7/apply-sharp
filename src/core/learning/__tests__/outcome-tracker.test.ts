import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome.storage.local before imports
const mockStorage: Record<string, unknown> = {};
const mockChrome = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] ?? null })),
      set: vi.fn(async (data: Record<string, unknown>) => {
        Object.assign(mockStorage, data);
      }),
    },
  },
};
(globalThis as Record<string, unknown>).chrome = mockChrome;

// Mock adaptive-keywords to avoid cross-module initialization issues
vi.mock('../adaptive-keywords', () => ({
  adaptiveKeywordDB: {
    recordUsage: vi.fn(async () => {}),
    updateFromOutcome: vi.fn(async () => {}),
    applyTimeDecay: vi.fn(async () => {}),
  },
}));

import { OutcomeTracker } from '../outcome-tracker';

describe('OutcomeTracker', () => {
  let tracker: OutcomeTracker;

  beforeEach(async () => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
    tracker = new OutcomeTracker();
    // Allow init to complete
    await new Promise((r) => setTimeout(r, 50));
  });

  describe('trackApplication', () => {
    it('creates a new tracked application', async () => {
      const app = await tracker.trackApplication({
        jobId: 'job-1',
        jobTitle: 'Software Engineer',
        company: 'Acme Corp',
        platform: 'LinkedIn',
        profileId: 'profile-1',
        keywordsUsed: ['JavaScript', 'React'],
      });

      expect(app.id).toMatch(/^app_/);
      expect(app.jobTitle).toBe('Software Engineer');
      expect(app.company).toBe('Acme Corp');
      expect(app.platform).toBe('linkedin'); // lowercased
      expect(app.status).toBe('applied');
      expect(app.responseReceived).toBe(false);
      expect(app.interviewCount).toBe(0);
    });

    it('records keyword usage in adaptive DB', async () => {
      const { adaptiveKeywordDB } = await import('../adaptive-keywords');
      await tracker.trackApplication({
        jobId: 'job-2',
        jobTitle: 'Dev',
        company: 'Test',
        platform: 'indeed',
        profileId: 'p-1',
        keywordsUsed: ['Python', 'Django'],
      });

      expect(adaptiveKeywordDB.recordUsage).toHaveBeenCalledWith(
        ['Python', 'Django'],
        'indeed',
        'Dev'
      );
    });

    it('saves to storage after tracking', async () => {
      await tracker.trackApplication({
        jobId: 'job-3',
        jobTitle: 'Dev',
        company: 'Test',
        platform: 'greenhouse',
        profileId: 'p-1',
        keywordsUsed: [],
      });

      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    it('uses defaults for optional fields', async () => {
      const app = await tracker.trackApplication({
        jobId: 'job-4',
        jobTitle: 'Dev',
        company: 'Test',
        platform: 'lever',
        profileId: 'p-1',
        keywordsUsed: [],
      });

      expect(app.industry).toBe('unknown');
      expect(app.resumeVersion).toBe('default');
      expect(app.coverLetterGenerated).toBe(false);
      expect(app.source).toBe('extension');
    });
  });

  describe('recordOutcome', () => {
    it('transitions status correctly', async () => {
      const app = await tracker.trackApplication({
        jobId: 'j1',
        jobTitle: 'Dev',
        company: 'Co',
        platform: 'linkedin',
        profileId: 'p1',
        keywordsUsed: ['JS'],
      });

      const updated = await tracker.recordOutcome(app.id, 'interview');
      expect(updated?.status).toBe('interview');
      expect(updated?.statusHistory.length).toBe(1);
      expect(updated?.statusHistory[0].from).toBe('applied');
      expect(updated?.statusHistory[0].to).toBe('interview');
    });

    it('marks response as received for relevant statuses', async () => {
      const app = await tracker.trackApplication({
        jobId: 'j2',
        jobTitle: 'Dev',
        company: 'Co',
        platform: 'linkedin',
        profileId: 'p1',
        keywordsUsed: [],
      });

      const updated = await tracker.recordOutcome(app.id, 'viewed');
      expect(updated?.responseReceived).toBe(true);
      expect(updated?.responseTimeHours).toBeGreaterThanOrEqual(0);
    });

    it('increments interview count for interview-like statuses', async () => {
      const app = await tracker.trackApplication({
        jobId: 'j3',
        jobTitle: 'Dev',
        company: 'Co',
        platform: 'linkedin',
        profileId: 'p1',
        keywordsUsed: [],
      });

      await tracker.recordOutcome(app.id, 'phone_screen');
      const result = tracker.getApplication(app.id);
      expect(result?.interviewCount).toBe(1);

      await tracker.recordOutcome(app.id, 'interview');
      const result2 = tracker.getApplication(app.id);
      expect(result2?.interviewCount).toBe(2);
    });

    it('marks offer received', async () => {
      const app = await tracker.trackApplication({
        jobId: 'j4',
        jobTitle: 'Dev',
        company: 'Co',
        platform: 'linkedin',
        profileId: 'p1',
        keywordsUsed: [],
      });

      await tracker.recordOutcome(app.id, 'offer');
      const result = tracker.getApplication(app.id);
      expect(result?.offerReceived).toBe(true);
    });

    it('returns null for non-existent application', async () => {
      const result = await tracker.recordOutcome('nonexistent', 'interview');
      expect(result).toBeNull();
    });

    it('records notes in status history', async () => {
      const app = await tracker.trackApplication({
        jobId: 'j5',
        jobTitle: 'Dev',
        company: 'Co',
        platform: 'linkedin',
        profileId: 'p1',
        keywordsUsed: [],
      });

      await tracker.recordOutcome(app.id, 'rejected', 'Position filled');
      const result = tracker.getApplication(app.id);
      expect(result?.statusHistory[0].notes).toBe('Position filled');
    });
  });

  describe('computeAndCacheStats', () => {
    it('returns zero stats when no applications', async () => {
      const stats = await tracker.computeAndCacheStats();
      expect(stats.totalApplications).toBe(0);
      expect(stats.responseRate).toBe(0);
      expect(stats.interviewRate).toBe(0);
      expect(stats.offerRate).toBe(0);
    });

    it('calculates rates correctly', async () => {
      // Create 4 apps: 2 get responses, 1 gets interview, 1 gets offer
      const a1 = await tracker.trackApplication({
        jobId: 'j1',
        jobTitle: 'Dev',
        company: 'A',
        platform: 'linkedin',
        profileId: 'p',
        keywordsUsed: [],
      });
      const a2 = await tracker.trackApplication({
        jobId: 'j2',
        jobTitle: 'Dev',
        company: 'B',
        platform: 'indeed',
        profileId: 'p',
        keywordsUsed: [],
      });
      const a3 = await tracker.trackApplication({
        jobId: 'j3',
        jobTitle: 'Dev',
        company: 'C',
        platform: 'linkedin',
        profileId: 'p',
        keywordsUsed: [],
      });
      await tracker.trackApplication({
        jobId: 'j4',
        jobTitle: 'Dev',
        company: 'D',
        platform: 'greenhouse',
        profileId: 'p',
        keywordsUsed: [],
      });

      await tracker.recordOutcome(a1.id, 'viewed');
      await tracker.recordOutcome(a2.id, 'interview');
      await tracker.recordOutcome(a3.id, 'offer');

      const stats = await tracker.computeAndCacheStats();
      expect(stats.totalApplications).toBe(4);
      expect(stats.responseRate).toBe(3 / 4); // 3 got responses
      expect(stats.interviewRate).toBe(1 / 4); // 1 phone_screen/interview/final_round
      expect(stats.offerRate).toBe(1 / 4);
    });

    it('calculates platform breakdown', async () => {
      await tracker.trackApplication({
        jobId: 'j1',
        jobTitle: 'Dev',
        company: 'A',
        platform: 'linkedin',
        profileId: 'p',
        keywordsUsed: [],
      });
      await tracker.trackApplication({
        jobId: 'j2',
        jobTitle: 'Dev',
        company: 'B',
        platform: 'indeed',
        profileId: 'p',
        keywordsUsed: [],
      });

      const stats = await tracker.computeAndCacheStats();
      expect(stats.byPlatform['linkedin']?.applications).toBe(1);
      expect(stats.byPlatform['indeed']?.applications).toBe(1);
    });

    it('generates weekly trend data', async () => {
      await tracker.trackApplication({
        jobId: 'j1',
        jobTitle: 'Dev',
        company: 'A',
        platform: 'linkedin',
        profileId: 'p',
        keywordsUsed: [],
      });

      const stats = await tracker.computeAndCacheStats();
      expect(stats.weeklyTrend.length).toBe(8);
    });

    it('caches stats to storage', async () => {
      // Need at least one application so computeAndCacheStats doesn't return early
      await tracker.trackApplication({
        jobId: 'j1',
        jobTitle: 'Dev',
        company: 'A',
        platform: 'linkedin',
        profileId: 'p',
        keywordsUsed: [],
      });
      vi.clearAllMocks();

      await tracker.computeAndCacheStats();
      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('getRecent', () => {
    it('returns applications sorted by most recent', async () => {
      await tracker.trackApplication({
        jobId: 'j1',
        jobTitle: 'First',
        company: 'A',
        platform: 'linkedin',
        profileId: 'p',
        keywordsUsed: [],
      });
      await new Promise((r) => setTimeout(r, 10));
      await tracker.trackApplication({
        jobId: 'j2',
        jobTitle: 'Second',
        company: 'B',
        platform: 'linkedin',
        profileId: 'p',
        keywordsUsed: [],
      });

      const recent = tracker.getRecent(10);
      expect(recent.length).toBe(2);
      expect(recent[0].jobTitle).toBe('Second');
    });

    it('respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await tracker.trackApplication({
          jobId: `j${i}`,
          jobTitle: `Dev ${i}`,
          company: 'Co',
          platform: 'linkedin',
          profileId: 'p',
          keywordsUsed: [],
        });
      }
      const recent = tracker.getRecent(3);
      expect(recent.length).toBe(3);
    });
  });

  describe('getByStatus', () => {
    it('filters by status', async () => {
      const app = await tracker.trackApplication({
        jobId: 'j1',
        jobTitle: 'Dev',
        company: 'A',
        platform: 'linkedin',
        profileId: 'p',
        keywordsUsed: [],
      });
      await tracker.recordOutcome(app.id, 'interview');

      const interviews = tracker.getByStatus('interview');
      expect(interviews.length).toBe(1);
      expect(interviews[0].status).toBe('interview');

      const applied = tracker.getByStatus('applied');
      expect(applied.length).toBe(0);
    });
  });

  describe('getBestPerformingKeywords', () => {
    it('returns keywords sorted by success rate', async () => {
      // Create apps with different keyword outcomes
      for (let i = 0; i < 4; i++) {
        const app = await tracker.trackApplication({
          jobId: `j${i}`,
          jobTitle: 'Dev',
          company: 'Co',
          platform: 'linkedin',
          profileId: 'p',
          keywordsUsed: ['React'],
        });
        if (i < 3) await tracker.recordOutcome(app.id, 'interview');
      }

      const best = await tracker.getBestPerformingKeywords();
      expect(best.length).toBeGreaterThan(0);
      expect(best[0].keyword).toBe('react'); // lowercased
      expect(best[0].score).toBe(75); // 3/4 = 75%
    });

    it('requires minimum 3 uses', async () => {
      for (let i = 0; i < 2; i++) {
        await tracker.trackApplication({
          jobId: `j${i}`,
          jobTitle: 'Dev',
          company: 'Co',
          platform: 'linkedin',
          profileId: 'p',
          keywordsUsed: ['RareSkill'],
        });
      }

      const best = await tracker.getBestPerformingKeywords();
      const found = best.find((k) => k.keyword === 'rareskill');
      expect(found).toBeUndefined();
    });
  });

  describe('exportData / importData', () => {
    it('exports all applications', async () => {
      await tracker.trackApplication({
        jobId: 'j1',
        jobTitle: 'Dev',
        company: 'A',
        platform: 'linkedin',
        profileId: 'p',
        keywordsUsed: [],
      });

      const exported = tracker.exportData();
      expect(exported.length).toBe(1);
      expect(exported[0].company).toBe('A');
    });

    it('imports new applications', async () => {
      const data = [
        {
          id: 'imported_1',
          jobId: 'j1',
          jobTitle: 'Imported',
          company: 'Ext',
          platform: 'indeed',
          industry: 'tech',
          profileId: 'p',
          keywordsUsed: [],
          resumeVersion: 'v1',
          coverLetterGenerated: false,
          answersGenerated: [],
          appliedAt: Date.now(),
          lastStatusChange: Date.now(),
          status: 'applied' as const,
          statusHistory: [],
          responseReceived: false,
          interviewCount: 0,
          offerReceived: false,
          source: 'import' as const,
        },
      ];

      const count = await tracker.importData(data);
      expect(count).toBe(1);
    });

    it('does not duplicate on import', async () => {
      await tracker.trackApplication({
        jobId: 'j1',
        jobTitle: 'Dev',
        company: 'A',
        platform: 'linkedin',
        profileId: 'p',
        keywordsUsed: [],
      });

      const exported = tracker.exportData();
      const count = await tracker.importData(exported);
      expect(count).toBe(0); // Already exists
    });
  });
});
