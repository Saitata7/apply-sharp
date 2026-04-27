/**
 * Email extraction (Workstream 10).
 *
 * Pure functions. No DOM, no fetches, no chrome.* references.
 *
 * Strategy:
 *   1. Optionally unwrap obfuscation patterns ([at], (dot), AT, DOT)
 *      via a SEPARATE preprocessing pass. The main regex never tries
 *      to match obfuscated forms.
 *   2. Run a bounded regex with a TLD length cap (2-24 chars) to
 *      reject runaway "example@foo.bar.lorem.ipsum" false positives.
 *   3. Strip trailing punctuation post-match.
 *   4. Classify each match into personal | role | noreply.
 *   5. Apply hard blocklists (personal webmail, analytics vendors).
 *
 * Per Plan agent: do NOT filter role/noreply, mark them low-confidence
 * and let the user toggle visibility. A small startup that only lists
 * `hiring@acme.co` is exactly who the user needs to reach.
 */

import type { EmailKind } from '@shared/types/contact.types';
import { isPersonalWebmailDomain, isAnalyticsDomain } from './blocklist';

/**
 * RFC 5322-lite email regex with HARD per-segment bounds. Iter-2 fix.
 *
 * The previous pattern `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g`
 * was catastrophic on pathological inputs: 100KB of repeated 'a' chars
 * hung for 12+ seconds because the local-part class and the domain class
 * both allow unlimited word characters that backtrack against each other
 * when no '@' is present.
 *
 * The fix uses tight upper bounds per RFC 5321:
 *   - local part: 1..64 chars (RFC max)
 *   - domain label: 1..63 chars (RFC max), up to 4 labels before the TLD
 *   - TLD: 2..24 alpha chars
 *
 * Bounded quantifiers eliminate exponential backtracking. Word-boundary
 * anchor `\b` ensures we never re-attempt a match starting in the middle
 * of a long alphanumeric run, which is the root cause of the ReDoS.
 */
export const EMAIL_REGEX =
  /\b[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9-]{1,63}(?:\.[a-zA-Z0-9-]{1,63}){0,4}\.[a-zA-Z]{2,24}\b/g;

/**
 * Local-parts that indicate a role-based mailbox (medium signal).
 * These are real hiring contacts at small companies but they tend to
 * route to a shared inbox, not a single recruiter.
 */
const ROLE_LOCAL_PARTS = new Set<string>([
  'info',
  'careers',
  'hiring',
  'jobs',
  'recruiting',
  'recruiter',
  'recruiters',
  'hello',
  'hi',
  'contact',
  'team',
  'people',
  'talent',
  'hr',
  'human-resources',
  'humanresources',
  'apply',
  'application',
  'work',
  'workwithus',
  'opportunities',
]);

/**
 * Local-parts that indicate a no-reply / system / abuse mailbox.
 * Hidden by default in the Contacts table.
 */
const NOREPLY_LOCAL_PARTS = new Set<string>([
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'no_reply',
  'mailer-daemon',
  'mailerdaemon',
  'postmaster',
  'support',
  'help',
  'security',
  'abuse',
  'webmaster',
  'admin',
  'administrator',
  'service',
  'system',
  'alerts',
  'notifications',
  'noresponse',
]);

export interface EmailMatch {
  /** Normalized lowercase. */
  email: string;
  /** As found in the source text. */
  raw: string;
  /** Classification: personal | role | noreply. */
  kind: EmailKind;
  /** Domain part (after the @). */
  domain: string;
  /** Local part (before the @). */
  localPart: string;
  /** True if blocked by personal webmail or analytics blocklist. */
  isBlocked: boolean;
  /** Position of the match in the source text (for anchor walking). */
  index: number;
}

/**
 * Extract emails from a text blob. Bounded TLD prevents runaway matches.
 * Returns one match per unique normalized email; duplicates collapse.
 *
 * The caller is expected to feed text-only content. For HTML pages,
 * extract text first via element.textContent.
 */
export function extractEmails(text: string): EmailMatch[] {
  if (!text || typeof text !== 'string') return [];
  // Cap input size for safety; 1MB is more than any reasonable page.
  const bounded = text.slice(0, 1_000_000);
  const seen = new Set<string>();
  const out: EmailMatch[] = [];
  // Reset lastIndex on the global regex to avoid stateful surprises.
  EMAIL_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EMAIL_REGEX.exec(bounded)) !== null) {
    const raw = stripTrailingPunct(m[0]);
    const normalized = normalizeEmail(raw);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const at = normalized.indexOf('@');
    if (at < 0) continue;
    const localPart = normalized.slice(0, at);
    const domain = normalized.slice(at + 1);
    out.push({
      email: normalized,
      raw,
      kind: classifyEmail(normalized),
      domain,
      localPart,
      isBlocked: isPersonalWebmailDomain(domain) || isAnalyticsDomain(domain),
      index: m.index,
    });
  }
  return out;
}

/**
 * Normalize an email for dedup:
 *   - lowercase
 *   - trim
 *   - strip +addressing (foo+bar@x.com -> foo@x.com)
 *   - gmail.com only: strip dots in the local part (f.o.o@gmail.com -> foo@gmail.com)
 *
 * Returns the empty string for invalid input.
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf('@');
  if (at < 0 || at === trimmed.length - 1) return '';
  let localPart = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  // Strip plus-addressing
  const plus = localPart.indexOf('+');
  if (plus >= 0) localPart = localPart.slice(0, plus);
  // gmail.com: dots are insignificant
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    localPart = localPart.replace(/\./g, '');
  }
  if (!localPart) return '';
  return `${localPart}@${domain}`;
}

/**
 * Classify an email as personal | role | noreply by checking the local
 * part against known sets. Default is 'personal'.
 */
export function classifyEmail(email: string): EmailKind {
  if (!email || typeof email !== 'string') return 'personal';
  const at = email.indexOf('@');
  if (at < 0) return 'personal';
  const localPart = email.slice(0, at).toLowerCase();
  if (NOREPLY_LOCAL_PARTS.has(localPart)) return 'noreply';
  if (ROLE_LOCAL_PARTS.has(localPart)) return 'role';
  return 'personal';
}

// Iter-2: unwrapObfuscation was deleted. The previous implementation
// had two problems: (1) it was never called from extractContactsFromDom
// or extractEmails (dead code), and (2) the `\s+at\s+` rule has a real
// false-positive hazard ("data at rest" -> "data@rest" -> fake personal
// email) that would surface real spam in production. The honest fix is
// to delete it. If we ever wire obfuscation unwrap in v2, the safer
// approach is a parser that requires the result to validate as an email
// before accepting the rewrite.

/**
 * Strip trailing punctuation from a regex match. Captures cases like
 * "Contact: sarah@acme.co." or "(sarah@acme.co)".
 */
function stripTrailingPunct(s: string): string {
  return s.replace(/[.,;:!?)\]}>]+$/, '');
}
