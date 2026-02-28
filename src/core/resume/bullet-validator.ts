/**
 * Bullet Point Quality Validator
 *
 * Validates resume bullet points against research-backed standards:
 * - XYZ formula: "Accomplished [X] as measured by [Y], by doing [Z]"
 * - Action verb tiers (Leadership → Achievement → Technical → Optimization → Analysis)
 * - Length: 100-200 characters
 * - Quantification: numbers, percentages, metrics
 * - Weak verb detection
 */

// ── Action Verb Tiers ──────────────────────────────────────────────────

export const ACTION_VERB_TIERS = {
  tier1_leadership: [
    'spearheaded',
    'orchestrated',
    'championed',
    'drove',
    'pioneered',
    'led',
    'directed',
    'founded',
    'established',
    'launched',
    'mobilized',
    'governed',
    'oversaw',
    'mentored',
    'coached',
  ],
  tier2_achievement: [
    'accelerated',
    'boosted',
    'generated',
    'delivered',
    'achieved',
    'surpassed',
    'exceeded',
    'captured',
    'secured',
    'earned',
    'increased',
    'grew',
    'expanded',
    'maximized',
    'amplified',
  ],
  tier3_technical: [
    'architected',
    'engineered',
    'developed',
    'built',
    'designed',
    'implemented',
    'automated',
    'migrated',
    'deployed',
    'integrated',
    'programmed',
    'coded',
    'configured',
    'provisioned',
    'instrumented',
  ],
  tier4_optimization: [
    'streamlined',
    'optimized',
    'revamped',
    'transformed',
    'modernized',
    'consolidated',
    'refactored',
    'simplified',
    'enhanced',
    'improved',
    'reduced',
    'eliminated',
    'minimized',
    'upgraded',
    'restructured',
  ],
  tier5_analysis: [
    'identified',
    'diagnosed',
    'analyzed',
    'evaluated',
    'formulated',
    'devised',
    'mapped',
    'researched',
    'assessed',
    'investigated',
    'discovered',
    'audited',
    'benchmarked',
    'forecasted',
    'validated',
  ],
} as const;

const ALL_STRONG_VERBS = Object.values(ACTION_VERB_TIERS).flat();

export const WEAK_VERB_STARTS = [
  'responsible for',
  'helped',
  'assisted',
  'worked on',
  'participated in',
  'utilized',
  'involved in',
  'contributed to',
  'supported',
  'handled',
  'tasked with',
  'did',
  'used',
] as const;

// ── Types ──────────────────────────────────────────────────────────────

export type BulletSeverity = 'error' | 'warning' | 'info';

export interface BulletIssue {
  type:
    | 'weak_verb'
    | 'too_short'
    | 'too_long'
    | 'no_quantification'
    | 'no_action_verb'
    | 'generic_language';
  severity: BulletSeverity;
  message: string;
  suggestion?: string;
}

export interface BulletAnalysis {
  text: string;
  charCount: number;
  wordCount: number;
  hasQuantification: boolean;
  hasActionVerb: boolean;
  actionVerbTier: number | null; // 1-5, null if no strong verb
  detectedVerb: string | null;
  issues: BulletIssue[];
  score: number; // 0-100
}

export interface RoleBulletReport {
  company: string;
  title: string;
  bulletCount: number;
  expectedRange: [number, number]; // [min, max] based on seniority
  bullets: BulletAnalysis[];
  roleScore: number; // 0-100 average
  issues: BulletIssue[];
}

export interface BulletValidationReport {
  overallScore: number; // 0-100
  totalBullets: number;
  bulletsWithIssues: number;
  roles: RoleBulletReport[];
  topIssues: BulletIssue[];
}

// ── Seniority → Bullet Count Rules ────────────────────────────────────

export type SeniorityLevel = 'entry' | 'mid' | 'senior' | 'lead' | 'principal' | 'executive';

const BULLETS_PER_ROLE: Record<SeniorityLevel, [number, number]> = {
  entry: [3, 5],
  mid: [5, 7],
  senior: [5, 8],
  lead: [5, 8],
  principal: [4, 7],
  executive: [4, 7],
};

// ── Core Validation ───────────────────────────────────────────────────

