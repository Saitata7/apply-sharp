/**
 * Auto-Improvement System
 * Automatically improves resumes and recommendations based on outcomes
 *
 * This is the brain that:
 * 1. Analyzes patterns from outcomes
 * 2. Generates actionable improvements
 * 3. Applies improvements automatically where safe
 * 4. Surfaces insights without user asking
 */

import { adaptiveKeywordDB, type KeywordRecommendation } from './adaptive-keywords';
import { outcomeTracker } from './outcome-tracker';
import { getPlatformStrategy } from '../ats/platform-strategies';

export interface AutoImprovement {
  id: string;
  type: ImprovementType;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action: ImprovementAction;
  impact: string;
  autoApplicable: boolean;
  createdAt: number;
  appliedAt?: number;
  dismissed?: boolean;
}

export type ImprovementType =
  | 'keyword_add'
  | 'keyword_remove'
  | 'keyword_emphasize'
  | 'format_change'
  | 'content_rewrite'
  | 'answer_update'
  | 'platform_specific'
  | 'timing_insight'
  | 'strategy_shift';

export interface ImprovementAction {
  type: 'add' | 'remove' | 'modify' | 'reorder' | 'info';
  target: 'skills' | 'experience' | 'summary' | 'answers' | 'resume' | 'strategy';
  data: Record<string, unknown>;
}

export interface LearningInsights {
  overallHealth: 'excellent' | 'good' | 'needs_improvement' | 'poor';
  responseRate: number;
  responseRateTrend: 'up' | 'stable' | 'down';
  topPerformingKeywords: string[];
  underperformingKeywords: string[];
  platformRecommendations: Record<string, string>;
  nextActions: string[];
  weeklyProgress: {
    applications: number;
    responses: number;
    interviews: number;
    trend: 'up' | 'stable' | 'down';
  };
}

const STORAGE_KEY = 'auto_improvements';

/**
 * Auto-Improver System
 */
export class AutoImprover {
  private improvements: Map<string, AutoImprovement> = new Map();
  private lastAnalysis: number = 0;
  private analysisInterval = 24 * 60 * 60 * 1000; // Daily
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Load saved improvements
      const saved = await chrome.storage.local.get(STORAGE_KEY);
      if (saved[STORAGE_KEY]) {
        for (const imp of saved[STORAGE_KEY]) {
          this.improvements.set(imp.id, imp);
        }
      }

