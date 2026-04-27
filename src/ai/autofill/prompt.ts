/**
 * Autofill v2 prompt builder.
 *
 * Composes ONE prompt that asks the model to fill the entire form in a single
 * structured-output call. Replaces the per-field loop in
 * src/background/handlers/learning-handlers.ts:212-314 (where each free-text
 * question got its own AI call with no awareness of the others, and the company
 * name fell through to the literal string "the company").
 *
 * Voice rules (no em-dash, banned vocab, burstiness, persona) come from
 * src/ai/prompts/system-rules.ts ANTI_AI_TELLS so the same rules apply
 * everywhere we generate text.
 */

import { buildSystemPrompt, PERSONAS, CORE_RULES, ANTI_AI_TELLS } from '@ai/prompts/system-rules';
import { sanitizePromptInput } from '@shared/utils/prompt-safety';
import type { TFormSnapshot } from './schema';
import type { CompanyResearch } from '../../background/research/company-research';

const MAX_JD_CHARS = 1500;
const MAX_RESEARCH_CHARS = 2000;

/** Slice of the user's profile the autofill needs. Kept narrow on purpose so
 *  we don't blast the entire MasterProfile through the prompt. */
export interface AutofillProfileSlice {
  fullName: string;
  email: string;
  phone: string;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  /** "Senior Backend Engineer" etc. */
  currentTitle: string;
  yearsExperience: number;
  /** Top 10 technical skills, comma-separated. */
  skillsLine: string;
  /** Most recent company name. */
  recentCompany: string;
  /** Career advisor summary if present. */
  summary?: string;
  /** Top 3 most relevant achievements as plain bullets. */
  topAchievements: string[];
  /** Work authorization, visa status, relocation, etc. */
  workAuth?: string;
  /** Salary expectation in USD if known. */
  salaryExpectation?: string;
}

export interface AutofillJobContext {
  company: string;
  title: string;
  description: string;
  url: string;
}

const AUTOFILL_VOICE_BLOCK = `
## Autofill Voice Rules

Read the COMPANY first, write about ME second.

For every "why this company" question, every "tell us about yourself" textarea,
every "what interests you" prompt:

  1. Open with one specific thing the company actually does or sells. Reference
     a real fact from the company research blob, never a generic compliment.
  2. Then map ONE relevant piece of my experience to it. Pick the experience
     that is closest to what they do, not my most impressive one.
  3. End with what I want to learn or contribute, in the candidate's own voice.

Hard rules for every answer:
  - Only mention experience that is RELEVANT to this specific role and company.
    Hide unrelated work even when it is impressive.
  - Use first person ("I"), natural phrasing, contractions where they fit.
  - Never start with "I am a..." or "With X years of experience..." or "Hello".
  - Free-text answers under 4 sentences for short fields, 4 to 6 for long ones.
  - For select / radio / checkbox: the value MUST be one of the option values
    given in the field, exact match. If none fit, return source "skip".
  - For date fields: format YYYY-MM-DD.
  - For numeric "years of experience" fields: a number as a string.
  - If a field is unanswerable from the profile and the company research, return
    source "skip" with an empty value. Never invent.
  - Never say you do not have the information. Just skip the field silently.
`.trim();

export interface BuiltAutofillPrompt {
  system: string;
  user: string;
}

/**
 * Compose the system + user prompt for one autofill call.
 *
 * The system prompt is the persona plus all the voice rules. The user prompt
 * is the actual data the model needs to fill the form.
 */
