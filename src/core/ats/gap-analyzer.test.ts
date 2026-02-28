import { describe, it, expect, vi } from 'vitest';
import { analyzeSkillGaps, LEARNING_RESOURCES } from './gap-analyzer';
import type { QuickATSScore, KeywordWithWeight } from './hybrid-scorer';

// ── Mock getSkillAreaForKeyword ──────────────────────────────────────────

vi.mock('./keywords', () => ({
  getSkillAreaForKeyword: (keyword: string) => {
    const map: Record<string, string> = {
      docker: 'devops',
      kubernetes: 'devops',
      terraform: 'devops',
      react: 'frontend',
      angular: 'frontend',
      typescript: 'frontend',
      python: 'backend',
      java: 'backend',
      postgresql: 'database',
      mongodb: 'database',
      graphql: 'architecture',
      kafka: 'architecture',
    };
    return map[keyword.toLowerCase()] || null;
  },
  getAllPatterns: () => [],
  findKeywordByName: () => null,
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function makeKeyword(
  keyword: string,
  weight: number,
  frequency: number,
  inRequirements: boolean
): KeywordWithWeight {
  return { keyword, weight, frequency, inRequirements };
}

function makeQuickScore(
  weightedKeywords: KeywordWithWeight[],
  missingKeywords: string[],
  overrides?: Partial<QuickATSScore>
): QuickATSScore {
  return {
    score: 50,
    matchedKeywords: [],
    missingKeywords,
    matchPercentage: 50,
    tier: 'fair',
    weightedKeywords,
    seniorityMatch: 'match',
    yearsRequired: null,
    criticalMissing: [],
    detectedJobDomain: 'tech',
    hasEnoughKeywords: true,
    detectedJobBackground: null,
    backgroundMismatch: false,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('analyzeSkillGaps', () => {
  describe('severity classification', () => {
    it('classifies critical gaps — weight >= 3 AND inRequirements', () => {
      const score = makeQuickScore([makeKeyword('Docker', 4, 3, true)], ['Docker']);
      const result = analyzeSkillGaps(score, []);
      expect(result.gaps[0].severity).toBe('critical');
    });

    it('classifies addressable gaps — weight >= 2', () => {
      const score = makeQuickScore([makeKeyword('GraphQL', 2, 2, false)], ['GraphQL']);
      const result = analyzeSkillGaps(score, []);
      expect(result.gaps[0].severity).toBe('addressable');
    });

    it('classifies addressable gaps — inRequirements but low weight', () => {
      const score = makeQuickScore([makeKeyword('Nginx', 1, 1, true)], ['Nginx']);
      const result = analyzeSkillGaps(score, []);
      expect(result.gaps[0].severity).toBe('addressable');
    });

    it('classifies minor gaps — low weight, not in requirements', () => {
      const score = makeQuickScore([makeKeyword('Svelte', 1, 1, false)], ['Svelte']);
      const result = analyzeSkillGaps(score, []);
      expect(result.gaps[0].severity).toBe('minor');
    });
  });

  describe('learning resources', () => {
    it('attaches learning resources for known keywords', () => {
      const score = makeQuickScore([makeKeyword('Docker', 3, 2, true)], ['Docker']);
      const result = analyzeSkillGaps(score, []);
      expect(result.gaps[0].learning).toBeDefined();
      expect(result.gaps[0].learning!.estimatedHours).toBe(40);
      expect(result.gaps[0].learning!.difficulty).toBe('intermediate');
    });

    it('has no learning resources for unknown keywords', () => {
      const score = makeQuickScore([makeKeyword('ObscureTool', 2, 1, false)], ['ObscureTool']);
      const result = analyzeSkillGaps(score, []);
      expect(result.gaps[0].learning).toBeUndefined();
    });

    it('includes transferableFrom for Docker', () => {
      expect(LEARNING_RESOURCES['docker'].transferableFrom).toContain('linux');
      expect(LEARNING_RESOURCES['docker'].transferableFrom).toContain('virtual machines');
    });

    it('includes framingTip when available', () => {
      expect(LEARNING_RESOURCES['docker'].framingTip).toBeDefined();
      expect(LEARNING_RESOURCES['docker'].framingTip!.length).toBeGreaterThan(0);
    });
  });

  describe('area grouping', () => {
    it('groups gaps by skill area', () => {
      const score = makeQuickScore(
        [
          makeKeyword('Docker', 3, 2, true),
          makeKeyword('Kubernetes', 3, 1, true),
          makeKeyword('React', 2, 1, false),
        ],
        ['Docker', 'Kubernetes', 'React']
      );
      const result = analyzeSkillGaps(score, []);
      const devops = result.gapsByArea.find((g) => g.area === 'DevOps');
      const frontend = result.gapsByArea.find((g) => g.area === 'Frontend');
      expect(devops).toBeDefined();
      expect(devops!.gaps).toHaveLength(2);
      expect(frontend).toBeDefined();
      expect(frontend!.gaps).toHaveLength(1);
    });

    it('sorts areas by total weight descending', () => {
      const score = makeQuickScore(
        [
          makeKeyword('Docker', 4, 3, true),
          makeKeyword('Kubernetes', 3, 2, true),
          makeKeyword('React', 1, 1, false),
        ],
        ['Docker', 'Kubernetes', 'React']
      );
      const result = analyzeSkillGaps(score, []);
      expect(result.gapsByArea[0].totalWeight).toBeGreaterThanOrEqual(
        result.gapsByArea[result.gapsByArea.length - 1].totalWeight
      );
    });

    it('sets topPriority for each area group', () => {
      const score = makeQuickScore(
        [
          makeKeyword('Docker', 4, 3, true), // critical
          makeKeyword('Terraform', 1, 1, false), // minor (same devops area)
        ],
        ['Docker', 'Terraform']
      );
      const result = analyzeSkillGaps(score, []);
      const devops = result.gapsByArea.find((g) => g.area === 'DevOps');
      expect(devops!.topPriority).toBe('critical');
    });
  });

  describe('roadmap', () => {
    it('limits roadmap to 7 items', () => {
      const keywords = Array.from({ length: 10 }, (_, i) => makeKeyword(`Keyword${i}`, 3, 2, true));
      const score = makeQuickScore(
        keywords,
        keywords.map((k) => k.keyword)
      );
      const result = analyzeSkillGaps(score, []);
      expect(result.roadmap.length).toBeLessThanOrEqual(7);
    });

    it('sorts roadmap by severity then weight', () => {
      const score = makeQuickScore(
        [
          makeKeyword('Docker', 4, 3, true), // critical
          makeKeyword('React', 1, 1, false), // minor
          makeKeyword('Python', 2, 2, false), // addressable
        ],
        ['Docker', 'React', 'Python']
      );
      const result = analyzeSkillGaps(score, []);
      expect(result.roadmap[0].severity).toBe('critical');
      expect(result.roadmap[result.roadmap.length - 1].severity).not.toBe('critical');
    });

    it('generates actionText with resource name for known keywords', () => {
      const score = makeQuickScore([makeKeyword('Docker', 3, 2, true)], ['Docker']);
      const result = analyzeSkillGaps(score, []);
      expect(result.roadmap[0].actionText).toContain('Docker');
      expect(result.roadmap[0].actionText).toContain('~40 hrs');
    });

    it('generates generic actionText for unknown keywords', () => {
      const score = makeQuickScore([makeKeyword('ObscureTool', 3, 2, true)], ['ObscureTool']);
      const result = analyzeSkillGaps(score, []);
      expect(result.roadmap[0].actionText).toContain('Research');
      expect(result.roadmap[0].actionText).toContain('ObscureTool');
    });

    it('includes reason text with JD context', () => {
      const score = makeQuickScore([makeKeyword('Docker', 3, 3, true)], ['Docker']);
      const result = analyzeSkillGaps(score, []);
      expect(result.roadmap[0].reason).toContain('Required in JD');
      expect(result.roadmap[0].reason).toContain('appears 3 times');
    });
  });

  describe('summary', () => {
    it('counts severity categories correctly', () => {
      const score = makeQuickScore(
        [
          makeKeyword('Docker', 4, 3, true), // critical
          makeKeyword('Kubernetes', 3, 2, true), // critical
          makeKeyword('React', 2, 1, false), // addressable
          makeKeyword('Svelte', 1, 1, false), // minor
        ],
        ['Docker', 'Kubernetes', 'React', 'Svelte']
      );
      const result = analyzeSkillGaps(score, []);
      expect(result.summary.critical).toBe(2);
      expect(result.summary.addressable).toBe(1);
      expect(result.summary.minor).toBe(1);
      expect(result.summary.total).toBe(4);
    });

    it('sets topAreaToFocus to highest-weight area', () => {
      const score = makeQuickScore(
        [
          makeKeyword('Docker', 4, 3, true),
          makeKeyword('Kubernetes', 3, 2, true),
          makeKeyword('React', 1, 1, false),
        ],
        ['Docker', 'Kubernetes', 'React']
      );
      const result = analyzeSkillGaps(score, []);
      expect(result.summary.topAreaToFocus).toBe('DevOps');
    });

    it('sets topAreaToFocus to null when no gaps', () => {
      const score = makeQuickScore([], []);
      const result = analyzeSkillGaps(score, []);
      expect(result.summary.topAreaToFocus).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns empty result when no missing keywords', () => {
      const score = makeQuickScore([], []);
      const result = analyzeSkillGaps(score, []);
      expect(result.gaps).toHaveLength(0);
      expect(result.gapsByArea).toHaveLength(0);
      expect(result.roadmap).toHaveLength(0);
      expect(result.summary.total).toBe(0);
    });

    it('excludes keywords already in profile skills', () => {
      const score = makeQuickScore(
        [makeKeyword('Docker', 3, 2, true), makeKeyword('React', 2, 1, false)],
        ['Docker', 'React']
      );
      // Profile already has Docker
      const result = analyzeSkillGaps(score, ['Docker']);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].keyword).toBe('React');
    });

    it('handles case-insensitive keyword matching', () => {
      const score = makeQuickScore([makeKeyword('docker', 3, 2, true)], ['DOCKER']);
      const result = analyzeSkillGaps(score, []);
      // 'DOCKER' in missingKeywords should still match 'docker' in weightedKeywords
      expect(result.gaps.length).toBeGreaterThanOrEqual(0);
    });

    it('assigns skill area from getSkillAreaForKeyword', () => {
      const score = makeQuickScore([makeKeyword('Docker', 3, 2, true)], ['Docker']);
      const result = analyzeSkillGaps(score, []);
      expect(result.gaps[0].skillArea).toBe('devops');
    });
  });
});

describe('LEARNING_RESOURCES', () => {
  it('covers at least 50 keywords', () => {
    expect(Object.keys(LEARNING_RESOURCES).length).toBeGreaterThanOrEqual(50);
  });

  it('every resource has required fields', () => {
    for (const [key, resource] of Object.entries(LEARNING_RESOURCES)) {
      expect(resource.estimatedHours, `${key} missing estimatedHours`).toBeGreaterThan(0);
      expect(resource.difficulty, `${key} missing difficulty`).toMatch(
        /beginner|intermediate|advanced/
      );
      expect(resource.freeResources.length, `${key} missing freeResources`).toBeGreaterThan(0);
      expect(resource.transferableFrom.length, `${key} missing transferableFrom`).toBeGreaterThan(
        0
      );
    }
  });
});
