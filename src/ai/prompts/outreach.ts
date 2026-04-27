/**
 * Cold outreach prompt builder (Workstream 5 prompt layer).
 *
 * Builds the system + user prompt for two outreach use cases:
 *
 *   1. Cold email to a recruiter or hiring manager (Gmail draft)
 *   2. LinkedIn DM (clipboard copy, NEVER injected into LinkedIn DOM)
 *
 * Both inherit the ANTI_AI_TELLS rule block, the no-em-dash ban, and the
 * "read company first, write candidate second" voice rule from the
 * autofill prompt. Both use the recruiter research aggregator output
 * (defuddle company website + Google News + GitHub + personal site) so
 * the message references something specific the recruiter or company
 * actually does.
 *
 * Length budgets are calibrated to Gmail's RETVec spam classifier and
 * to LinkedIn's character limit:
 *   - Cold email: under 120 words, 3 to 4 sentences, one specific hook,
 *     one clear ask, no formal greeting (Gmail Gemini deliverability
 *     research shows formal greetings hit Promotions/Spam harder)
 *   - LinkedIn DM: under 50 words, one sentence opener, one ask
 */

import { buildSystemPrompt, PERSONAS, CORE_RULES, ANTI_AI_TELLS } from './system-rules';
import { sanitizePromptInput } from '@shared/utils/prompt-safety';
import type { RecruiterResearchResult } from '@core/outreach/recruiter-research';

export type OutreachKind = 'cold_email' | 'linkedin_dm';

export interface OutreachContext {
  /** What the user is trying to accomplish. e.g. "I'm exploring senior backend
   *  roles at small AI startups and saw their recent Series B." */
  intent: string;
  /** Recruiter or hiring manager name (first name preferred for warmth). */
  recipientName?: string;
  /** Their role title if known. */
  recipientTitle?: string;
  /** Company name (required, drives the "read company first" rule). */
  companyName: string;
  /** Optional target role the user is interested in. */
  targetRole?: string;
}

export interface OutreachProfile {
  fullName: string;
  currentTitle: string;
  yearsExperience: number;
  /** A 1-2 line elevator that the message can paraphrase. */
  shortPitch: string;
  /** Top 1-2 achievements relevant to the target role. */
  topAchievements: string[];
  linkedinUrl?: string;
  portfolioUrl?: string;
}

const COLD_EMAIL_VOICE = `
## Cold Email Voice Rules

Format constraints (non-negotiable):
- Under 120 words total. Count them.
- 3 to 4 sentences. No paragraphs longer than 2 sentences.
- NO formal greeting. "Hi <Name>," is fine. "Dear Hiring Manager," is forbidden.
- NO formal sign-off. "Sai" is fine. "Best regards, Sai Tata" is forbidden for cold outreach.
- NO subject line in the body. The subject is generated separately.
- Plain text only. No HTML, no markdown, no bullet points.

Voice (non-negotiable):
- Sentence 1: ONE specific thing the company actually does, pulled from the
  research blob. Not "I love what you're building" - cite a real fact.
- Sentence 2 or 3: ONE relevant thing the candidate has done that maps to it.
  Pick the closest match, not the most impressive.
- Final sentence: ONE clear ask. "Open to a 15-minute call this week?" works.
  Vague ("would love to chat sometime") does not.

Forbidden vocabulary (zero tolerance):
- "I am excited to..." (every cold email opens with this; instant Promotions)
- "I came across your profile..." (instant LinkedIn template flag)
- "I would love to learn more..." (vague, no ask)
- "passionate about" (passion noise)
- Any phrase from the global ANTI_AI_TELLS list (delve, leverage, tapestry, etc.)
- Em-dashes anywhere.

Gmail Gemini + RETVec spam research note: short, specific, contraction-using,
human-toned messages get delivered to inbox; templated long polished cold
emails get Promotions or Spam.
`.trim();

const LINKEDIN_DM_VOICE = `
## LinkedIn DM Voice Rules

Format constraints (non-negotiable):
- Under 50 words. Count them.
- 1 to 2 sentences. Single line if possible.
- NO greeting beyond first name.
- NO sign-off.
- NO links in the first message.

Voice (non-negotiable):
- Open with a SPECIFIC reference to something they posted, shipped, or said
  publicly. Not "I saw your profile and was impressed."
- One sentence about why you. Pick the single most relevant thing.
- Optional micro-ask at the end. "Open to a quick chat?" is the only
  acceptable form.

Forbidden vocabulary (zero tolerance):
- "I came across your profile..." (instant template flag)
- "Hope you're doing well" (zero information)
- Em-dashes anywhere.
`.trim();

