/**
 * Red Flag Scanner
 *
 * Analyzes a MasterProfile for career-level red flags that would
 * concern a hiring manager: employment gaps, job hopping, missing
 * contact info, generic language, title regression, etc.
 */

import type {
  MasterProfile,
  EnrichedExperience,
  ExtendedPersonalInfo,
  CareerContext,
  EnrichedEducation,
  Certification,
} from '@shared/types/master-profile.types';

// ── Types ────────────────────────────────────────────────────────────────

export type RedFlagSeverity = 'error' | 'warning' | 'info';

export type RedFlagCategory =
  | 'employment-gap'
  | 'job-hopping'
  | 'contact-info'
  | 'generic-language'
  | 'career-progression'
  | 'missing-content'
  | 'education';

export interface RedFlag {
  category: RedFlagCategory;
  severity: RedFlagSeverity;
  message: string;
  suggestion: string;
  details?: string;
}

export interface RedFlagReport {
  flags: RedFlag[];
  score: number;
  summary: {
    errors: number;
    warnings: number;
    info: number;
    total: number;
  };
}

// ── Generic Language Patterns ────────────────────────────────────────────

const GENERIC_PHRASES = [
  'results-driven',
  'team player',
  'detail-oriented',
  'passionate',
  'hard-working',
  'self-motivated',
  'go-getter',
  'think outside the box',
  'synergy',
  'cutting-edge',
  'dynamic professional',
  'proven track record',
  'highly motivated',
  'strong work ethic',
  'excellent communication skills',
  'fast learner',
  'problem solver',
];

// ── Seniority Level Mapping ─────────────────────────────────────────────

const TITLE_SENIORITY: Record<string, number> = {
  intern: 0,
  junior: 1,
  associate: 1,
  entry: 1,
  mid: 2,
  senior: 3,
  staff: 4,
  lead: 4,
  principal: 5,
  director: 6,
  vp: 7,
  'vice president': 7,
  cto: 8,
  ceo: 8,
  cfo: 8,
  coo: 8,
  'c-level': 8,
};

function extractSeniorityFromTitle(title: string): number | null {
  const lower = title.toLowerCase();
  for (const [keyword, level] of Object.entries(TITLE_SENIORITY)) {
    if (lower.includes(keyword)) return level;
  }
  return null;
}

// ── Date Helpers ─────────────────────────────────────────────────────────

function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function monthsBetween(earlier: Date, later: Date): number {
  return (
    (later.getFullYear() - earlier.getFullYear()) * 12 + (later.getMonth() - earlier.getMonth())
  );
}

function formatDateShort(d: Date): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Detection Functions ─────────────────────────────────────────────────

function detectEmploymentGaps(experience: EnrichedExperience[]): RedFlag[] {
  if (experience.length < 2) return [];

  const flags: RedFlag[] = [];

  // Sort by start date ascending
  const sorted = [...experience]
    .filter((e) => e.startDate && !isNaN(new Date(e.startDate).getTime()))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    const currentEnd = parseDate(current.endDate);
    const nextStart = parseDate(next.startDate);

    if (!currentEnd || !nextStart) continue;

    const gapMonths = monthsBetween(currentEnd, nextStart);

    if (gapMonths > 12) {
      flags.push({
        category: 'employment-gap',
        severity: 'error',
        message: `${gapMonths}-month employment gap between ${current.company} and ${next.company}`,
        suggestion:
          'Address this gap in your cover letter — mention freelance work, education, personal development, or caregiving',
        details: `${formatDateShort(currentEnd)} to ${formatDateShort(nextStart)}`,
      });
    } else if (gapMonths >= 6) {
      flags.push({
        category: 'employment-gap',
        severity: 'warning',
        message: `${gapMonths}-month gap between ${current.company} and ${next.company}`,
        suggestion: 'Consider briefly explaining this gap — employers notice gaps over 6 months',
        details: `${formatDateShort(currentEnd)} to ${formatDateShort(nextStart)}`,
      });
    }
  }

  return flags;
}

