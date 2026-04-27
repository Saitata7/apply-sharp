/**
 * Anchor walker (Workstream 10).
 *
 * The killer feature: given an email or phone match position in a DOM
 * Element, walk outward to find the associated name, title, and company.
 *
 * Pure heuristics. No NER model. No AI on the critical path. Gemini Nano
 * is an OPTIONAL tiebreaker called from extractor.ts; this module never
 * touches the AI service directly.
 *
 * Algorithm:
 *   1. Walk up the parent chain until either:
 *      (a) the ancestor contains 2+ sibling elements with text, OR
 *      (b) we hit a section/article/li/tr boundary, OR
 *      (c) 6 levels deep (hard cap).
 *   2. Within that container, harvest text candidates:
 *      - h1-h6 headings
 *      - strong, b, span[class*="name"]
 *      - text nodes matching TitleCase First [Middle.] Last
 *      - JSON-LD Person schema (deterministic win on Greenhouse)
 *      - <dl><dt>Name</dt><dd>...</dd></dl> structured pairs
 *      - <table> label-value rows
 *   3. Score name candidates by DOM-distance to anchor.
 *   4. Title extraction looks for separator patterns adjacent to name:
 *      ", Head of X" / "- Engineering Manager" / "| Recruiter"
 *      Falls back to text containing role keywords.
 *
 * Two entry points:
 *   - walkFromAnchor(element, ctx): full DOM walk, used by content script
 *   - walkFromAnchorTextOnly(text, offset): text-only fallback for tests
 *     and background HTML parsing without DOM
 */

import type { ContactConfidence } from '@shared/types/contact.types';

export interface AnchorWalkContext {
  hostname: string;
  jdText?: string;
}

export interface AnchorWalkResult {
  name?: string;
  title?: string;
  company?: string;
  confidence: ContactConfidence;
  /** True if the candidate was rejected and needs Nano review */
  ambiguous: boolean;
}

const NAME_PATTERN = /^[A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+$/;

const ROLE_KEYWORDS = [
  'recruiter',
  'recruiting',
  'engineer',
  'engineering',
  'manager',
  'director',
  'vp',
  'vice president',
  'ceo',
  'cto',
  'cfo',
  'coo',
  'founder',
  'co-founder',
  'cofounder',
  'head of',
  'lead',
  'team lead',
  'tech lead',
  'talent',
  'people',
  'hr',
  'human resources',
  'product manager',
  'designer',
  'principal',
  'staff',
  'senior',
];

const BOUNDARY_TAGS = new Set([
  'SECTION',
  'ARTICLE',
  'LI',
  'TR',
  'TBODY',
  'NAV',
  'FOOTER',
  'HEADER',
  'ASIDE',
]);
const MAX_WALK_DEPTH = 6;

/**
 * Walk outward from an anchor element (the element containing the email
 * or phone match) to find name, title, company.
 */
export function walkFromAnchor(
  anchorElement: Element,
  _context: AnchorWalkContext
): AnchorWalkResult {
  if (!anchorElement) {
    return { confidence: 'low', ambiguous: true };
  }

  const container = findContainer(anchorElement);
  if (!container) {
    return { confidence: 'low', ambiguous: true };
  }

  // Try the deterministic wins first
  const jsonLd = harvestJsonLd(container);
  if (jsonLd.name) {
    return {
      name: jsonLd.name,
      title: jsonLd.title,
      company: jsonLd.company,
      confidence: 'high',
      ambiguous: false,
    };
  }

  const dlPair = harvestDlPair(container);
  if (dlPair.name || dlPair.title) {
    return {
      name: dlPair.name,
      title: dlPair.title,
      company: dlPair.company,
      confidence: 'high',
      ambiguous: false,
    };
  }

  // Heuristic harvest: headings, name spans, TitleCase text nodes
  const candidates: NameCandidate[] = [];

  // Priority 1: headings within the container
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach((h, idx) => {
    const text = (h.textContent || '').trim();
    if (text && looksLikeName(text)) {
      candidates.push({ text, distance: idx, weight: 3 });
    }
  });

  // Priority 2: span[class*="name"] / strong / b
  const nameSpans = container.querySelectorAll('span[class*="name" i], strong, b');
  nameSpans.forEach((el, idx) => {
    const text = (el.textContent || '').trim();
    if (text && looksLikeName(text)) {
      candidates.push({ text, distance: 100 + idx, weight: 2 });
    }
  });

  // Priority 3: free text nodes matching TitleCase
  const walker =
    typeof document !== 'undefined' && document.createTreeWalker
      ? document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
      : null;
  if (walker) {
    let node = walker.nextNode();
    let textIdx = 0;
    while (node) {
      const text = (node.textContent || '').trim();
      if (text && looksLikeName(text)) {
        candidates.push({ text, distance: 200 + textIdx, weight: 1 });
      }
      textIdx++;
      node = walker.nextNode();
      if (textIdx > 200) break; // hard cap
    }
  }

  // Pick the highest-weighted name candidate, ties broken by lower distance.
  candidates.sort((a, b) => b.weight - a.weight || a.distance - b.distance);
  const bestName = candidates[0]?.text;

  // Title extraction: look for role keywords in any text node
  const title = extractTitle(container, bestName);

  if (!bestName) {
    return { confidence: 'low', ambiguous: true };
  }

  return {
    name: bestName,
    title,
    confidence: title ? 'high' : 'medium',
    ambiguous: !title,
  };
}

/**
 * Pure text-only fallback for tests and background HTML parsing without
 * a real DOM. Less precise than walkFromAnchor - only catches the
 * "Sarah Chen, Head of Engineering, sarah@acme.co" inline pattern.
 */
export function walkFromAnchorTextOnly(
  surroundingText: string,
  matchOffset: number
): AnchorWalkResult {
  if (!surroundingText || matchOffset < 0) {
    return { confidence: 'low', ambiguous: true };
  }

  // Look in a 200-char window before the match (closest to the anchor)
  const start = Math.max(0, matchOffset - 200);

  // Try to find a name preceded by a separator close to the anchor
  // Patterns: "Sarah Chen - sarah@" / "Sarah Chen, Head of Engineering, sarah@"
  const beforeMatch = surroundingText.slice(start, matchOffset);

  let name: string | undefined;
  let title: string | undefined;

  // Find the LAST TitleCase name in the before-text (closest to anchor)
  const nameMatches = Array.from(
    beforeMatch.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)\b/g)
  );
  if (nameMatches.length > 0) {
    name = nameMatches[nameMatches.length - 1][1];
  }

  // Find a title near the name
  if (name) {
    const afterName = beforeMatch.slice(beforeMatch.lastIndexOf(name) + name.length);
    // Separator chars: comma, hyphen, pipe, en-dash (\u2013).
    const titleMatch = afterName.match(/[,\-|\u2013]\s*([^,\-|\u2013\n]+)/);
    if (titleMatch) {
      const candidate = titleMatch[1].trim();
      if (candidate.length > 0 && candidate.length < 80 && containsRoleKeyword(candidate)) {
        title = candidate;
      }
    }
  }

  return {
    name,
    title,
    confidence: name && title ? 'high' : name ? 'medium' : 'low',
    ambiguous: !name,
  };
}