      // Run analysis if needed (call internal to avoid initPromise deadlock)
      const now = Date.now();
      if (now - this.lastAnalysis > this.analysisInterval) {
        await this.runFullAnalysisInternal();
      }
    } catch (error) {
      console.debug('[AutoImprover] Initialization failed:', (error as Error).message);
    }
  }

  /**
   * Run complete analysis and generate improvements
   */
  async runFullAnalysis(): Promise<AutoImprovement[]> {
    await this.initPromise;
    return this.runFullAnalysisInternal();
  }

  private async runFullAnalysisInternal(): Promise<AutoImprovement[]> {
    console.log('[AutoImprover] Running full analysis...');
    this.lastAnalysis = Date.now();

    const newImprovements: AutoImprovement[] = [];

    // Get stats and keyword data
    const stats = await outcomeTracker.getStats();
    const keywordImprovements = await adaptiveKeywordDB.getAutoImprovements();
    // Note: outcomeTracker.getBestPerformingKeywords() available for future personalized scoring

    // 1. Keyword-based improvements
    for (const kw of keywordImprovements.keywordsToEmphasize.slice(0, 5)) {
      newImprovements.push(
        this.createImprovement({
          type: 'keyword_emphasize',
          priority: 'high',
          title: `Emphasize "${kw}" more`,
          description: `This keyword has been performing well. Consider using it more prominently in your applications.`,
          action: {
            type: 'modify',
            target: 'skills',
            data: { keyword: kw, action: 'emphasize' },
          },
          impact: 'Higher response rates on applications using this keyword',
          autoApplicable: false,
        })
      );
    }

    // 2. Keywords to de-emphasize
    for (const kw of keywordImprovements.keywordsToDeemphasize.slice(0, 3)) {
      newImprovements.push(
        this.createImprovement({
          type: 'keyword_remove',
          priority: 'medium',
          title: `Consider removing or replacing "${kw}"`,
          description: `This keyword hasn't been helping your applications. Consider replacing with a trending alternative.`,
          action: {
            type: 'remove',
            target: 'skills',
            data: { keyword: kw, action: 'remove' },
          },
          impact: 'Cleaner resume with higher-impact keywords',
          autoApplicable: false,
        })
      );
    }

    // 3. Emerging keywords to add
    for (const kw of keywordImprovements.emergingToAdd.slice(0, 3)) {
      newImprovements.push(
        this.createImprovement({
          type: 'keyword_add',
          priority: 'high',
          title: `Add emerging skill: "${kw}"`,
          description: `This skill is trending in 2025 job postings and showing strong performance.`,
          action: {
            type: 'add',
            target: 'skills',
            data: { keyword: kw, category: 'emerging' },
          },
          impact: 'Stay ahead of hiring trends',
          autoApplicable: false,
        })
      );
    }

    // 4. Platform-specific improvements
    for (const [platform, insight] of Object.entries(keywordImprovements.platformInsights)) {
      const strategy = getPlatformStrategy(platform);
      newImprovements.push(
        this.createImprovement({
          type: 'platform_specific',
          priority: 'medium',
          title: `${strategy.name} optimization`,
          description: insight,
          action: {
            type: 'info',
            target: 'strategy',
            data: { platform, strategy: strategy.matchingType },
          },
          impact: `Better ATS matching on ${strategy.name}`,
          autoApplicable: false,
        })
      );
    }

    // 5. Response rate based improvements
    if (stats.responseRate < 0.1) {
      newImprovements.push(
        this.createImprovement({
          type: 'strategy_shift',
          priority: 'critical',
          title: 'Low response rate detected',
          description: `Your response rate is ${Math.round(stats.responseRate * 100)}%. Consider tailoring resumes more closely to job descriptions and using more exact keyword matches.`,
          action: {
            type: 'modify',
            target: 'resume',
            data: { recommendation: 'increase_keyword_matching' },
          },
          impact: 'Could significantly improve response rates',
          autoApplicable: false,
        })
      );
    }

    // 6. Timing insights
    if (stats.avgResponseTimeHours > 0) {
      const avgDays = Math.round(stats.avgResponseTimeHours / 24);
      newImprovements.push(
        this.createImprovement({
          type: 'timing_insight',
          priority: 'low',
          title: `Average response time: ${avgDays} days`,
          description: `Companies typically respond within ${avgDays} days. Consider following up after this period.`,
          action: {
            type: 'info',
            target: 'strategy',
            data: { avgResponseDays: avgDays },
          },
          impact: 'Better follow-up timing',
          autoApplicable: false,
        })
      );
    }

    // Save new improvements (don't duplicate)
    for (const imp of newImprovements) {
      const existing = this.findSimilarImprovement(imp);
      if (!existing) {
        this.improvements.set(imp.id, imp);
      }
    }

    await this.saveToStorage();
    console.log(`[AutoImprover] Generated ${newImprovements.length} improvements`);

    return newImprovements;
  }

  /**
   * Create an improvement entry
   */
  private createImprovement(data: Omit<AutoImprovement, 'id' | 'createdAt'>): AutoImprovement {
    return {
      ...data,
      id: `imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
    };
  }

  /**
   * Find similar existing improvement
   */
  private findSimilarImprovement(imp: AutoImprovement): AutoImprovement | undefined {
    for (const existing of this.improvements.values()) {
      if (
        existing.type === imp.type &&
        existing.title === imp.title &&
        !existing.dismissed &&
        !existing.appliedAt
      ) {
        return existing;
      }
    }
    return undefined;
  }

  /**
   * Get active improvements (not dismissed or applied)
   */
  getActiveImprovements(): AutoImprovement[] {
    return Array.from(this.improvements.values())
      .filter((i) => !i.dismissed && !i.appliedAt)
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }

  /**
   * Get improvements by type
   */
  getByType(type: ImprovementType): AutoImprovement[] {
    return Array.from(this.improvements.values()).filter(
      (i) => i.type === type && !i.dismissed && !i.appliedAt
    );
  }

  /**
   * Mark improvement as applied
   */
  async markApplied(id: string): Promise<void> {
    await this.initPromise;
    const imp = this.improvements.get(id);
    if (imp) {
      imp.appliedAt = Date.now();
      await this.saveToStorage();
    }
  }

  /**
   * Dismiss improvement
   */
  async dismiss(id: string): Promise<void> {
    await this.initPromise;
    const imp = this.improvements.get(id);
    if (imp) {
      imp.dismissed = true;
      await this.saveToStorage();
    }
  }

  /**
   * Get comprehensive learning insights
   */
  async getLearningInsights(): Promise<LearningInsights> {
    await this.initPromise;
    const stats = await outcomeTracker.getStats();
    const bestKeywords = await outcomeTracker.getBestPerformingKeywords();
    const keywordData = await adaptiveKeywordDB.getAutoImprovements();

    // Determine overall health
    let overallHealth: LearningInsights['overallHealth'];
    if (stats.responseRate >= 0.3) overallHealth = 'excellent';
    else if (stats.responseRate >= 0.15) overallHealth = 'good';
    else if (stats.responseRate >= 0.05) overallHealth = 'needs_improvement';
    else overallHealth = 'poor';

    // Determine response rate trend from weekly data
    let responseRateTrend: 'up' | 'stable' | 'down' = 'stable';
    if (stats.weeklyTrend.length >= 4) {
      const recent = stats.weeklyTrend.slice(-4);
      const recentAvg =
        recent.reduce(
          (sum, w) => sum + (w.applications > 0 ? w.responses / w.applications : 0),
          0
        ) / 4;

      const older = stats.weeklyTrend.slice(0, 4);
      const olderAvg =
        older.reduce((sum, w) => sum + (w.applications > 0 ? w.responses / w.applications : 0), 0) /
        4;

      if (recentAvg > olderAvg * 1.1) responseRateTrend = 'up';
      else if (recentAvg < olderAvg * 0.9) responseRateTrend = 'down';
    }

    // Weekly progress
    const lastWeek =
      stats.weeklyTrend.length > 0
        ? stats.weeklyTrend[stats.weeklyTrend.length - 1]
        : { applications: 0, responses: 0, interviews: 0 };

    const prevWeek =
      stats.weeklyTrend.length > 1
        ? stats.weeklyTrend[stats.weeklyTrend.length - 2]
        : { applications: 0, responses: 0, interviews: 0 };

    let weeklyTrend: 'up' | 'stable' | 'down' = 'stable';
    if (lastWeek.responses > prevWeek.responses) weeklyTrend = 'up';
    else if (lastWeek.responses < prevWeek.responses) weeklyTrend = 'down';

    // Build next actions
    const nextActions: string[] = [];

    if (stats.responseRate < 0.1) {
      nextActions.push('Focus on exact keyword matching for job descriptions');
    }

    if (keywordData.emergingToAdd.length > 0) {
      nextActions.push(`Add trending skills: ${keywordData.emergingToAdd.slice(0, 3).join(', ')}`);
    }

    if (stats.totalApplications < 10) {
      nextActions.push('Apply to more jobs to gather learning data');
    }

    const staleApps = outcomeTracker.getNeedingAttention();
    if (staleApps.length > 0) {
      nextActions.push(`Follow up on ${staleApps.length} pending applications`);
    }

    // Platform recommendations
    const platformRecommendations: Record<string, string> = {};
    for (const [platform, pStats] of Object.entries(stats.byPlatform)) {
      const strategy = getPlatformStrategy(platform);
      const responseRate = pStats.applications > 0 ? pStats.responses / pStats.applications : 0;

      if (responseRate < 0.1 && pStats.applications >= 5) {
        if (strategy.keywordFlexibility === 'strict') {
          platformRecommendations[platform] =
            'Use EXACT phrases from job descriptions - this platform requires precise matching';
        } else if (strategy.matchingType === 'frequency') {
          platformRecommendations[platform] =
            'Repeat key skills 2-3 times throughout resume for better ranking';
        } else {
          platformRecommendations[platform] =
            'Focus on demonstrating achievements with measurable results';
        }
      } else if (responseRate >= 0.3 && pStats.applications >= 3) {
        platformRecommendations[platform] = `Strong performance! Keep using current approach`;
      }
    }

    return {
      overallHealth,
      responseRate: stats.responseRate,
      responseRateTrend,
      topPerformingKeywords: bestKeywords.slice(0, 5).map((k) => k.keyword),
      underperformingKeywords: keywordData.keywordsToDeemphasize,
      platformRecommendations,
      nextActions,
      weeklyProgress: {
        applications: lastWeek.applications,
        responses: lastWeek.responses,
        interviews: lastWeek.interviews,
        trend: weeklyTrend,
      },
    };
  }

  /**
   * Get smart recommendations for a specific job
   */
  async getJobSpecificRecommendations(
    jobKeywords: string[],
    resumeKeywords: string[],
    platform: string,
    industry?: string
  ): Promise<{
    keywordRecs: KeywordRecommendation[];
    platformTips: string[];
    score: number;
  }> {
    await this.initPromise;
    // Get keyword recommendations
    const keywordRecs = adaptiveKeywordDB.getRecommendations(
      jobKeywords,
      resumeKeywords,
      platform,
      industry
    );

    // Get platform strategy
    const strategy = getPlatformStrategy(platform);

    // Platform-specific tips
    const platformTips = strategy.recommendations.slice(0, 3);

    // Calculate predicted score based on keyword match + historical performance
    const matchedCount = jobKeywords.filter((jk) =>
      resumeKeywords.some((rk) => rk.toLowerCase() === jk.toLowerCase())
    ).length;

    const matchRate = jobKeywords.length > 0 ? matchedCount / jobKeywords.length : 0;

    // Adjust based on platform type
    let score = Math.round(matchRate * 100);
    if (strategy.keywordFlexibility === 'strict' && matchRate < 0.8) {
      score = Math.round(score * 0.8); // Penalty for strict platforms
    }

    return {
      keywordRecs,
      platformTips,
      score: Math.min(100, score),
    };
  }

  /**
   * Save to storage
   */
  private async saveToStorage(): Promise<void> {
    try {
      const data = Array.from(this.improvements.values());
      await chrome.storage.local.set({
        [STORAGE_KEY]: data,
        auto_improver_last_analysis: this.lastAnalysis,
      });
    } catch (error) {
      console.debug('[AutoImprover] Failed to save to storage:', (error as Error).message);
    }
  }
}

// Singleton instance
export const autoImprover = new AutoImprover();