function detectJobHopping(experience: EnrichedExperience[]): RedFlag[] {
  // Only count full-time roles — short contracts/freelance/internships are expected
  const fullTimeRoles = experience.filter(
    (exp) => exp.employmentType === 'full-time' || !exp.employmentType
  );

  const shortRoles = fullTimeRoles.filter(
    (exp) => exp.durationMonths > 0 && exp.durationMonths < 18 && !exp.isCurrent
  );

  if (shortRoles.length >= 3) {
    return [
      {
        category: 'job-hopping',
        severity: 'warning',
        message: `${shortRoles.length} full-time roles lasted under 18 months — may appear as job hopping`,
        suggestion:
          'Emphasize growth and accomplishments at each role to show intentional career moves, not instability',
        details: shortRoles.map((r) => `${r.company} (${r.durationMonths} months)`).join(', '),
      },
    ];
  }

  if (shortRoles.length === 2) {
    return [
      {
        category: 'job-hopping',
        severity: 'info',
        message: '2 full-time roles lasted under 18 months',
        suggestion: 'Not a red flag yet, but be prepared to explain short tenures in interviews',
      },
    ];
  }

  return [];
}

function checkContactInfo(personal: ExtendedPersonalInfo): RedFlag[] {
  const flags: RedFlag[] = [];

  if (!personal.email?.trim()) {
    flags.push({
      category: 'contact-info',
      severity: 'error',
      message: 'Missing email address',
      suggestion: 'Add a professional email address — this is essential for applications',
    });
  }

  if (!personal.phone?.trim()) {
    flags.push({
      category: 'contact-info',
      severity: 'warning',
      message: 'Missing phone number',
      suggestion: 'Add a phone number — many recruiters prefer to call rather than email',
    });
  }

  if (!personal.linkedInUrl?.trim()) {
    flags.push({
      category: 'contact-info',
      severity: 'warning',
      message: 'Missing LinkedIn URL',
      suggestion: '87% of recruiters check LinkedIn — add your profile URL to your resume',
    });
  }

  if (!personal.portfolioUrl?.trim() && !personal.githubUrl?.trim()) {
    flags.push({
      category: 'contact-info',
      severity: 'info',
      message: 'No portfolio or GitHub link',
      suggestion:
        'Adding a portfolio or GitHub profile can strengthen your application for technical roles',
    });
  }

  return flags;
}

function checkSummary(careerContext: CareerContext | undefined): RedFlag[] {
  const flags: RedFlag[] = [];

  if (!careerContext?.summary?.trim()) {
    flags.push({
      category: 'generic-language',
      severity: 'error',
      message: 'Missing professional summary',
      suggestion:
        'Add a 2-3 sentence summary highlighting your strongest qualifications and career focus',
    });
    return flags;
  }

  const summary = careerContext.summary;
  const wordCount = summary.split(/\s+/).filter(Boolean).length;

  if (wordCount < 30) {
    flags.push({
      category: 'generic-language',
      severity: 'warning',
      message: `Professional summary is only ${wordCount} words — too brief to make an impact`,
      suggestion:
        'Expand your summary to 50-80 words with specific achievements and target role alignment',
    });
  }

  const lowerSummary = summary.toLowerCase();
  const foundPhrases = GENERIC_PHRASES.filter((phrase) => lowerSummary.includes(phrase));

  if (foundPhrases.length > 0) {
    flags.push({
      category: 'generic-language',
      severity: 'warning',
      message: `Summary uses generic language: "${foundPhrases.join('", "')}"`,
      suggestion:
        'Replace clichés with specific achievements — "results-driven" → "Delivered 3 products generating $2M ARR"',
    });
  }

  return flags;
}

