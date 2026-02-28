/**
 * Outcome Tracking System
 * Automatically tracks application results and feeds learning engines
 *
 * Flow:
 * 1. User applies to job -> trackApplication()
 * 2. User gets response -> recordOutcome()
 * 3. System auto-learns -> updateLearningEngines()
 * 4. Future recommendations improve automatically
 */

import { adaptiveKeywordDB } from './adaptive-keywords';

export interface TrackedApplication {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  platform: string;
  industry: string;

  // What was used
  profileId: string;
  keywordsUsed: string[];
  resumeVersion: string;
  coverLetterGenerated: boolean;
  answersGenerated: string[];

  // Timing
  appliedAt: number;
  lastStatusChange: number;

  // Status tracking
  status: ApplicationStatus;
  statusHistory: StatusChange[];

  // Outcome data
  responseReceived: boolean;
  responseTimeHours?: number;
  interviewCount: number;
  offerReceived: boolean;
  offerAccepted?: boolean;

  // Metadata
  notes?: string;
  source: 'extension' | 'manual' | 'import';
}

export type ApplicationStatus =
  | 'applied'
  | 'viewed'
  | 'under_review'
  | 'phone_screen'
  | 'interview'
  | 'final_round'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  | 'no_response';

export interface StatusChange {
  from: ApplicationStatus;
  to: ApplicationStatus;
  timestamp: number;
  notes?: string;
}

export interface OutcomeStats {
  totalApplications: number;
  responseRate: number;
  interviewRate: number;
  offerRate: number;
  avgResponseTimeHours: number;
  byPlatform: Record<string, PlatformStats>;
  byIndustry: Record<string, number>;
  weeklyTrend: WeeklyTrend[];
}

export interface PlatformStats {
  applications: number;
  responses: number;
  interviews: number;
  offers: number;
  avgResponseTime: number;
}

export interface WeeklyTrend {
  weekStart: string;
  applications: number;
  responses: number;
  interviews: number;
}

const STORAGE_KEY = 'tracked_applications';
const STATS_KEY = 'application_stats';

/**
 * Outcome Tracking System
 */
