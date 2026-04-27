/**
 * Contact extractor (Workstream 10).
 *
 * Pure orchestration function that ties email-regex + phone-regex +
 * anchor-walker + dedupe + blocklist together. Returns a list of
 * SaveContactPayload-shaped sightings ready to send to the background.
 *
 * Critical: this function is PURE. No IDB, no fetches, no chrome.* refs.
 * The caller (content script entry point) handles message passing and
 * persistence. Tests can run this against jsdom fixtures with no
 * background mock.
 *
 * Algorithm:
 *   1. Skip immediately if isSensitiveHost(hostname).
 *   2. Get the text content of the root element.
 *   3. Run extractEmails + extractPhones over the text.
 *   4. For each anchor, find its DOM element via querying back into the
 *      DOM (since the regex match returned a string offset, not a node).
 *   5. Run anchor-walker on each anchor element to get name+title.
 *   6. Build a ContactSighting per anchor.
 *   7. Skip blocked emails (personal webmail, analytics).
 *   8. Bucket by confidence: high -> save, low -> drop, ambiguous mid ->
 *      mark needsReview (Nano tiebreaker is wired by the caller, not here).
 *
 * The Nano tiebreaker is OPT-IN at the caller level. This module exposes
 * the candidates and lets the caller decide whether to call AI on them.
 */

import type {
  Contact,
  ContactExtractedFields,
  ContactSighting,
  ContactConfidence,
} from '@shared/types/contact.types';
import { extractEmails, type EmailMatch } from './email-regex';
import { extractPhones, regionFromContext, type PhoneMatch } from './phone-regex';
import { walkFromAnchor, walkFromAnchorTextOnly, type AnchorWalkResult } from './anchor-walker';
import { isSensitiveHost } from './blocklist';
import { contactIdFor } from './dedupe';

export interface ExtractContext {
  hostname: string;
  url: string;
  platform: string;
  /** Optional: free-text JD text from the existing JOB_DETECTED extractor. */
  jdText?: string;
  /** Optional: html lang attribute, used to derive default phone region. */
  htmlLang?: string;
}

export interface ExtractedContactCandidate {
  /** Computed contact id (email/phone/nc/unknown prefix). */
  id: string;
  /** Sighting payload ready to merge into the contact repo. */
  sighting: ContactSighting;
  /** Per-candidate confidence score 0..1, computed from anchor walk + match quality. */
  score: number;
  /** True if confidence is mid-band and Nano tiebreaker should be considered. */
  needsReview: boolean;
}

/**
 * Extract contact candidates from a DOM root.
 *
 * Returns one candidate per UNIQUE email or phone match. Blocked emails
 * (personal webmail, analytics) are filtered out. Sensitive hosts are
 * rejected entirely.
 *
 * The caller is responsible for:
 *   - Calling this function (typically content script)
 *   - Optionally running the Nano tiebreaker on candidates with
 *     needsReview === true
 *   - Sending the resulting payloads to the background SAVE_CONTACT handler
 */
export function extractContactsFromDom(
  root: Element,
  context: ExtractContext
): ExtractedContactCandidate[] {
  if (!root || !context?.hostname) return [];
  if (isSensitiveHost(context.hostname)) return [];

  // Use element-boundary text extraction so <p>a@x.co</p><p>b@y.co</p>
  // becomes "a@x.co b@y.co" and not "a@x.cob@y.co". textContent
  // concatenates without separators which makes the regex match
  // pathological cross-element fake emails.
  const text = textWithBoundaries(root).slice(0, 1_000_000);
  if (!text) return [];

  const region = regionFromContext(context.htmlLang, context.hostname);
  const emails = extractEmails(text);
  const phones = extractPhones(text, region);

  const candidates: ExtractedContactCandidate[] = [];

  // Pass 1: emails (anchor #1)
  for (const m of emails) {
    if (m.isBlocked) continue;
    const anchorEl = findAnchorElement(root, m.email);
    const walk: AnchorWalkResult = anchorEl
      ? walkFromAnchor(anchorEl, { hostname: context.hostname, jdText: context.jdText })
      : walkFromAnchorTextOnly(text, m.index);
    const fields = buildFields(m, undefined, walk);
    const score = scoreCandidate(walk, m.kind);
    candidates.push(buildCandidate(fields, walk, context, score));
  }

  // Pass 2: phones (anchor #2). Skip phones whose anchor element already
  // produced an email candidate (avoid double-counting Sarah twice).
  const usedAnchors = new Set<Element | null>();
  for (const m of phones) {
    const anchorEl = findAnchorElement(root, m.raw);
    if (anchorEl && usedAnchors.has(anchorEl)) continue;
    usedAnchors.add(anchorEl);
    const walk: AnchorWalkResult = anchorEl
      ? walkFromAnchor(anchorEl, { hostname: context.hostname, jdText: context.jdText })
      : walkFromAnchorTextOnly(text, m.index);
    const fields = buildFields(undefined, m, walk);
    const score = scoreCandidate(walk, undefined, m.confidence);
    candidates.push(buildCandidate(fields, walk, context, score));
  }

  return candidates;
}

/**
 * Convenience: extract from raw HTML string. Used by tests against
 * fixture files. Builds a temporary DOM via DOMParser when available
 * (jsdom or content script), falls back to walkFromAnchorTextOnly when
 * not (background service worker has no DOMParser by default - this
 * pure function is the only option there).
 */