export function buildAutofillPrompt(
  snapshot: TFormSnapshot,
  profile: AutofillProfileSlice,
  jobContext: AutofillJobContext,
  research: CompanyResearch
): BuiltAutofillPrompt {
  const system = buildSystemPrompt(PERSONAS.CAREER_ADVISOR, [
    CORE_RULES,
    ANTI_AI_TELLS,
    AUTOFILL_VOICE_BLOCK,
  ]);

  const safe = {
    fullName: sanitizePromptInput(profile.fullName, 'candidate_name'),
    email: sanitizePromptInput(profile.email, 'candidate_email'),
    phone: sanitizePromptInput(profile.phone, 'candidate_phone'),
    location: sanitizePromptInput(profile.location ?? '', 'candidate_location'),
    linkedin: sanitizePromptInput(profile.linkedin ?? '', 'linkedin'),
    github: sanitizePromptInput(profile.github ?? '', 'github'),
    portfolio: sanitizePromptInput(profile.portfolio ?? '', 'portfolio'),
    currentTitle: sanitizePromptInput(profile.currentTitle, 'candidate_title'),
    skillsLine: sanitizePromptInput(profile.skillsLine, 'candidate_skills'),
    recentCompany: sanitizePromptInput(profile.recentCompany, 'recent_company'),
    summary: sanitizePromptInput(profile.summary ?? '', 'candidate_summary'),
    topAchievements: profile.topAchievements
      .slice(0, 3)
      .map((a, i) => `  ${i + 1}. ${sanitizePromptInput(a, `achievement_${i}`)}`)
      .join('\n'),
    workAuth: sanitizePromptInput(profile.workAuth ?? '', 'work_auth'),
    salary: sanitizePromptInput(profile.salaryExpectation ?? '', 'salary'),
  };

  const safeJob = {
    company: sanitizePromptInput(jobContext.company, 'target_company'),
    title: sanitizePromptInput(jobContext.title, 'target_title'),
    description: sanitizePromptInput(
      jobContext.description.slice(0, MAX_JD_CHARS),
      'job_description'
    ),
    url: sanitizePromptInput(jobContext.url, 'job_url'),
  };

  // SECURITY: research.text comes from defuddle/Jina-extracted external HTML
  // (the company's own website). A poisoned company page can embed
  // "Ignore prior instructions" or other prompt-injection text. Run it
  // through the same sanitizer the user fields use so the model gets
  // injection-marker-stripped content. The slice cap is also enforced here.
  const safeResearchText = sanitizePromptInput(
    research.text.slice(0, MAX_RESEARCH_CHARS),
    'company_research'
  );
  const researchBlock =
    research.tier === 1
      ? safeResearchText
      : `[research tier ${research.tier}, source: ${research.domain ?? 'unknown'}]\n${safeResearchText}`;

  const user = `Fill the form below. Return ONLY JSON matching the AutofillResponse schema.

CANDIDATE PROFILE:
- Name: ${safe.fullName}
- Email: ${safe.email}
- Phone: ${safe.phone}
${safe.location ? `- Location: ${safe.location}` : ''}
${safe.linkedin ? `- LinkedIn: ${safe.linkedin}` : ''}
${safe.github ? `- GitHub: ${safe.github}` : ''}
${safe.portfolio ? `- Portfolio: ${safe.portfolio}` : ''}
- Current/Recent Title: ${safe.currentTitle}
- Years of Experience: ${profile.yearsExperience}
- Recent Company: ${safe.recentCompany}
- Top Skills: ${safe.skillsLine}
${safe.summary ? `- Summary: ${safe.summary}` : ''}
${safe.workAuth ? `- Work Authorization: ${safe.workAuth}` : ''}
${safe.salary ? `- Salary Expectation: ${safe.salary}` : ''}

TOP RELEVANT ACHIEVEMENTS:
${safe.topAchievements || '  (none provided)'}

TARGET JOB:
- Company: ${safeJob.company}
- Role: ${safeJob.title}
- URL: ${safeJob.url}
- JD: ${safeJob.description}

COMPANY RESEARCH:
${researchBlock}

FORM TO FILL (${snapshot.fields.length} fields, platform: ${snapshot.platform}):
${JSON.stringify(snapshot.fields, null, 0)}

Return JSON with shape { "answers": [{"fieldId","value","source","confidence"}], "notes": null }
- One entry per field. fieldId MUST match the input.
- source is one of: profile, ai, company-research, skip.
- confidence is 0..1 (your self-rated certainty).
- For skip, value is "" and confidence is 0.`;

  return { system, user };
}