export class OutcomeTracker {
  private applications: Map<string, TrackedApplication> = new Map();
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.initialize();
  }

  /**
   * Initialize from storage
   */
  private async initialize(): Promise<void> {
    const saved = await this.loadFromStorage();
    if (saved) {
      for (const app of saved) {
        this.applications.set(app.id, app);
      }
    }

    // Run auto-analysis on startup (call internal to avoid initPromise deadlock)
    await this.markStaleApplications();
    await adaptiveKeywordDB.applyTimeDecay();
    await this.computeAndCacheStats();
  }

  /**
   * Track a new application
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
    answersGenerated?: string[];
    source?: 'extension' | 'manual' | 'import';
  }): Promise<TrackedApplication> {
    await this.initPromise;
    const id = `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const application: TrackedApplication = {
      id,
      jobId: data.jobId,
      jobTitle: data.jobTitle,
      company: data.company,
      platform: data.platform.toLowerCase(),
      industry: data.industry || 'unknown',
      profileId: data.profileId,
      keywordsUsed: data.keywordsUsed,
      resumeVersion: data.resumeVersion || 'default',
      coverLetterGenerated: data.coverLetterGenerated || false,
      answersGenerated: data.answersGenerated || [],
      appliedAt: now,
      lastStatusChange: now,
      status: 'applied',
      statusHistory: [],
      responseReceived: false,
      interviewCount: 0,
      offerReceived: false,
      source: data.source || 'extension',
    };

    this.applications.set(id, application);
    await this.saveToStorage();

    // Record keyword usage in adaptive DB
    await adaptiveKeywordDB.recordUsage(
      data.keywordsUsed,
      data.platform.toLowerCase(),
      data.jobTitle
    );

    console.log(`[OutcomeTracker] Tracked application: ${data.company} - ${data.jobTitle}`);
    return application;
  }

  /**
   * Record an outcome/status change
   */
  async recordOutcome(
    applicationId: string,
    newStatus: ApplicationStatus,
    notes?: string
  ): Promise<TrackedApplication | null> {
    await this.initPromise;
    const app = this.applications.get(applicationId);
    if (!app) {
      console.warn(`[OutcomeTracker] Application not found: ${applicationId}`);
      return null;
    }

    const now = Date.now();
    const oldStatus = app.status;

    // Record status change
    app.statusHistory.push({
      from: oldStatus,
      to: newStatus,
      timestamp: now,
      notes,
    });

    app.status = newStatus;
    app.lastStatusChange = now;

    // Update outcome flags
    if (
      [
        'viewed',
        'under_review',
        'phone_screen',
        'interview',
        'final_round',
        'offer',
        'rejected',
      ].includes(newStatus)
    ) {
      if (!app.responseReceived) {
        app.responseReceived = true;
        app.responseTimeHours = (now - app.appliedAt) / (1000 * 60 * 60);
      }
    }

    if (['phone_screen', 'interview', 'final_round'].includes(newStatus)) {
      app.interviewCount++;
    }

    if (newStatus === 'offer') {
      app.offerReceived = true;
    }

    await this.saveToStorage();

    // Update learning engines
    await this.updateLearningEngines(app, newStatus);

    console.log(`[OutcomeTracker] Updated ${app.company}: ${oldStatus} -> ${newStatus}`);
    return app;
  }

  /**
   * Update learning engines based on outcome
   */
  private async updateLearningEngines(
    app: TrackedApplication,
    status: ApplicationStatus
  ): Promise<void> {
    // Map status to outcome type for keyword DB
    const outcomeMap: Record<
      ApplicationStatus,
      'no_response' | 'rejected' | 'interview' | 'offer'
    > = {
      applied: 'no_response',
      viewed: 'no_response',
      under_review: 'no_response',
      phone_screen: 'interview',
      interview: 'interview',
      final_round: 'interview',
      offer: 'offer',
      rejected: 'rejected',
      withdrawn: 'rejected',
      no_response: 'no_response',
    };

    const outcome = outcomeMap[status];

    // Update adaptive keyword database
    await adaptiveKeywordDB.updateFromOutcome(app.keywordsUsed, app.platform, outcome);

    // Check for stale applications (no response after 2 weeks)
    await this.markStaleApplications();
  }

  /**
   * Mark applications with no response as "no_response"
   */
  private async markStaleApplications(): Promise<void> {
    const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const app of this.applications.values()) {
      if (app.status === 'applied' && now - app.appliedAt > TWO_WEEKS) {
        await this.recordOutcome(app.id, 'no_response', 'Auto-marked: no response after 2 weeks');
      }
    }
  }

  /**
   * Run automatic analysis and learning
   * Called on startup and periodically
   */
  async runAutoAnalysis(): Promise<void> {
    await this.initPromise;
    // Mark stale applications
    await this.markStaleApplications();

    // Apply time decay to keyword scores
    await adaptiveKeywordDB.applyTimeDecay();

    // Compute and cache stats
    await this.computeAndCacheStats();
  }

  /**
   * Compute comprehensive statistics
   */
  async computeAndCacheStats(): Promise<OutcomeStats> {
    const apps = Array.from(this.applications.values());

    const stats: OutcomeStats = {
      totalApplications: apps.length,
      responseRate: 0,
      interviewRate: 0,
      offerRate: 0,
      avgResponseTimeHours: 0,
      byPlatform: {},
      byIndustry: {},
      weeklyTrend: [],
    };

    if (apps.length === 0) return stats;

    // Calculate rates
    const responses = apps.filter((a) => a.responseReceived).length;
    const interviews = apps.filter((a) => a.interviewCount > 0).length;
    const offers = apps.filter((a) => a.offerReceived).length;

    stats.responseRate = responses / apps.length;
    stats.interviewRate = interviews / apps.length;
    stats.offerRate = offers / apps.length;

    // Average response time
    const responseTimes = apps
      .filter((a) => a.responseTimeHours !== undefined)
      .map((a) => a.responseTimeHours!);

    if (responseTimes.length > 0) {
      stats.avgResponseTimeHours = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    }

    // By platform
    const platforms = [...new Set(apps.map((a) => a.platform))];
    for (const platform of platforms) {
      const platformApps = apps.filter((a) => a.platform === platform);
      stats.byPlatform[platform] = {
        applications: platformApps.length,
        responses: platformApps.filter((a) => a.responseReceived).length,
        interviews: platformApps.filter((a) => a.interviewCount > 0).length,
        offers: platformApps.filter((a) => a.offerReceived).length,
        avgResponseTime: 0,
      };

      const pResponseTimes = platformApps
        .filter((a) => a.responseTimeHours !== undefined)
        .map((a) => a.responseTimeHours!);

      if (pResponseTimes.length > 0) {
        stats.byPlatform[platform].avgResponseTime =
          pResponseTimes.reduce((a, b) => a + b, 0) / pResponseTimes.length;
      }
    }

    // By industry
    const industries = [...new Set(apps.map((a) => a.industry))];
    for (const industry of industries) {
      stats.byIndustry[industry] = apps.filter((a) => a.industry === industry).length;
    }

    // Weekly trend (last 8 weeks)
    const now = Date.now();
    const WEEK = 7 * 24 * 60 * 60 * 1000;

    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now - i * WEEK);
      const weekEnd = new Date(now - (i - 1) * WEEK);

      const weekApps = apps.filter(
        (a) => a.appliedAt >= weekStart.getTime() && a.appliedAt < weekEnd.getTime()
      );

      stats.weeklyTrend.push({
        weekStart: weekStart.toISOString().split('T')[0],
        applications: weekApps.length,
        responses: weekApps.filter((a) => a.responseReceived).length,
        interviews: weekApps.filter((a) => a.interviewCount > 0).length,
      });
    }

    // Cache stats
    await chrome.storage.local.set({ [STATS_KEY]: stats });

    return stats;
  }

  /**
   * Get cached stats
   */
  async getStats(): Promise<OutcomeStats> {
    await this.initPromise;
    try {
      const result = await chrome.storage.local.get(STATS_KEY);
      return result[STATS_KEY] || (await this.computeAndCacheStats());
    } catch (error) {
      console.debug('[OutcomeTracker] Failed to get stats:', (error as Error).message);
      return this.computeAndCacheStats();
    }
  }

  /**
   * Get application by ID
   */
  getApplication(id: string): TrackedApplication | undefined {
    return this.applications.get(id);
  }

  /**
   * Get recent applications
   */
  getRecent(limit: number = 20): TrackedApplication[] {
    return Array.from(this.applications.values())
      .sort((a, b) => b.appliedAt - a.appliedAt)
      .slice(0, limit);
  }

  /**
   * Get applications by status
   */
  getByStatus(status: ApplicationStatus): TrackedApplication[] {
    return Array.from(this.applications.values())
      .filter((a) => a.status === status)
      .sort((a, b) => b.lastStatusChange - a.lastStatusChange);
  }

  /**
   * Get applications needing attention
   */
  getNeedingAttention(): TrackedApplication[] {
    const now = Date.now();
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

    return Array.from(this.applications.values())
      .filter(
        (a) =>
          a.status === 'applied' && now - a.appliedAt > ONE_WEEK && now - a.appliedAt < 2 * ONE_WEEK
      )
      .sort((a, b) => a.appliedAt - b.appliedAt);
  }

  /**
   * Get best performing keywords for user's applications
   */
  async getBestPerformingKeywords(): Promise<{ keyword: string; score: number; uses: number }[]> {
    await this.initPromise;
    const keywordStats: Map<string, { successes: number; uses: number }> = new Map();

    for (const app of this.applications.values()) {
      const isSuccess = app.responseReceived || app.interviewCount > 0;

      for (const keyword of app.keywordsUsed) {
        const key = keyword.toLowerCase();
        const existing = keywordStats.get(key) || { successes: 0, uses: 0 };
        existing.uses++;
        if (isSuccess) existing.successes++;
        keywordStats.set(key, existing);
      }
    }

    return Array.from(keywordStats.entries())
      .filter(([_, stats]) => stats.uses >= 3) // Need at least 3 uses
      .map(([keyword, stats]) => ({
        keyword,
        score: Math.round((stats.successes / stats.uses) * 100),
        uses: stats.uses,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }

  /**
   * Save to storage
   */
  private async saveToStorage(): Promise<void> {
    try {
      const data = Array.from(this.applications.values());
      await chrome.storage.local.set({ [STORAGE_KEY]: data });
    } catch (error) {
      console.debug('[OutcomeTracker] Failed to save to storage:', (error as Error).message);
    }
  }

  /**
   * Load from storage
   */
  private async loadFromStorage(): Promise<TrackedApplication[] | null> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return result[STORAGE_KEY] || null;
    } catch (error) {
      console.debug('[OutcomeTracker] Failed to load from storage:', (error as Error).message);
      return null;
    }
  }

  /**
   * Export data for backup
   */
  exportData(): TrackedApplication[] {
    return Array.from(this.applications.values());
  }

  /**
   * Import data from backup
   */
  async importData(data: TrackedApplication[]): Promise<number> {
    await this.initPromise;
    let imported = 0;
    for (const app of data) {
      if (!this.applications.has(app.id)) {
        this.applications.set(app.id, app);
        imported++;
      }
    }
    await this.saveToStorage();
    return imported;
  }
}

// Singleton instance
export const outcomeTracker = new OutcomeTracker();
