/**
 * Adaptive Keyword Database
 * Self-improving keyword system that learns from application outcomes
 *
 * Key features:
 * - Tracks keyword effectiveness per platform
 * - Auto-adjusts weights based on success rates
 * - Industry-specific keyword clustering
 * - Time-decay for outdated keywords
 */

import { HIGH_VALUE_KEYWORDS, getKeywordVariations } from '../ats/platform-strategies';

export interface KeywordEntry {
  keyword: string;
  variations: string[];
  category: KeywordCategory;
  industry: string[];

  // Performance metrics
  globalScore: number; // 0-100, overall effectiveness
  platformScores: Record<string, number>; // Per-platform scores
  successRate: number; // Applications that got responses
  interviewRate: number; // Applications that got interviews

  // Trend tracking
  trend: 'rising' | 'stable' | 'declining';
  lastUpdated: number;
  usageCount: number;

  // Semantic relationships
  relatedKeywords: string[];
  synonyms: string[];
}

export type KeywordCategory =
  | 'technical_skill'
  | 'soft_skill'
  | 'tool'
  | 'framework'
  | 'language'
  | 'methodology'
  | 'certification'
  | 'domain'
  | 'action_verb'
  | 'emerging';

export interface IndustryCluster {
  industry: string;
  topKeywords: string[];
  emergingKeywords: string[];
  decliningKeywords: string[];
  avgSuccessRate: number;
}

export interface KeywordRecommendation {
  keyword: string;
  reason: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  expectedImpact: number;
  placement: string[];
}

const STORAGE_KEY = 'adaptive_keywords';

/**
 * Adaptive Keyword Database
 * Learns and improves keyword recommendations automatically
 */
