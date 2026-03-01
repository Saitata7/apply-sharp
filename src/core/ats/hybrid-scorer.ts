/**
 * Hybrid ATS Scorer
 * Layer 1: Instant keyword matching (free, ~100ms)
 * Layer 2: AI deep analysis (on-demand, cost-effective)
 */

import type { AIService } from '@/ai';
import type {
  MasterProfile,
  GeneratedProfile,
  SkillDetail,
} from '@shared/types/master-profile.types';
import type { ResumeProfile } from '@shared/types/profile.types';
import type { ExtractedJob } from '@shared/types/job.types';
import { getCustomPatterns, getCustomVariations } from './custom-keywords';
import { getAllPatterns, findKeywordByName } from './keywords';
import {
  detectBackgroundFromJD,
  getBackgroundConfig,
  type BackgroundType,
} from '@shared/types/background.types';

export interface KeywordWithWeight {
  keyword: string;
  weight: number; // 1-5 based on frequency and position
  frequency: number;
  inRequirements: boolean;
}

export interface QuickATSScore {
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  matchPercentage: number;
  tier: 'excellent' | 'good' | 'fair' | 'poor';
  // Strategic additions
  weightedKeywords: KeywordWithWeight[];
  seniorityMatch: 'match' | 'over' | 'under' | 'unknown';
  yearsRequired: number | null;
  criticalMissing: string[]; // High-weight keywords that are missing
  // Job domain analysis
  detectedJobDomain: 'tech' | 'non-tech' | 'unknown';
  hasEnoughKeywords: boolean; // Whether we found enough keywords to score reliably
  // Background mismatch detection
  detectedJobBackground: string | null; // e.g., 'marketing', 'engineering', etc.
  backgroundMismatch: boolean; // true if profile background differs from job background
  backgroundMismatchMessage?: string; // Human-readable message about the mismatch
  warnings?: string[]; // User-facing warnings (e.g., too few keywords)
}

export interface DeepATSScore extends QuickATSScore {
  overallScore: number;
  skillMatchScore: number;
  experienceMatchScore: number;
  cultureFitScore: number;
  strengths: string[];
  gaps: string[];
  suggestions: string[];
  prioritizedActions: PrioritizedAction[];
  competitivePosition: string;
  aiAnalysis: string;
}

export interface PrioritizedAction {
  priority: 'high' | 'medium' | 'low';
  action: string;
  impact: string;
}

/**
 * Strip HR/EEO/legal boilerplate from job descriptions before keyword extraction.
 * These sections contain words like "diversity", "inclusion", "equal opportunity"
 * that pollute keyword matching with non-technical terms.
 */
export function stripBoilerplate(text: string): string {
  // Remove common EEO/legal sections that appear at the end of JDs
  const boilerplatePatterns = [
    // EEO statements
    /(?:^|\n)\s*(?:equal\s+(?:employment\s+)?opportunity|eeo|eeoc|we\s+are\s+an?\s+equal|affirmative\s+action)[^\n]*(?:\n(?!\s*(?:what|how|about|job|role|responsibilities|requirements|qualifications))[^\n]*)*/gi,
    // Diversity/inclusion boilerplate paragraphs
    /(?:^|\n)\s*(?:at\s+\w+,?\s+)?(?:we\s+(?:take\s+great\s+pride|value\s+diversity|are\s+(?:committed|proud)|celebrate|believe)\s+(?:in\s+)?(?:the\s+)?(?:diversity|inclusion|celebrating|equal|supporting))[^\n]*(?:\n(?!\s*(?:what|how|about|job|role|responsibilities|requirements|qualifications))[^\n]*)*/gi,
    // ADA/accommodation notices
    /(?:^|\n)\s*(?:reasonable\s+accommodations?|americans?\s+with\s+disabilities|ada\s+compliance)[^\n]*(?:\n[^\n]*)*/gi,
    // Applicant authorization / visa boilerplate
    /(?:^|\n)\s*(?:applicants?\s+must\s+be\s+(?:currently\s+)?authorized|the\s+company\s+will\s+not\s+sponsor)[^\n]*/gi,
    // Background check notices
    /(?:^|\n)\s*(?:background\s+check|drug\s+(?:test|screen)|pre-employment\s+screening)[^\n]*/gi,
    // Generic legal disclaimers
    /(?:^|\n)\s*(?:this\s+(?:job\s+)?(?:description|posting)\s+is\s+not\s+(?:intended\s+to\s+be\s+)?(?:an?\s+)?(?:exhaustive|comprehensive|all-inclusive))[^\n]*/gi,
  ];

  let cleaned = text;
  for (const pattern of boilerplatePatterns) {
    cleaned = cleaned.replace(pattern, '\n');
  }

  return cleaned.trim();
}

/**
 * Quick ATS Score - Strategic instant analysis (no AI needed)
 * Uses frequency-weighted keyword matching with context awareness
 */
