/**
 * Email Template Generator
 *
 * Generates contextual email templates (thank-you, follow-up, networking,
 * cold outreach, post-rejection) personalized to the candidate's profile
 * and the target job/company.
 */

import type { AIService } from '@ai/index';
import type { MasterProfile } from '@shared/types/master-profile.types';
import { PROMPT_SAFETY_PREAMBLE, sanitizePromptInput } from '@shared/utils/prompt-safety';
import { extractJSONFromResponse } from '@shared/utils/json-utils';

// ── Types ───────────────────────────────────────────────────────────────

export type EmailType =
  | 'thank_you'
  | 'follow_up'
  | 'networking'
  | 'cold_outreach'
  | 'post_rejection';

export interface EmailTemplate {
  type: EmailType;
  subject: string;
  body: string;
  wordCount: number;
  tone: string;
  generatedAt: string;
}

export interface EmailGenerationPayload {
  emailType: EmailType;
  jobDescription: string;
  companyName: string;
  jobTitle: string;
  recipientName?: string;
  discussionPoints?: string[];
  daysSinceApplication?: number;
  referrerName?: string;
}

interface EmailContext {
  candidateName: string;
  candidateTitle: string;
  yearsExperience: number;
  topSkills: string[];
  recentCompany: string;
  companyName: string;
  jobTitle: string;
  recipientName: string;
}

// ── Helpers (pure, testable) ────────────────────────────────────────────

const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  thank_you: 'Thank You (Post-Interview)',
  follow_up: 'Application Follow-Up',
  networking: 'Networking / Referral Request',
  cold_outreach: 'Cold Outreach to Hiring Manager',
  post_rejection: 'Post-Rejection (Graceful)',
};

const EMAIL_TEMPERATURES: Record<EmailType, number> = {
  thank_you: 0.5,
  follow_up: 0.5,
  networking: 0.6,
  cold_outreach: 0.6,
  post_rejection: 0.5,
};

export function getEmailTypeLabel(type: EmailType): string {
  return EMAIL_TYPE_LABELS[type] || type;
}

export function getEmailTypes(): { value: EmailType; label: string }[] {
  return Object.entries(EMAIL_TYPE_LABELS).map(([value, label]) => ({
    value: value as EmailType,
    label,
  }));
}

export function buildEmailContext(
  profile: MasterProfile,
  payload: EmailGenerationPayload
): EmailContext {
  const personal = profile.personal;
  const career = profile.careerContext;
  const experience = profile.experience || [];
  const skills = profile.skills;

  const allSkills = [
    ...(skills?.technical || []),
    ...(skills?.tools || []),
    ...(skills?.frameworks || []),
  ];
  const topSkills = allSkills.map((s) => (typeof s === 'string' ? s : s.name)).slice(0, 10);

  const recentJob = experience.length > 0 ? experience[0] : null;

  return {
    candidateName: personal?.fullName || 'the candidate',
    candidateTitle: recentJob?.title || career?.primaryDomain || 'Professional',
    yearsExperience: career?.yearsOfExperience ?? 0,
    topSkills,
    recentCompany: recentJob?.company || '',
    companyName: payload.companyName || 'the company',
    jobTitle: payload.jobTitle || 'the role',
    recipientName: payload.recipientName || 'Hiring Manager',
  };
}

// ── Email-type-specific prompt instructions ─────────────────────────────

