/**
 * Layered ATS Scorer
 *
 * 4-Layer intelligent scoring system:
 * Layer 0: Background Detection (CS, Data, MBA, etc.)
 * Layer 1: Role Detection (Full Stack, Backend, Data Analyst, etc.)
 * Layer 2: Skill Area Detection & Weighting (Frontend 40%, Backend 50%, etc.)
 * Layer 3: Keyword Matching (within relevant skill areas only)
 *
 * Benefits:
 * - 60% fewer pattern checks (only relevant areas)
 * - Skill area breakdown (see WHERE you're weak)
 * - Better recommendations (actionable insights)
 * - Helps resume optimization (know what to emphasize)
 */

import type {
  MasterProfile,
  GeneratedProfile,
  SkillDetail,
} from '@shared/types/master-profile.types';
import type { ResumeProfile } from '@shared/types/profile.types';
import type {
  BackgroundType,
  LayeredATSResult,
  SkillAreaScore,
  KeywordMatch,
} from '@shared/types/background.types';
import {
  BACKGROUND_CONFIGS,
  getBackgroundConfig,
  getRoleConfig,
} from '@shared/types/background.types';
import { getPatternsForSkillArea, getKeywordsForSkillArea } from './keywords';
import { stripBoilerplate } from './hybrid-scorer';

// ============================================
// SKILL AREA INDICATORS
// ============================================

/**
 * Keywords that indicate a skill area is needed in the JD
 * Used for Layer 2 detection
 */
