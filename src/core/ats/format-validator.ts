/**
 * ATS Format Validator
 *
 * Pre-generation validation that checks resume content against ATS rules:
 * - Section header names (safe vs prohibited)
 * - Date format consistency
 * - Keyword density (target 2-3%)
 * - Bullet point format (action verb start, length)
 * - Page count vs experience level
 * - Acronym/full-form pairing
 * - Prohibited element detection
 */

import { analyzeBullet, type BulletAnalysis } from '@/core/resume/bullet-validator';

// ── Constants ────────────────────────────────────────────────────────────

const SAFE_SECTION_HEADERS = [
  'summary',
  'profile',
  'professional summary',
  'executive summary',
  'work experience',
  'professional experience',
  'experience',
  'employment history',
  'education',
  'academic background',
  'skills',
  'technical skills',
  'core competencies',
  'areas of expertise',
  'certifications',
  'licenses & certifications',
  'professional certifications',
  'projects',
  'academic projects',
  'personal projects',
  'key projects',
  'publications',
  'awards',
  'honors',
  'volunteer experience',
] as const;

const PROHIBITED_SECTION_HEADERS = [
  'my story',
  'bio',
  'about me',
  "where i've been",
  'gigs',
  'alma mater',
  'learning',
  'toolbox',
  'what i know',
  'hobbies',
  'interests',
  'references',
  'references available upon request',
] as const;

const SAFE_DATE_PATTERN =
  /^(0[1-9]|1[0-2])\/\d{4}$|^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$|^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/;
const CURRENT_JOB_PATTERN = /present|current/i;

const DANGEROUS_DATE_PATTERNS = [
  /'\d{2}/, // '23
  /summer|spring|fall|winter|autumn/i, // Seasonal
  /ongoing/i, // "Ongoing" instead of "Present"
  /^\d{4}\s*[-–—]\s*\d{4}$/, // Just years (2022-2023)
];

/** Common tech acronyms that should also include full form */
const ACRONYM_FULL_FORM_PAIRS: Record<string, string> = {
  aws: 'amazon web services',
  gcp: 'google cloud platform',
  'ci/cd': 'continuous integration',
  k8s: 'kubernetes',
  ml: 'machine learning',
  ai: 'artificial intelligence',
  nlp: 'natural language processing',
  api: 'application programming interface',
  sql: 'structured query language',
  css: 'cascading style sheets',
  html: 'hypertext markup language',
  sre: 'site reliability engineer',
  devops: 'development operations',
  saas: 'software as a service',
  rbac: 'role-based access control',
};

// ── Types ────────────────────────────────────────────────────────────────

export type FormatSeverity = 'error' | 'warning' | 'info';

export interface FormatIssue {
  category:
    | 'section_headers'
    | 'dates'
    | 'keywords'
    | 'bullets'
    | 'page_count'
    | 'acronyms'
    | 'layout'
    | 'general';
  severity: FormatSeverity;
  message: string;
  suggestion?: string;
}

export interface ATSFormatScore {
  overallScore: number; // 0-100
  categoryScores: {
    sectionHeaders: number;
    dateFormat: number;
    keywordDensity: number;
    bulletQuality: number;
    pageCount: number;
    acronymCoverage: number;
  };
  issues: FormatIssue[];
  passesMinimum: boolean; // true if score >= 70
}

export interface ResumeContent {
  sections: Array<{ header: string; content: string }>;
  bullets: string[];
  dates: string[];
  fullText: string;
  wordCount: number;
  yearsOfExperience: number;
  pageCount: number;
}

// ── Main Validator ───────────────────────────────────────────────────────

export function validateATSFormat(content: ResumeContent): ATSFormatScore {
  const issues: FormatIssue[] = [];

  const sectionScore = validateSectionHeaders(content.sections, issues);
  const dateScore = validateDates(content.dates, issues);
  const keywordScore = validateKeywordDensity(content.fullText, content.wordCount, issues);
  const bulletScore = validateBullets(content.bullets, issues);
  const pageScore = validatePageCount(content.pageCount, content.yearsOfExperience, issues);
  const acronymScore = validateAcronyms(content.fullText, issues);

  const weights = {
    sectionHeaders: 0.15,
    dateFormat: 0.1,
    keywordDensity: 0.25,
    bulletQuality: 0.25,
    pageCount: 0.1,
    acronymCoverage: 0.15,
  };

  const overallScore = Math.round(
    sectionScore * weights.sectionHeaders +
      dateScore * weights.dateFormat +
      keywordScore * weights.keywordDensity +
      bulletScore * weights.bulletQuality +
      pageScore * weights.pageCount +
      acronymScore * weights.acronymCoverage
  );

  return {
    overallScore,
    categoryScores: {
      sectionHeaders: sectionScore,
      dateFormat: dateScore,
      keywordDensity: keywordScore,
      bulletQuality: bulletScore,
      pageCount: pageScore,
      acronymCoverage: acronymScore,
    },
    issues,
    passesMinimum: overallScore >= 70,
  };
}

