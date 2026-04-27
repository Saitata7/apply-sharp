/**
 * Outreach background handlers (Workstream 5).
 *
 * Two messages:
 *   - GENERATE_OUTREACH: takes intent + recipient + company name, runs the
 *     recruiter research aggregator, calls the AI to draft the message,
 *     returns the body (and the subject hint for cold emails). Does NOT
 *     send anything. The user copies to clipboard or creates a Gmail draft
 *     via a separate message.
 *   - CREATE_GMAIL_DRAFT: takes a pre-composed message + the user's BYOK
 *     Google OAuth client id, calls GmailProvider.createDraft, returns the
 *     draft id and compose URL the user can open in Gmail.
 *
 * Both handlers never auto-send. Both never touch the LinkedIn DOM.
 */

import type { MessageResponse } from '@shared/utils/messaging';
import { masterProfileRepo, contactRepo } from '@storage/index';
import { getAIService } from '../message-handler';
import {
  buildOutreachPrompt,
  type OutreachKind,
  type OutreachContext,
  type OutreachProfile,
} from '@/ai/prompts/outreach';
import { researchRecruiter } from '@core/outreach/recruiter-research';
import { GmailProvider } from '@/ai/providers/gmail';

export interface GenerateOutreachPayload {
  kind: OutreachKind;
  context: OutreachContext;
  /** Optional override; defaults to the active master profile. */
  profileOverride?: Partial<OutreachProfile>;
  /** Optional GitHub username for richer research. */
  githubUsername?: string;
  /** Optional personal site for richer research. */
  personalSite?: string;
  /**
   * Workstream 10: optional contact id captured by the Contact CRM.
   * When set, the handler fetches the contact and prefers its canonical
   * fields for recipientName / recipientTitle / companyName / email.
   * Manually-set context fields still override (so the user can edit
   * before generating).
   */
  contactId?: string;
}

export interface GenerateOutreachResult {
  /** The drafted message body. */
  body: string;
  /** Subject line for cold emails (undefined for LinkedIn DMs). */
  subject?: string;
  /** Which research tier was used (1 model knowledge, 2 defuddle, 3 jina). */
  researchTier: 1 | 2 | 3;
  /** Resolved recruiter research for downstream display. */
  research: {
    domain: string | null;
    newsCount: number;
    hasGithub: boolean;
  };
}

function buildProfileSlice(
  profile: NonNullable<Awaited<ReturnType<typeof masterProfileRepo.getActive>>>,
  override?: Partial<OutreachProfile>
): OutreachProfile {
  const recent = profile.experience?.[0];
  const achievements: string[] = [];
  for (const a of recent?.achievements ?? []) {
    if (typeof a === 'string') achievements.push(a);
    else if (a && typeof a === 'object' && 'text' in a) {
      achievements.push(String((a as { text: unknown }).text));
    }
  }

  return {
    fullName: override?.fullName ?? profile.personal?.fullName ?? '',
    currentTitle: override?.currentTitle ?? recent?.title ?? 'Software Professional',
    yearsExperience: override?.yearsExperience ?? profile.careerContext?.yearsOfExperience ?? 0,
    shortPitch:
      override?.shortPitch ??
      profile.careerContext?.summary?.split(/\.[\s]/)[0] ??
      'Experienced engineer focused on shipping.',
    topAchievements: override?.topAchievements ?? achievements.slice(0, 3),
    linkedinUrl: override?.linkedinUrl ?? profile.personal?.linkedInUrl,
    portfolioUrl:
      override?.portfolioUrl ?? profile.personal?.portfolioUrl ?? profile.personal?.websiteUrl,
  };
}