const SKILL_AREA_INDICATORS: Record<string, string[]> = {
  // === TECH SKILL AREAS ===
  frontend: [
    'react',
    'angular',
    'vue',
    'frontend',
    'front-end',
    'front end',
    'html',
    'css',
    'javascript',
    'typescript',
    'ui',
    'user interface',
    'responsive',
    'spa',
    'single page',
    'web app',
    'browser',
    'dom',
    'redux',
    'next.js',
    'nextjs',
    'tailwind',
    'sass',
    'scss',
  ],
  backend: [
    'backend',
    'back-end',
    'back end',
    'server',
    'api',
    'rest',
    'graphql',
    'microservice',
    'java',
    'python',
    'node',
    'golang',
    'go',
    'spring',
    'django',
    'flask',
    'express',
    'php',
    'laravel',
    'ruby',
    'rails',
    '.net',
    'c#',
    'scala',
    'kotlin',
    'rust',
    'service',
  ],
  database: [
    'database',
    'sql',
    'mysql',
    'postgresql',
    'postgres',
    'mongodb',
    'redis',
    'elasticsearch',
    'dynamodb',
    'oracle',
    'sql server',
    'nosql',
    'data model',
    'query',
    'stored procedure',
    'index',
    'cassandra',
    'firebase',
    'rds',
    'aurora',
  ],
  devops: [
    'devops',
    'docker',
    'kubernetes',
    'k8s',
    'aws',
    'azure',
    'gcp',
    'cloud',
    'ci/cd',
    'cicd',
    'jenkins',
    'terraform',
    'ansible',
    'deploy',
    'infrastructure',
    'linux',
    'pipeline',
    'github actions',
    'gitlab',
    'helm',
    'monitoring',
    'prometheus',
    'grafana',
  ],
  testing: [
    'test',
    'testing',
    'qa',
    'quality',
    'selenium',
    'cypress',
    'jest',
    'junit',
    'pytest',
    'automation',
    'tdd',
    'bdd',
    'unit test',
    'integration test',
    'e2e',
    'end-to-end',
    'coverage',
    'mock',
  ],
  architecture: [
    'architect',
    'architecture',
    'system design',
    'scalab',
    'distributed',
    'microservice',
    'design pattern',
    'solid',
    'ddd',
    'domain driven',
    'event driven',
    'cqrs',
    'high availability',
    'performance',
  ],
  mobile: [
    'mobile',
    'ios',
    'android',
    'react native',
    'flutter',
    'swift',
    'kotlin',
    'xamarin',
    'app store',
    'play store',
    'mobile app',
    'native app',
    'hybrid app',
    'cordova',
    'capacitor',
  ],
  'ml-ai': [
    'machine learning',
    'ml',
    'ai',
    'artificial intelligence',
    'deep learning',
    'tensorflow',
    'pytorch',
    'nlp',
    'natural language',
    'computer vision',
    'model',
    'neural network',
    'llm',
    'gpt',
    'generative',
    'data science',
  ],
  security: [
    'security',
    'oauth',
    'authentication',
    'authorization',
    'encrypt',
    'owasp',
    'vulnerability',
    'penetration',
    'ssl',
    'tls',
    'jwt',
    'sso',
    'identity',
    'compliance',
    'gdpr',
    'soc2',
  ],
  'data-analytics': [
    'analytics',
    'tableau',
    'power bi',
    'looker',
    'dashboard',
    'report',
    'bi',
    'business intelligence',
    'visualization',
    'insight',
    'metric',
    'kpi',
    'excel',
    'data analyst',
    'etl',
    'warehouse',
  ],

  // === NON-TECH SKILL AREAS ===
  'retail-operations': [
    'retail',
    'store',
    'merchandis',
    'inventory',
    'pos',
    'point of sale',
    'cash register',
    'cashier',
    'front end',
    'check stand',
    'checkout',
    'shrink',
    'loss prevention',
    'planogram',
    'stock',
    'replenish',
    'pricing',
    'markdown',
    'promotion',
    'display',
    'shelf',
  ],
  'customer-service': [
    'customer service',
    'customer experience',
    'customer satisfaction',
    'client service',
    'customer support',
    'call center',
    'help desk',
    'complaint',
    'resolution',
    'escalation',
    'customer relations',
    'service recovery',
    'nps',
    'csat',
    'customer feedback',
  ],
  'management-leadership': [
    'manage',
    'manager',
    'supervisor',
    'lead',
    'leadership',
    'team lead',
    'direct report',
    'coach',
    'mentor',
    'train',
    'develop',
    'performance review',
    'hiring',
    'staffing',
    'scheduling',
    'delegate',
    'motivate',
    'conflict resolution',
    'decision making',
    'accountability',
  ],
  operations: [
    'operations',
    'process',
    'procedure',
    'workflow',
    'efficiency',
    'productivity',
    'logistics',
    'supply chain',
    'vendor',
    'compliance',
    'audit',
    'quality control',
    'sop',
    'standard operating',
    'kpi',
    'continuous improvement',
    'lean',
    'six sigma',
    'optimization',
  ],
  'finance-accounting': [
    'accounting',
    'finance',
    'budget',
    'forecast',
    'p&l',
    'profit',
    'revenue',
    'expense',
    'cost control',
    'financial report',
    'audit',
    'accounts payable',
    'accounts receivable',
    'reconciliation',
    'ledger',
    'gaap',
    'quickbooks',
    'sap',
    'erp',
    'invoice',
    'billing',
  ],
  'sales-marketing': [
    'sales',
    'selling',
    'revenue',
    'quota',
    'target',
    'pipeline',
    'lead generation',
    'prospecting',
    'closing',
    'negotiation',
    'crm',
    'salesforce',
    'marketing',
    'campaign',
    'brand',
    'promotion',
    'digital marketing',
    'seo',
    'social media',
    'content',
    'advertising',
  ],
  'human-resources': [
    'hr',
    'human resources',
    'recruiting',
    'talent acquisition',
    'onboarding',
    'employee relations',
    'benefits',
    'compensation',
    'payroll',
    'hris',
    'performance management',
    'training',
    'development',
    'engagement',
    'retention',
    'succession planning',
    'labor law',
    'eeoc',
  ],
  healthcare: [
    'patient',
    'clinical',
    'medical',
    'healthcare',
    'health care',
    'nursing',
    'physician',
    'diagnosis',
    'treatment',
    'care plan',
    'hipaa',
    'ehr',
    'emr',
    'epic',
    'cerner',
    'pharmacy',
    'lab',
    'vital signs',
    'medication',
    'charting',
    'bedside',
  ],
  administrative: [
    'administrative',
    'admin',
    'office',
    'clerical',
    'reception',
    'calendar',
    'scheduling',
    'correspondence',
    'filing',
    'data entry',
    'microsoft office',
    'word',
    'excel',
    'powerpoint',
    'outlook',
    'typing',
    'phone',
    'meeting',
    'travel arrangement',
    'expense report',
  ],
};

