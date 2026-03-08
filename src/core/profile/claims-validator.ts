/**
 * Claims Validator & Defensibility Scoring
 *
 * Every bullet and claim in a profile must pass the defensibility test:
 * "Can you defend this in a 2-minute interview?"
 *
 * Scoring:
 *   STRONG   (80-100): Specific, measurable, defensible
 *   MODERATE (50-79):  Real but vague — needs specifics
 *   WEAK     (0-49):   Inflated, unverifiable, or generic
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type DefensibilityLevel = 'strong' | 'moderate' | 'weak';

export interface ClaimAnalysis {
  text: string;
  score: number;
  level: DefensibilityLevel;
  feedback: string;
  suggestedImprovement?: string;
  issues: ClaimIssue[];
}

export interface ClaimIssue {
  type: ClaimIssueType;
  message: string;
  suggestion: string;
}

export type ClaimIssueType =
  | 'vague_impact'
  | 'no_quantification'
  | 'inflated_language'
  | 'passive_voice'
  | 'no_context'
  | 'no_ownership'
  | 'generic_language'
  | 'unverifiable_claim';

export interface ClaimsReport {
  overallScore: number;
  totalClaims: number;
  strong: number;
  moderate: number;
  weak: number;
  claims: ClaimAnalysis[];
  topIssues: ClaimIssue[];
}

// ── Inflated Language Patterns ─────────────────────────────────────────────

const INFLATED_PHRASES = [
  'significantly improved',
  'greatly enhanced',
  'dramatically increased',
  'substantially reduced',
  'vastly improved',
  'tremendous impact',
  'massive improvement',
  'revolutionary',
  'cutting-edge',
  'world-class',
  'best-in-class',
  'game-changing',
  'paradigm shift',
  'synergy',
  'synergies',
  'leveraged',
  'utilize',
  'utilized',
];

const VAGUE_IMPACT_PATTERNS = [
  /improved?\s+(performance|efficiency|productivity|quality)/i,
  /enhanced?\s+(the\s+)?(system|process|workflow|experience)/i,
  /increased?\s+(revenue|sales|growth|engagement)/i,
  /reduced?\s+(costs?|time|errors?|bugs?)/i,
  /optimized?\s+(the\s+)?(code|system|process|performance)/i,
];

const GENERIC_PHRASES = [
  'responsible for',
  'helped with',
  'assisted in',
  'worked on',
  'participated in',
  'was involved in',
  'tasked with',
  'assigned to',
  'dealt with',
  'handled',
  'managed various',
  'performed various',
  'results-driven',
  'team player',
  'hard worker',
  'self-starter',
  'go-getter',
  'detail-oriented professional',
  'proven track record',
];

const PASSIVE_PATTERNS = [
  /^was\s/i,
  /^were\s/i,
  /^been\s/i,
  /^being\s/i,
  /^got\s/i,
  /^had\s+(to|been)/i,
];

// ── Quantification Detection ───────────────────────────────────────────────

const QUANTIFICATION_PATTERN =
  /\d+[\d,.]*\s*(%|percent|x|times|users?|customers?|clients?|requests?|transactions?|records?|nodes?|servers?|team\s+members?|engineers?|developers?|people|employees?|hours?|days?|weeks?|months?|minutes?|seconds?|ms|TB|GB|MB|KB|M\b|K\b|million|thousand|billion)?/i;

const SPECIFICITY_INDICATORS = [
  /\b(from\s+\d+.*to\s+\d+)/i, // "from X to Y" (before/after)
  /\b\d+[\d,.]*\s*%/, // percentage
  /\$[\d,.]+/, // dollar amounts
  /\b\d+\+?\s*(team|engineers?|developers?|members?)/i, // team size
  /\b\d+[\d,.]*\s*(daily|monthly|weekly|annually)/i, // frequency
  /\b\d+[\d,.]*\s*(users?|customers?|clients?)/i, // user count
];

const CONTEXT_INDICATORS = [
  /\b(at\s+a?\s*\w+\s*(startup|company|enterprise|organization))/i,
  /\b(across\s+\d+\s*(teams?|departments?|regions?|countries?))/i,
  /\b(for\s+(a\s+)?(team|company|division|product)\s+of)/i,
  /\b(in\s+a?\s*(fast-paced|agile|distributed|remote|hybrid)\s+environment)/i,
  /\b(serving|supporting|handling)\s+\d+/i,
];

const OWNERSHIP_INDICATORS = [
  /^(spearheaded|orchestrated|championed|drove|pioneered|led|initiated|proposed|conceived|designed|architected)/i,
  /\b(single-handedly|independently|personally|took\s+initiative)/i,
  /\b(my\s+(decision|idea|initiative|proposal))/i,
];

// ── Main Functions ─────────────────────────────────────────────────────────

/**
 * Analyze a single claim/bullet for defensibility.
 */