export class AdaptiveKeywordDB {
  private keywords: Map<string, KeywordEntry> = new Map();
  private industryClusters: Map<string, IndustryCluster> = new Map();
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.initializeFromDefaults();
  }

  /**
   * Initialize database with default high-value keywords
   */
  private async initializeFromDefaults(): Promise<void> {
    // Load saved data if exists
    const saved = await this.loadFromStorage();
    if (saved && saved.keywords.length > 0) {
      for (const entry of saved.keywords) {
        this.keywords.set(entry.keyword.toLowerCase(), entry);
      }
      return;
    }

    // Initialize from HIGH_VALUE_KEYWORDS
    for (const [category, keywords] of Object.entries(HIGH_VALUE_KEYWORDS)) {
      for (const keyword of keywords) {
        const entry: KeywordEntry = {
          keyword,
          variations: getKeywordVariations(keyword),
          category: this.mapCategory(category),
          industry: this.inferIndustry(category),
          globalScore: 75, // Default starting score
          platformScores: {},
          successRate: 0.5, // Neutral starting point
          interviewRate: 0.3,
          trend: 'stable',
          lastUpdated: Date.now(),
          usageCount: 0,
          relatedKeywords: [],
          synonyms: [],
        };
        this.keywords.set(keyword.toLowerCase(), entry);
      }
    }

    // Add semantic relationships
    this.buildSemanticRelationships();
    await this.saveToStorage();
  }

  /**
   * Map category string to KeywordCategory
   */
  private mapCategory(category: string): KeywordCategory {
    const mapping: Record<string, KeywordCategory> = {
      programming: 'language',
      frontend: 'framework',
      backend: 'framework',
      cloud: 'tool',
      ai_ml: 'technical_skill',
      data: 'technical_skill',
      emerging_2025: 'emerging',
      soft_skills: 'soft_skill',
      remote_work: 'tool',
    };
    return mapping[category] || 'technical_skill';
  }

  /**
   * Infer industry from category
   */
  private inferIndustry(category: string): string[] {
    const mapping: Record<string, string[]> = {
      programming: ['technology', 'software', 'fintech'],
      frontend: ['technology', 'software', 'agency'],
      backend: ['technology', 'software', 'enterprise'],
      cloud: ['technology', 'cloud', 'enterprise'],
      ai_ml: ['technology', 'ai', 'research', 'fintech'],
      data: ['technology', 'analytics', 'fintech', 'healthcare'],
      emerging_2025: ['technology', 'ai', 'startup'],
      soft_skills: ['all'],
      remote_work: ['all'],
    };
    return mapping[category] || ['technology'];
  }

  /**
   * Build semantic relationships between keywords
   */
  private buildSemanticRelationships(): void {
    const relationships: Record<string, string[]> = {
      react: ['javascript', 'typescript', 'redux', 'next.js', 'frontend'],
      python: ['django', 'fastapi', 'flask', 'pandas', 'numpy'],
      'node.js': ['javascript', 'express', 'typescript', 'backend'],
      aws: ['cloud', 'docker', 'kubernetes', 'terraform', 'devops'],
      'machine learning': ['python', 'tensorflow', 'pytorch', 'data science', 'ai'],
      docker: ['kubernetes', 'containerization', 'devops', 'ci/cd'],
      postgresql: ['sql', 'database', 'backend', 'data'],
      leadership: ['management', 'team leadership', 'mentoring', 'communication'],
      agile: ['scrum', 'kanban', 'project management', 'sprint'],
    };

    for (const [keyword, related] of Object.entries(relationships)) {
      const entry = this.keywords.get(keyword.toLowerCase());
      if (entry) {
        entry.relatedKeywords = related;
      }
    }
  }

  /**
   * Record keyword usage in an application
   */
  async recordUsage(keywords: string[], platform: string, _jobRole: string): Promise<void> {
    await this.initPromise;
    for (const keyword of keywords) {
      const key = keyword.toLowerCase();
      const entry = this.keywords.get(key);

      if (entry) {
        entry.usageCount++;
        entry.lastUpdated = Date.now();

        // Initialize platform score if not exists
        if (!entry.platformScores[platform]) {
          entry.platformScores[platform] = 50;
        }
      } else {
        // New keyword discovered - add with low initial score
        const newEntry: KeywordEntry = {
          keyword,
          variations: [keyword],
          category: 'technical_skill',
          industry: ['unknown'],
          globalScore: 50,
          platformScores: { [platform]: 50 },
          successRate: 0.5,
          interviewRate: 0.3,
          trend: 'stable',
          lastUpdated: Date.now(),
          usageCount: 1,
          relatedKeywords: [],
          synonyms: [],
        };
        this.keywords.set(key, newEntry);
      }
    }

    await this.saveToStorage();
  }

  /**
   * Update keyword performance based on application outcome
   */
  async updateFromOutcome(
    keywords: string[],
    platform: string,
    outcome: 'no_response' | 'rejected' | 'interview' | 'offer'
  ): Promise<void> {
    await this.initPromise;
    const outcomeScores: Record<string, number> = {
      no_response: -5,
      rejected: -2,
      interview: 10,
      offer: 20,
    };

    const scoreChange = outcomeScores[outcome] || 0;

    for (const keyword of keywords) {
      const key = keyword.toLowerCase();
      const entry = this.keywords.get(key);

      if (entry) {
        // Update global score with dampening
        const dampening = Math.min(1, 10 / (entry.usageCount + 1));
        entry.globalScore = Math.max(0, Math.min(100, entry.globalScore + scoreChange * dampening));

        // Update platform-specific score
        const platformScore = entry.platformScores[platform] || 50;
        entry.platformScores[platform] = Math.max(
          0,
          Math.min(100, platformScore + scoreChange * 1.5 * dampening)
        );

        // Update success/interview rates
        if (outcome === 'interview' || outcome === 'offer') {
          entry.successRate = entry.successRate * 0.9 + 0.1;
          if (outcome === 'offer') {
            entry.interviewRate = entry.interviewRate * 0.9 + 0.1;
          }
        } else if (outcome === 'no_response') {
          entry.successRate = entry.successRate * 0.95;
        }

        // Update trend
        entry.trend = this.calculateTrend(entry);
        entry.lastUpdated = Date.now();
      }
    }

    await this.saveToStorage();
  }

  /**
   * Calculate keyword trend based on recent performance
   */
  private calculateTrend(entry: KeywordEntry): 'rising' | 'stable' | 'declining' {
    const daysSinceUpdate = (Date.now() - entry.lastUpdated) / (1000 * 60 * 60 * 24);

    if (daysSinceUpdate > 30) {
      // Stale data - apply time decay
      return entry.globalScore > 60 ? 'stable' : 'declining';
    }

    if (entry.successRate > 0.6 && entry.globalScore > 75) {
      return 'rising';
    } else if (entry.successRate < 0.3 || entry.globalScore < 40) {
      return 'declining';
    }

    return 'stable';
  }

  /**
   * Get smart keyword recommendations for a job
   */
  getRecommendations(
    jobKeywords: string[],
    resumeKeywords: string[],
    platform: string,
    _industry?: string
  ): KeywordRecommendation[] {
    const recommendations: KeywordRecommendation[] = [];
    const resumeSet = new Set(resumeKeywords.map((k) => k.toLowerCase()));

    for (const jobKeyword of jobKeywords) {
      const key = jobKeyword.toLowerCase();

      // Skip if already in resume
      if (resumeSet.has(key)) continue;

      const entry = this.keywords.get(key);
      const platformScore = entry?.platformScores[platform] || 50;
      const globalScore = entry?.globalScore || 50;

      // Calculate expected impact
      const expectedImpact = platformScore * 0.6 + globalScore * 0.4;

      // Determine priority
      let priority: 'critical' | 'high' | 'medium' | 'low';
      if (expectedImpact > 80) priority = 'critical';
      else if (expectedImpact > 65) priority = 'high';
      else if (expectedImpact > 50) priority = 'medium';
      else priority = 'low';

      // Build reason
      let reason = '';
      if (entry?.trend === 'rising') {
        reason = `High-performing keyword on ${platform} (${Math.round(platformScore)}% success rate)`;
      } else if (platformScore > 70) {
        reason = `Strong performer on ${platform}`;
      } else {
        reason = `Mentioned in job description`;
      }

      recommendations.push({
        keyword: jobKeyword,
        reason,
        priority,
        expectedImpact,
        placement: this.suggestPlacement(entry?.category),
      });
    }

    // Sort by expected impact
    recommendations.sort((a, b) => b.expectedImpact - a.expectedImpact);

    // Add related keywords that are trending
    const relatedRecs = this.getTrendingRelated(jobKeywords, resumeSet, platform);
    recommendations.push(...relatedRecs);

    return recommendations.slice(0, 15); // Top 15 recommendations
  }

  /**
   * Get trending related keywords
   */
  private getTrendingRelated(
    jobKeywords: string[],
    resumeSet: Set<string>,
    _platform: string
  ): KeywordRecommendation[] {
    const related: KeywordRecommendation[] = [];
    const seen = new Set<string>();

    for (const jk of jobKeywords) {
      const entry = this.keywords.get(jk.toLowerCase());
      if (!entry?.relatedKeywords) continue;

      for (const rk of entry.relatedKeywords) {
        const key = rk.toLowerCase();
        if (resumeSet.has(key) || seen.has(key)) continue;

        const relatedEntry = this.keywords.get(key);
        if (relatedEntry?.trend === 'rising') {
          seen.add(key);
          related.push({
            keyword: rk,
            reason: `Trending related skill (${relatedEntry.successRate * 100}% success rate)`,
            priority: 'medium',
            expectedImpact: relatedEntry.globalScore,
            placement: this.suggestPlacement(relatedEntry.category),
          });
        }
      }
    }

    return related;
  }

  /**
   * Suggest placement locations for keyword
   */
  private suggestPlacement(category?: KeywordCategory): string[] {
    const placements: Record<KeywordCategory, string[]> = {
      technical_skill: ['Skills section', 'Experience bullets'],
      soft_skill: ['Summary', 'Experience bullets'],
      tool: ['Skills section', 'Experience bullets'],
      framework: ['Skills section', 'Experience bullets', 'Projects'],
      language: ['Skills section'],
      methodology: ['Summary', 'Experience bullets'],
      certification: ['Certifications section', 'Summary'],
      domain: ['Summary', 'Experience descriptions'],
      action_verb: ['Experience bullets'],
      emerging: ['Skills section', 'Summary'],
    };

    return placements[category || 'technical_skill'];
  }

  /**
   * Get auto-improvement actions (no user input needed)
   */
  async getAutoImprovements(): Promise<{
    keywordsToEmphasize: string[];
    keywordsToDeemphasize: string[];
    platformInsights: Record<string, string>;
    emergingToAdd: string[];
  }> {
    await this.initPromise;
    const keywordsToEmphasize: string[] = [];
    const keywordsToDeemphasize: string[] = [];
    const emergingToAdd: string[] = [];
    const platformInsights: Record<string, string> = {};

    // Analyze all keywords
    for (const [, entry] of this.keywords.entries()) {
      if (entry.trend === 'rising' && entry.globalScore > 70) {
        keywordsToEmphasize.push(entry.keyword);
      }

      if (entry.trend === 'declining' && entry.globalScore < 40) {
        keywordsToDeemphasize.push(entry.keyword);
      }

      if (entry.category === 'emerging' && entry.successRate > 0.5) {
        emergingToAdd.push(entry.keyword);
      }
    }

    // Platform insights
    const platforms = ['greenhouse', 'lever', 'workday', 'linkedin', 'indeed'];
    for (const platform of platforms) {
      const topKeywords = Array.from(this.keywords.values())
        .filter((e) => (e.platformScores[platform] || 0) > 70)
        .sort((a, b) => (b.platformScores[platform] || 0) - (a.platformScores[platform] || 0))
        .slice(0, 3)
        .map((e) => e.keyword);

      if (topKeywords.length > 0) {
        platformInsights[platform] = `Focus on: ${topKeywords.join(', ')}`;
      }
    }

    return {
      keywordsToEmphasize: keywordsToEmphasize.slice(0, 10),
      keywordsToDeemphasize: keywordsToDeemphasize.slice(0, 5),
      platformInsights,
      emergingToAdd: emergingToAdd.slice(0, 5),
    };
  }

  /**
   * Get industry-specific insights
   */
  getIndustryInsights(industry: string): IndustryCluster | null {
    return this.industryClusters.get(industry) || null;
  }

  /**
   * Save to chrome.storage
   */
  private async saveToStorage(): Promise<void> {
    try {
      const data = {
        keywords: Array.from(this.keywords.values()),
        lastSaved: Date.now(),
      };

      await chrome.storage.local.set({ [STORAGE_KEY]: data });
    } catch (error) {
      console.debug('[AdaptiveKeywords] Failed to save to storage:', (error as Error).message);
    }
  }

  /**
   * Load from chrome.storage
   */
  private async loadFromStorage(): Promise<{ keywords: KeywordEntry[] } | null> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return result[STORAGE_KEY] || null;
    } catch (error) {
      console.debug('[AdaptiveKeywords] Failed to load from storage:', (error as Error).message);
      return null;
    }
  }

  /**
   * Apply time decay to stale keywords
   * Run this periodically (e.g., daily)
   */
  async applyTimeDecay(): Promise<void> {
    await this.initPromise;
    const now = Date.now();
    const DECAY_THRESHOLD = 30 * 24 * 60 * 60 * 1000; // 30 days
    const DECAY_FACTOR = 0.95;

    for (const [, entry] of this.keywords.entries()) {
      const age = now - entry.lastUpdated;

      if (age > DECAY_THRESHOLD) {
        const decayPeriods = Math.floor(age / DECAY_THRESHOLD);
        const decay = Math.pow(DECAY_FACTOR, decayPeriods);

        entry.globalScore = Math.max(30, entry.globalScore * decay);

        for (const platform of Object.keys(entry.platformScores)) {
          entry.platformScores[platform] = Math.max(
            30,
            (entry.platformScores[platform] || 50) * decay
          );
        }

        entry.trend = 'declining';
      }
    }

    await this.saveToStorage();
  }

  /**
   * Get all keywords for a category
   */
  getByCategory(category: KeywordCategory): KeywordEntry[] {
    return Array.from(this.keywords.values())
      .filter((e) => e.category === category)
      .sort((a, b) => b.globalScore - a.globalScore);
  }

  /**
   * Search keywords
   */
  search(query: string): KeywordEntry[] {
    const q = query.toLowerCase();
    return Array.from(this.keywords.values())
      .filter(
        (e) =>
          e.keyword.toLowerCase().includes(q) ||
          e.variations.some((v) => v.toLowerCase().includes(q))
      )
      .sort((a, b) => b.globalScore - a.globalScore);
  }
}

// Singleton instance
export const adaptiveKeywordDB = new AdaptiveKeywordDB();