// ============================================
// INTERFACES
// ============================================

export interface SkillAreaWeight {
  areaId: string;
  areaName: string;
  weight: number; // 0-100, how much this area matters in the JD
  mentions: number; // How many times area keywords were found
  isRequired: boolean; // If mentioned in requirements section
}

export interface LayeredScoreInput {
  profile: MasterProfile | GeneratedProfile | ResumeProfile;
  jobDescription: string;
  jobTitle?: string;
}

// ============================================
// LAYER 0: BACKGROUND DETECTION
// ============================================

/**
 * Detect the professional background from JD
 * This is the first filter - if background doesn't match, score is lower
 */
export function detectBackground(jobDescription: string): {
  background: BackgroundType | null;
  confidence: number;
  indicators: string[];
} {
  const jdLower = jobDescription.toLowerCase();
  const results: { bg: BackgroundType; score: number; matched: string[] }[] = [];

  for (const config of BACKGROUND_CONFIGS) {
    const matched: string[] = [];
    for (const indicator of config.indicators) {
      if (jdLower.includes(indicator.toLowerCase())) {
        matched.push(indicator);
      }
    }
    if (matched.length > 0) {
      results.push({ bg: config.id, score: matched.length, matched });
    }
  }

  if (results.length === 0) {
    return { background: null, confidence: 0, indicators: [] };
  }

  // Sort by score, get best match
  results.sort((a, b) => b.score - a.score);
  const best = results[0];

  // Confidence based on how dominant the match is
  const confidence =
    results.length === 1 ? 1 : best.score / (best.score + (results[1]?.score || 0));

  return {
    background: best.bg,
    confidence,
    indicators: best.matched,
  };
}

// ============================================
// LAYER 1: ROLE DETECTION
// ============================================

/**
 * Detect the specific role from JD within a background
 */
export function detectRole(
  background: BackgroundType,
  jobDescription: string,
  jobTitle?: string
): {
  roleId: string | null;
  roleName: string | null;
  confidence: number;
} {
  const bgConfig = getBackgroundConfig(background);
  if (!bgConfig || bgConfig.roles.length === 0) {
    return { roleId: null, roleName: null, confidence: 0 };
  }

  const jdLower = jobDescription.toLowerCase();
  const titleLower = (jobTitle || '').toLowerCase();
  const results: { roleId: string; roleName: string; score: number }[] = [];

  for (const role of bgConfig.roles) {
    let score = 0;

    // Check job title first (high weight)
    for (const indicator of role.indicators) {
      if (titleLower.includes(indicator.toLowerCase())) {
        score += 3;
      }
    }

    // Check JD content
    for (const indicator of role.indicators) {
      if (jdLower.includes(indicator.toLowerCase())) {
        score += 1;
      }
    }

    if (score > 0) {
      results.push({ roleId: role.id, roleName: role.name, score });
    }
  }

  if (results.length === 0) {
    // Default to first role in background
    const defaultRole = bgConfig.roles[0];
    return {
      roleId: defaultRole?.id || null,
      roleName: defaultRole?.name || null,
      confidence: 0.3,
    };
  }

  results.sort((a, b) => b.score - a.score);
  const best = results[0];
  const confidence = Math.min(best.score / 5, 1); // Max confidence at 5+ matches

  return {
    roleId: best.roleId,
    roleName: best.roleName,
    confidence,
  };
}

// ============================================
// LAYER 2: SKILL AREA DETECTION & WEIGHTING
// ============================================

/**
 * Detect which skill areas are needed and their relative weights
 * Based on keyword mention frequency in JD
 */