const QUANTIFICATION_PATTERN =
  /\d+[\d,.]*\s*(%|percent|x|times|hours?|days?|weeks?|months?|years?|users?|customers?|clients?|requests?|transactions?|endpoints?|services?|team|members?|engineers?|people|\$|M|K|B|million|thousand|billion)?/i;

const GENERIC_PHRASES = [
  'results-driven',
  'detail-oriented',
  'team player',
  'hard worker',
  'go-getter',
  'self-starter',
  'dynamic professional',
  'proven track record',
  'excellent communication',
  'strong work ethic',
  'fast learner',
  'highly motivated',
  'passionate about',
];

export function analyzeBullet(text: string): BulletAnalysis {
  const cleaned = text.replace(/^[•\-–*]\s*/, '').trim();
  const charCount = cleaned.length;
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  const lower = cleaned.toLowerCase();
  const issues: BulletIssue[] = [];

  // Check for weak verb starts
  const weakVerb = WEAK_VERB_STARTS.find((wv) => lower.startsWith(wv));
  if (weakVerb) {
    issues.push({
      type: 'weak_verb',
      severity: 'error',
      message: `Starts with weak phrase "${weakVerb}"`,
      suggestion: `Replace with a strong action verb (e.g., ${suggestReplacement(weakVerb)})`,
    });
  }

  // Check for action verb
  const firstWord = lower.split(/\s/)[0].replace(/[^a-z]/g, '');
  let actionVerbTier: number | null = null;
  let detectedVerb: string | null = null;

  for (const [tierKey, verbs] of Object.entries(ACTION_VERB_TIERS)) {
    if (
      verbs.some(
        (v) =>
          firstWord === v ||
          firstWord === v + 'd' ||
          firstWord === v + 'ed' ||
          firstWord === v + 'ing'
      )
    ) {
      const tierNum = parseInt(tierKey.charAt(4));
      actionVerbTier = tierNum;
      detectedVerb = firstWord;
      break;
    }
  }

  const hasActionVerb =
    actionVerbTier !== null ||
    ALL_STRONG_VERBS.some(
      (v) => firstWord === v || firstWord === v + 'd' || firstWord === v + 'ed'
    );

  if (!hasActionVerb && !weakVerb) {
    issues.push({
      type: 'no_action_verb',
      severity: 'warning',
      message: 'Does not start with a recognized action verb',
      suggestion: 'Start with a strong verb like Architected, Delivered, Streamlined, etc.',
    });
  }

  // Check length
  if (charCount < 50) {
    issues.push({
      type: 'too_short',
      severity: 'warning',
      message: `Too short (${charCount} chars). Bullets should be 100-200 characters.`,
      suggestion: 'Add context, scale, or impact to make this more compelling',
    });
  } else if (charCount > 250) {
    issues.push({
      type: 'too_long',
      severity: 'warning',
      message: `Too long (${charCount} chars). Bullets should be 100-200 characters.`,
      suggestion: 'Split into two bullets or trim to focus on the most impactful detail',
    });
  }

  // Check quantification
  const hasQuantification = QUANTIFICATION_PATTERN.test(cleaned);
  if (!hasQuantification) {
    issues.push({
      type: 'no_quantification',
      severity: 'info',
      message: 'No metrics or quantification found',
      suggestion: 'Add numbers: team size, percentage improvement, user count, cost savings, etc.',
    });
  }

  // Check for generic language
  const genericFound = GENERIC_PHRASES.find((gp) => lower.includes(gp));
  if (genericFound) {
    issues.push({
      type: 'generic_language',
      severity: 'warning',
      message: `Contains generic phrase "${genericFound}"`,
      suggestion: 'Replace with specific, measurable achievements',
    });
  }

  // Calculate score
  let score = 50; // baseline
  if (hasActionVerb) score += 15;
  if (hasQuantification) score += 20;
  if (charCount >= 100 && charCount <= 200) score += 10;
  if (actionVerbTier !== null && actionVerbTier <= 3) score += 5;
  if (weakVerb) score -= 25;
  if (genericFound) score -= 15;
  if (charCount < 50) score -= 10;
  if (charCount > 250) score -= 5;

  return {
    text: cleaned,
    charCount,
    wordCount,
    hasQuantification,
    hasActionVerb,
    actionVerbTier,
    detectedVerb,
    issues,
    score: Math.max(0, Math.min(100, score)),
  };
}

// ── Role-Level Validation ─────────────────────────────────────────────