interface NameCandidate {
  text: string;
  distance: number;
  weight: number;
}

function findContainer(anchorElement: Element): Element | null {
  let current: Element | null = anchorElement;
  let depth = 0;
  while (current && depth < MAX_WALK_DEPTH) {
    const parent: Element | null = current.parentElement;
    if (!parent) return current;
    // Boundary tags stop the walk
    if (BOUNDARY_TAGS.has(parent.tagName)) return parent;
    // Stop when we have 2+ sibling elements with text
    const siblings: Element[] = Array.from(parent.children);
    const textSiblings = siblings.filter((s: Element) => (s.textContent || '').trim().length > 0);
    if (textSiblings.length >= 2) return parent;
    current = parent;
    depth++;
  }
  return current;
}

function looksLikeName(text: string): boolean {
  if (!text || text.length < 3 || text.length > 80) return false;
  // Strict TitleCase pattern: First [Middle.] Last
  return NAME_PATTERN.test(text.trim());
}

function containsRoleKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  for (const kw of ROLE_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

function extractTitle(container: Element, name?: string): string | undefined {
  // Look for any text in the container containing a role keyword
  // that is NOT the name itself
  const text = (container.textContent || '').slice(0, 2000);
  if (!text) return undefined;
  // Split into clauses on common separators (comma, newline, pipe, en-dash, hyphen)
  const clauses = text.split(/[,\n|\u2013-]+/).map((c) => c.trim());
  for (const clause of clauses) {
    if (!clause || clause.length > 80) continue;
    if (name && clause === name) continue;
    if (containsRoleKeyword(clause)) {
      return clause;
    }
  }
  return undefined;
}

function harvestJsonLd(container: Element): { name?: string; title?: string; company?: string } {
  // Look for <script type="application/ld+json"> within or near the container
  const scripts = container.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || '{}');
      // Person schema
      if (data['@type'] === 'Person' || data.type === 'Person') {
        return {
          name: data.name,
          title: data.jobTitle || data.title,
          company: data.affiliation?.name || data.worksFor?.name,
        };
      }
      // Sometimes embedded in @graph
      if (Array.isArray(data['@graph'])) {
        for (const item of data['@graph']) {
          if (item['@type'] === 'Person' || item.type === 'Person') {
            return {
              name: item.name,
              title: item.jobTitle || item.title,
              company: item.affiliation?.name || item.worksFor?.name,
            };
          }
        }
      }
    } catch {
      // Malformed JSON-LD; skip
    }
  }
  return {};
}

function harvestDlPair(container: Element): { name?: string; title?: string; company?: string } {
  // Pattern: <dl><dt>Name</dt><dd>Sarah Chen</dd><dt>Title</dt><dd>Head of Eng</dd></dl>
  const result: { name?: string; title?: string; company?: string } = {};
  const dts = container.querySelectorAll('dt');
  dts.forEach((dt) => {
    const label = (dt.textContent || '').trim().toLowerCase();
    const dd = dt.nextElementSibling;
    if (!dd || dd.tagName !== 'DD') return;
    const value = (dd.textContent || '').trim();
    if (!value) return;
    if (label.includes('name')) result.name = value;
    else if (label.includes('title') || label.includes('role') || label.includes('position'))
      result.title = value;
    else if (label.includes('company') || label.includes('organization')) result.company = value;
  });
  return result;
}