export function detectSkillAreas(jobDescription: string): SkillAreaWeight[] {
  const jdLower = jobDescription.toLowerCase();
  const areas: SkillAreaWeight[] = [];

  // Extract requirements section for "required" detection
  const requirementsSection = extractRequirementsSection(jdLower);

  for (const [areaId, indicators] of Object.entries(SKILL_AREA_INDICATORS)) {
    let mentions = 0;
    let inRequirements = false;

    for (const indicator of indicators) {
      const regex = new RegExp(`\\b${escapeRegex(indicator)}\\b`, 'gi');
      const matches = jdLower.match(regex);
      if (matches) {
        mentions += matches.length;

        // Check if in requirements section
        if (requirementsSection && regex.test(requirementsSection)) {
          inRequirements = true;
        }
      }
    }

    if (mentions > 0) {
      areas.push({
        areaId,
        areaName: formatAreaName(areaId),
        weight: 0, // Calculated after
        mentions,
        isRequired: inRequirements,
      });
    }
  }

  // Calculate weights based on mentions
  const totalMentions = areas.reduce((sum, a) => sum + a.mentions, 0);

  for (const area of areas) {
    // Base weight from mention frequency
    let weight = Math.round((area.mentions / totalMentions) * 100);

    // Boost if in requirements section
    if (area.isRequired) {
      weight = Math.min(weight * 1.3, 100);
    }

    area.weight = Math.round(weight);
  }

  // Normalize weights to sum to 100
  const totalWeight = areas.reduce((sum, a) => sum + a.weight, 0);
  if (totalWeight > 0 && totalWeight !== 100) {
    for (const area of areas) {
      area.weight = Math.round((area.weight / totalWeight) * 100);
    }
  }

  // Sort by weight (most important first)
  areas.sort((a, b) => b.weight - a.weight);

  return areas;
}

/**
 * Get skill areas for a specific role (defaults + JD detection)
 */
export function getSkillAreasForRole(
  background: BackgroundType,
  roleId: string,
  jobDescription: string
): SkillAreaWeight[] {
  // First, detect from JD (primary source)
  const jdAreas = detectSkillAreas(jobDescription);

  // If we got good detection from JD, use that
  if (jdAreas.length >= 2) {
    return jdAreas;
  }

  // Fall back to role defaults if JD detection is weak
  const roleConfig = getRoleConfig(background, roleId);
  if (roleConfig) {
    const defaultAreas: SkillAreaWeight[] = roleConfig.skillAreas
      .filter((sa) => sa.defaultWeight > 0)
      .map((sa) => ({
        areaId: sa.id,
        areaName: sa.name,
        weight: sa.defaultWeight,
        mentions: 0,
        isRequired: sa.isRequired,
      }));

    // Merge with JD detection
    for (const jdArea of jdAreas) {
      const existing = defaultAreas.find((a) => a.areaId === jdArea.areaId);
      if (existing) {
        // Boost weight based on JD mentions
        existing.weight = Math.round((existing.weight + jdArea.weight) / 2);
        existing.mentions = jdArea.mentions;
        existing.isRequired = existing.isRequired || jdArea.isRequired;
      } else {
        // Add new area from JD
        defaultAreas.push(jdArea);
      }
    }

    // Normalize
    const totalWeight = defaultAreas.reduce((sum, a) => sum + a.weight, 0);
    for (const area of defaultAreas) {
      area.weight = Math.round((area.weight / totalWeight) * 100);
    }

    defaultAreas.sort((a, b) => b.weight - a.weight);
    return defaultAreas;
  }

  return jdAreas;
}

// ============================================
// LAYER 3: KEYWORD MATCHING (PER SKILL AREA)
// ============================================

/**
 * Match keywords within a specific skill area
 */
