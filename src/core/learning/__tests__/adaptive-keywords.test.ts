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

// Mock platform-strategies
vi.mock('../../ats/platform-strategies', () => ({
  HIGH_VALUE_KEYWORDS: {
    programming: ['JavaScript', 'Python', 'TypeScript'],
    frontend: ['React', 'Vue'],
    cloud: ['AWS', 'Docker'],
    emerging_2025: ['GenAI'],
  },
  getKeywordVariations: (keyword: string) => [keyword, keyword.toLowerCase()],
}));

import { AdaptiveKeywordDB } from '../adaptive-keywords';

describe('AdaptiveKeywordDB', () => {
  let db: AdaptiveKeywordDB;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear storage
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
    db = new AdaptiveKeywordDB();
  });

  describe('initializeFromDefaults', () => {
    it('initializes with HIGH_VALUE_KEYWORDS when no saved data exists', async () => {
      // Wait for init
      const recs = db.getRecommendations(['JavaScript'], [], 'linkedin');
      // Should not crash — init is async but getRecommendations is sync
      expect(Array.isArray(recs)).toBe(true);
    });

    it('loads from storage when saved data exists', async () => {
      mockStorage['adaptive_keywords'] = {
        keywords: [
          {
            keyword: 'Rust',
            variations: ['Rust'],
            category: 'language',
            industry: ['technology'],
            globalScore: 90,
            platformScores: {},
            successRate: 0.8,
            interviewRate: 0.5,
            trend: 'rising',
            lastUpdated: Date.now(),
            usageCount: 5,
            relatedKeywords: [],
            synonyms: [],
          },
        ],
      };

      const freshDb = new AdaptiveKeywordDB();
      // Give init time
      await new Promise((r) => setTimeout(r, 50));
      const results = freshDb.search('Rust');
      expect(results.length).toBe(1);
      expect(results[0].globalScore).toBe(90);
    });
  });

  describe('recordUsage', () => {
    it('increments usage count for existing keywords', async () => {
      await db.recordUsage(['JavaScript'], 'linkedin', 'Frontend Developer');
      const results = db.search('JavaScript');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].usageCount).toBeGreaterThanOrEqual(1);
    });

    it('creates new entry for unknown keywords', async () => {
      await db.recordUsage(['GraphQL'], 'greenhouse', 'Backend Developer');
      const results = db.search('GraphQL');
      expect(results.length).toBe(1);
      expect(results[0].usageCount).toBe(1);
      expect(results[0].globalScore).toBe(50); // Default for new
    });

    it('initializes platform score for new platforms', async () => {
      await db.recordUsage(['JavaScript'], 'workday', 'Dev');
      const results = db.search('JavaScript');
      expect(results[0].platformScores['workday']).toBe(50);
    });

    it('saves to storage after recording', async () => {
      await db.recordUsage(['Python'], 'indeed', 'Dev');
      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('updateFromOutcome', () => {
    it('increases score on interview outcome', async () => {
      await db.recordUsage(['JavaScript'], 'linkedin', 'Dev');
      const beforeResults = db.search('JavaScript');
      const beforeScore = beforeResults[0].globalScore;

      await db.updateFromOutcome(['JavaScript'], 'linkedin', 'interview');
      const afterResults = db.search('JavaScript');
      expect(afterResults[0].globalScore).toBeGreaterThan(beforeScore);
    });

    it('increases score more on offer outcome', async () => {
      await db.recordUsage(['Python'], 'linkedin', 'Dev');

      await db.updateFromOutcome(['Python'], 'linkedin', 'interview');
      const afterInterview = db.search('Python')[0].globalScore;

      // Reset and test offer
      await db.recordUsage(['TypeScript'], 'linkedin', 'Dev');
      await db.updateFromOutcome(['TypeScript'], 'linkedin', 'offer');
      const afterOffer = db.search('TypeScript')[0].globalScore;

      // Offer should boost more (20 vs 10 base points)
      expect(afterOffer).toBeGreaterThan(afterInterview);
    });

    it('decreases score on no_response outcome', async () => {
      await db.recordUsage(['JavaScript'], 'linkedin', 'Dev');
      const before = db.search('JavaScript')[0].globalScore;

      await db.updateFromOutcome(['JavaScript'], 'linkedin', 'no_response');
      const after = db.search('JavaScript')[0].globalScore;
      expect(after).toBeLessThan(before);
    });

    it('decreases score on rejected outcome', async () => {
      await db.recordUsage(['JavaScript'], 'linkedin', 'Dev');
      const before = db.search('JavaScript')[0].globalScore;

      await db.updateFromOutcome(['JavaScript'], 'linkedin', 'rejected');
      const after = db.search('JavaScript')[0].globalScore;
      expect(after).toBeLessThan(before);
    });

    it('applies dampening based on usage count', async () => {
      // Record many usages to reduce dampening
      for (let i = 0; i < 20; i++) {
        await db.recordUsage(['JavaScript'], 'linkedin', 'Dev');
      }
      const before = db.search('JavaScript')[0].globalScore;

      await db.updateFromOutcome(['JavaScript'], 'linkedin', 'interview');
      const after = db.search('JavaScript')[0].globalScore;

      // With high usage count, dampening should reduce the impact
      expect(after - before).toBeLessThan(10);
    });

    it('updates platform-specific score with 1.5x multiplier', async () => {
      await db.recordUsage(['JavaScript'], 'linkedin', 'Dev');
      const beforePlatform = db.search('JavaScript')[0].platformScores['linkedin'] || 50;

      await db.updateFromOutcome(['JavaScript'], 'linkedin', 'interview');
      const afterPlatform = db.search('JavaScript')[0].platformScores['linkedin'];

      // Platform score change should be ~1.5x global change
      expect(afterPlatform).toBeGreaterThan(beforePlatform);
    });

    it('updates success and interview rates', async () => {
      await db.recordUsage(['JavaScript'], 'linkedin', 'Dev');

      await db.updateFromOutcome(['JavaScript'], 'linkedin', 'offer');
      const result = db.search('JavaScript')[0];
      expect(result.successRate).toBeGreaterThan(0.5);
      expect(result.interviewRate).toBeGreaterThan(0.3);
    });
  });

  describe('calculateTrend', () => {
    it('marks keywords as rising when high score and success rate', async () => {
      // Set up a high-performing keyword
      await db.recordUsage(['JavaScript'], 'linkedin', 'Dev');
      // Multiple positive outcomes
      for (let i = 0; i < 5; i++) {
        await db.updateFromOutcome(['JavaScript'], 'linkedin', 'interview');
      }
      const result = db.search('JavaScript')[0];
      expect(result.trend).toBe('rising');
    });

    it('marks keywords as declining when low score', async () => {
      await db.recordUsage(['JavaScript'], 'linkedin', 'Dev');
      for (let i = 0; i < 10; i++) {
        await db.updateFromOutcome(['JavaScript'], 'linkedin', 'no_response');
      }
      const result = db.search('JavaScript')[0];
      expect(result.trend).toBe('declining');
    });
  });

  describe('getRecommendations', () => {
    it('returns recommendations for missing keywords', async () => {
      await db.recordUsage(['JavaScript', 'React'], 'linkedin', 'Dev');
      const recs = db.getRecommendations(
        ['JavaScript', 'React', 'GraphQL'],
        ['JavaScript'],
        'linkedin'
      );
      // Should recommend React and GraphQL (not JavaScript since it's in resume)
      const keywords = recs.map((r) => r.keyword);
      expect(keywords).toContain('React');
      expect(keywords).not.toContain('JavaScript');
    });

    it('sorts by expected impact', () => {
      const recs = db.getRecommendations(
        ['JavaScript', 'React', 'GraphQL', 'Rust'],
        [],
        'linkedin'
      );
      for (let i = 1; i < recs.length; i++) {
        expect(recs[i].expectedImpact).toBeLessThanOrEqual(recs[i - 1].expectedImpact);
      }
    });

    it('limits to 15 recommendations', () => {
      const manyKeywords = Array.from({ length: 30 }, (_, i) => `Skill${i}`);
      const recs = db.getRecommendations(manyKeywords, [], 'linkedin');
      expect(recs.length).toBeLessThanOrEqual(15);
    });

    it('assigns correct priority levels', () => {
      const recs = db.getRecommendations(['JavaScript'], [], 'linkedin');
      for (const rec of recs) {
        expect(['critical', 'high', 'medium', 'low']).toContain(rec.priority);
      }
    });
  });

  describe('applyTimeDecay', () => {
    it('decays scores for stale keywords', async () => {
      await db.recordUsage(['JavaScript'], 'linkedin', 'Dev');
      const before = db.search('JavaScript')[0].globalScore;

      // Manually set lastUpdated to 60 days ago
      const entry = db.search('JavaScript')[0];
      entry.lastUpdated = Date.now() - 60 * 24 * 60 * 60 * 1000;

      await db.applyTimeDecay();
      const after = db.search('JavaScript')[0];
      expect(after.globalScore).toBeLessThan(before);
      expect(after.trend).toBe('declining');
    });

    it('does not decay recently updated keywords', async () => {
      await db.recordUsage(['JavaScript'], 'linkedin', 'Dev');
      const before = db.search('JavaScript')[0].globalScore;

      await db.applyTimeDecay();
      const after = db.search('JavaScript')[0].globalScore;
      expect(after).toBe(before);
    });

    it('enforces minimum score of 30', async () => {
      await db.recordUsage(['JavaScript'], 'linkedin', 'Dev');
      const entry = db.search('JavaScript')[0];
      entry.globalScore = 31;
      entry.lastUpdated = Date.now() - 365 * 24 * 60 * 60 * 1000; // 1 year ago

      await db.applyTimeDecay();
      const after = db.search('JavaScript')[0];
      expect(after.globalScore).toBeGreaterThanOrEqual(30);
    });
  });

  describe('getByCategory', () => {
    it('returns keywords filtered by category', () => {
      const languages = db.getByCategory('language');
      for (const entry of languages) {
        expect(entry.category).toBe('language');
      }
    });

    it('returns results sorted by globalScore', () => {
      const results = db.getByCategory('language');
      for (let i = 1; i < results.length; i++) {
        expect(results[i].globalScore).toBeLessThanOrEqual(results[i - 1].globalScore);
      }
    });
  });

  describe('search', () => {
    it('finds keywords by name', () => {
      const results = db.search('java');
      expect(results.length).toBeGreaterThan(0);
    });

    it('finds keywords by variation', () => {
      const results = db.search('javascript');
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns empty for non-existent keywords', () => {
      const results = db.search('xyznonexistent');
      expect(results.length).toBe(0);
    });
  });

  describe('getAutoImprovements', () => {
    it('returns improvement data structure', async () => {
      const improvements = await db.getAutoImprovements();
      expect(improvements).toHaveProperty('keywordsToEmphasize');
      expect(improvements).toHaveProperty('keywordsToDeemphasize');
      expect(improvements).toHaveProperty('platformInsights');
      expect(improvements).toHaveProperty('emergingToAdd');
      expect(Array.isArray(improvements.keywordsToEmphasize)).toBe(true);
      expect(Array.isArray(improvements.keywordsToDeemphasize)).toBe(true);
      expect(Array.isArray(improvements.emergingToAdd)).toBe(true);
    });

    it('limits results', async () => {
      const improvements = await db.getAutoImprovements();
      expect(improvements.keywordsToEmphasize.length).toBeLessThanOrEqual(10);
      expect(improvements.keywordsToDeemphasize.length).toBeLessThanOrEqual(5);
      expect(improvements.emergingToAdd.length).toBeLessThanOrEqual(5);
    });
  });
});
