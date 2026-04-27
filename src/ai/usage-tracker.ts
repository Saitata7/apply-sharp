/**
 * Token Usage Tracker
 *
 * Tracks AI API token consumption so BYOK users can monitor their spend.
 * Uses chrome.storage.local with a rolling window of 1000 entries max.
 */

export interface TokenUsageEntry {
  timestamp: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  feature: string;
}

export interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  byProvider: Record<string, { input: number; output: number; calls: number }>;
  byFeature: Record<string, { input: number; output: number; calls: number }>;
  last24h: { input: number; output: number; calls: number };
  last7d: { input: number; output: number; calls: number };
}

const STORAGE_KEY = 'ai_usage_log';
const MAX_ENTRIES = 1000;

class UsageTracker {
  /**
   * Record a token usage entry. Fire-and-forget — never throws.
   */
  async trackUsage(entry: Omit<TokenUsageEntry, 'timestamp'>): Promise<void> {
    try {
      const fullEntry: TokenUsageEntry = {
        ...entry,
        timestamp: Date.now(),
      };

      const entries = await this.getEntries();
      entries.push(fullEntry);

      // Keep rolling window
      const trimmed = entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries;

      await chrome.storage.local.set({ [STORAGE_KEY]: trimmed });
    } catch (error) {
      // Usage tracking must never crash the app
      console.debug('[UsageTracker] Failed to track usage:', error);
    }
  }

  /**
   * Get aggregated usage summary.
   */
  async getSummary(): Promise<UsageSummary> {
    try {
      const entries = await this.getEntries();

      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

      const summary: UsageSummary = {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCalls: entries.length,
        byProvider: {},
        byFeature: {},
        last24h: { input: 0, output: 0, calls: 0 },
        last7d: { input: 0, output: 0, calls: 0 },
      };

      for (const entry of entries) {
        summary.totalInputTokens += entry.inputTokens;
        summary.totalOutputTokens += entry.outputTokens;

        // By provider
        if (!summary.byProvider[entry.provider]) {
          summary.byProvider[entry.provider] = { input: 0, output: 0, calls: 0 };
        }
        summary.byProvider[entry.provider].input += entry.inputTokens;
        summary.byProvider[entry.provider].output += entry.outputTokens;
        summary.byProvider[entry.provider].calls += 1;

        // By feature
        if (!summary.byFeature[entry.feature]) {
          summary.byFeature[entry.feature] = { input: 0, output: 0, calls: 0 };
        }
        summary.byFeature[entry.feature].input += entry.inputTokens;
        summary.byFeature[entry.feature].output += entry.outputTokens;
        summary.byFeature[entry.feature].calls += 1;

        // Time windows
        if (entry.timestamp >= oneDayAgo) {
          summary.last24h.input += entry.inputTokens;
          summary.last24h.output += entry.outputTokens;
          summary.last24h.calls += 1;
        }
        if (entry.timestamp >= sevenDaysAgo) {
          summary.last7d.input += entry.inputTokens;
          summary.last7d.output += entry.outputTokens;
          summary.last7d.calls += 1;
        }
      }

      return summary;
    } catch (error) {
      console.debug('[UsageTracker] Failed to get summary:', error);
      return {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCalls: 0,
        byProvider: {},
        byFeature: {},
        last24h: { input: 0, output: 0, calls: 0 },
        last7d: { input: 0, output: 0, calls: 0 },
      };
    }
  }

  /**
   * Clear all usage data.
   */
  async clearUsage(): Promise<void> {
    try {
      await chrome.storage.local.remove(STORAGE_KEY);
    } catch (error) {
      console.debug('[UsageTracker] Failed to clear usage:', error);
    }
  }

  private async getEntries(): Promise<TokenUsageEntry[]> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    } catch {
      return [];
    }
  }
}

export const usageTracker = new UsageTracker();