export async function handleGenerateOutreach(
  payload: GenerateOutreachPayload
): Promise<MessageResponse> {
  try {
    // Workstream 10: if a contactId was provided, fetch the contact and
    // backfill the context fields the user did not explicitly set.
    // The user-supplied context still wins on every field they set
    // explicitly (truthy check), so the contact only fills the gaps.
    if (payload?.contactId) {
      try {
        const contact = await contactRepo.getById(payload.contactId);
        if (contact) {
          const c = contact.canonical;
          payload.context = {
            ...payload.context,
            companyName: payload.context?.companyName || c.company || '',
            recipientName: payload.context?.recipientName || c.name,
            recipientTitle: payload.context?.recipientTitle || c.title,
          };
        }
      } catch (err) {
        // Contact lookup failure should not block outreach generation;
        // fall through to manual fields.
        console.warn('[Outreach] contact lookup failed:', err);
      }
    }

    if (!payload?.context?.companyName) {
      return { success: false, error: 'Company name is required for outreach research' };
    }

    const ai = await getAIService();
    if (ai.error) return { success: false, error: ai.error };
    const aiService = ai.service!;

    const masterProfile = await masterProfileRepo.getActive();
    if (!masterProfile) {
      return { success: false, error: 'No active profile. Set one up before drafting outreach.' };
    }

    const profileSlice = buildProfileSlice(masterProfile, payload.profileOverride);

    const research = await researchRecruiter({
      companyName: payload.context.companyName,
      githubUsername: payload.githubUsername,
      personalSite: payload.personalSite,
    });

    const built = buildOutreachPrompt(payload.kind, payload.context, profileSlice, research);

    const messages = [
      { role: 'system' as const, content: built.system },
      { role: 'user' as const, content: built.user },
    ];

    const response = await aiService.chat(messages, {
      temperature: 0.55,
      maxTokens: payload.kind === 'cold_email' ? 350 : 200,
      feature: payload.kind,
    });

    const body = (response?.content ?? '').trim();
    if (!body) {
      return { success: false, error: 'AI returned an empty draft' };
    }

    let subject: string | undefined;
    if (payload.kind === 'cold_email' && built.subjectHint) {
      try {
        const subjectResp = await aiService.chat(
          [
            { role: 'system', content: built.system },
            {
              role: 'user',
              content:
                built.subjectHint +
                '\nReturn ONLY the subject line, no quotes, no formatting, no greeting.',
            },
          ],
          { temperature: 0.5, maxTokens: 40, feature: 'cold_email_subject' }
        );
        subject = (subjectResp?.content ?? '')
          .trim()
          .replace(/^Subject:\s*/i, '')
          .slice(0, 80);
      } catch {
        // best effort
      }
    }

    const result: GenerateOutreachResult = {
      body,
      subject,
      researchTier: research.company.tier,
      research: {
        domain: research.company.domain,
        newsCount: research.recentNews.length,
        hasGithub: research.github !== null,
      },
    };

    return { success: true, data: result };
  } catch (err) {
    console.error('[Outreach] generate failed:', err);
    return { success: false, error: (err as Error).message };
  }
}

export interface CreateGmailDraftPayload {
  /** User's own Google OAuth Client ID. BYOK only. */
  clientId: string;
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}

/**
 * Lightweight RFC-5322-ish email validation. Not exhaustive (the full
 * spec is unrenderable as a regex), but rejects the obvious junk that
 * would otherwise hit Gmail and waste an OAuth roundtrip. The Gmail
 * provider's sanitizeHeader catches CRLF injection regardless.
 *
 * Accepts a comma-separated list of addresses (Gmail accepts these in
 * the To/Cc/Bcc headers). All entries must be valid for the function
 * to return true.
 */
function isLikelyValidEmail(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length > 998) return false; // header length cap
  const parts = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => p.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p));
}

const MAX_EMAIL_BODY_CHARS = 25000;
const MAX_EMAIL_SUBJECT_CHARS = 200;

export async function handleCreateGmailDraft(
  payload: CreateGmailDraftPayload
): Promise<MessageResponse> {
  try {
    if (!payload?.clientId) {
      return { success: false, error: 'Google OAuth Client ID required (BYOK)' };
    }
    if (!payload.to || !payload.subject || !payload.body) {
      return { success: false, error: 'to, subject, and body are required' };
    }
    if (!isLikelyValidEmail(payload.to)) {
      return { success: false, error: `"${payload.to}" does not look like a valid email address` };
    }
    if (payload.cc && !isLikelyValidEmail(payload.cc)) {
      return {
        success: false,
        error: `Cc "${payload.cc}" does not look like a valid email address`,
      };
    }
    if (payload.bcc && !isLikelyValidEmail(payload.bcc)) {
      return {
        success: false,
        error: `Bcc "${payload.bcc}" does not look like a valid email address`,
      };
    }
    if (payload.body.length > MAX_EMAIL_BODY_CHARS) {
      return {
        success: false,
        error: `Email body is too long (${payload.body.length} chars; cap is ${MAX_EMAIL_BODY_CHARS}).`,
      };
    }
    if (payload.subject.length > MAX_EMAIL_SUBJECT_CHARS) {
      return {
        success: false,
        error: `Email subject is too long (${payload.subject.length} chars; cap is ${MAX_EMAIL_SUBJECT_CHARS}).`,
      };
    }
    const provider = new GmailProvider({ clientId: payload.clientId });
    const result = await provider.createDraft({
      to: payload.to,
      subject: payload.subject,
      body: payload.body,
      cc: payload.cc,
      bcc: payload.bcc,
    });
    return { success: true, data: result };
  } catch (err) {
    console.error('[Outreach] gmail draft failed:', err);
    return { success: false, error: (err as Error).message };
  }
}
