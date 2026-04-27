/**
 * Keyword Regex Patterns  -  Shared module for JD keyword extraction
 *
 * Consolidated superset of patterns used in:
 * - handleAnalyzeJDForResume (JD analysis)
 * - handleOptimizeResumeForJD (resume optimization scoring)
 */

// Programming Languages
export const LANGUAGE_PATTERNS: RegExp[] = [
  /\bjava\b/gi,
  /\bjavascript\b/gi,
  /\btypescript\b/gi,
  /\bpython\b/gi,
  /\bc#\b/gi,
  /\bc\+\+/gi,
  /\bgolang\b/gi,
  /\bgo\b(?!\s+to)/gi,
  /\brust\b/gi,
  /\bscala\b/gi,
  /\bruby\b/gi,
  /\bphp\b/gi,
  /\bswift\b/gi,
  /\bkotlin\b/gi,
  /\bhtml\b/gi,
  /\bcss\b/gi,
  /\bsql\b/gi,
  /\bplsql\b/gi,
  /\bt-sql\b/gi,
  /\bbash\b/gi,
];

// Frameworks & Libraries
export const FRAMEWORK_PATTERNS: RegExp[] = [
  /\breact\b/gi,
  /\bangular\b/gi,
  /\bvue\.?js?\b/gi,
  /\bsvelte\b/gi,
  /\bnode\.?js?\b/gi,
  /\bexpress\.?js?\b/gi,
  /\bnext\.?js?\b/gi,
  /\bspring\b/gi,
  /\bspring\s*boot\b/gi,
  /\b\.net\b/gi,
  /\basp\.net\b/gi,
  /\bdjango\b/gi,
  /\bflask\b/gi,
  /\bfastapi\b/gi,
  /\bgraphql\b/gi,
  /\brest\s*api\b/gi,
  /\bapi\s*development\b/gi,
  /\bapi\b/gi,
  /\bweb\s*api\b/gi,
];

// Cloud & DevOps
export const CLOUD_PATTERNS: RegExp[] = [
  /\baws\b/gi,
  /\bazure\b/gi,
  /\bgcp\b/gi,
  /\bdocker\b/gi,
  /\bkubernetes\b/gi,
  /\bterraform\b/gi,
  /\bjenkins\b/gi,
  /\bci\/cd\b/gi,
  /\bdevops\b/gi,
  /\bcloud\b/gi,
  /\bmicroservices\b/gi,
  /\bgit\b/gi,
  /\blinux\b/gi,
];

// Databases
export const DB_PATTERNS: RegExp[] = [
  /\bmongodb\b/gi,
  /\bpostgresql\b/gi,
  /\bmysql\b/gi,
  /\bredis\b/gi,
  /\bnosql\b/gi,
  /\boracle\b/gi,
  /\bsql\s*server\b/gi,
  /\bfirebase\b/gi,
  /\belasticsearch\b/gi,
];

// AI/ML Keywords
export const AI_PATTERNS: RegExp[] = [
  /\bgen\s*ai\b/gi,
  /\bgenerative\s*ai\b/gi,
  /\bmachine\s*learning\b/gi,
  /\bml\b/gi,
  /\bdeep\s*learning\b/gi,
  /\bai\b/gi,
  /\bllm\b/gi,
  /\bnlp\b/gi,
  /\btensorflow\b/gi,
  /\bpytorch\b/gi,
  /\bopenai\b/gi,
];

// Soft Skills
export const SOFT_SKILL_PATTERNS: RegExp[] = [
  /\bproblem[\s-]*solving\b/gi,
  /\bcommunication\s*skills?\b/gi,
  /\bcollaborat(ion|ive)\b/gi,
  /\bteamwork\b/gi,
  /\bleadership\b/gi,
  /\banalytical\b/gi,
  /\bagile\b/gi,
  /\bscrum\b/gi,
  /\bsoftware\s*engineering\b/gi,
  /\bdeductive\s*reasoning\b/gi,
  /\bunit\s*test/gi,
];

// Other Technical Terms
export const OTHER_PATTERNS: RegExp[] = [
  /\bfrontend\b/gi,
  /\bbackend\b/gi,
  /\bfull[\s-]*stack\b/gi,
  /\bscripting\b/gi,
  /\bautomation\b/gi,
  /\bweb[\s-]*based\b/gi,
  /\boop\b/gi,
  /\bdesign\s*patterns\b/gi,
  /\brestful\b/gi,
  /\bjson\b/gi,
];

// Combined for convenience  -  core tech patterns (no soft skills or other)
export const CORE_TECH_PATTERNS: RegExp[] = [
  ...LANGUAGE_PATTERNS,
  ...FRAMEWORK_PATTERNS,
  ...CLOUD_PATTERNS,
  ...DB_PATTERNS,
  ...AI_PATTERNS,
];

// All patterns including soft skills and other
export const ALL_PATTERNS: RegExp[] = [
  ...CORE_TECH_PATTERNS,
  ...SOFT_SKILL_PATTERNS,
  ...OTHER_PATTERNS,
];

// Categorized for structured extraction
export const ALL_TECH_PATTERNS: { category: string; patterns: RegExp[] }[] = [
  { category: 'languages', patterns: LANGUAGE_PATTERNS },
  { category: 'frameworks', patterns: FRAMEWORK_PATTERNS },
  { category: 'cloud', patterns: CLOUD_PATTERNS },
  { category: 'databases', patterns: DB_PATTERNS },
  { category: 'ai', patterns: AI_PATTERNS },
  { category: 'softSkills', patterns: SOFT_SKILL_PATTERNS },
  { category: 'other', patterns: OTHER_PATTERNS },
];

/**
 * Extract unique normalized keywords from text using all patterns.
 * Returns deduplicated, lowercase keywords found in the text.
 */
export function extractKeywordsFromText(text: string): string[] {
  const lowerText = text.toLowerCase();
  const keywords: string[] = [];

  ALL_PATTERNS.forEach((pattern) => {
    const matches = lowerText.match(pattern);
    if (matches) {
      matches.forEach((m) => {
        const normalized = m.toLowerCase().trim().replace(/\s+/g, ' ');
        if (normalized && normalized.length > 1 && !keywords.includes(normalized)) {
          keywords.push(normalized);
        }
      });
    }
  });

  return keywords;
}

/**
 * Extract keywords with frequency counts from text.
 * Returns a Map of normalized keyword to occurrence count.
 */
export function extractKeywordsWithFrequency(
  text: string,
  patterns?: RegExp[]
): Map<string, number> {
  const lowerText = text.toLowerCase();
  const keywordFrequency: Map<string, number> = new Map();
  const patternsToUse = patterns ?? CORE_TECH_PATTERNS;

  patternsToUse.forEach((pattern) => {
    const matches = lowerText.match(pattern);
    if (matches) {
      matches.forEach((match) => {
        const normalized = match.toLowerCase().trim().replace(/\s+/g, ' ');
        if (normalized && normalized.length > 1) {
          keywordFrequency.set(normalized, (keywordFrequency.get(normalized) || 0) + 1);
        }
      });
    }
  });

  return keywordFrequency;
}