export function extractContactsFromHtml(
  html: string,
  context: ExtractContext
): ExtractedContactCandidate[] {
  if (!html || typeof html !== 'string') return [];
  if (typeof DOMParser === 'undefined') {
    // Background fallback: text-only path
    return extractContactsFromTextOnly(html, context);
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return extractContactsFromDom(doc.body, context);
}

/**
 * Background-safe text-only fallback. No DOM, no DOMParser. Less
 * precise (only inline patterns), but always available.
 */
export function extractContactsFromTextOnly(
  rawText: string,
  context: ExtractContext
): ExtractedContactCandidate[] {
  if (!rawText) return [];
  if (isSensitiveHost(context.hostname)) return [];

  // Strip HTML tags very crudely
  const text = rawText
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 1_000_000);
  if (!text) return [];

  const region = regionFromContext(context.htmlLang, context.hostname);
  const emails = extractEmails(text);
  const phones = extractPhones(text, region);

  const candidates: ExtractedContactCandidate[] = [];
  for (const m of emails) {
    if (m.isBlocked) continue;
    const walk = walkFromAnchorTextOnly(text, m.index);
    const fields = buildFields(m, undefined, walk);
    const score = scoreCandidate(walk, m.kind);
    candidates.push(buildCandidate(fields, walk, context, score));
  }
  for (const m of phones) {
    const walk = walkFromAnchorTextOnly(text, m.index);
    const fields = buildFields(undefined, m, walk);
    const score = scoreCandidate(walk, undefined, m.confidence);
    candidates.push(buildCandidate(fields, walk, context, score));
  }
  return candidates;
}

/**
 * Find a DOM element containing the given text needle. Used to walk
 * back from a regex match offset into a DOM node so the anchor walker
 * has a starting point.
 *
 * Returns the deepest element whose textContent contains the needle.
 * If multiple matches exist (the user has the same email twice on the
 * page), returns the first.
 */
/**
 * Walk the DOM and concatenate text nodes with explicit spaces between
 * element boundaries. Prevents the textContent gotcha where adjacent
 * elements get joined into a single string with no separator, which
 * causes the email regex to match fake cross-element addresses.
 */
function textWithBoundaries(root: Element): string {
  const parts: string[] = [];
  if (typeof document === 'undefined' || !document.createTreeWalker) {
    return root.textContent || '';
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  let count = 0;
  while (node) {
    const t = (node.textContent || '').trim();
    if (t) parts.push(t);
    if (count++ > 50_000) break;
    node = walker.nextNode();
  }
  return parts.join(' ');
}

function findAnchorElement(root: Element, needle: string): Element | null {
  if (!needle) return null;
  // querySelectorAll('*') is the simplest path; bounded by walking only
  // visible text. Cap at 5000 elements to avoid pathological pages.
  const all = root.querySelectorAll('*');
  let best: Element | null = null;
  let bestDepth = -1;
  let count = 0;
  for (const el of all) {
    if (count++ > 5000) break;
    const text = el.textContent || '';
    if (!text.includes(needle)) continue;
    // Prefer the DEEPEST element that contains the needle (most specific)
    let depth = 0;
    let cur: Element | null = el;
    while (cur && cur !== root) {
      depth++;
      cur = cur.parentElement;
    }
    if (depth > bestDepth) {
      bestDepth = depth;
      best = el;
    }
  }
  return best;
}

function buildFields(
  email: EmailMatch | undefined,
  phone: PhoneMatch | undefined,
  walk: AnchorWalkResult
): ContactExtractedFields {
  return {
    name: walk.name,
    title: walk.title,
    company: walk.company,
    email: email?.email,
    emailKind: email?.kind,
    phone: phone?.e164,
  };
}

function scoreCandidate(
  walk: AnchorWalkResult,
  emailKind?: 'personal' | 'role' | 'noreply',
  phoneConfidence?: ContactConfidence
): number {
  let score = 0;
  // Walk confidence: high=0.5, medium=0.3, low=0.1
  if (walk.confidence === 'high') score += 0.5;
  else if (walk.confidence === 'medium') score += 0.3;
  else score += 0.1;
  // Email kind boost
  if (emailKind === 'personal') score += 0.4;
  else if (emailKind === 'role') score += 0.2;
  else if (emailKind === 'noreply') score += 0.05;
  // Phone confidence boost
  if (phoneConfidence === 'high') score += 0.3;
  else if (phoneConfidence === 'medium') score += 0.2;
  else if (phoneConfidence === 'low') score += 0.1;
  // Name+title bonus
  if (walk.name) score += 0.1;
  if (walk.title) score += 0.1;
  return Math.min(1, score);
}

function buildCandidate(
  fields: ContactExtractedFields,
  walk: AnchorWalkResult,
  context: ExtractContext,
  score: number
): ExtractedContactCandidate {
  const id = contactIdFor(fields);
  const confidence: ContactConfidence = score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';
  const sighting: ContactSighting = {
    capturedAt: new Date().toISOString(),
    sourceUrl: context.url,
    platform: context.platform,
    extractedFields: fields,
    confidence,
  };
  return {
    id,
    sighting,
    score,
    needsReview: score >= 0.4 && score < 0.7 && walk.ambiguous,
  };
}

/**
 * Convert a list of candidates into the merged Contact form for tests.
 * Used by extractor.test.ts; the production path goes through the IDB
 * repo's mergeOnSave instead.
 */
export function candidatesToContacts(
  candidates: ExtractedContactCandidate[],
  jobId?: string
): Contact[] {
  const byId = new Map<string, Contact>();
  for (const c of candidates) {
    const existing = byId.get(c.id) ?? null;
    const now = new Date().toISOString();
    if (existing) {
      existing.sightings.push(c.sighting);
      if (jobId && !existing.jobIds.includes(jobId)) existing.jobIds.push(jobId);
      existing.updatedAt = now;
    } else {
      byId.set(c.id, {
        id: c.id,
        sightings: [c.sighting],
        jobIds: jobId ? [jobId] : [],
        canonical: c.sighting.extractedFields,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return Array.from(byId.values());
}