export function calculateQuickATSScore(
  profile: MasterProfile | GeneratedProfile | ResumeProfile,
  jobDescription: string
): QuickATSScore {
  const profileSkills = extractProfileSkills(profile);
  const jdLower = jobDescription.toLowerCase();

  // Detect job domain (tech vs non-tech)
  const detectedJobDomain = detectJobDomain(jdLower);

  // Detect job background and check for mismatch with profile
  const detectedJobBackground = detectBackgroundFromJD(jobDescription);
  const profileBackground = extractProfileBackground(profile);
  const { backgroundMismatch, backgroundMismatchMessage } = checkBackgroundMismatch(
    profileBackground,
    detectedJobBackground
  );

  // Strip HR/EEO boilerplate before keyword extraction
  const cleanedJD = stripBoilerplate(jobDescription);

  // Extract keywords with frequency and position weighting
  const weightedKeywords = extractWeightedKeywords(cleanedJD);

  // Check if we have enough keywords for reliable scoring
  // Need at least 3 keywords to make a meaningful assessment
  const hasEnoughKeywords = weightedKeywords.length >= 3;

  // Extract seniority context from JD
  const { seniorityLevel: jdSeniority, yearsRequired } = extractSeniorityContext(jdLower);
  const profileSeniority = extractProfileSeniority(profile);

  const matched: string[] = [];
  const missing: string[] = [];
  const criticalMissing: string[] = [];

  let weightedScore = 0;
  let totalWeight = 0;

  for (const kw of weightedKeywords) {
    totalWeight += kw.weight;
    if (matchesSkill(kw.keyword, profileSkills)) {
      matched.push(kw.keyword);
      weightedScore += kw.weight;
    } else {
      missing.push(kw.keyword);
      // Critical if high weight (>=3) and in requirements section
      if (kw.weight >= 3 && kw.inRequirements) {
        criticalMissing.push(kw.keyword);
      }
    }
  }

  // Calculate base score from weighted keyword match
  // If not enough keywords, score is 0 (unable to analyze reliably)
  let score =
    totalWeight > 0 && hasEnoughKeywords ? Math.round((weightedScore / totalWeight) * 100) : 0;

  // Determine seniority match
  let seniorityMatch: 'match' | 'over' | 'under' | 'unknown' = 'unknown';
  if (jdSeniority && profileSeniority) {
    const levels = ['entry', 'mid', 'senior', 'lead', 'principal', 'staff', 'director'];
    const jdLevel = levels.indexOf(jdSeniority);
    const profileLevel = levels.indexOf(profileSeniority);

    if (jdLevel >= 0 && profileLevel >= 0) {
      if (Math.abs(jdLevel - profileLevel) <= 1) {
        seniorityMatch = 'match';
      } else if (profileLevel > jdLevel) {
        seniorityMatch = 'over';
        score = Math.min(score, 85); // Cap score if overqualified
      } else {
        seniorityMatch = 'under';
        score = Math.max(score - 15, 0); // Penalty for underqualified
      }
    }
  }

  // Bonus for matching experience years
  if (
    yearsRequired !== null &&
    'careerContext' in profile &&
    profile.careerContext?.yearsOfExperience
  ) {
    const profileYears = profile.careerContext.yearsOfExperience;
    if (profileYears >= yearsRequired) {
      score = Math.min(score + 5, 100);
    } else if (profileYears >= yearsRequired - 1) {
      // Close enough - no penalty
    } else {
      score = Math.max(score - 10, 0);
    }
  }

  const matchPercentage =
    weightedKeywords.length > 0 ? Math.round((matched.length / weightedKeywords.length) * 100) : 0;

  // Apply penalty for background mismatch
  if (backgroundMismatch) {
    score = Math.max(score - 20, 0); // Significant penalty for wrong background
  }

  // Collect warnings for the caller
  const warnings: string[] = [];
  if (!hasEnoughKeywords) {
    warnings.push('Too few keywords extracted from job description for reliable scoring');
  }

  return {
    score: Math.min(score, 95), // Cap at 95% - no resume is perfect
    matchedKeywords: matched,
    missingKeywords: missing,
    matchPercentage,
    tier: getTier(score),
    weightedKeywords,
    seniorityMatch,
    yearsRequired,
    criticalMissing,
    detectedJobDomain,
    hasEnoughKeywords,
    detectedJobBackground,
    backgroundMismatch,
    backgroundMismatchMessage,
    warnings,
  };
}

/**
 * Extract profile background from MasterProfile or GeneratedProfile
 */
function extractProfileBackground(
  profile: MasterProfile | GeneratedProfile | ResumeProfile
): BackgroundType | null {
  if ('backgroundConfig' in profile && profile.backgroundConfig?.background) {
    return profile.backgroundConfig.background;
  }

  // Try to infer from careerContext
  if ('careerContext' in profile && profile.careerContext?.primaryDomain) {
    const domain = profile.careerContext.primaryDomain.toLowerCase();
    if (
      domain.includes('software') ||
      domain.includes('engineer') ||
      domain.includes('developer') ||
      domain.includes('backend') ||
      domain.includes('frontend')
    ) {
      return 'computer-science';
    }
    if (
      domain.includes('data') &&
      (domain.includes('analyst') || domain.includes('analytics') || domain.includes('science'))
    ) {
      return 'data-analytics';
    }
    if (domain.includes('design') || domain.includes('ux') || domain.includes('ui')) {
      return 'design';
    }
    if (domain.includes('marketing') || domain.includes('content') || domain.includes('social')) {
      return 'marketing';
    }
    if (
      domain.includes('business') ||
      domain.includes('operations') ||
      domain.includes('project') ||
      domain.includes('product')
    ) {
      return 'mba-business';
    }
    if (
      domain.includes('mechanical') ||
      domain.includes('electrical') ||
      domain.includes('civil') ||
      domain.includes('manufacturing')
    ) {
      return 'engineering';
    }
    if (
      domain.includes('healthcare') ||
      domain.includes('medical') ||
      domain.includes('nursing') ||
      domain.includes('clinical') ||
      domain.includes('patient')
    ) {
      return 'healthcare';
    }
    if (
      domain.includes('finance') ||
      domain.includes('accounting') ||
      domain.includes('banking') ||
      domain.includes('investment')
    ) {
      return 'finance';
    }
    if (
      domain.includes('legal') ||
      domain.includes('lawyer') ||
      domain.includes('attorney') ||
      domain.includes('law')
    ) {
      return 'legal';
    }
    if (
      domain.includes('education') ||
      domain.includes('teaching') ||
      domain.includes('teacher') ||
      domain.includes('instructor')
    ) {
      return 'education';
    }
  }

  return null;
}

