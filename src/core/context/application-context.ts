/**
 * Cross-Feature Application Context
 *
 * Shared context object so features aren't isolated:
 * - Interview prep knows ATS score gaps → targets weak areas
 * - Email templates know application history → contextual follow-ups
 * - Cover letter knows what worked before → uses successful patterns
 * - Resume tailoring knows learning insights → emphasizes winning keywords
 */

import type { MasterProfile } from '@shared/types/master-profile.types';
import type { Job, ExtractedJob } from '@shared/types/job.types';
import { masterProfileRepo } from '@storage/repositories/master-profile.repo';

import { learningService } from '@core/learning';
import type { LearningInsights } from '@core/learning/auto-improver';

export interface ApplicationContext {
  /** Active master profile */
  profile: MasterProfile | null;

  /** Current job being viewed/applied to */
  currentJob: ExtractedJob | Job | null;

  /** Learning insights from outcome tracking */
  learningInsights: LearningInsights | null;

  /** Recent applications for context */
  recentApplicationCount: number;

  /** Timestamp of context build */
  builtAt: Date;
}

/**
 * Build the full application context for use across features.
 * This is the single source of shared state that all AI features can access.
 */
export async function buildApplicationContext(
  currentJob?: ExtractedJob | Job | null
): Promise<ApplicationContext> {
  const [profile, learningInsights] = await Promise.all([
    masterProfileRepo.getActive().catch(() => null),
    learningService.getInsights().catch(() => null),
  ]);

  // Get recent application count from learning service
  let recentApplicationCount = 0;
  try {
    const recent = learningService.getRecentApplications(100);
    recentApplicationCount = recent.length;
  } catch {
    // Learning service may not be initialized
  }

  return {
    profile: profile || null,
    currentJob: currentJob || null,
    learningInsights,
    recentApplicationCount,
    builtAt: new Date(),
  };
}

/**
 * Build a text summary of the application context for injection into AI prompts.
 */
export function contextToPromptText(ctx: ApplicationContext): string {
  const parts: string[] = [];

  if (ctx.profile) {
    const exp = ctx.profile.experience?.length || 0;
    const seniority = ctx.profile.careerContext?.seniorityLevel || 'unknown';
    parts.push(
      `Candidate: ${ctx.profile.personal?.fullName || 'Unknown'}, ${seniority} level, ${exp} roles on record.`
    );
  }

  if (ctx.currentJob) {
    const job = ctx.currentJob;
    parts.push(`Current job: ${job.title || 'Unknown'} at ${job.company || 'Unknown'}.`);
  }

  if (ctx.learningInsights && ctx.recentApplicationCount >= 3) {
    const li = ctx.learningInsights;
    parts.push(
      `Application history: ${ctx.recentApplicationCount} applications, ${li.responseRate}% response rate (${li.responseRateTrend}).`
    );
    if (li.topPerformingKeywords.length > 0) {
      parts.push(`Winning keywords: ${li.topPerformingKeywords.slice(0, 5).join(', ')}.`);
    }
  }

  return parts.join('\n');
}
