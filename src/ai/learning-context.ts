/**
 * Learning → AI Feedback
 *
 * Builds a learning context string from the learning system's outcome data
 * and injects it into AI system messages. This way the AI knows:
 * - Which keywords led to interviews
 * - Which keywords didn't help
 * - Response rate trends
 * - Platform-specific tips
 *
 * This closes the loop: outcomes → learning system → AI prompts → better output.
 */

import { learningService } from '@core/learning';

/**
 * Build a learning context string to inject into AI system messages.
 * Returns empty string if no learning data is available.
 */
export async function buildLearningContext(): Promise<string> {
  try {
    const insights = await learningService.getInsights();

    // Don't inject if not enough data
    if (insights.weeklyProgress.applications < 3) {
      return '';
    }

    const parts: string[] = [
      `## Learning Context (from ${insights.weeklyProgress.applications} tracked applications)`,
    ];

    if (insights.topPerformingKeywords.length > 0) {
      parts.push(
        `- Keywords that led to interviews: ${insights.topPerformingKeywords.slice(0, 10).join(', ')}`
      );
    }

    if (insights.underperformingKeywords.length > 0) {
      parts.push(
        `- Keywords that didn't help: ${insights.underperformingKeywords.slice(0, 5).join(', ')}`
      );
    }

    parts.push(`- Response rate: ${insights.responseRate}% (trend: ${insights.responseRateTrend})`);

    if (insights.weeklyProgress.interviews > 0) {
      parts.push(`- Interviews this period: ${insights.weeklyProgress.interviews}`);
    }

    const platformEntries = Object.entries(insights.platformRecommendations);
    if (platformEntries.length > 0) {
      parts.push(`- Platform tips:`);
      for (const [platform, tip] of platformEntries.slice(0, 3)) {
        parts.push(`  - ${platform}: ${tip}`);
      }
    }

    if (insights.nextActions.length > 0) {
      parts.push(`- Recommended actions: ${insights.nextActions.slice(0, 3).join('; ')}`);
    }

    return parts.join('\n');
  } catch (error) {
    console.debug('[LearningContext] Failed to build context:', error);
    return '';
  }
}
