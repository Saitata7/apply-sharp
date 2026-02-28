/**
 * LinkedIn Profile Consistency Checker
 *
 * Compares a MasterProfile (from uploaded resume) against user-provided
 * LinkedIn profile data to flag discrepancies. 87% of recruiters check
 * LinkedIn; 47% reject for inconsistencies between resume and LinkedIn.
 *
 * Pattern mirrors red-flag-scanner.ts: severity-based reporting, score 0-100.
 */

import type {
  MasterProfile,
  EnrichedExperience,
  EnrichedEducation,
} from '@shared/types/master-profile.types';

// ── Types ────────────────────────────────────────────────────────────────

export type LinkedInDiscrepancyType =
  | 'title-mismatch'
  | 'date-mismatch'
  | 'company-mismatch'
  | 'skills-gap'
  | 'education-mismatch'
  | 'missing-on-linkedin'
  | 'missing-on-resume';

export type DiscrepancySeverity = 'error' | 'warning' | 'info';

export interface LinkedInDiscrepancy {
  type: LinkedInDiscrepancyType;
  severity: DiscrepancySeverity;
  field: string;
  resumeValue: string;
  linkedInValue: string;
  message: string;
  suggestion: string;
}

export interface LinkedInExperience {
  title: string;
  company: string;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
}

export interface LinkedInEducation {
  institution: string;
  degree: string;
  field: string;
  startDate?: string;
  endDate?: string;
}

export interface LinkedInProfileData {
  experience: LinkedInExperience[];
  education: LinkedInEducation[];
  skills: string[];
  headline?: string;
  location?: string;
}

export interface LinkedInConsistencyReport {
  discrepancies: LinkedInDiscrepancy[];
  score: number;
  summary: {
    errors: number;
    warnings: number;
    info: number;
    total: number;
  };
  recommendation: 'update-resume' | 'update-linkedin' | 'both' | 'consistent';
}

// ── Text Normalization ──────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,\-–—/\\()&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;

  const wordsA = new Set(na.split(' ').filter(Boolean));
  const wordsB = new Set(nb.split(' ').filter(Boolean));
  const union = new Set([...wordsA, ...wordsB]);
  if (union.size === 0) return 0;

  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap / union.size;
}

// ── Date Helpers ────────────────────────────────────────────────────────

function parseMonthYear(dateStr: string | undefined): { year: number; month: number } | null {
  if (!dateStr) return null;

  // Try "Month Year" format (e.g., "Jan 2024", "January 2024")
  const monthNames: Record<string, number> = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };

  const lower = dateStr.toLowerCase().trim();

  // "Jan 2024" or "January 2024"
  const monthYearMatch = lower.match(/^(\w+)\s+(\d{4})$/);
  if (monthYearMatch) {
    const month = monthNames[monthYearMatch[1]];
    if (month !== undefined) {
      return { year: parseInt(monthYearMatch[2]), month };
    }
  }

  // "2024-01" or "01/2024"
  const isoMatch = lower.match(/^(\d{4})-(\d{1,2})$/);
  if (isoMatch) {
    return { year: parseInt(isoMatch[1]), month: parseInt(isoMatch[2]) - 1 };
  }

  const slashMatch = lower.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return { year: parseInt(slashMatch[2]), month: parseInt(slashMatch[1]) - 1 };
  }

  // ISO date "2024-01-15"
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return { year: d.getFullYear(), month: d.getMonth() };
  }

  // Year-only fallback
  const yearOnly = lower.match(/^(\d{4})$/);
  if (yearOnly) {
    return { year: parseInt(yearOnly[1]), month: 0 };
  }

  return null;
}

function monthDiff(a: { year: number; month: number }, b: { year: number; month: number }): number {
  return Math.abs((a.year - b.year) * 12 + (a.month - b.month));
}

// ── Experience Matching ─────────────────────────────────────────────────