export function matchKeywordsInArea(
  areaId: string,
  jobDescription: string,
  profileSkills: Set<string>
): {
  matched: KeywordMatch[];
  missing: KeywordMatch[];
  matchScore: number;
} {
  const patterns = getPatternsForSkillArea(areaId);
  const keywords = getKeywordsForSkillArea(areaId);
  const jdLower = jobDescription.toLowerCase();

  const matched: KeywordMatch[] = [];
  const missing: KeywordMatch[] = [];

  // Find keywords mentioned in JD
  const jdKeywords = new Map<string, number>(); // keyword -> mention count

  for (const [pattern, name] of patterns) {
    const matches = jdLower.match(pattern);
    if (matches && matches.length > 0) {
      jdKeywords.set(name, matches.length);
    }
  }

  // Check each JD keyword against profile
  for (const [keyword, mentions] of jdKeywords) {
    const keywordEntry = keywords.find((k) => k.name === keyword);
    const importance = getImportance(mentions, keywordEntry?.isCore || false);

    const matchData: KeywordMatch = {
      keyword,
      skillArea: areaId,
      found: false,
      jdMentions: mentions,
      importance,
    };

    if (matchesProfileSkill(keyword, profileSkills, keywords)) {
      matchData.found = true;
      matched.push(matchData);
    } else {
      missing.push(matchData);
    }
  }

  // Calculate match score
  const totalKeywords = matched.length + missing.length;
  // If no keywords found, return 0 (unable to analyze) instead of 100
  // This prevents inflated scores for areas we can't measure
  const matchScore = totalKeywords > 0 ? Math.round((matched.length / totalKeywords) * 100) : 0;

  return { matched, missing, matchScore };
}

/**
 * Check if a keyword matches any profile skill (with variations)
 */
function matchesProfileSkill(
  keyword: string,
  profileSkills: Set<string>,
  areaKeywords: Array<{ name: string; variations: string[] }>
): boolean {
  const lower = keyword.toLowerCase();

  // Direct match
  if (profileSkills.has(lower)) {
    return true;
  }

  // Check variations from keyword entry
  const entry = areaKeywords.find((k) => k.name.toLowerCase() === lower);
  if (entry) {
    for (const variation of entry.variations) {
      if (profileSkills.has(variation.toLowerCase())) {
        return true;
      }
    }
  }

  // Partial match
  for (const skill of profileSkills) {
    if (skill.includes(lower) || lower.includes(skill)) {
      return true;
    }
  }

  return false;
}

// ============================================
// MAIN SCORING FUNCTION
// ============================================

/**
 * Calculate the full layered ATS score
 */