export function analyzeClaim(text: string): ClaimAnalysis {
  const issues: ClaimIssue[] = [];
  let score = 50; // Start at baseline

  const lowerText = text.toLowerCase().trim();

  // Check for inflated language
  for (const phrase of INFLATED_PHRASES) {
    if (lowerText.includes(phrase)) {
      issues.push({
        type: 'inflated_language',
        message: `Uses inflated phrase: "${phrase}"`,
        suggestion: `Replace with specific data. Instead of "${phrase}", state the actual number or describe the scope.`,
      });
      score -= 10;
    }
  }

  // Check for vague impact
  let hasVagueImpact = false;
  for (const pattern of VAGUE_IMPACT_PATTERNS) {
    if (pattern.test(text) && !QUANTIFICATION_PATTERN.test(text)) {
      hasVagueImpact = true;
      break;
    }
  }
  if (hasVagueImpact) {
    issues.push({
      type: 'vague_impact',
      message: 'Claims impact without specific metrics',
      suggestion:
        'Add a number: How much? How many? What percentage? If no exact number, describe the scope (e.g., "for a team of 15" or "across 3 microservices").',
    });
    score -= 15;
  }

  // Check for generic language
  for (const phrase of GENERIC_PHRASES) {
    if (lowerText.includes(phrase)) {
      issues.push({
        type: 'generic_language',
        message: `Uses generic phrase: "${phrase}"`,
        suggestion: `Replace with a specific action verb and concrete outcome.`,
      });
      score -= 12;
    }
  }

  // Check for passive voice
  for (const pattern of PASSIVE_PATTERNS) {
    if (pattern.test(text)) {
      issues.push({
        type: 'passive_voice',
        message: 'Starts with passive voice',
        suggestion:
          'Start with a strong action verb: Architected, Built, Designed, Delivered, etc.',
      });
      score -= 8;
      break;
    }
  }

  // Positive: has quantification
  const hasQuantification = QUANTIFICATION_PATTERN.test(text);
  if (hasQuantification) {
    score += 15;
  } else {
    issues.push({
      type: 'no_quantification',
      message: 'No numbers or metrics found',
      suggestion:
        'Add specifics: team size, user count, percentage improvement, data volume, or time saved. If no exact number, describe scope.',
    });
    score -= 5;
  }

  // Positive: has specificity (before/after, dollar amounts, etc.)
  const specificityCount = SPECIFICITY_INDICATORS.filter((p) => p.test(text)).length;
  score += specificityCount * 8;

  // Positive: has context
  const hasContext = CONTEXT_INDICATORS.some((p) => p.test(text));
  if (hasContext) {
    score += 10;
  } else if (text.length < 80) {
    issues.push({
      type: 'no_context',
      message: 'Missing context (team size, company stage, scale)',
      suggestion:
        'Add context: "at a Series B fintech startup", "for a team of 12", "across 3 regions".',
    });
  }

  // Positive: shows ownership
  const hasOwnership = OWNERSHIP_INDICATORS.some((p) => p.test(text));
  if (hasOwnership) {
    score += 8;
  } else {
    issues.push({
      type: 'no_ownership',
      message: "Doesn't clearly show ownership or initiative",
      suggestion:
        'Start with a strong ownership verb: Spearheaded, Pioneered, Initiated, Proposed, Led.',
    });
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine level
  const level: DefensibilityLevel = score >= 80 ? 'strong' : score >= 50 ? 'moderate' : 'weak';

  // Build feedback
  const feedback = buildFeedback(level, issues, hasQuantification, hasContext, hasOwnership);

  // Build improvement suggestion for weak/moderate
  const suggestedImprovement =
    level !== 'strong' ? buildImprovementSuggestion(text, issues) : undefined;

  return {
    text,
    score,
    level,
    feedback,
    suggestedImprovement,
    issues,
  };
}

/**
 * Validate all claims in a profile's experience bullets.
 */
export function validateAllClaims(
  experiences: Array<{
    company: string;
    title: string;
    achievements: string[];
  }>
): ClaimsReport {
  const claims: ClaimAnalysis[] = [];

  for (const exp of experiences) {
    for (const achievement of exp.achievements) {
      if (achievement.trim()) {
        claims.push(analyzeClaim(achievement));
      }
    }
  }

  const strong = claims.filter((c) => c.level === 'strong').length;
  const moderate = claims.filter((c) => c.level === 'moderate').length;
  const weak = claims.filter((c) => c.level === 'weak').length;
  const totalClaims = claims.length;

  const overallScore =
    totalClaims > 0 ? Math.round(claims.reduce((sum, c) => sum + c.score, 0) / totalClaims) : 0;

  // Collect top issues (deduplicated by type, sorted by frequency)
  const issuesByType = new Map<ClaimIssueType, { issue: ClaimIssue; count: number }>();
  for (const claim of claims) {
    for (const issue of claim.issues) {
      const existing = issuesByType.get(issue.type);
      if (existing) {
        existing.count++;
      } else {
        issuesByType.set(issue.type, { issue, count: 1 });
      }
    }
  }
  const topIssues = Array.from(issuesByType.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((entry) => entry.issue);

  return {
    overallScore,
    totalClaims,
    strong,
    moderate,
    weak,
    claims,
    topIssues,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildFeedback(
  level: DefensibilityLevel,
  issues: ClaimIssue[],
  hasQuantification: boolean,
  hasContext: boolean,
  hasOwnership: boolean
): string {
  if (level === 'strong') {
    const strengths: string[] = [];
    if (hasQuantification) strengths.push('has measurable results');
    if (hasContext) strengths.push('includes context');
    if (hasOwnership) strengths.push('shows ownership');
    return `Strong claim — ${strengths.join(', ')}. Defensible in an interview.`;
  }

  if (level === 'moderate') {
    return `Real but vague. ${issues[0]?.suggestion || 'Add specifics to strengthen this claim.'}`;
  }

  return `Weak claim — would not survive interviewer scrutiny. ${issues[0]?.suggestion || 'Rewrite with specific actions and outcomes.'}`;
}

function buildImprovementSuggestion(_text: string, issues: ClaimIssue[]): string {
  const suggestions: string[] = [];

  if (issues.some((i) => i.type === 'no_quantification' || i.type === 'vague_impact')) {
    suggestions.push('Add a specific metric (percentage, count, or timeframe)');
  }
  if (issues.some((i) => i.type === 'no_context')) {
    suggestions.push('Add context (team size, company stage, or scale)');
  }
  if (issues.some((i) => i.type === 'no_ownership')) {
    suggestions.push('Start with a strong action verb showing ownership');
  }
  if (issues.some((i) => i.type === 'generic_language')) {
    suggestions.push('Replace generic phrases with concrete actions');
  }
  if (issues.some((i) => i.type === 'inflated_language')) {
    suggestions.push('Replace inflated language with actual data');
  }

  return suggestions.length > 0
    ? `To strengthen: ${suggestions.join('. ')}.`
    : 'Add specifics to make this claim defensible in an interview.';
}