function findBestMatch(
  target: { company: string; title: string },
  candidates: { company: string; title: string }[]
): { index: number; companyScore: number; titleScore: number } | null {
  let bestIdx = -1;
  let bestCompanyScore = 0;

  for (let i = 0; i < candidates.length; i++) {
    const score = similarity(target.company, candidates[i].company);
    if (score > bestCompanyScore) {
      bestCompanyScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx === -1 || bestCompanyScore < 0.3) return null;

  return {
    index: bestIdx,
    companyScore: bestCompanyScore,
    titleScore: similarity(target.title, candidates[bestIdx].title),
  };
}

// ── Detection Functions ─────────────────────────────────────────────────

function compareExperience(
  resumeExp: EnrichedExperience[],
  linkedInExp: LinkedInExperience[]
): LinkedInDiscrepancy[] {
  const flags: LinkedInDiscrepancy[] = [];
  const matchedLinkedIn = new Set<number>();

  for (const re of resumeExp) {
    const match = findBestMatch({ company: re.company, title: re.title }, linkedInExp);

    if (!match) {
      flags.push({
        type: 'missing-on-linkedin',
        severity: 'error',
        field: `${re.title} at ${re.company}`,
        resumeValue: `${re.title} at ${re.company}`,
        linkedInValue: '(not found)',
        message: `"${re.title} at ${re.company}" is on your resume but not on LinkedIn`,
        suggestion: 'Add this role to your LinkedIn profile — recruiters will check',
      });
      continue;
    }

    matchedLinkedIn.add(match.index);
    const le = linkedInExp[match.index];

    // Company name mismatch (only if significantly different)
    if (match.companyScore < 0.7 && match.companyScore >= 0.3) {
      flags.push({
        type: 'company-mismatch',
        severity: 'warning',
        field: `Company name for ${re.title}`,
        resumeValue: re.company,
        linkedInValue: le.company,
        message: `Company name differs: resume says "${re.company}", LinkedIn says "${le.company}"`,
        suggestion: 'Use the exact same company name on both — inconsistencies raise red flags',
      });
    }

    // Title mismatch
    if (match.titleScore < 0.6) {
      flags.push({
        type: 'title-mismatch',
        severity: 'error',
        field: `Job title at ${re.company}`,
        resumeValue: re.title,
        linkedInValue: le.title,
        message: `Title mismatch at ${re.company}: resume says "${re.title}", LinkedIn says "${le.title}"`,
        suggestion:
          'Job titles must match exactly — this is the #1 thing recruiters verify on LinkedIn',
      });
    } else if (match.titleScore < 0.9) {
      flags.push({
        type: 'title-mismatch',
        severity: 'warning',
        field: `Job title at ${re.company}`,
        resumeValue: re.title,
        linkedInValue: le.title,
        message: `Title slightly differs at ${re.company}: resume "${re.title}" vs LinkedIn "${le.title}"`,
        suggestion: 'Align titles on both platforms for consistency',
      });
    }

    // Date mismatch
    const resumeStart = parseMonthYear(re.startDate);
    const linkedInStart = parseMonthYear(le.startDate);
    if (resumeStart && linkedInStart && monthDiff(resumeStart, linkedInStart) > 2) {
      flags.push({
        type: 'date-mismatch',
        severity: 'warning',
        field: `Start date at ${re.company}`,
        resumeValue: re.startDate,
        linkedInValue: le.startDate || '(not set)',
        message: `Start date differs at ${re.company}: resume "${re.startDate}" vs LinkedIn "${le.startDate}"`,
        suggestion:
          'Ensure dates match within 1 month — discrepancies suggest dishonesty to recruiters',
      });
    }

    const resumeEnd = re.isCurrent ? null : parseMonthYear(re.endDate);
    const linkedInEnd = le.isCurrent ? null : parseMonthYear(le.endDate);
    if (resumeEnd && linkedInEnd && monthDiff(resumeEnd, linkedInEnd) > 2) {
      flags.push({
        type: 'date-mismatch',
        severity: 'warning',
        field: `End date at ${re.company}`,
        resumeValue: re.endDate || 'Present',
        linkedInValue: le.endDate || 'Present',
        message: `End date differs at ${re.company}: resume "${re.endDate}" vs LinkedIn "${le.endDate}"`,
        suggestion: 'Align end dates on both platforms',
      });
    }
  }

  // Check for LinkedIn roles not on resume
  for (let i = 0; i < linkedInExp.length; i++) {
    if (!matchedLinkedIn.has(i)) {
      const le = linkedInExp[i];
      flags.push({
        type: 'missing-on-resume',
        severity: 'info',
        field: `${le.title} at ${le.company}`,
        resumeValue: '(not found)',
        linkedInValue: `${le.title} at ${le.company}`,
        message: `"${le.title} at ${le.company}" is on LinkedIn but not on your resume`,
        suggestion: 'If relevant, consider adding this role to your resume for completeness',
      });
    }
  }

  return flags;
}

function compareEducation(
  resumeEdu: EnrichedEducation[],
  linkedInEdu: LinkedInEducation[]
): LinkedInDiscrepancy[] {
  const flags: LinkedInDiscrepancy[] = [];
  const matchedLinkedIn = new Set<number>();

  for (const re of resumeEdu) {
    let bestIdx = -1;
    let bestScore = 0;

    for (let i = 0; i < linkedInEdu.length; i++) {
      const score = similarity(re.institution, linkedInEdu[i].institution);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1 || bestScore < 0.3) {
      flags.push({
        type: 'missing-on-linkedin',
        severity: 'warning',
        field: `Education: ${re.degree} at ${re.institution}`,
        resumeValue: `${re.degree} in ${re.field} at ${re.institution}`,
        linkedInValue: '(not found)',
        message: `"${re.degree} at ${re.institution}" is on your resume but not on LinkedIn`,
        suggestion: 'Add your education to LinkedIn — it helps with recruiter search filters',
      });
      continue;
    }

    matchedLinkedIn.add(bestIdx);
    const le = linkedInEdu[bestIdx];

    // Degree mismatch
    const degreeSim = similarity(re.degree, le.degree);
    if (degreeSim < 0.5) {
      flags.push({
        type: 'education-mismatch',
        severity: 'warning',
        field: `Degree at ${re.institution}`,
        resumeValue: re.degree,
        linkedInValue: le.degree,
        message: `Degree differs at ${re.institution}: resume "${re.degree}" vs LinkedIn "${le.degree}"`,
        suggestion: 'Ensure degree titles match on both platforms',
      });
    }

    // Field mismatch
    if (re.field && le.field) {
      const fieldSim = similarity(re.field, le.field);
      if (fieldSim < 0.5) {
        flags.push({
          type: 'education-mismatch',
          severity: 'info',
          field: `Field of study at ${re.institution}`,
          resumeValue: re.field,
          linkedInValue: le.field,
          message: `Field of study differs at ${re.institution}: resume "${re.field}" vs LinkedIn "${le.field}"`,
          suggestion: 'Align field of study names for consistency',
        });
      }
    }
  }

  for (let i = 0; i < linkedInEdu.length; i++) {
    if (!matchedLinkedIn.has(i)) {
      const le = linkedInEdu[i];
      flags.push({
        type: 'missing-on-resume',
        severity: 'info',
        field: `Education: ${le.degree} at ${le.institution}`,
        resumeValue: '(not found)',
        linkedInValue: `${le.degree} in ${le.field} at ${le.institution}`,
        message: `"${le.degree} at ${le.institution}" is on LinkedIn but not on your resume`,
        suggestion: 'If relevant, consider adding this to your resume',
      });
    }
  }

  return flags;
}

function compareSkills(profile: MasterProfile, linkedInSkills: string[]): LinkedInDiscrepancy[] {
  if (linkedInSkills.length === 0) return [];

  const flags: LinkedInDiscrepancy[] = [];

  // Collect all resume skills (normalized)
  const resumeSkillNames = new Set<string>();
  const allSkillArrays = [
    profile.skills?.technical,
    profile.skills?.tools,
    profile.skills?.frameworks,
    profile.skills?.programmingLanguages,
  ];

  for (const arr of allSkillArrays) {
    if (!arr) continue;
    for (const skill of arr) {
      resumeSkillNames.add(normalize(skill.name));
      for (const alias of skill.aliases || []) {
        resumeSkillNames.add(normalize(alias));
      }
    }
  }

  const linkedInNormalized = linkedInSkills.map((s) => ({
    original: s,
    normalized: normalize(s),
  }));

  // Skills on resume but not on LinkedIn
  const linkedInNormalizedSet = new Set(linkedInNormalized.map((s) => s.normalized));
  const missingOnLinkedIn: string[] = [];

  for (const arr of allSkillArrays) {
    if (!arr) continue;
    for (const skill of arr) {
      const n = normalize(skill.name);
      const aliases = (skill.aliases || []).map(normalize);
      const found =
        linkedInNormalizedSet.has(n) || aliases.some((a) => linkedInNormalizedSet.has(a));
      if (!found) {
        missingOnLinkedIn.push(skill.name);
      }
    }
  }

  if (missingOnLinkedIn.length > 5) {
    flags.push({
      type: 'skills-gap',
      severity: 'info',
      field: 'Skills missing from LinkedIn',
      resumeValue:
        missingOnLinkedIn.slice(0, 10).join(', ') +
        (missingOnLinkedIn.length > 10 ? ` (+${missingOnLinkedIn.length - 10} more)` : ''),
      linkedInValue: '(not listed)',
      message: `${missingOnLinkedIn.length} resume skills not on LinkedIn`,
      suggestion:
        'Add your top skills to LinkedIn — recruiters filter candidates by LinkedIn skills',
    });
  }

  // Skills on LinkedIn but not on resume
  const missingOnResume: string[] = [];
  for (const ls of linkedInNormalized) {
    if (!resumeSkillNames.has(ls.normalized)) {
      missingOnResume.push(ls.original);
    }
  }

  if (missingOnResume.length > 3) {
    flags.push({
      type: 'skills-gap',
      severity: 'info',
      field: 'LinkedIn skills not on resume',
      resumeValue: '(not listed)',
      linkedInValue:
        missingOnResume.slice(0, 10).join(', ') +
        (missingOnResume.length > 10 ? ` (+${missingOnResume.length - 10} more)` : ''),
      message: `${missingOnResume.length} LinkedIn skills not on your resume`,
      suggestion:
        'If these skills are relevant to your target roles, consider adding them to your resume',
    });
  }

  return flags;
}

// ── LinkedIn Text Parser ────────────────────────────────────────────────

/**
 * Parses pasted LinkedIn profile text into structured data.
 * LinkedIn profile copy-paste typically produces text in this format:
 *
 * Experience
 * Title
 * Company · Employment Type
 * Start Date - End Date · Duration
 * Location
 * Description...
 *
 * Education
 * Institution
 * Degree, Field
 * Start - End
 *
 * Skills
 * Skill1 · Skill2 · ...
 */
export function parseLinkedInText(text: string): LinkedInProfileData {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const result: LinkedInProfileData = {
    experience: [],
    education: [],
    skills: [],
  };

  type Section = 'none' | 'experience' | 'education' | 'skills' | 'other';
  let currentSection: Section = 'none';

  // Section header patterns
  const sectionHeaders: Record<string, Section> = {
    experience: 'experience',
    'work experience': 'experience',
    'professional experience': 'experience',
    education: 'education',
    skills: 'skills',
    'top skills': 'skills',
    // Sections we skip
    about: 'other',
    summary: 'other',
    licenses: 'other',
    certifications: 'other',
    'licenses & certifications': 'other',
    volunteer: 'other',
    publications: 'other',
    honors: 'other',
    languages: 'other',
    recommendations: 'other',
    interests: 'other',
    activity: 'other',
    projects: 'other',
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lineLower = line.toLowerCase().replace(/[:\s]+$/, '');

    // Check for section header
    if (sectionHeaders[lineLower] !== undefined) {
      currentSection = sectionHeaders[lineLower];
      i++;
      continue;
    }

    if (currentSection === 'experience') {
      // Try to parse an experience entry
      // Pattern: Title on first line, Company · Type on next, Date range on next
      const entry = parseExperienceEntry(lines, i);
      if (entry) {
        result.experience.push(entry.experience);
        i = entry.nextIndex;
        continue;
      }
    }

    if (currentSection === 'education') {
      const entry = parseEducationEntry(lines, i);
      if (entry) {
        result.education.push(entry.education);
        i = entry.nextIndex;
        continue;
      }
    }

    if (currentSection === 'skills') {
      // Skills can be one per line or separated by · or ,
      const skillLine = line.replace(/^[-•]\s*/, '');
      const separators = /[·•,|]/;
      if (separators.test(skillLine)) {
        const skills = skillLine
          .split(separators)
          .map((s) => s.trim())
          .filter(Boolean);
        result.skills.push(...skills);
      } else if (skillLine.length > 0 && skillLine.length < 60) {
        result.skills.push(skillLine);
      }
    }

    i++;
  }

  // Deduplicate skills
  result.skills = [...new Set(result.skills)];

  return result;
}

// Date pattern for LinkedIn: "Jan 2024 - Present", "2020 - 2024", etc.
const DATE_RANGE_PATTERN =
  /^((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}|\d{4})\s*[-–—]\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}|\d{4}|present|current)/i;