/**
 * Check for background mismatch between profile and job
 */
function checkBackgroundMismatch(
  profileBackground: BackgroundType | null,
  jobBackground: BackgroundType | null
): { backgroundMismatch: boolean; backgroundMismatchMessage?: string } {
  // If we can't determine either background, no mismatch detected
  if (!profileBackground || !jobBackground) {
    return { backgroundMismatch: false };
  }

  // Same background = no mismatch
  if (profileBackground === jobBackground) {
    return { backgroundMismatch: false };
  }

  // Check for related backgrounds (some overlap is acceptable)
  const relatedBackgrounds: Record<BackgroundType, BackgroundType[]> = {
    'computer-science': ['data-analytics', 'design'], // Devs sometimes do data or design
    'data-analytics': ['computer-science', 'mba-business'], // Data overlaps with CS and business
    'mba-business': ['marketing', 'finance'], // Business overlaps with marketing and finance
    marketing: ['mba-business', 'design'], // Marketing overlaps with business and design
    design: ['marketing', 'computer-science'], // Design overlaps with marketing and CS
    engineering: [], // Traditional engineering is quite specific
    healthcare: [], // Healthcare is specific
    finance: ['mba-business'], // Finance overlaps with business
    legal: [], // Legal is specific
    education: [], // Education is specific
    other: [], // No relations
  };

  const related = relatedBackgrounds[profileBackground] || [];
  if (related.includes(jobBackground)) {
    return { backgroundMismatch: false }; // Related backgrounds are okay
  }

  // Get human-readable names
  const profileConfig = getBackgroundConfig(profileBackground);
  const jobConfig = getBackgroundConfig(jobBackground);

  const profileName = profileConfig?.name || profileBackground;
  const jobName = jobConfig?.name || jobBackground;

  return {
    backgroundMismatch: true,
    backgroundMismatchMessage: `Your background is "${profileName}" but this job is "${jobName}". Skills may not transfer directly.`,
  };
}

/**
 * Detect if a job is tech or non-tech based on keywords
 */
function detectJobDomain(jdLower: string): 'tech' | 'non-tech' | 'unknown' {
  // Tech indicators
  const techIndicators = [
    'software',
    'engineer',
    'developer',
    'programming',
    'code',
    'api',
    'database',
    'frontend',
    'backend',
    'full stack',
    'devops',
    'cloud',
    'aws',
    'azure',
    'gcp',
    'react',
    'angular',
    'vue',
    'node',
    'python',
    'java',
    'javascript',
    'typescript',
    'kubernetes',
    'docker',
    'microservice',
    'machine learning',
    'data science',
    'artificial intelligence',
    'ml',
    'ai',
    'data engineer',
    'sre',
    'qa engineer',
    'test automation',
    'mobile developer',
    'ios',
    'android',
    'security engineer',
  ];

  // Non-tech indicators
  const nonTechIndicators = [
    'retail',
    'store',
    'cashier',
    'sales associate',
    'customer service',
    'warehouse',
    'driver',
    'delivery',
    'cook',
    'chef',
    'restaurant',
    'server',
    'bartender',
    'nurse',
    'nursing',
    'medical assistant',
    'pharmacy',
    'healthcare',
    'patient',
    'teacher',
    'instructor',
    'tutor',
    'education',
    'administrative assistant',
    'receptionist',
    'office manager',
    'accountant',
    'bookkeeper',
    'hr coordinator',
    'marketing coordinator',
    'sales representative',
    'account executive',
    'construction',
    'electrician',
    'plumber',
    'mechanic',
    'technician',
    'security guard',
    'janitor',
    'housekeeper',
    'cleaner',
    'landscaper',
  ];

  let techScore = 0;
  let nonTechScore = 0;

  for (const indicator of techIndicators) {
    if (jdLower.includes(indicator)) techScore++;
  }

  for (const indicator of nonTechIndicators) {
    if (jdLower.includes(indicator)) nonTechScore++;
  }

  // Require at least 2 indicators to make a determination
  if (techScore >= 2 && techScore > nonTechScore) return 'tech';
  if (nonTechScore >= 2 && nonTechScore > techScore) return 'non-tech';

  return 'unknown';
}

/**
 * Extract keywords with frequency-based weighting
 * Keywords mentioned more often = more important
 *
 * Uses the comprehensive keyword library from src/core/ats/keywords/
 * which includes: frontend, backend, database, devops, testing,
 * architecture, mobile, ml-ai, security, and data-analytics keywords.
 */