export interface BuiltOutreachPrompt {
  system: string;
  user: string;
  /** For cold emails only: a separately generated subject line draft. */
  subjectHint?: string;
}

export function buildOutreachPrompt(
  kind: OutreachKind,
  context: OutreachContext,
  profile: OutreachProfile,
  research: RecruiterResearchResult
): BuiltOutreachPrompt {
  const voiceBlock = kind === 'cold_email' ? COLD_EMAIL_VOICE : LINKEDIN_DM_VOICE;

  const system = buildSystemPrompt(PERSONAS.CAREER_ADVISOR, [
    CORE_RULES,
    ANTI_AI_TELLS,
    voiceBlock,
  ]);

  const safe = {
    fullName: sanitizePromptInput(profile.fullName, 'candidate_name'),
    currentTitle: sanitizePromptInput(profile.currentTitle, 'candidate_title'),
    yearsExperience: profile.yearsExperience,
    shortPitch: sanitizePromptInput(profile.shortPitch, 'candidate_pitch'),
    topAchievements: profile.topAchievements
      .slice(0, 2)
      .map((a, i) => `  ${i + 1}. ${sanitizePromptInput(a, `achievement_${i}`)}`)
      .join('\n'),
    linkedin: sanitizePromptInput(profile.linkedinUrl ?? '', 'linkedin'),
    portfolio: sanitizePromptInput(profile.portfolioUrl ?? '', 'portfolio'),
  };

  const safeContext = {
    intent: sanitizePromptInput(context.intent, 'intent'),
    recipientName: sanitizePromptInput(context.recipientName ?? '', 'recipient_name'),
    recipientTitle: sanitizePromptInput(context.recipientTitle ?? '', 'recipient_title'),
    companyName: sanitizePromptInput(context.companyName, 'company_name'),
    targetRole: sanitizePromptInput(context.targetRole ?? '', 'target_role'),
  };

  const user = `Write a ${kind === 'cold_email' ? 'cold email' : 'LinkedIn DM'}.

INTENT (what the candidate wants from this message):
${safeContext.intent}

CANDIDATE:
- Name: ${safe.fullName}
- Current title: ${safe.currentTitle} (${safe.yearsExperience} years)
- Short pitch: ${safe.shortPitch}
${safe.linkedin ? `- LinkedIn: ${safe.linkedin}` : ''}
${safe.portfolio ? `- Portfolio: ${safe.portfolio}` : ''}

TOP RELEVANT ACHIEVEMENTS:
${safe.topAchievements || '  (none provided)'}

RECIPIENT:
${safeContext.recipientName ? `- Name: ${safeContext.recipientName}` : '- Name: (unknown)'}
${safeContext.recipientTitle ? `- Title: ${safeContext.recipientTitle}` : ''}
- Company: ${safeContext.companyName}
${safeContext.targetRole ? `- Target role: ${safeContext.targetRole}` : ''}

RESEARCH (use a SPECIFIC fact from this; never invent):
${research.promptBlock}

Write ONLY the message body. ${kind === 'cold_email' ? 'No subject line. No greeting more formal than "Hi {firstName},". No sign-off more formal than the first name on its own line.' : 'No greeting beyond first name. No sign-off.'}`;

  const subjectHint = kind === 'cold_email' ? buildSubjectHint(context, research) : undefined;

  return { system, user, subjectHint };
}

function buildSubjectHint(context: OutreachContext, research: RecruiterResearchResult): string {
  // The subject line is generated by a separate cheap call. The hint here
  // is what we ask for: short, specific, no clickbait.
  const company = context.companyName;
  const role = context.targetRole;
  const recentNews = research.recentNews[0]?.title;
  if (recentNews) {
    return `Reference the recent ${company} news: "${recentNews.slice(0, 60)}". Under 8 words. No clickbait.`;
  }
  if (role) {
    return `Subject: Quick question about the ${role} role at ${company}. Under 8 words. No clickbait.`;
  }
  return `Subject: short, specific, references ${company} concretely. Under 8 words. No clickbait.`;
}