const DURATION_PATTERN = /·?\s*(\d+\s*(?:yr|year|mo|month)s?(?:\s+\d+\s*(?:yr|year|mo|month)s?)?)/i;

function parseExperienceEntry(
  lines: string[],
  startIdx: number
): { experience: LinkedInExperience; nextIndex: number } | null {
  if (startIdx >= lines.length) return null;

  // First line: title (or company for nested roles)
  const titleLine = lines[startIdx];

  // Skip if it looks like a section header or date
  if (DATE_RANGE_PATTERN.test(titleLine)) return null;

  // Look for company on next line (typically "Company · Employment Type" or "Company Name")
  let companyLine = '';
  let dateRange = '';
  let nextIdx = startIdx + 1;

  // Scan ahead for company and date info
  for (let j = startIdx + 1; j < Math.min(startIdx + 5, lines.length); j++) {
    const l = lines[j];

    // Check if this is a date range line
    if (DATE_RANGE_PATTERN.test(l) || DURATION_PATTERN.test(l)) {
      if (!companyLine && j === startIdx + 1) {
        // No company found between title and date — might be sparse format
      }
      dateRange = l;
      nextIdx = j + 1;
      // Skip location line if next
      if (nextIdx < lines.length) {
        const isLocation =
          /^[a-z\s,]+(?:area|city|state|county|region|remote|hybrid|on-?site)?\s*$/i.test(
            lines[nextIdx]
          ) && lines[nextIdx].length < 60;
        if (isLocation) nextIdx++;
      }
      break;
    }

    // Check for section header — stop
    const lLower = l.toLowerCase().replace(/[:\s]+$/, '');
    if (
      [
        'experience',
        'education',
        'skills',
        'about',
        'certifications',
        'volunteer',
        'projects',
        'licenses & certifications',
        'top skills',
      ].includes(lLower)
    ) {
      break;
    }

    // First non-date, non-title line is likely company
    if (!companyLine) {
      companyLine = l;
      nextIdx = j + 1;
    }
  }

  if (!companyLine && !dateRange) {
    // Couldn't parse this as an experience entry
    return null;
  }

  // Extract company name (remove " · Full-time", " · Contract", etc.)
  const company = companyLine.split(/\s*·\s*/)[0].trim();

  // Extract dates
  const dateMatch = dateRange.match(DATE_RANGE_PATTERN);
  let startDate = '';
  let endDate: string | undefined;
  let isCurrent = false;

  if (dateMatch) {
    startDate = dateMatch[1];
    const endStr = dateMatch[2].toLowerCase();
    if (endStr === 'present' || endStr === 'current') {
      isCurrent = true;
    } else {
      endDate = dateMatch[2];
    }
  }

  return {
    experience: {
      title: titleLine,
      company: company || '(unknown)',
      startDate,
      endDate,
      isCurrent,
    },
    nextIndex: nextIdx,
  };
}