export function calculateLayeredATSScore(input: LayeredScoreInput): LayeredATSResult {
  const { profile, jobTitle } = input;
  // Strip HR/EEO boilerplate before any analysis
  const jobDescription = stripBoilerplate(input.jobDescription);

  // Extract profile skills
  const profileSkills = extractProfileSkills(profile);

  // Layer 0: Background Detection
  const backgroundResult = detectBackground(jobDescription);

  // Layer 1: Role Detection
  const roleResult = backgroundResult.background
    ? detectRole(backgroundResult.background, jobDescription, jobTitle)
    : { roleId: null, roleName: null, confidence: 0 };

  // Layer 2: Skill Area Detection
  const skillAreas =
    backgroundResult.background && roleResult.roleId
      ? getSkillAreasForRole(backgroundResult.background, roleResult.roleId, jobDescription)
      : detectSkillAreas(jobDescription);

  // Layer 3: Keyword Matching per Skill Area
  const skillAreaScores: SkillAreaScore[] = [];
  const allKeywordMatches: KeywordMatch[] = [];
  const criticalMissing: string[] = [];

  let weightedScore = 0;
  let totalWeight = 0;

  for (const area of skillAreas) {
    const { matched, missing, matchScore } = matchKeywordsInArea(
      area.areaId,
      jobDescription,
      profileSkills
    );

    skillAreaScores.push({
      areaId: area.areaId,
      areaName: area.areaName,
      jdWeight: area.weight,
      userStrength: getProfileStrengthInArea(profile, area.areaId),
      matchScore,
      matchedKeywords: matched.map((m) => m.keyword),
      missingKeywords: missing.map((m) => m.keyword),
    });

    // Collect all matches
    allKeywordMatches.push(...matched, ...missing);

    // Track critical missing (high importance in required areas)
    for (const m of missing) {
      if (m.importance === 'critical' && area.isRequired) {
        criticalMissing.push(m.keyword);
      }
    }

    // Weighted score calculation
    weightedScore += matchScore * area.weight;
    totalWeight += area.weight;
  }

  // Calculate overall score
  const overallScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;

  // Detect seniority
  const { seniorityLevel } = extractSeniorityFromJD(jobDescription);
  const profileSeniority = extractProfileSeniority(profile);
  const seniorityMatch = compareSeniority(profileSeniority, seniorityLevel);

  // Apply seniority adjustments
  let adjustedScore = overallScore;
  if (seniorityMatch === 'under') {
    adjustedScore = Math.max(adjustedScore - 15, 0);
  } else if (seniorityMatch === 'over') {
    adjustedScore = Math.min(adjustedScore, 85);
  }

  // Generate recommendations
  const recommendations = generateRecommendations(
    skillAreaScores,
    criticalMissing,
    seniorityMatch,
    adjustedScore
  );

  return {
    overallScore: Math.min(adjustedScore, 95), // Cap at 95
    backgroundMatch: {
      isMatch: backgroundResult.background !== null,
      detected: backgroundResult.background,
      confidence: backgroundResult.confidence,
    },
    roleMatch: {
      detectedRole: roleResult.roleName,
      matchScore: roleResult.confidence * 100,
      seniorityMatch: seniorityMatch === 'match',
      detectedSeniority: seniorityLevel,
    },
    skillAreaScores,
    keywordMatches: allKeywordMatches,
    criticalMissing,
    recommendations,
    tier: getTier(adjustedScore),
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function extractRequirementsSection(text: string): string | null {
  const patterns = [
    /requirements?:?\s*([\s\S]*?)(?=responsibilities|about|benefits|$)/i,
    /qualifications?:?\s*([\s\S]*?)(?=responsibilities|about|benefits|$)/i,
    /what you.ll need:?\s*([\s\S]*?)(?=responsibilities|about|$)/i,
    /must have:?\s*([\s\S]*?)(?=nice to have|preferred|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatAreaName(areaId: string): string {
  const names: Record<string, string> = {
    // Tech skill areas
    frontend: 'Frontend Development',
    backend: 'Backend Development',
    database: 'Database & Data Storage',
    devops: 'DevOps & Infrastructure',
    testing: 'Testing & QA',
    architecture: 'System Architecture',
    mobile: 'Mobile Development',
    'ml-ai': 'Machine Learning & AI',
    security: 'Security',
    'data-analytics': 'Data Analytics',
    // Non-tech skill areas
    'retail-operations': 'Retail Operations',
    'customer-service': 'Customer Service',
    'management-leadership': 'Management & Leadership',
    operations: 'Operations',
    'finance-accounting': 'Finance & Accounting',
    'sales-marketing': 'Sales & Marketing',
    'human-resources': 'Human Resources',
    healthcare: 'Healthcare',
    administrative: 'Administrative',
  };
  return names[areaId] || areaId;
}

function getImportance(
  mentions: number,
  isCore: boolean
): 'critical' | 'important' | 'nice-to-have' {
  if (isCore || mentions >= 3) return 'critical';
  if (mentions >= 2) return 'important';
  return 'nice-to-have';
}

function extractProfileSkills(
  profile: MasterProfile | GeneratedProfile | ResumeProfile
): Set<string> {
  const skills = new Set<string>();

  if ('skills' in profile && profile.skills) {
    if ('technical' in profile.skills && Array.isArray(profile.skills.technical)) {
      for (const s of profile.skills.technical) {
        if (typeof s === 'string') {
          skills.add(s.toLowerCase());
        } else if (s && typeof s === 'object' && 'name' in s) {
          skills.add((s as SkillDetail).name.toLowerCase());
          if ((s as SkillDetail).normalizedName) {
            skills.add((s as SkillDetail).normalizedName.toLowerCase());
          }
          for (const alias of (s as SkillDetail).aliases || []) {
            skills.add(alias.toLowerCase());
          }
        }
      }
    }

    if ('tools' in profile.skills && Array.isArray(profile.skills.tools)) {
      for (const s of profile.skills.tools) {
        if (typeof s === 'string') {
          skills.add(s.toLowerCase());
        } else if (s && typeof s === 'object' && 'name' in s) {
          skills.add((s as SkillDetail).name.toLowerCase());
        }
      }
    }

    if ('frameworks' in profile.skills && Array.isArray(profile.skills.frameworks)) {
      for (const s of profile.skills.frameworks) {
        if (typeof s === 'object' && 'name' in s) {
          skills.add((s as SkillDetail).name.toLowerCase());
        }
      }
    }

    if (
      'programmingLanguages' in profile.skills &&
      Array.isArray(profile.skills.programmingLanguages)
    ) {
      for (const s of profile.skills.programmingLanguages) {
        if (typeof s === 'object' && 'name' in s) {
          skills.add((s as SkillDetail).name.toLowerCase());
        }
      }
    }
  }

  if ('highlightedSkills' in profile && Array.isArray(profile.highlightedSkills)) {
    for (const s of profile.highlightedSkills) {
      skills.add(s.toLowerCase());
    }
  }

  if ('atsKeywords' in profile && Array.isArray(profile.atsKeywords)) {
    for (const s of profile.atsKeywords) {
      skills.add(s.toLowerCase());
    }
  }

  return skills;
}

function getProfileStrengthInArea(
  profile: MasterProfile | GeneratedProfile | ResumeProfile,
  areaId: string
): number {
  // If profile has backgroundConfig, use it
  if ('backgroundConfig' in profile && profile.backgroundConfig) {
    const area = profile.backgroundConfig.skillAreas?.find((a) => a.id === areaId);
    if (area) {
      return area.strength;
    }
  }

  // Otherwise estimate from skills count
  const skills = extractProfileSkills(profile);
  const areaKeywords = getKeywordsForSkillArea(areaId);

  let matchCount = 0;
  for (const kw of areaKeywords) {
    if (skills.has(kw.name.toLowerCase())) {
      matchCount++;
    }
  }

  // Rough estimate: 5 skills = 50%, 10 = 80%, 15+ = 90%
  return Math.min(Math.round((matchCount / 10) * 80), 95);
}

function extractSeniorityFromJD(jd: string): {
  seniorityLevel: string | null;
  yearsRequired: number | null;
} {
  const jdLower = jd.toLowerCase();

  // Years extraction
  const yearsPatterns = [
    /(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)/i,
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

  // Seniority level
  let seniorityLevel: string | null = null;
  if (/\b(principal|staff)\b/i.test(jdLower)) {
    seniorityLevel = 'principal';
  } else if (/\blead\b/i.test(jdLower)) {
    seniorityLevel = 'lead';
  } else if (/\bsenior\b/i.test(jdLower)) {
    seniorityLevel = 'senior';
  } else if (/\b(mid|intermediate)\b/i.test(jdLower)) {
    seniorityLevel = 'mid';
  } else if (/\b(junior|entry)\b/i.test(jdLower)) {
    seniorityLevel = 'entry';
  } else if (yearsRequired !== null) {
    if (yearsRequired >= 10) seniorityLevel = 'principal';
    else if (yearsRequired >= 7) seniorityLevel = 'lead';
    else if (yearsRequired >= 5) seniorityLevel = 'senior';
    else if (yearsRequired >= 2) seniorityLevel = 'mid';
    else seniorityLevel = 'entry';
  }

  return { seniorityLevel, yearsRequired };
}

function extractProfileSeniority(
  profile: MasterProfile | GeneratedProfile | ResumeProfile
): string | null {
  if ('careerContext' in profile && profile.careerContext?.seniorityLevel) {
    return profile.careerContext.seniorityLevel;
  }
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

function compareSeniority(
  profileLevel: string | null,
  jdLevel: string | null
): 'match' | 'over' | 'under' | 'unknown' {
  if (!profileLevel || !jdLevel) return 'unknown';

  const levels = ['entry', 'mid', 'senior', 'lead', 'principal'];
  const profileIdx = levels.indexOf(profileLevel);
  const jdIdx = levels.indexOf(jdLevel);

  if (profileIdx < 0 || jdIdx < 0) return 'unknown';

  const diff = profileIdx - jdIdx;
  if (Math.abs(diff) <= 1) return 'match';
  if (diff > 1) return 'over';
  return 'under';
}

function generateRecommendations(
  skillAreaScores: SkillAreaScore[],
  criticalMissing: string[],
  seniorityMatch: string,
  score: number
): string[] {
  const recommendations: string[] = [];

  // Critical missing keywords
  if (criticalMissing.length > 0) {
    recommendations.push(
      `Critical: Add these required skills to your resume: ${criticalMissing.slice(0, 3).join(', ')}`
    );
  }

  // Weakest skill areas
  const weakAreas = skillAreaScores
    .filter((a) => a.matchScore < 50 && a.jdWeight >= 15)
    .sort((a, b) => a.matchScore - b.matchScore);

  if (weakAreas.length > 0) {
    const weakest = weakAreas[0];
    recommendations.push(
      `Improve ${weakest.areaName}: You're at ${weakest.matchScore}% match. Missing: ${weakest.missingKeywords.slice(0, 3).join(', ')}`
    );
  }

  // Seniority advice
  if (seniorityMatch === 'under') {
    recommendations.push(
      'This role may require more experience. Emphasize leadership, mentoring, and impact.'
    );
  } else if (seniorityMatch === 'over') {
    recommendations.push(
      'You may be overqualified. Show interest in the specific challenges of this role.'
    );
  }

  // Strong areas to emphasize
  const strongAreas = skillAreaScores
    .filter((a) => a.matchScore >= 80 && a.jdWeight >= 20)
    .sort((a, b) => b.matchScore - a.matchScore);

  if (strongAreas.length > 0) {
    recommendations.push(
      `Strength: Emphasize your ${strongAreas[0].areaName} experience (${strongAreas[0].matchScore}% match)`
    );
  }

  // Overall advice
  if (score >= 75) {
    recommendations.push(
      'Strong match! Focus on quantifying achievements and showing impact at scale.'
    );
  } else if (score < 50) {
    recommendations.push(
      'Consider if this role aligns with your experience, or heavily tailor your resume.'
    );
  }

  return recommendations;
}

function getTier(score: number): 'excellent' | 'good' | 'moderate' | 'poor' {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'moderate';
  return 'poor';
}

// ============================================
// EXPORTS FOR RESUME OPTIMIZATION
// ============================================

/**
 * Get skill areas to emphasize for resume optimization
 * Returns areas sorted by JD weight with gap analysis
 */
interface AreaEmphasis {
  areaId: string;
  areaName: string;
  priority: 'high' | 'medium' | 'low';
  jdWeight: number;
  currentMatch: number;
  keywordsToAdd: string[];
  keywordsYouHave: string[];
}

export function getAreasToEmphasize(
  jobDescription: string,
  profileSkills: Set<string>
): AreaEmphasis[] {
  const skillAreas = detectSkillAreas(jobDescription);
  const results: AreaEmphasis[] = [];

  for (const area of skillAreas) {
    const { matched, missing, matchScore } = matchKeywordsInArea(
      area.areaId,
      jobDescription,
      profileSkills
    );

    const priority: 'high' | 'medium' | 'low' =
      area.weight >= 30 ? 'high' : area.weight >= 15 ? 'medium' : 'low';

    results.push({
      areaId: area.areaId,
      areaName: area.areaName,
      priority,
      jdWeight: area.weight,
      currentMatch: matchScore,
      keywordsToAdd: missing.slice(0, 5).map((m) => m.keyword),
      keywordsYouHave: matched.map((m) => m.keyword),
    });
  }

  return results.sort((a, b) => b.jdWeight - a.jdWeight);
}