// ── Section Header Validation ────────────────────────────────────────────

function validateSectionHeaders(
  sections: Array<{ header: string; content: string }>,
  issues: FormatIssue[]
): number {
  if (sections.length === 0) return 100;

  let score = 100;
  const penaltyPerIssue = 20;

  for (const section of sections) {
    const headerLower = section.header.toLowerCase().trim();

    // Check for prohibited headers
    if (PROHIBITED_SECTION_HEADERS.some((ph) => headerLower === ph)) {
      issues.push({
        category: 'section_headers',
        severity: 'error',
        message: `Prohibited section header: "${section.header}"`,
        suggestion: `Rename to a standard ATS-safe header (e.g., "Work Experience", "Skills", "Education")`,
      });
      score -= penaltyPerIssue;
    }
    // Check if it matches any safe header
    else if (!SAFE_SECTION_HEADERS.some((sh) => headerLower === sh)) {
      issues.push({
        category: 'section_headers',
        severity: 'warning',
        message: `Non-standard section header: "${section.header}"`,
        suggestion: 'Consider using a standard header for better ATS parsing',
      });
      score -= penaltyPerIssue / 2;
    }
  }

  // Check for required sections
  const headerLowers = sections.map((s) => s.header.toLowerCase().trim());
  const hasExperience = headerLowers.some(
    (h) => h.includes('experience') || h.includes('employment')
  );
  const hasSkills = headerLowers.some((h) => h.includes('skills') || h.includes('competencies'));
  const hasEducation = headerLowers.some((h) => h.includes('education') || h.includes('academic'));

  if (!hasExperience) {
    issues.push({
      category: 'section_headers',
      severity: 'error',
      message: 'Missing required section: Work Experience',
      suggestion: 'Add a "Work Experience" or "Professional Experience" section',
    });
    score -= penaltyPerIssue;
  }
  if (!hasSkills) {
    issues.push({
      category: 'section_headers',
      severity: 'warning',
      message: 'Missing recommended section: Skills',
      suggestion: 'Add a "Technical Skills" or "Skills" section for keyword matching',
    });
    score -= penaltyPerIssue / 2;
  }
  if (!hasEducation) {
    issues.push({
      category: 'section_headers',
      severity: 'info',
      message: 'No Education section found',
      suggestion: 'Add an "Education" section if applicable',
    });
    score -= 5;
  }

  return Math.max(0, score);
}

// ── Date Format Validation ───────────────────────────────────────────────

function validateDates(dates: string[], issues: FormatIssue[]): number {
  if (dates.length === 0) return 100;

  let score = 100;
  const penaltyPerBad = Math.min(25, Math.round(100 / dates.length));

  for (const date of dates) {
    const trimmed = date.trim();

    // Check for current job indicator
    if (CURRENT_JOB_PATTERN.test(trimmed)) continue;

    // Check for dangerous patterns
    const dangerousMatch = DANGEROUS_DATE_PATTERNS.find((p) => p.test(trimmed));
    if (dangerousMatch) {
      issues.push({
        category: 'dates',
        severity: 'warning',
        message: `Potentially unsafe date format: "${trimmed}"`,
        suggestion: 'Use "MMM YYYY" format (e.g., "Jan 2024") or "MM/YYYY"',
      });
      score -= penaltyPerBad;
      continue;
    }

    // Check for safe format
    if (!SAFE_DATE_PATTERN.test(trimmed)) {
      issues.push({
        category: 'dates',
        severity: 'info',
        message: `Non-standard date format: "${trimmed}"`,
        suggestion: 'Preferred formats: "Jan 2024", "01/2024", "January 2024"',
      });
      score -= penaltyPerBad / 2;
    }
  }

  return Math.max(0, score);
}

// ── Keyword Density Validation ───────────────────────────────────────────