function extractWeightedKeywords(jobDescription: string): KeywordWithWeight[] {
  const text = jobDescription.toLowerCase();
  const keywordMap = new Map<string, KeywordWithWeight>();

  // Detect requirements section for position-based weighting
  const requirementsSection = extractRequirementsSection(text);

  // Get all patterns from the organized keyword library
  // This includes 1000+ keywords across all skill areas
  const libraryPatterns = getAllPatterns();

  // Merge with custom keywords from custom-keywords.ts (user-defined)
  const customPatterns = getCustomPatterns();
  const allPatterns = [...libraryPatterns, ...customPatterns];

  for (const [pattern, keyword] of allPatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      const frequency = matches.length;
      pattern.lastIndex = 0; // Reset after .match() to avoid stale lastIndex
      const inRequirements = requirementsSection ? pattern.test(requirementsSection) : false;

      // Calculate weight: base 1 + frequency bonus + requirements bonus
      let weight = 1;
      weight += Math.min(frequency - 1, 2); // +1 for each repeat, max +2
      if (inRequirements) weight += 2; // +2 if in requirements section

      keywordMap.set(keyword, {
        keyword,
        weight: Math.min(weight, 5), // Cap at 5
        frequency,
        inRequirements,
      });
    }
  }

  // Auto-detect additional tech keywords not in predefined patterns
  const autoDetectedKeywords = autoExtractTechKeywords(jobDescription, keywordMap);
  for (const kw of autoDetectedKeywords) {
    if (!keywordMap.has(kw.keyword)) {
      keywordMap.set(kw.keyword, kw);
    }
  }

  // Sort by weight (most important first)
  return Array.from(keywordMap.values()).sort((a, b) => b.weight - a.weight);
}

/**
 * Auto-extract technology keywords from JD that aren't in predefined patterns
 * Looks for: capitalized tech names, acronyms, version patterns, tech suffixes
 */