export function validateRoleBullets(
  company: string,
  title: string,
  bullets: string[],
  seniority: SeniorityLevel = 'mid'
): RoleBulletReport {
  const expectedRange = BULLETS_PER_ROLE[seniority] || BULLETS_PER_ROLE.mid;
  const analyzed = bullets.map((b) => analyzeBullet(b));
  const roleIssues: BulletIssue[] = [];

  if (bullets.length < expectedRange[0]) {
    roleIssues.push({
      type: 'too_short',
      severity: 'warning',
      message: `Only ${bullets.length} bullets (expected ${expectedRange[0]}-${expectedRange[1]} for ${seniority} level)`,
      suggestion: `Add ${expectedRange[0] - bullets.length} more achievement-focused bullets`,
    });
  } else if (bullets.length > expectedRange[1]) {
    roleIssues.push({
      type: 'too_long',
      severity: 'info',
      message: `${bullets.length} bullets (expected max ${expectedRange[1]} for ${seniority} level)`,
      suggestion: `Consider trimming to the ${expectedRange[1]} most impactful bullets`,
    });
  }

  const roleScore =
    analyzed.length > 0
      ? Math.round(analyzed.reduce((sum, b) => sum + b.score, 0) / analyzed.length)
      : 0;

  return {
    company,
    title,
    bulletCount: bullets.length,
    expectedRange,
    bullets: analyzed,
    roleScore,
    issues: roleIssues,
  };
}

// ── Full Resume Validation ────────────────────────────────────────────

export function validateAllBullets(
  roles: Array<{
    company: string;
    title: string;
    bullets: string[];
    seniority?: SeniorityLevel;
  }>
): BulletValidationReport {
  const roleReports = roles.map((r) =>
    validateRoleBullets(r.company, r.title, r.bullets, r.seniority || 'mid')
  );

  const totalBullets = roleReports.reduce((sum, r) => sum + r.bulletCount, 0);
  const bulletsWithIssues = roleReports.reduce(
    (sum, r) => sum + r.bullets.filter((b) => b.issues.length > 0).length,
    0
  );

  const overallScore =
    roleReports.length > 0
      ? Math.round(roleReports.reduce((sum, r) => sum + r.roleScore, 0) / roleReports.length)
      : 0;

  // Collect top issues across all bullets (deduplicated by type)
  const issueCountByType = new Map<string, { issue: BulletIssue; count: number }>();
  for (const role of roleReports) {
    for (const bullet of role.bullets) {
      for (const issue of bullet.issues) {
        const existing = issueCountByType.get(issue.type);
        if (existing) {
          existing.count++;
        } else {
          issueCountByType.set(issue.type, { issue, count: 1 });
        }
      }
    }
    for (const issue of role.issues) {
      const existing = issueCountByType.get(issue.type + '_role');
      if (existing) {
        existing.count++;
      } else {
        issueCountByType.set(issue.type + '_role', { issue, count: 1 });
      }
    }
  }

  const topIssues = Array.from(issueCountByType.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((e) => ({
      ...e.issue,
      message: `${e.issue.message} (${e.count} occurrence${e.count > 1 ? 's' : ''})`,
    }));

  return {
    overallScore,
    totalBullets,
    bulletsWithIssues,
    roles: roleReports,
    topIssues,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function suggestReplacement(weakVerb: string): string {
  const replacements: Record<string, string> = {
    'responsible for': 'Led, Managed, Directed, Oversaw',
    helped: 'Contributed to, Enabled, Supported, Facilitated',
    assisted: 'Collaborated on, Partnered with, Co-developed',
    'worked on': 'Built, Developed, Delivered, Executed',
    'participated in': 'Contributed to, Drove, Shaped',
    utilized: 'Leveraged, Applied, Deployed, Implemented',
    'involved in': 'Drove, Led, Contributed to',
    'contributed to': 'Delivered, Built, Shaped, Advanced',
    supported: 'Enabled, Empowered, Strengthened',
    handled: 'Managed, Processed, Resolved, Executed',
    'tasked with': 'Executed, Delivered, Completed, Drove',
    did: 'Executed, Completed, Delivered, Performed',
    used: 'Leveraged, Applied, Deployed, Implemented',
  };
  return replacements[weakVerb] || 'Architected, Delivered, Streamlined, Optimized';
}