function parseEducationEntry(
  lines: string[],
  startIdx: number
): { education: LinkedInEducation; nextIndex: number } | null {
  if (startIdx >= lines.length) return null;

  const institutionLine = lines[startIdx];
  if (institutionLine.length > 100) return null;

  let degree = '';
  let field = '';
  let nextIdx = startIdx + 1;

  // Next line is typically "Degree, Field of Study" or "Degree"
  if (nextIdx < lines.length) {
    const degreeLine = lines[nextIdx];

    // Skip if it looks like a section header
    const dLower = degreeLine.toLowerCase().replace(/[:\s]+$/, '');
    if (['experience', 'education', 'skills', 'about'].includes(dLower)) {
      return {
        education: { institution: institutionLine, degree: '', field: '' },
        nextIndex: nextIdx,
      };
    }

    // Parse "Degree, Field" or "Degree · Field"
    const parts = degreeLine.split(/[,·]/);
    degree = parts[0]?.trim() || '';
    field = parts[1]?.trim() || '';
    nextIdx++;
  }

  // Skip date line if present
  if (nextIdx < lines.length) {
    const dateLine = lines[nextIdx];
    if (/\d{4}/.test(dateLine) && dateLine.length < 30) {
      nextIdx++;
    }
  }

  return {
    education: {
      institution: institutionLine,
      degree,
      field,
    },
    nextIndex: nextIdx,
  };
}