function autoExtractTechKeywords(
  jobDescription: string,
  existingKeywords: Map<string, KeywordWithWeight>
): KeywordWithWeight[] {
  const detected: KeywordWithWeight[] = [];
  const existingLower = new Set([...existingKeywords.keys()].map((k) => k.toLowerCase()));
  const text = jobDescription;

  // Common words to ignore (not tech terms)
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'you',
    'your',
    'our',
    'this',
    'that',
    'will',
    'are',
    'have',
    'has',
    'been',
    'being',
    'their',
    'them',
    'they',
    'what',
    'when',
    'where',
    'which',
    'who',
    'how',
    'all',
    'each',
    'every',
    'both',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'under',
    'about',
    'team',
    'work',
    'working',
    'experience',
    'years',
    'required',
    'preferred',
    'strong',
    'good',
    'excellent',
    'ability',
    'skills',
    'knowledge',
    'understanding',
    'proficiency',
    'familiar',
    'familiarity',
    'minimum',
    'must',
    'should',
    'would',
    'could',
    'can',
    'may',
    'might',
    'shall',
    'looking',
    'seeking',
    'join',
    'opportunity',
    'role',
    'position',
    'job',
    'company',
    'organization',
    'business',
    'industry',
    'market',
    'client',
    'customer',
    'user',
    'project',
    'product',
    'service',
    'solution',
    'develop',
    'development',
    'developer',
    'engineer',
    'engineering',
    'design',
    'designer',
    'build',
    'building',
    'create',
    'creating',
    'implement',
    'implementation',
    'maintain',
    'maintenance',
    'support',
    'manage',
    'management',
    'lead',
    'leading',
    'senior',
    'junior',
    'mid',
    'level',
    'plus',
    'bonus',
    'nice',
    'equal',
    'employer',
    'opportunity',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'january',
    'february',
    'march',
    'april',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
    'remote',
    'onsite',
    'hybrid',
    'full',
    'time',
    'part',
    'contract',
    'permanent',
    'salary',
    'benefits',
    // HR/EEO/legal terms that leak through
    'diversity',
    'inclusion',
    'inclusive',
    'belonging',
    'equity',
    'accommodation',
    'accommodations',
    'disability',
    'disabilities',
    'affirmative',
    'discrimination',
    'harassment',
    'veteran',
    'veterans',
    'gender',
    'race',
    'ethnicity',
    'religion',
    'orientation',
    'identity',
    'protected',
    'status',
    'applicant',
    'applicants',
    'authorize',
    'authorized',
    'sponsor',
    'sponsorship',
    'visa',
    'citizenship',
    'comply',
    'compliance',
    'background',
    'screening',
    'check',
    'drug',
    'test',
  ]);

  // Pattern 1: Capitalized technology names (e.g., "Splunk", "Terraform", "Airflow")
  // Must be followed by technical context words
  const capitalizedPattern = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)*)\b/g;
  let match;
  while ((match = capitalizedPattern.exec(text)) !== null) {
    const word = match[1];
    const wordLower = word.toLowerCase();

    // Skip if already detected, is a stop word, or too short
    if (existingLower.has(wordLower) || stopWords.has(wordLower) || word.length < 3) {
      continue;
    }

    // Check if it appears in a technical context
    const contextPattern = new RegExp(
      `\\b${word}\\b[\\s,]*(experience|knowledge|skills?|proficiency|developer|engineer|framework|library|platform|tool|system|database|server|integration|api|sdk)?`,
      'gi'
    );
    const contextMatches = text.match(contextPattern);

    if (contextMatches && contextMatches.length > 0) {
      const frequency = (text.match(new RegExp(`\\b${word}\\b`, 'gi')) || []).length;
      if (frequency >= 1) {
        detected.push({
          keyword: word,
          weight: Math.min(frequency, 3), // Lower weight for auto-detected
          frequency,
          inRequirements: false,
        });
        existingLower.add(wordLower);
      }
    }
  }

  // Pattern 2: Acronyms (2-5 uppercase letters like "AWS", "GCP", "ETL", "CICD")
  const acronymPattern = /\b([A-Z]{2,5})\b/g;
  while ((match = acronymPattern.exec(text)) !== null) {
    const acronym = match[1];
    const acronymLower = acronym.toLowerCase();

    // Skip common non-tech acronyms
    const skipAcronyms = new Set([
      'USA',
      'USD',
      'CEO',
      'CTO',
      'CFO',
      'COO',
      'HR',
      'IT',
      'PM',
      'QA',
      'BA',
      'UI',
      'UX',
      'EEO',
      'EEOC',
      'ADA',
      'OFCCP',
      'EOE',
      'AA',
      'FLSA',
      'FMLA',
    ]);
    if (existingLower.has(acronymLower) || skipAcronyms.has(acronym) || acronym.length < 2) {
      continue;
    }

    const frequency = (text.match(new RegExp(`\\b${acronym}\\b`, 'g')) || []).length;
    if (frequency >= 2) {
      // Acronyms need at least 2 mentions
      detected.push({
        keyword: acronym,
        weight: Math.min(frequency, 3),
        frequency,
        inRequirements: false,
      });
      existingLower.add(acronymLower);
    }
  }

  // Pattern 3: Tech with version numbers (e.g., "Java 11", "Python 3.9", "ES6")
  const versionPattern = /\b([A-Za-z]+)\s*(\d+(?:\.\d+)?)\b/g;
  while ((match = versionPattern.exec(text)) !== null) {
    const tech = match[1];
    const version = match[2];
    const combined = `${tech} ${version}`;
    const combinedLower = combined.toLowerCase();

    if (
      existingLower.has(combinedLower) ||
      existingLower.has(tech.toLowerCase()) ||
      tech.length < 2
    ) {
      continue;
    }

    // Only include if the tech name looks like a technology
    if (
      /^[A-Z]/.test(tech) ||
      ['java', 'python', 'node', 'es', 'php', 'go', 'ruby'].includes(tech.toLowerCase())
    ) {
      detected.push({
        keyword: combined,
        weight: 2,
        frequency: 1,
        inRequirements: false,
      });
      existingLower.add(combinedLower);
    }
  }

  // Pattern 4: Tech suffixes (.js, .io, DB, MQ, etc.)
  const suffixPattern = /\b([A-Za-z]+(?:\.js|\.io|\.net|\.py|DB|MQ|SQL|API|SDK|CLI))\b/gi;
  while ((match = suffixPattern.exec(text)) !== null) {
    const word = match[1];
    const wordLower = word.toLowerCase();

    if (existingLower.has(wordLower) || word.length < 3) {
      continue;
    }

    const frequency = (
      text.match(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')) || []
    ).length;
    detected.push({
      keyword: word,
      weight: Math.min(frequency + 1, 3),
      frequency,
      inRequirements: false,
    });
    existingLower.add(wordLower);
  }

  // Pattern 5: Compound tech names (camelCase or hyphenated)
  const compoundPattern = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+|[a-z]+(?:-[a-z]+)+)\b/g;
  while ((match = compoundPattern.exec(text)) !== null) {
    const word = match[1];
    const wordLower = word.toLowerCase();

    if (existingLower.has(wordLower) || stopWords.has(wordLower) || word.length < 4) {
      continue;
    }

    // Check frequency
    const frequency = (
      text.match(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')) || []
    ).length;
    if (frequency >= 1) {
      detected.push({
        keyword: word,
        weight: Math.min(frequency, 2),
        frequency,
        inRequirements: false,
      });
      existingLower.add(wordLower);
    }
  }

  return detected;
}

/**
 * Extract the requirements/qualifications section for position-based weighting
 */
