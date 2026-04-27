/**
 * Autofill v2 background handler.
 *
 * Receives a serialized form snapshot from the content script, fetches the
 * active MasterProfile, derives a profile slice, runs company research, calls
 * runAutofill, and returns the answer map back to the content script for
 * application.
 *
 * Replaces the per-field path in learning-handlers.ts:212-314
 * (handleGenerateAIAnswer) which made N AI calls and used "the company" as
 * a fallback. The per-field path stays around for backwards compatibility
 * with the old autofill-content.ts UI until the cutover commit.
 */

import type { MessageResponse } from '@shared/utils/messaging';
import { masterProfileRepo } from '@storage/index';
import { getAIService } from '../message-handler';
import { runAutofill, type RunAutofillResult } from '@/ai/autofill/run';
import type { TFormSnapshot, TAutofillResponse } from '@/ai/autofill/schema';
import type { AutofillProfileSlice, AutofillJobContext } from '@/ai/autofill/prompt';
import { researchCompany } from '../research/company-research';

export interface RunAutofillPayload {
  snapshot: TFormSnapshot;
  jobContext?: {
    company?: string;
    title?: string;
    description?: string;
    url?: string;
  };
}

export interface RunAutofillResponseData {
  response: TAutofillResponse;
  answered: number;
  skipped: number;
  hadRefusals: boolean;
  research: {
    tier: 1 | 2 | 3;
    domain: string | null;
  };
}

function formatSalaryExpectation(s?: {
  min?: number;
  max?: number;
  currency?: string;
  negotiable?: boolean;
}): string | undefined {
  if (!s || (s.min == null && s.max == null)) return undefined;
  const cur = s.currency ?? 'USD';
  if (s.min != null && s.max != null) return `${cur} ${s.min} to ${s.max}`;
  if (s.min != null) return `${cur} ${s.min}+`;
  return `${cur} up to ${s.max}`;
}

/**
 * Build the autofill profile slice from a MasterProfile.
 *
 * Kept narrow on purpose: the prompt only needs the fields that map to common
 * application form questions. We do not blast the entire MasterProfile through
 * the prompt because (a) it costs tokens and (b) the model gets distracted by
 * irrelevant details when it should be focused on relevance to THIS role.
 */
function buildProfileSlice(
  masterProfile: NonNullable<Awaited<ReturnType<typeof masterProfileRepo.getActive>>>
): AutofillProfileSlice {
  const personal = masterProfile.personal;
  const career = masterProfile.careerContext;
  const recentExp = masterProfile.experience?.[0];

  // Top 3 achievements across the most recent two roles, ranked by length as a
  // proxy for specificity. The runAutofill prompt explicitly tells the model to
  // pick the most RELEVANT achievement, not the most impressive, so we just
  // surface a healthy candidate set.
  const recentAchievements: string[] = [];
  for (const exp of (masterProfile.experience ?? []).slice(0, 2)) {
    for (const a of exp.achievements ?? []) {
      if (typeof a === 'string') recentAchievements.push(a);
      else if (a && typeof a === 'object' && 'text' in a) {
        recentAchievements.push(String((a as { text: unknown }).text));
      }
    }
  }
  const topAchievements = recentAchievements
    .filter((a) => a && a.length > 20)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);

  const skillsLine = (masterProfile.skills?.technical ?? [])
    .slice(0, 12)
    .map((s) => (typeof s === 'string' ? s : (s as { name?: string }).name))
    .filter(Boolean)
    .join(', ');

  return {
    fullName: personal?.fullName ?? '',
    email: personal?.email ?? '',
    phone: personal?.phone ?? '',
    location: personal?.location?.formatted,
    linkedin: personal?.linkedInUrl,
    github: personal?.githubUrl,
    portfolio: personal?.portfolioUrl ?? personal?.websiteUrl,
    currentTitle: recentExp?.title ?? 'Software Professional',
    yearsExperience: career?.yearsOfExperience ?? 0,
    skillsLine,
    recentCompany: recentExp?.company ?? '',
    summary: career?.summary,
    topAchievements,
    workAuth: masterProfile.autofillData?.workAuthorization,
    salaryExpectation: formatSalaryExpectation(masterProfile.autofillData?.salaryExpectations),
  };
}

export async function handleRunAutofill(payload: RunAutofillPayload): Promise<MessageResponse> {
  try {
    if (!payload?.snapshot) {
      return { success: false, error: 'Missing form snapshot' };
    }

    const ai = await getAIService();
    if (ai.error) return { success: false, error: ai.error };
    const aiService = ai.service!;

    const masterProfile = await masterProfileRepo.getActive();
    if (!masterProfile) {
      return {
        success: false,
        error: 'No active profile found. Set up your profile in ApplySharp settings.',
      };
    }

    const slice = buildProfileSlice(masterProfile);

    if (!slice.fullName || !slice.email) {
      return {
        success: false,
        error: 'Profile is missing name or email. Add them in settings before autofilling.',
      };
    }

    const jobContext: AutofillJobContext = {
      company: payload.jobContext?.company ?? '',
      title: payload.jobContext?.title ?? '',
      description: payload.jobContext?.description ?? '',
      url: payload.jobContext?.url ?? payload.snapshot.url,
    };

    // Research the company. Always non-throwing; degrades to tier 1 with a
    // strict do-not-invent instruction if everything fails.
    const research = await researchCompany(jobContext.company, jobContext.url);

    let result: RunAutofillResult;
    try {
      result = await runAutofill(aiService, payload.snapshot, slice, jobContext, research);
    } catch (err) {
      console.error('[AutofillV2] runAutofill failed:', err);
      return { success: false, error: (err as Error).message ?? 'Autofill call failed' };
    }

    const data: RunAutofillResponseData = {
      response: result.response,
      answered: result.answered,
      skipped: result.skipped,
      hadRefusals: result.hadRefusals,
      research: { tier: research.tier, domain: research.domain },
    };

    return { success: true, data };
  } catch (error) {
    console.error('[AutofillV2] handler error:', error);
    return { success: false, error: (error as Error).message };
  }
}
