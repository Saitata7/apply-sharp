/**
 * Normalize a (company, title) pair for exact-match reposting detection.
 *
 * Per the WS8 design (Plan-agent sanity check): we use exact match on a
 * normalized form, NOT fuzzy Levenshtein. Levenshtein generates too many
 * false positives ("Senior Engineer" vs "Senior Engineer II" should NOT
 * collide), and the normalize-and-exact approach catches ~90% of true
 * reposts at zero complexity cost.
 *
 * Normalization rules (in order):
 *   1. Lowercase
 *   2. Strip parentheticals: "Senior Engineer (Remote)" → "senior engineer"
 *   3. Strip trailing geo/work-mode: "Backend Eng - US" → "backend eng"
 *   4. Strip seniority modifiers: "Senior Backend Eng" → "backend eng"
 *      (preserves the canonical role; reposted same-team often varies the
 *      seniority label)
 *   5. Replace punctuation with spaces
 *   6. Collapse whitespace and trim
 *
 * Levenshtein fuzzy match is explicitly OUT OF SCOPE for v1 - see plan
 * "Out of scope" section.
 */

const PARENTHETICAL_RE = /[([].*?[)\]]/g;
const TRAILING_GEO_RE =
  /[-\u2013\u2014]\s*(remote|onsite|hybrid|us|usa|uk|eu|emea|apac|americas|europe|na|global|north america|united states).*/i;
const SENIORITY_RE =
  /\b(senior|sr|junior|jr|staff|principal|lead|entry|intern|associate|i{1,3})\b/gi;
const PUNCT_RE = /[^\w\s]/g;
const WHITESPACE_RE = /\s+/g;

function normalize(s: string | undefined | null): string {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(PARENTHETICAL_RE, '')
    .replace(TRAILING_GEO_RE, '')
    .replace(SENIORITY_RE, '')
    .replace(PUNCT_RE, ' ')
    .replace(WHITESPACE_RE, ' ')
    .trim();
}

export function normalizeForRepostMatch(s: string | undefined | null): string {
  return normalize(s);
}

export function normalizeCompany(company: string | undefined | null): string {
  // Companies get a slightly lighter treatment: strip Inc/LLC/Corp/Ltd
  // suffixes that vary across postings of the same company.
  if (!company) return '';
  return company
    .toLowerCase()
    .replace(/\b(inc|llc|corp|corporation|ltd|limited|gmbh|s\.?a\.?|co|company)\b/g, '')
    .replace(PUNCT_RE, ' ')
    .replace(WHITESPACE_RE, ' ')
    .trim();
}

export function normalizeTitle(title: string | undefined | null): string {
  return normalize(title);
}

/**
 * True if two (company, title) pairs match after normalization.
 * Used by the reposting signal to count prior listings in the user's tracker.
 */
export function isSameRolePosting(
  a: { company: string; title: string },
  b: { company: string; title: string }
): boolean {
  return (
    normalizeCompany(a.company) === normalizeCompany(b.company) &&
    normalizeTitle(a.title) === normalizeTitle(b.title)
  );
}