function extractRequirementsSection(text: string): string | null {
  // Common section headers
  const patterns = [
    /requirements?:?\s*([\s\S]*?)(?=responsibilities|about|benefits|what we offer|$)/i,
    /qualifications?:?\s*([\s\S]*?)(?=responsibilities|about|benefits|what we offer|$)/i,
    /what you'll need:?\s*([\s\S]*?)(?=responsibilities|about|benefits|what we offer|$)/i,
    /must have:?\s*([\s\S]*?)(?=nice to have|preferred|responsibilities|$)/i,
    /required skills?:?\s*([\s\S]*?)(?=preferred|nice to have|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Extract seniority level and years required from JD
 */
function extractSeniorityContext(jdLower: string): {
  seniorityLevel: string | null;
  yearsRequired: number | null;
} {
  // Extract years of experience
  const yearsPatterns = [
    /(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)/i,
    /(?:experience|exp)\s*(?:of\s*)?(\d+)\+?\s*(?:years?|yrs?)/i,
    /minimum\s*(?:of\s*)?(\d+)\s*(?:years?|yrs?)/i,
  ];

  let yearsRequired: number | null = null;
  for (const pattern of yearsPatterns) {
    const match = jdLower.match(pattern);
    if (match) {
      yearsRequired = parseInt(match[1], 10);
      break;
    }
  }

  // Extract seniority level
  let seniorityLevel: string | null = null;
  if (/\b(principal|staff)\b/i.test(jdLower)) {
    seniorityLevel = 'principal';
  } else if (/\b(director|head of)\b/i.test(jdLower)) {
    seniorityLevel = 'director';
  } else if (/\b(lead|tech lead|team lead)\b/i.test(jdLower)) {
    seniorityLevel = 'lead';
  } else if (/\bsenior\b/i.test(jdLower)) {
    seniorityLevel = 'senior';
  } else if (/\b(mid[\s-]?level|intermediate)\b/i.test(jdLower)) {
    seniorityLevel = 'mid';
  } else if (/\b(junior|entry[\s-]?level|associate)\b/i.test(jdLower)) {
    seniorityLevel = 'entry';
  } else if (yearsRequired !== null) {
    // Infer from years
    if (yearsRequired >= 10) seniorityLevel = 'principal';
    else if (yearsRequired >= 7) seniorityLevel = 'lead';
    else if (yearsRequired >= 5) seniorityLevel = 'senior';
    else if (yearsRequired >= 2) seniorityLevel = 'mid';
    else seniorityLevel = 'entry';
  }

  return { seniorityLevel, yearsRequired };
}

/**
 * Extract profile seniority level
 */
function extractProfileSeniority(
  profile: MasterProfile | GeneratedProfile | ResumeProfile
): string | null {
  if ('careerContext' in profile && profile.careerContext?.seniorityLevel) {
    const level = profile.careerContext.seniorityLevel.toLowerCase();
    if (level.includes('principal') || level.includes('staff')) return 'principal';
    if (level.includes('director')) return 'director';
    if (level.includes('lead')) return 'lead';
    if (level.includes('senior')) return 'senior';
    if (level.includes('mid')) return 'mid';
    if (level.includes('junior') || level.includes('entry')) return 'entry';
    return level;
  }

  // Infer from years of experience
  if ('careerContext' in profile && profile.careerContext?.yearsOfExperience) {
    const years = profile.careerContext.yearsOfExperience;
    if (years >= 10) return 'principal';
    if (years >= 7) return 'lead';
    if (years >= 5) return 'senior';
    if (years >= 2) return 'mid';
    return 'entry';
  }

  return null;
}

/**
 * Deep ATS Score - Strategic AI-powered analysis
 * Uses the same 3-step approach as resume optimization
 */
export async function calculateDeepATSScore(
  profile: MasterProfile | GeneratedProfile,
  job: ExtractedJob,
  aiService: AIService
): Promise<DeepATSScore> {
  // Start with quick score
  const quickScore = calculateQuickATSScore(profile, job.description);

  // Build profile context for AI
  const profileContext = buildProfileContext(profile);

  // Strategic prompt that thinks like a hiring manager
  const prompt = `You are a senior hiring manager at ${job.company || 'a tech company'} evaluating a candidate for the "${job.title}" role.

## YOUR MINDSET
Think about what you REALLY need for this role, not just keyword matching:
- What business problem will this person solve?
- What's the #1 thing that would make them successful?
- What gaps are dealbreakers vs. learnable?

## CANDIDATE PROFILE
${profileContext}

## JOB DESCRIPTION
${job.description}

## INITIAL KEYWORD ANALYSIS
- Matched (${quickScore.matchedKeywords.length}): ${quickScore.matchedKeywords.slice(0, 10).join(', ')}
- Missing (${quickScore.missingKeywords.length}): ${quickScore.missingKeywords.slice(0, 10).join(', ')}
- Critical Missing: ${quickScore.criticalMissing.slice(0, 5).join(', ') || 'None identified'}
- Seniority Match: ${quickScore.seniorityMatch}
- Years Required: ${quickScore.yearsRequired ?? 'Not specified'}

## YOUR ANALYSIS TASK
Think step by step:

1. REAL FIT: Beyond keywords, does this person's trajectory match what we need?
2. EXPERIENCE DEPTH: Do they have relevant scale/complexity, not just the technologies?
3. GROWTH POTENTIAL: Can they grow into this role if slightly under-qualified?
4. RED FLAGS: What concerns would make you hesitate?
5. COMPETITIVE POSITION: How do they compare to typical applicants you see?

Return a JSON object:
{
  "overallScore": 0-100 (be honest - 70+ means you'd interview them),
  "skillMatchScore": 0-100,
  "experienceMatchScore": 0-100 (depth + scale, not just keywords),
  "cultureFitScore": 0-100 (inferred from writing style, career choices),
  "strengths": ["What makes this candidate stand out (be specific)", "...", "..."],
  "gaps": ["Honest gaps that matter for THIS role", "..."],
  "suggestions": [
    "Specific action to improve chances (not generic advice)",
    "How to address the biggest gap",
    "What to emphasize in the interview"
  ],
  "prioritizedActions": [
    {"priority": "high", "action": "Most impactful thing to do NOW", "impact": "Why this matters"},
    {"priority": "medium", "action": "...", "impact": "..."}
  ],
  "competitivePosition": "One sentence: where they stand vs typical applicant pool",
  "aiAnalysis": "2-3 sentences: honest assessment a recruiter would give their colleague"
}

Be direct and honest. Inflated scores waste everyone's time.`;

  try {
    const response = await aiService.chat([{ role: 'user', content: prompt }], {
      temperature: 0.3,
      maxTokens: 1500,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const aiResult = JSON.parse(jsonMatch[0]);

    return {
      ...quickScore,
      score: aiResult.overallScore || quickScore.score,
      overallScore: aiResult.overallScore || quickScore.score,
      skillMatchScore: aiResult.skillMatchScore || quickScore.matchPercentage,
      experienceMatchScore: aiResult.experienceMatchScore || 50,
      cultureFitScore: aiResult.cultureFitScore || 50,
      strengths: aiResult.strengths || [],
      gaps: aiResult.gaps || [],
      suggestions: aiResult.suggestions || [],
      prioritizedActions: aiResult.prioritizedActions || [],
      competitivePosition: aiResult.competitivePosition || 'Unable to assess',
      aiAnalysis: aiResult.aiAnalysis || 'Analysis unavailable',
      tier: getTier(aiResult.overallScore || quickScore.score),
    };
  } catch (error) {
    console.error('Deep ATS analysis failed:', error);
    // Return enhanced quick score as fallback
    return {
      ...quickScore,
      overallScore: quickScore.score,
      skillMatchScore: quickScore.matchPercentage,
      experienceMatchScore: 50,
      cultureFitScore: 50,
      strengths: quickScore.matchedKeywords.length > 5 ? ['Strong keyword alignment'] : [],
      gaps: quickScore.missingKeywords.length > 5 ? ['Several required skills missing'] : [],
      suggestions: quickScore.missingKeywords
        .slice(0, 3)
        .map((kw) => `Consider adding ${kw} to your resume`),
      prioritizedActions: quickScore.missingKeywords.slice(0, 2).map((kw) => ({
        priority: 'high' as const,
        action: `Add ${kw} to your skills`,
        impact: 'Improved keyword matching',
      })),
      competitivePosition: 'Unable to assess without AI analysis',
      aiAnalysis: 'AI analysis unavailable. Based on keyword matching, this is the assessment.',
    };
  }
}

/**
 * Extract skills from different profile types
 */
function extractProfileSkills(
  profile: MasterProfile | GeneratedProfile | ResumeProfile
): Set<string> {
  const skills = new Set<string>();

  if ('skills' in profile && profile.skills) {
    // MasterProfile
    if ('technical' in profile.skills && Array.isArray(profile.skills.technical)) {
      if (typeof profile.skills.technical[0] === 'string') {
        // ResumeProfile format
        (profile.skills.technical as string[]).forEach((s) => skills.add(s.toLowerCase()));
      } else {
        // MasterProfile format with SkillDetail
        (profile.skills.technical as SkillDetail[]).forEach((s) => {
          skills.add(s.name.toLowerCase());
          skills.add(s.normalizedName.toLowerCase());
          s.aliases?.forEach((a) => skills.add(a.toLowerCase()));
        });
      }
    }

    if ('tools' in profile.skills && Array.isArray(profile.skills.tools)) {
      if (typeof profile.skills.tools[0] === 'string') {
        (profile.skills.tools as string[]).forEach((s) => skills.add(s.toLowerCase()));
      } else {
        (profile.skills.tools as SkillDetail[]).forEach((s) => {
          skills.add(s.name.toLowerCase());
        });
      }
    }

    if ('frameworks' in profile.skills && Array.isArray(profile.skills.frameworks)) {
      (profile.skills.frameworks as SkillDetail[]).forEach((s) => {
        skills.add(s.name.toLowerCase());
      });
    }
  }

  // GeneratedProfile
  if ('highlightedSkills' in profile && Array.isArray(profile.highlightedSkills)) {
    profile.highlightedSkills.forEach((s) => skills.add(s.toLowerCase()));
  }

  if ('atsKeywords' in profile && Array.isArray(profile.atsKeywords)) {
    profile.atsKeywords.forEach((s) => skills.add(s.toLowerCase()));
  }

  return skills;
}

/**
 * Check if a keyword matches any skill
 * Uses the comprehensive keyword library for variation matching
 */
function matchesSkill(keyword: string, skills: Set<string>): boolean {
  const lower = keyword.toLowerCase();

  // Direct match
  if (skills.has(lower)) {
    return true;
  }

  // Try to find keyword in our comprehensive library
  const keywordEntry = findKeywordByName(keyword);
  if (keywordEntry) {
    // Check if any variation matches a skill
    const allVariations = [
      keywordEntry.name.toLowerCase(),
      ...keywordEntry.variations.map((v) => v.toLowerCase()),
    ];
    for (const variation of allVariations) {
      if (skills.has(variation)) {
        return true;
      }
    }
  }

  // Merge custom variations from custom-keywords.ts
  const customVars = getCustomVariations();
  for (const [main, alts] of Object.entries(customVars)) {
    if (lower === main || alts.includes(lower)) {
      if (skills.has(main) || alts.some((a) => skills.has(a))) {
        return true;
      }
    }
  }

  // Fallback: Core variations for common aliases not fully covered elsewhere
  const coreVariations: Record<string, string[]> = {
    javascript: ['js', 'es6', 'ecmascript'],
    typescript: ['ts'],
    'c#': ['csharp', 'dotnet'],
    'c++': ['cpp'],
    python: ['py', 'python3'],
    golang: ['go'],
    'node.js': ['node', 'nodejs'],
    postgresql: ['postgres', 'psql'],
    kubernetes: ['k8s'],
    'ci/cd': ['cicd', 'ci cd'],
    'machine learning': ['ml'],
    'deep learning': ['dl'],
    'rest api': ['restful', 'rest'],
    microservices: ['micro services'],
  };

  for (const [main, alts] of Object.entries(coreVariations)) {
    if (lower === main || alts.includes(lower)) {
      if (skills.has(main) || alts.some((a) => skills.has(a))) {
        return true;
      }
    }
  }

  // Partial match for compound skills (but require minimum 3 chars to avoid false positives)
  if (lower.length >= 3) {
    for (const skill of skills) {
      if (skill.length >= 3 && (skill.includes(lower) || lower.includes(skill))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get score tier
 */
function getTier(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

/**
 * Build profile context for AI prompt
 */
function buildProfileContext(profile: MasterProfile | GeneratedProfile): string {
  if ('careerContext' in profile && profile.careerContext) {
    // MasterProfile
    const mp = profile as MasterProfile;
    return `
Name: ${mp.personal?.fullName || 'Unknown'}
Years of Experience: ${mp.careerContext?.yearsOfExperience || 0}
Seniority: ${mp.careerContext?.seniorityLevel || 'Unknown'}
Primary Domain: ${mp.careerContext?.primaryDomain || 'Unknown'}
Top Skills: ${
      mp.skills?.technical
        ?.slice(0, 15)
        .map((s) => (typeof s === 'string' ? s : s.name))
        .join(', ') || 'N/A'
    }
Key Strengths: ${mp.careerContext?.strengthAreas?.join(', ') || 'N/A'}
`.trim();
  } else {
    // GeneratedProfile
    const gp = profile as GeneratedProfile;
    return `
Target Role: ${gp.targetRole}
Profile: ${gp.name}
Summary: ${gp.tailoredSummary}
Highlighted Skills: ${gp.highlightedSkills?.join(', ') || 'N/A'}
ATS Keywords: ${gp.atsKeywords?.join(', ') || 'N/A'}
`.trim();
  }
}

/**
 * Get score color for UI
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return '#22c55e'; // green
  if (score >= 60) return '#eab308'; // yellow
  if (score >= 40) return '#f97316'; // orange
  return '#ef4444'; // red
}

/**
 * Get actionable recommendations based on quick score
 * Uses strategic data for better recommendations
 */
export function getQuickRecommendations(quickScore: QuickATSScore): string[] {
  const recommendations: string[] = [];

  // Warning for background mismatch (highest priority)
  if (quickScore.backgroundMismatch && quickScore.backgroundMismatchMessage) {
    recommendations.push(`⚠️ Background Mismatch: ${quickScore.backgroundMismatchMessage}`);
  }

  // Warning if not enough keywords to analyze
  if (!quickScore.hasEnoughKeywords) {
    recommendations.push(
      'Unable to analyze reliably - not enough recognizable keywords in the job description.'
    );

    // Additional context based on detected domain
    if (quickScore.detectedJobDomain === 'non-tech') {
      recommendations.push(
        'This appears to be a non-tech role. Our analysis works best with tech/IT positions.'
      );
    } else if (quickScore.detectedJobDomain === 'unknown') {
      recommendations.push('Could not determine the job type. Consider reviewing manually.');
    }

    return recommendations;
  }

  // Critical missing keywords are highest priority
  if (quickScore.criticalMissing.length > 0) {
    recommendations.push(
      `Critical: Add these required skills: ${quickScore.criticalMissing.slice(0, 3).join(', ')}`
    );
  }

  // Seniority mismatch advice
  if (quickScore.seniorityMatch === 'under') {
    recommendations.push(
      'This role may require more experience. Highlight leadership and impact in your current role.'
    );
  } else if (quickScore.seniorityMatch === 'over') {
    recommendations.push(
      'You may be overqualified. Consider if this aligns with your career goals, or emphasize your interest in the specific challenges.'
    );
  }

  // Years of experience advice
  if (quickScore.yearsRequired !== null) {
    recommendations.push(
      `This role requires ${quickScore.yearsRequired}+ years of experience. Make sure your timeline is clearly visible.`
    );
  }

  // General keyword advice
  if (quickScore.missingKeywords.length > 0 && quickScore.criticalMissing.length === 0) {
    const topMissing = quickScore.missingKeywords.slice(0, 3);
    recommendations.push(`Consider adding: ${topMissing.join(', ')}`);
  }

  // Tier-specific advice
  if (quickScore.tier === 'excellent') {
    recommendations.push(
      'Strong match! Focus on quantifying achievements and showing impact at scale.'
    );
  } else if (quickScore.tier === 'poor') {
    recommendations.push(
      'Low match - consider if this role aligns with your experience, or heavily tailor your resume.'
    );
  }

  return recommendations;
}
