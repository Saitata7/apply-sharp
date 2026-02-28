/**
 * Learning Module
 * Self-improving system that learns from application outcomes
 *
 * Components:
 * - AdaptiveKeywordDB: Keyword performance tracking
 * - OutcomeTracker: Application outcome tracking
 * - AutoImprover: Automatic recommendation generation
 */

export { AdaptiveKeywordDB, adaptiveKeywordDB } from './adaptive-keywords';
export type {
  KeywordEntry,
  KeywordCategory,
  IndustryCluster,
  KeywordRecommendation,
} from './adaptive-keywords';

export {
  OutcomeTracker,
  outcomeTracker,
  type TrackedApplication,
  type ApplicationStatus,
  type StatusChange,
  type OutcomeStats,
  type PlatformStats,
  type WeeklyTrend,
} from './outcome-tracker';

export {
  AutoImprover,
  autoImprover,
  type AutoImprovement,
  type ImprovementType,
  type ImprovementAction,
  type LearningInsights,
} from './auto-improver';

// Import singletons for internal use
import { autoImprover } from './auto-improver';
import { outcomeTracker } from './outcome-tracker';
import type { KeywordRecommendation } from './adaptive-keywords';
import type { AutoImprovement, LearningInsights } from './auto-improver';
import type { TrackedApplication, OutcomeStats } from './outcome-tracker';

/**
 * Unified Learning Service
 * Provides a simple interface for the extension to interact with learning
 */
export class LearningService {
  /**
   * Initialize all learning components
   * Call this when extension starts
   */
  async initialize(): Promise<void> {
    // Components auto-initialize, but we can trigger analysis
    await autoImprover.runFullAnalysis();
  }

  /**
   * Track when user applies to a job
   */
  async trackApplication(data: {
    jobId: string;
    jobTitle: string;
    company: string;
    platform: string;
    industry?: string;
    profileId: string;
    keywordsUsed: string[];
    resumeVersion?: string;
    coverLetterGenerated?: boolean;
  }): Promise<string> {
    const app = await outcomeTracker.trackApplication(data);
    return app.id;
  }

  /**
   * Record when user gets a response
   */
  async recordOutcome(
    applicationId: string,
    status: 'viewed' | 'rejected' | 'interview' | 'offer' | 'no_response',
    notes?: string
  ): Promise<void> {
    await outcomeTracker.recordOutcome(applicationId, status, notes);
  }

  /**
   * Get smart recommendations for a job
   */
  async getRecommendations(
    jobKeywords: string[],
    resumeKeywords: string[],
    platform: string
  ): Promise<{
    keywordsToAdd: KeywordRecommendation[];
    platformTips: string[];
    predictedScore: number;
  }> {
    const result = await autoImprover.getJobSpecificRecommendations(
      jobKeywords,
      resumeKeywords,
      platform
    );

    return {
      keywordsToAdd: result.keywordRecs,
      platformTips: result.platformTips,
      predictedScore: result.score,
    };
  }

  /**
   * Get overall insights (for dashboard)
   */
  async getInsights(): Promise<LearningInsights> {
    return autoImprover.getLearningInsights();
  }

  /**
   * Get pending improvements
   */
  getImprovements(): AutoImprovement[] {
    return autoImprover.getActiveImprovements();
  }

  /**
   * Get application statistics
   */
  async getStats(): Promise<OutcomeStats> {
    return outcomeTracker.getStats();
  }

  /**
   * Get recent applications
   */
  getRecentApplications(limit?: number): TrackedApplication[] {
    return outcomeTracker.getRecent(limit);
  }

  /**
   * Get applications needing follow-up
   */
  getApplicationsNeedingAttention(): TrackedApplication[] {
    return outcomeTracker.getNeedingAttention();
  }

  /**
   * Run full analysis (call periodically or on demand)
   */
  async runAnalysis(): Promise<AutoImprovement[]> {
    await outcomeTracker.runAutoAnalysis();
    return autoImprover.runFullAnalysis();
  }
}

// Export singleton
export const learningService = new LearningService();