function getTypeInstructions(payload: EmailGenerationPayload): string {
  switch (payload.emailType) {
    case 'thank_you': {
      const points = payload.discussionPoints?.length
        ? `\nSpecific discussion points to reference:\n${payload.discussionPoints.map((p) => `- ${p}`).join('\n')}`
        : '';
      return `Write a post-interview thank you email.
- Express genuine gratitude for their time
- Reference specific topics discussed during the interview${points}
- Reiterate enthusiasm for the role and why you're a good fit
- Keep it warm but professional, 100-200 words
- End with a forward-looking statement`;
    }

    case 'follow_up': {
      const days = payload.daysSinceApplication || 7;
      return `Write a follow-up email checking on application status.
- It has been approximately ${days} days since the application was submitted
- Be polite and brief — express continued interest without being pushy
- Mention you applied for the specific role and briefly restate your value
- Ask if there are any updates on the hiring timeline
- Keep it professional and concise, 75-150 words`;
    }

    case 'networking': {
      const referrer = payload.referrerName
        ? `\nMention that ${payload.referrerName} suggested reaching out.`
        : '';
      return `Write a networking email requesting a referral or informational conversation.
- Be genuine and specific about why you're reaching out to THIS person${referrer}
- Show you've done homework on the company and role
- Make a specific, low-commitment ask (15-min chat, or referral)
- Offer to share your resume or LinkedIn for review
- Keep it warm and collegial, 100-175 words`;
    }

    case 'cold_outreach':
      return `Write a cold outreach email to a hiring manager.
- Lead with something specific about the company (recent news, product, mission)
- Briefly explain your relevant background and what you'd bring
- Do NOT sound like a mass email — personalize heavily
- Make a clear, specific ask (interest in the role, open to chat)
- Keep it crisp and professional, 100-175 words
- Avoid being overly flattering or desperate`;

    case 'post_rejection':
      return `Write a graceful response to a job rejection.
- Express gratitude for the opportunity and their time
- Show maturity and professionalism — no bitterness
- Ask for brief feedback if appropriate
- Keep the door open for future opportunities
- Keep it brief and dignified, 75-125 words`;

    default:
      return `Write a professional email for this job application context.
- Be concise and professional, 100-175 words`;
  }
}

// ── Main Generation Function ────────────────────────────────────────────

export async function generateEmailTemplate(
  aiService: AIService,
  profile: MasterProfile,
  payload: EmailGenerationPayload
): Promise<EmailTemplate> {
  const ctx = buildEmailContext(profile, payload);
  const temperature = EMAIL_TEMPERATURES[payload.emailType];
  const typeInstructions = getTypeInstructions(payload);

  const skillsList =
    ctx.topSkills.length > 0 ? ctx.topSkills.join(', ') : 'various technical skills';

  const prompt = `${PROMPT_SAFETY_PREAMBLE}

You are an expert professional email writer helping a job candidate craft a personalized email.

CANDIDATE PROFILE:
- Name: ${sanitizePromptInput(ctx.candidateName, 'candidateName')}
- Current/Recent Title: ${sanitizePromptInput(ctx.candidateTitle, 'candidateTitle')}
- Years of Experience: ${ctx.yearsExperience}
- Key Skills: ${sanitizePromptInput(skillsList, 'skills')}
${ctx.recentCompany ? `- Recent Company: ${sanitizePromptInput(ctx.recentCompany, 'recentCompany')}` : ''}

TARGET:
- Company: ${sanitizePromptInput(ctx.companyName, 'companyName')}
- Role: ${sanitizePromptInput(ctx.jobTitle, 'jobTitle')}
- Recipient: ${sanitizePromptInput(ctx.recipientName, 'recipientName')}

${payload.jobDescription ? `JOB DESCRIPTION (key context):\n${sanitizePromptInput(payload.jobDescription.slice(0, 2000), 'jobDescription')}` : ''}

EMAIL TYPE: ${getEmailTypeLabel(payload.emailType)}

INSTRUCTIONS:
${typeInstructions}

RULES:
- Be authentic — avoid generic AI-sounding phrases like "I am writing to express..."
- Use the candidate's actual background, not fabricated details
- Reference specific details from the JD or company where relevant
- Maintain a natural, human tone

Return ONLY a JSON object with this exact structure:
{
  "subject": "Email subject line",
  "body": "Full email body with proper greeting and sign-off"
}`;

  const response = await aiService.chat([{ role: 'user', content: prompt }], {
    temperature,
    maxTokens: 1000,
  });

  const parsed = extractJSONFromResponse<{ subject: string; body: string }>(response.content);

  if (!parsed?.subject || !parsed?.body) {
    throw new Error('Failed to generate email — invalid AI response');
  }

  const wordCount = parsed.body.split(/\s+/).filter(Boolean).length;

  return {
    type: payload.emailType,
    subject: parsed.subject,
    body: parsed.body,
    wordCount,
    tone:
      payload.emailType === 'networking' || payload.emailType === 'cold_outreach'
        ? 'warm'
        : 'professional',
    generatedAt: new Date().toISOString(),
  };
}