function validateKeywordDensity(
  fullText: string,
  wordCount: number,
  issues: FormatIssue[]
): number {
  if (wordCount === 0) return 0;

  // Count unique repeated meaningful words (proxy for keyword usage)
  const words = fullText
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const freq = new Map<string, number>();
  for (const word of words) {
    const cleaned = word.replace(/[^a-z0-9+#]/g, '');
    if (cleaned.length > 3) {
      freq.set(cleaned, (freq.get(cleaned) || 0) + 1);
    }
  }

  // Words appearing 2+ times are likely intentional keywords
  const repeatedKeywords = Array.from(freq.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  const totalKeywordInstances = repeatedKeywords.reduce((sum, [, count]) => sum + count, 0);
  const density = (totalKeywordInstances / wordCount) * 100;

  let score = 100;

  if (density < 1.5) {
    issues.push({
      category: 'keywords',
      severity: 'warning',
      message: `Low keyword density (${density.toFixed(1)}%). Target: 2-3%`,
      suggestion: 'Naturally weave more relevant keywords into your summary and bullet points',
    });
    score = Math.round((density / 1.5) * 70); // Scale up to 70 at 1.5%
  } else if (density > 5) {
    issues.push({
      category: 'keywords',
      severity: 'warning',
      message: `High keyword density (${density.toFixed(1)}%). May appear as keyword stuffing`,
      suggestion: 'Reduce repetition; vary phrasing and use synonyms',
    });
    score = Math.max(50, 100 - Math.round((density - 5) * 10));
  } else if (density >= 2 && density <= 3) {
    // Perfect range
    score = 100;
  } else {
    // Acceptable but not ideal (1.5-2 or 3-5)
    score = 85;
  }

  // Check for any keyword repeated too many times (>5)
  const overUsed = repeatedKeywords.filter(([, count]) => count > 5);
  for (const [word, count] of overUsed) {
    issues.push({
      category: 'keywords',
      severity: 'info',
      message: `"${word}" appears ${count} times — may seem repetitive`,
      suggestion: `Try to limit to 4-5 uses max. Use variations or synonyms.`,
    });
    score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

// ── Bullet Point Validation ──────────────────────────────────────────────

function validateBullets(bullets: string[], issues: FormatIssue[]): number {
  if (bullets.length === 0) return 100;

  const analyses: BulletAnalysis[] = bullets.map((b) => analyzeBullet(b));
  const avgScore = Math.round(analyses.reduce((sum, a) => sum + a.score, 0) / analyses.length);

  // Aggregate bullet issues into format issues
  const weakVerbCount = analyses.filter((a) => a.issues.some((i) => i.type === 'weak_verb')).length;
  const noQuantCount = analyses.filter((a) => !a.hasQuantification).length;
  const tooShortCount = analyses.filter((a) => a.charCount < 50).length;
  const tooLongCount = analyses.filter((a) => a.charCount > 250).length;

  if (weakVerbCount > 0) {
    issues.push({
      category: 'bullets',
      severity: 'error',
      message: `${weakVerbCount} bullet(s) start with weak verbs`,
      suggestion: 'Replace with strong action verbs (Architected, Delivered, Streamlined, etc.)',
    });
  }

  if (noQuantCount > bullets.length * 0.6) {
    issues.push({
      category: 'bullets',
      severity: 'warning',
      message: `${noQuantCount} of ${bullets.length} bullets lack quantification`,
      suggestion: 'Add numbers: team size, % improvement, user count, cost savings',
    });
  }

  if (tooShortCount > 0) {
    issues.push({
      category: 'bullets',
      severity: 'warning',
      message: `${tooShortCount} bullet(s) are too short (under 50 chars)`,
      suggestion: 'Add context, scale, or impact to make bullets more compelling',
    });
  }

  if (tooLongCount > 0) {
    issues.push({
      category: 'bullets',
      severity: 'info',
      message: `${tooLongCount} bullet(s) are too long (over 250 chars)`,
      suggestion: 'Split into two bullets or trim to focus on the most impactful detail',
    });
  }

  return avgScore;
}

// ── Page Count Validation ────────────────────────────────────────────────

function validatePageCount(
  pageCount: number,
  yearsOfExperience: number,
  issues: FormatIssue[]
): number {
  let targetPages: [number, number];

  if (yearsOfExperience <= 5) {
    targetPages = [1, 1];
  } else if (yearsOfExperience <= 10) {
    targetPages = [1, 2];
  } else {
    targetPages = [2, 2];
  }

  if (pageCount < targetPages[0]) {
    issues.push({
      category: 'page_count',
      severity: 'info',
      message: `Resume is ${pageCount} page(s) but ${targetPages[0]}-${targetPages[1]} recommended for ${yearsOfExperience} years experience`,
      suggestion: 'Consider adding more detail to fully showcase your experience',
    });
    return 80;
  }

  if (pageCount > targetPages[1]) {
    const severity: FormatSeverity = pageCount > targetPages[1] + 1 ? 'error' : 'warning';
    issues.push({
      category: 'page_count',
      severity,
      message: `Resume is ${pageCount} page(s) — exceeds recommended ${targetPages[1]} for ${yearsOfExperience} years experience`,
      suggestion:
        yearsOfExperience <= 5
          ? 'Entry-level resumes should be 1 page. Remove older or less relevant experience.'
          : `Trim to ${targetPages[1]} pages by focusing on the most recent and relevant roles`,
    });
    return severity === 'error' ? 40 : 65;
  }

  return 100;
}

// ── Acronym/Full-Form Validation ─────────────────────────────────────────

function validateAcronyms(fullText: string, issues: FormatIssue[]): number {
  const textLower = fullText.toLowerCase();
  let score = 100;
  let missingCount = 0;
  let totalChecked = 0;

  for (const [acronym, fullForm] of Object.entries(ACRONYM_FULL_FORM_PAIRS)) {
    const hasAcronym = textLower.includes(acronym);
    const hasFullForm = textLower.includes(fullForm);

    if (hasAcronym || hasFullForm) {
      totalChecked++;
      if (hasAcronym && !hasFullForm) {
        missingCount++;
      }
    }
  }

  if (totalChecked > 0 && missingCount > 0) {
    // Only deduct proportionally
    const missingRate = missingCount / totalChecked;
    score = Math.round(100 * (1 - missingRate * 0.5)); // Max 50% penalty

    if (missingCount <= 3) {
      issues.push({
        category: 'acronyms',
        severity: 'info',
        message: `${missingCount} acronym(s) found without full form`,
        suggestion: 'Include both forms: e.g., "AWS (Amazon Web Services)" for better ATS parsing',
      });
    } else {
      issues.push({
        category: 'acronyms',
        severity: 'warning',
        message: `${missingCount} acronym(s) missing full form — ATS may not recognize them`,
        suggestion: 'Include both acronym and full term for key technologies',
      });
    }
  }

  return Math.max(0, score);
}

// ── Helper: Extract Resume Content from Generated Data ───────────────────

export function extractResumeContent(
  data: {
    summary?: string;
    experience?: Array<{
      company: string;
      title: string;
      startDate?: string;
      endDate?: string;
      achievements?: string[];
    }>;
    skills?: { technical?: string[]; tools?: string[]; frameworks?: string[] };
    education?: Array<{ institution: string; degree: string; year?: string }>;
    certifications?: string[];
    projects?: Array<{ name: string; highlights?: string[] }>;
  },
  yearsOfExperience: number,
  pageCount: number
): ResumeContent {
  const sections: Array<{ header: string; content: string }> = [];
  const bullets: string[] = [];
  const dates: string[] = [];
  const textParts: string[] = [];

  // Summary
  if (data.summary) {
    sections.push({ header: 'Summary', content: data.summary });
    textParts.push(data.summary);
  }

  // Skills
  const allSkills = [
    ...(data.skills?.technical || []),
    ...(data.skills?.tools || []),
    ...(data.skills?.frameworks || []),
  ];
  if (allSkills.length > 0) {
    const skillText = allSkills.join(', ');
    sections.push({ header: 'Technical Skills', content: skillText });
    textParts.push(skillText);
  }

  // Experience
  if (data.experience?.length) {
    sections.push({ header: 'Work Experience', content: '' });
    for (const exp of data.experience) {
      if (exp.startDate) dates.push(exp.startDate);
      if (exp.endDate) dates.push(exp.endDate);
      textParts.push(`${exp.title} at ${exp.company}`);
      if (exp.achievements) {
        for (const a of exp.achievements) {
          bullets.push(a);
          textParts.push(a);
        }
      }
    }
  }

  // Education
  if (data.education?.length) {
    sections.push({ header: 'Education', content: '' });
    for (const edu of data.education) {
      textParts.push(`${edu.degree} ${edu.institution}`);
      if (edu.year) dates.push(edu.year);
    }
  }

  // Certifications
  if (data.certifications?.length) {
    sections.push({ header: 'Certifications', content: data.certifications.join(', ') });
    textParts.push(data.certifications.join(' '));
  }

  // Projects
  if (data.projects?.length) {
    sections.push({ header: 'Projects', content: '' });
    for (const proj of data.projects) {
      textParts.push(proj.name);
      if (proj.highlights) {
        for (const h of proj.highlights) {
          bullets.push(h);
          textParts.push(h);
        }
      }
    }
  }

  const fullText = textParts.join(' ');
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;

  return {
    sections,
    bullets,
    dates,
    fullText,
    wordCount,
    yearsOfExperience,
    pageCount,
  };
}
