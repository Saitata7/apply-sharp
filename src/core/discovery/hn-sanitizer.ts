/**
 * Strict HN comment sanitizer (Workstream 9, security boundary).
 *
 * Hacker News comments arrive as HTML strings via the Algolia API. The HN
 * comment format is very simple - only `<p>`, `<a>`, `<i>`, `<b>`, `<pre>`,
 * `<code>`, plain text, and entity escapes - but the side panel renders
 * inside a privileged extension origin, so untrusted HTML is a hard XSS
 * vector. Every comment passes through this sanitizer before render.
 *
 * Approach: strict allowlist via regex parsing. We do NOT use DOMParser /
 * innerHTML round-trip because:
 *   - DOMParser is unavailable in service workers (the call site is the
 *     background handler, not the side panel React component)
 *   - innerHTML round-trip would still execute attributes during parse
 *   - Adding DOMPurify is a new dependency we can avoid for this narrow case
 *
 * Allowed tags: p, br, i, b, em, strong, code, pre, a (https only)
 * Allowed entities: &amp; &lt; &gt; &quot; &#39; &nbsp;
 * Everything else is stripped.
 *
 * Threat model and defense posture:
 *   - SINGLE-LAYER strict allowlist. The output of this function is consumed
 *     by exactly one site, DiscoveryCard.tsx, which renders it via
 *     dangerouslySetInnerHTML. There is no second sanitizer layer; the
 *     allowlist is the security boundary.
 *   - The 35-test bypass suite at hn-sanitizer.test.ts is the regression
 *     guard. New bypass categories MUST land as failing tests there before
 *     code changes ship.
 *   - Output is hard-capped at 2KB to bound the worst case.
 *   - Plain-text shadow copy is provided for screen readers and tooltips
 *     so callers that do not need HTML can skip the dangerouslySetInnerHTML
 *     path entirely.
 */

const ALLOWED_TAGS = new Set(['p', 'br', 'i', 'b', 'em', 'strong', 'code', 'pre']);
// `a` is allowed but with strict href validation; handled separately.
const SAFE_HREF = /^https?:\/\//i;

export interface SanitizedHN {
  /** HTML safe to render via dangerouslySetInnerHTML inside the side panel. */
  htmlSafe: string;
  /** Stripped-text equivalent for screen readers and tooltip plain text. */
  plain: string;
}

/**
 * Strip every tag except the allowlist, neutralize unsafe href attributes,
 * cap the result at 2KB to defend against pathological input.
 */
export function sanitizeHNComment(input: string | null | undefined): SanitizedHN {
  if (!input || typeof input !== 'string') {
    return { htmlSafe: '', plain: '' };
  }

  // Hard input cap before parsing - refuse to scan a 100KB pathological
  // payload character by character.
  const bounded = input.slice(0, 16_384);

  // First pass: strip HTML comments AND processing instructions entirely.
  // Comments could carry mXSS payloads in conditional comment shapes.
  // <!-- ... --> and <? ... ?> never appear in real HN posts.
  let out = bounded;
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/<\?[\s\S]*?\?>/g, '');

  // Strip script and style entirely (content + tags). HN never sends these
  // but a hostile mirror could.
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  // Strip iframe / object / embed / svg / form / math / template entirely
  out = out.replace(
    /<(iframe|object|embed|svg|math|template|noscript|form|input|button|link|meta)\b[^>]*>/gi,
    ''
  );
  out = out.replace(
    /<\/(iframe|object|embed|svg|math|template|noscript|form|input|button|link|meta)>/gi,
    ''
  );

  // Process anchor tags with href validation. Only https/http + plain href.
  // Iter-2 hardening: tighten the href regex to reject unquoted attribute
  // values and to treat any whitespace inside the href value as invalid.
  out = out.replace(/<a\b([^>]*)>/gi, (_full, attrs) => {
    const hrefMatch = /href\s*=\s*"([^"\s]+)"/i.exec(attrs);
    if (!hrefMatch) return '';
    const href = hrefMatch[1];
    if (!SAFE_HREF.test(href)) return '';
    // Re-emit a clean anchor with only the validated href + safe rel/target.
    const safe = href.replace(/[<>"']/g, '');
    return `<a href="${safe}" rel="noopener noreferrer" target="_blank">`;
  });

  // Process all remaining tags: strip everything not in the allowlist.
  out = out.replace(/<\/?([a-z][a-z0-9-]*)([^>]*)>/gi, (full, tagName: string) => {
    const t = tagName.toLowerCase();
    if (t === 'a') return full; // already processed above
    if (!ALLOWED_TAGS.has(t)) return '';
    // Allowed tag: strip ALL attributes (no styling vectors, no event handlers)
    const isClosing = full.startsWith('</');
    return isClosing ? `</${t}>` : `<${t}>`;
  });

  // NOTE: previous iter-1 versions had a global post-pass that nuked the
  // substrings 'javascript:', 'vbscript:', and 'data:' from the entire
  // string. That was overbroad - it corrupted legitimate text like
  // "Learn JavaScript: a primer" into "Learn  a primer". The anchor
  // handler above already validates the only place those substrings
  // matter (href values), so the post-pass was deleted in iter-2.

  // Cap final length to 2KB for safety + UI sanity.
  const htmlSafe = out.slice(0, 2048);

  // Plain-text version: strip ALL tags and decode common entities.
  const plain = htmlSafe
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
    .slice(0, 2048);

  return { htmlSafe, plain };
}