function detectTitleRegression(experience: EnrichedExperience[]): RedFlag[] {
  if (experience.length < 2) return [];

  const flags: RedFlag[] = [];

  // Sort by start date ascending (oldest first)
  const sorted = [...experience]
    .filter((e) => e.startDate && !isNaN(new Date(e.startDate).getTime()))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    const currentLevel = extractSeniorityFromTitle(current.normalizedTitle || current.title);
    const nextLevel = extractSeniorityFromTitle(next.normalizedTitle || next.title);

    if (currentLevel === null || nextLevel === null) continue;

    // Flag only if regression is 2+ levels (minor lateral moves are fine)
    if (currentLevel - nextLevel >= 2) {
      flags.push({
        category: 'career-progression',
        severity: 'warning',
        message: `Title regression: "${current.title}" → "${next.title}"`,
        suggestion:
          'If intentional (career pivot, startup opportunity), explain briefly in your cover letter',
        details: `${current.company} → ${next.company}`,
      });
    }
  }

  return flags;
}

function checkAchievements(experience: EnrichedExperience[]): RedFlag[] {
  const flags: RedFlag[] = [];

  for (const exp of experience) {
    const achievementCount = (exp.achievements?.length || 0) + (exp.responsibilities?.length || 0);

    if (achievementCount === 0) {
      flags.push({
        category: 'missing-content',
        severity: 'error',
        message: `No achievements or bullet points for ${exp.title} at ${exp.company}`,
        suggestion:
          'Add 3-5 achievement bullets per role using the XYZ formula: "Accomplished [X] as measured by [Y], by doing [Z]"',
      });
    } else if (achievementCount === 1) {
      flags.push({
        category: 'missing-content',
        severity: 'warning',
        message: `Only 1 bullet point for ${exp.title} at ${exp.company}`,
        suggestion:
          'Add at least 3 bullets per role — highlight different achievements, skills, and impacts',
      });
    }
  }

  return flags;
}

function checkEducation(
  education: EnrichedEducation[],
  certifications: Certification[],
  yearsOfExperience: number
): RedFlag[] {
  // Only relevant for experienced professionals
  if (yearsOfExperience < 5) return [];
  if (education.length === 0 && certifications.length === 0) return [];

  const currentYear = new Date().getFullYear();
  const threshold = currentYear - 10;

  const hasRecentEducation = education.some((edu) => {
    const endYear = parseInt(edu.endDate, 10);
    return !isNaN(endYear) && endYear >= threshold;
  });

  const hasRecentCert = certifications.some((cert) => {
    if (cert.dateObtained) {
      const year = parseInt(cert.dateObtained, 10);
      if (!isNaN(year)) return year >= threshold;
      const d = new Date(cert.dateObtained);
      return !isNaN(d.getTime()) && d.getFullYear() >= threshold;
    }
    return false;
  });

  if (!hasRecentEducation && !hasRecentCert) {
    return [
      {
        category: 'education',
        severity: 'info',
        message: 'No education or certifications from the last 10 years',
        suggestion:
          'Consider adding recent courses, certifications, or professional development to show continuous learning',
      },
    ];
  }

  return [];
}

// ── Main Scanner ─────────────────────────────────────────────────────────

export function scanRedFlags(profile: MasterProfile): RedFlagReport {
  const flags: RedFlag[] = [
    ...detectEmploymentGaps(profile.experience || []),
    ...detectJobHopping(profile.experience || []),
    ...checkContactInfo(profile.personal || ({} as ExtendedPersonalInfo)),
    ...checkSummary(profile.careerContext),
    ...detectTitleRegression(profile.experience || []),
    ...checkAchievements(profile.experience || []),
    ...checkEducation(
      profile.education || [],
      profile.certifications || [],
      profile.careerContext?.yearsOfExperience || 0
    ),
  ];

  // Sort: errors first, then warnings, then info
  const severityOrder: Record<RedFlagSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };
  flags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Calculate score
  const errors = flags.filter((f) => f.severity === 'error').length;
  const warnings = flags.filter((f) => f.severity === 'warning').length;
  const info = flags.filter((f) => f.severity === 'info').length;

  const score = Math.max(0, 100 - errors * 10 - warnings * 5 - info * 2);

  return {
    flags,
    score,
    summary: {
      errors,
      warnings,
      info,
      total: flags.length,
    },
  };
}