// ── Main Checker ────────────────────────────────────────────────────────

export function checkLinkedInConsistency(
  profile: MasterProfile,
  linkedInData: LinkedInProfileData
): LinkedInConsistencyReport {
  const discrepancies: LinkedInDiscrepancy[] = [
    ...compareExperience(profile.experience || [], linkedInData.experience),
    ...compareEducation(profile.education || [], linkedInData.education),
    ...compareSkills(profile, linkedInData.skills),
  ];

  // Sort: errors first, then warnings, then info
  const severityOrder: Record<DiscrepancySeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };
  discrepancies.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Calculate score (same formula as red-flag-scanner)
  const errors = discrepancies.filter((d) => d.severity === 'error').length;
  const warnings = discrepancies.filter((d) => d.severity === 'warning').length;
  const info = discrepancies.filter((d) => d.severity === 'info').length;

  const score = Math.max(0, 100 - errors * 10 - warnings * 5 - info * 2);

  // Determine recommendation
  const missingOnLinkedIn = discrepancies.filter((d) => d.type === 'missing-on-linkedin').length;
  const missingOnResume = discrepancies.filter((d) => d.type === 'missing-on-resume').length;
  const mismatches = discrepancies.filter((d) =>
    ['title-mismatch', 'date-mismatch', 'company-mismatch', 'education-mismatch'].includes(d.type)
  ).length;

  let recommendation: LinkedInConsistencyReport['recommendation'] = 'consistent';
  if (score < 90) {
    if (missingOnLinkedIn > missingOnResume + mismatches) {
      recommendation = 'update-linkedin';
    } else if (missingOnResume > missingOnLinkedIn + mismatches) {
      recommendation = 'update-resume';
    } else {
      recommendation = 'both';
    }
  }

  return {
    discrepancies,
    score,
    summary: { errors, warnings, info, total: discrepancies.length },
    recommendation,
  };
}
