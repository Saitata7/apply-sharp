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

// Use vi.hoisted to create mocks that can be referenced in vi.mock factories
const { mockAdaptiveKeywordDB, mockOutcomeTracker } = vi.hoisted(() => ({
  mockAdaptiveKeywordDB: {
    getAutoImprovements: vi.fn(
      async (): Promise<Record<string, unknown>> => ({
        keywordsToEmphasize: ['React', 'TypeScript', 'Node.js'],
        keywordsToDeemphasize: ['jQuery', 'Backbone'],
        platformInsights: { linkedin: 'Focus on: React, TypeScript' },
        emergingToAdd: ['GenAI', 'LLM'],
      })
    ),
    getRecommendations: vi.fn(() => []),
  },
  mockOutcomeTracker: {
    getStats: vi.fn(
      async (): Promise<Record<string, unknown>> => ({
        totalApplications: 20,
        responseRate: 0.25,
        interviewRate: 0.1,
        offerRate: 0.05,
        avgResponseTimeHours: 72,
        byPlatform: {
          linkedin: {
            applications: 10,
            responses: 3,
            interviews: 1,
            offers: 0,
            avgResponseTime: 48,
          },
          indeed: { applications: 10, responses: 2, interviews: 1, offers: 1, avgResponseTime: 96 },
        },
        byIndustry: { technology: 15, fintech: 5 },
        weeklyTrend: [
          { weekStart: '2024-01-01', applications: 3, responses: 1, interviews: 0 },
          { weekStart: '2024-01-08', applications: 4, responses: 1, interviews: 1 },
          { weekStart: '2024-01-15', applications: 5, responses: 2, interviews: 0 },
          { weekStart: '2024-01-22', applications: 3, responses: 0, interviews: 0 },
          { weekStart: '2024-01-29', applications: 2, responses: 1, interviews: 0 },
          { weekStart: '2024-02-05', applications: 1, responses: 0, interviews: 0 },
          { weekStart: '2024-02-12', applications: 1, responses: 1, interviews: 1 },
          { weekStart: '2024-02-19', applications: 1, responses: 0, interviews: 0 },
        ],
      })
    ),
    getBestPerformingKeywords: vi.fn(async () => [
      { keyword: 'React', score: 80, uses: 10 },
      { keyword: 'TypeScript', score: 70, uses: 8 },
    ]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getNeedingAttention: vi.fn((): any[] => []),
  },
}));

vi.mock('../adaptive-keywords', () => ({
  adaptiveKeywordDB: mockAdaptiveKeywordDB,
}));

vi.mock('../outcome-tracker', () => ({
  outcomeTracker: mockOutcomeTracker,
}));

// Mock platform-strategies
vi.mock('../../ats/platform-strategies', () => ({
  getPlatformStrategy: (platform: string) => ({
    name: platform.charAt(0).toUpperCase() + platform.slice(1),
    matchingType: 'keyword',
    keywordFlexibility: 'moderate',
    recommendations: ['Tip 1', 'Tip 2', 'Tip 3'],
  }),
}));

import { AutoImprover } from '../auto-improver';

describe('AutoImprover', () => {
  let improver: AutoImprover;

  beforeEach(async () => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
    improver = new AutoImprover();
    // Allow init to complete
    await new Promise((r) => setTimeout(r, 100));
  });

  describe('runFullAnalysis', () => {
    it('generates keyword_emphasize improvements', async () => {
      const improvements = await improver.runFullAnalysis();
      const emphasize = improvements.filter((i) => i.type === 'keyword_emphasize');
      expect(emphasize.length).toBeGreaterThan(0);
      expect(emphasize[0].title).toContain('React');
      expect(emphasize[0].priority).toBe('high');
    });

    it('generates keyword_remove improvements', async () => {
      const improvements = await improver.runFullAnalysis();
      const remove = improvements.filter((i) => i.type === 'keyword_remove');
      expect(remove.length).toBeGreaterThan(0);
      expect(remove[0].title).toContain('jQuery');
      expect(remove[0].priority).toBe('medium');
    });

    it('generates keyword_add improvements for emerging skills', async () => {
      const improvements = await improver.runFullAnalysis();
      const add = improvements.filter((i) => i.type === 'keyword_add');
      expect(add.length).toBeGreaterThan(0);
      expect(add[0].title).toContain('GenAI');
    });

    it('generates platform_specific improvements', async () => {
      const improvements = await improver.runFullAnalysis();
      const platform = improvements.filter((i) => i.type === 'platform_specific');
      expect(platform.length).toBeGreaterThan(0);
    });

    it('generates timing_insight when avg response time > 0', async () => {
      const improvements = await improver.runFullAnalysis();
      const timing = improvements.filter((i) => i.type === 'timing_insight');
      expect(timing.length).toBe(1);
      expect(timing[0].title).toContain('3 days');
    });

    it('generates strategy_shift when response rate < 10%', async () => {
      mockOutcomeTracker.getStats.mockResolvedValueOnce({
        totalApplications: 50,
        responseRate: 0.05,
        interviewRate: 0.02,
        offerRate: 0,
        avgResponseTimeHours: 0,
        byPlatform: {},
        byIndustry: {},
        weeklyTrend: [],
      });

      const improvements = await improver.runFullAnalysis();
      const shift = improvements.filter((i) => i.type === 'strategy_shift');
      expect(shift.length).toBe(1);
      expect(shift[0].priority).toBe('critical');
    });

    it('does not duplicate existing improvements', async () => {
      await improver.runFullAnalysis();
      await improver.runFullAnalysis();
      // Second run should not add duplicates
      const active = improver.getActiveImprovements();
      const titles = active.map((i) => i.title);
      const uniqueTitles = [...new Set(titles)];
      expect(titles.length).toBe(uniqueTitles.length);
    });
  });

  describe('getActiveImprovements', () => {
    it('returns non-dismissed, non-applied improvements', async () => {
      await improver.runFullAnalysis();
      const active = improver.getActiveImprovements();
      for (const imp of active) {
        expect(imp.dismissed).toBeFalsy();
        expect(imp.appliedAt).toBeUndefined();
      }
    });

    it('sorts by priority: critical > high > medium > low', async () => {
      await improver.runFullAnalysis();
      const active = improver.getActiveImprovements();
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      for (let i = 1; i < active.length; i++) {
        expect(priorityOrder[active[i].priority]).toBeGreaterThanOrEqual(
          priorityOrder[active[i - 1].priority]
        );
      }
    });
  });

  describe('getByType', () => {
    it('filters improvements by type', async () => {
      await improver.runFullAnalysis();
      const keywordAdd = improver.getByType('keyword_add');
      for (const imp of keywordAdd) {
        expect(imp.type).toBe('keyword_add');
      }
    });
  });

  describe('markApplied', () => {
    it('marks improvement as applied', async () => {
      await improver.runFullAnalysis();
      const active = improver.getActiveImprovements();
      const firstId = active[0].id;

      await improver.markApplied(firstId);
      const activeAfter = improver.getActiveImprovements();
      expect(activeAfter.find((i) => i.id === firstId)).toBeUndefined();
    });

    it('saves to storage after marking', async () => {
      await improver.runFullAnalysis();
      const active = improver.getActiveImprovements();
      const callsBefore = mockChrome.storage.local.set.mock.calls.length;

      await improver.markApplied(active[0].id);
      expect(mockChrome.storage.local.set.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  describe('dismiss', () => {
    it('dismisses an improvement', async () => {
      await improver.runFullAnalysis();
      const active = improver.getActiveImprovements();
      const firstId = active[0].id;

      await improver.dismiss(firstId);
      const activeAfter = improver.getActiveImprovements();
      expect(activeAfter.find((i) => i.id === firstId)).toBeUndefined();
    });
  });

  describe('getLearningInsights', () => {
    it('returns comprehensive insight data', async () => {
      const insights = await improver.getLearningInsights();
      expect(insights.overallHealth).toBe('good'); // 25% response rate
      expect(insights.responseRate).toBe(0.25);
      expect(insights.topPerformingKeywords.length).toBeGreaterThan(0);
      expect(insights.nextActions.length).toBeGreaterThan(0);
    });

    it('classifies health as excellent for high response rate', async () => {
      mockOutcomeTracker.getStats.mockResolvedValueOnce({
        totalApplications: 10,
        responseRate: 0.4,
        interviewRate: 0.2,
        offerRate: 0.1,
        avgResponseTimeHours: 48,
        byPlatform: {},
        byIndustry: {},
        weeklyTrend: [],
      });

      const insights = await improver.getLearningInsights();
      expect(insights.overallHealth).toBe('excellent');
    });

    it('classifies health as poor for very low response rate', async () => {
      mockOutcomeTracker.getStats.mockResolvedValueOnce({
        totalApplications: 50,
        responseRate: 0.02,
        interviewRate: 0.01,
        offerRate: 0,
        avgResponseTimeHours: 0,
        byPlatform: {},
        byIndustry: {},
        weeklyTrend: [],
      });

      const insights = await improver.getLearningInsights();
      expect(insights.overallHealth).toBe('poor');
    });

    it('provides weekly progress info', async () => {
      const insights = await improver.getLearningInsights();
      expect(insights.weeklyProgress).toHaveProperty('applications');
      expect(insights.weeklyProgress).toHaveProperty('responses');
      expect(insights.weeklyProgress).toHaveProperty('interviews');
      expect(insights.weeklyProgress).toHaveProperty('trend');
    });

    it('suggests following up on stale apps', async () => {
      mockOutcomeTracker.getNeedingAttention.mockReturnValueOnce([
        { id: 'app1', company: 'Stale Corp' },
        { id: 'app2', company: 'Old Inc' },
      ]);

      const insights = await improver.getLearningInsights();
      const followUp = insights.nextActions.find((a) => a.includes('Follow up'));
      expect(followUp).toBeDefined();
      expect(followUp).toContain('2');
    });
  });

  describe('getJobSpecificRecommendations', () => {
    it('returns keyword recs, platform tips, and score', async () => {
      const result = await improver.getJobSpecificRecommendations(
        ['React', 'TypeScript', 'GraphQL'],
        ['React', 'TypeScript'],
        'linkedin'
      );

      expect(result).toHaveProperty('keywordRecs');
      expect(result).toHaveProperty('platformTips');
      expect(result).toHaveProperty('score');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('calculates match score correctly', async () => {
      const result = await improver.getJobSpecificRecommendations(
        ['React', 'TypeScript', 'Node.js', 'GraphQL'],
        ['React', 'TypeScript'],
        'linkedin'
      );

      // 2/4 = 50% match
      expect(result.score).toBe(50);
    });
  });
});
