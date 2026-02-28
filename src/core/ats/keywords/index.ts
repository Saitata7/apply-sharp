/**
 * Keyword Index - Exports all skill area keywords
 *
 * This module provides comprehensive keyword patterns organized by skill area
 * for the 4-layer ATS matching system:
 *
 * Layer 0: Background (CS, Data, MBA, etc.)
 * Layer 1: Role (Full Stack, Data Analyst, etc.)
 * Layer 2: Skill Areas (Frontend, Backend, Database, etc.)
 * Layer 3: Keywords (React, Python, SQL, etc.)
 */

// Skill Area Keyword Exports - Computer Science
export { FRONTEND_KEYWORDS, getFrontendPatterns } from './frontend';
export { BACKEND_KEYWORDS, getBackendPatterns } from './backend';
export { DATABASE_KEYWORDS, getDatabasePatterns } from './database';
export { DEVOPS_KEYWORDS, getDevopsPatterns } from './devops';
export { TESTING_KEYWORDS, getTestingPatterns } from './testing';
export { ARCHITECTURE_KEYWORDS, getArchitecturePatterns } from './architecture';
export { MOBILE_KEYWORDS, getMobilePatterns } from './mobile';
export { ML_AI_KEYWORDS, getMlAiPatterns } from './ml-ai';
export { SECURITY_KEYWORDS, getSecurityPatterns } from './security';
export { DATA_ANALYTICS_KEYWORDS, getDataAnalyticsPatterns } from './data-analytics';

// Skill Area Keyword Exports - Other Backgrounds
export {
  MBA_BUSINESS_KEYWORDS,
  getMbaBusinessPatterns,
  MANAGEMENT_LEADERSHIP_KEYWORDS,
  OPERATIONS_KEYWORDS,
  STRATEGY_KEYWORDS,
  FINANCE_ACCOUNTING_KEYWORDS,
  PROJECT_MANAGEMENT_KEYWORDS,
  COMMUNICATION_KEYWORDS,
} from './mba-business';
export {
  ENGINEERING_KEYWORDS,
  getEngineeringPatterns,
  TECHNICAL_DESIGN_KEYWORDS,
  PROJECT_ENGINEERING_KEYWORDS,
  QUALITY_COMPLIANCE_KEYWORDS,
  MANUFACTURING_KEYWORDS,
  SAFETY_KEYWORDS,
  TECHNICAL_ANALYSIS_KEYWORDS,
} from './engineering';
export {
  DESIGN_KEYWORDS,
  getDesignPatterns,
  UX_DESIGN_KEYWORDS,
  UI_DESIGN_KEYWORDS,
  GRAPHIC_DESIGN_KEYWORDS,
  DESIGN_TOOLS_KEYWORDS,
  MOTION_DESIGN_KEYWORDS,
} from './design';
export {
  MARKETING_KEYWORDS,
  getMarketingPatterns,
  DIGITAL_MARKETING_KEYWORDS,
  CONTENT_MARKETING_KEYWORDS,
  SOCIAL_MEDIA_KEYWORDS,
  BRAND_MARKETING_KEYWORDS,
  MARKETING_ANALYTICS_KEYWORDS,
  MARKETING_TOOLS_KEYWORDS,
} from './marketing';

// Common / Universal Keywords (soft skills, office tools, etc.)
export {
  COMMON_KEYWORDS,
  getCommonPatterns,
  COMMUNICATION_SKILLS_KEYWORDS,
  LEADERSHIP_SKILLS_KEYWORDS,
  TEAMWORK_SKILLS_KEYWORDS,
  PROBLEM_SOLVING_KEYWORDS,
  ORGANIZATION_SKILLS_KEYWORDS,
  ADAPTABILITY_KEYWORDS,
  WORK_ETHIC_KEYWORDS,
  REMOTE_WORK_KEYWORDS,
  OFFICE_TOOLS_KEYWORDS,
  CUSTOMER_SERVICE_KEYWORDS,
  EDUCATION_KEYWORDS,
} from './common';

// Other Backgrounds (Healthcare, Finance, Legal, Education)
export {
  HEALTHCARE_KEYWORDS,
  getHealthcarePatterns,
  CLINICAL_SKILLS_KEYWORDS,
  PATIENT_CARE_KEYWORDS,
  HEALTHCARE_TECHNOLOGY_KEYWORDS,
  HEALTHCARE_COMPLIANCE_KEYWORDS,
  HEALTHCARE_ADMIN_KEYWORDS,
  HEALTHCARE_CERTIFICATIONS_KEYWORDS,
} from './other-backgrounds';
export {
  FINANCE_KEYWORDS,
  getFinancePatterns,
  FINANCIAL_ANALYSIS_KEYWORDS,
  ACCOUNTING_KEYWORDS,
  BUDGETING_FORECASTING_KEYWORDS,
  INVESTMENT_BANKING_KEYWORDS,
  FINANCIAL_COMPLIANCE_KEYWORDS,
  FINANCE_TOOLS_KEYWORDS,
} from './other-backgrounds';
export {
  LEGAL_KEYWORDS,
  getLegalPatterns,
  LEGAL_PRACTICE_KEYWORDS,
  LEGAL_RESEARCH_KEYWORDS,
  CONTRACT_MANAGEMENT_KEYWORDS,
  LEGAL_TOOLS_KEYWORDS,
  LEGAL_COMPLIANCE_KEYWORDS,
} from './other-backgrounds';
export {
  EDUCATION_KEYWORDS as EDUCATION_FIELD_KEYWORDS,
  getEducationPatterns,
  TEACHING_INSTRUCTION_KEYWORDS,
  CURRICULUM_DESIGN_KEYWORDS,
  STUDENT_MANAGEMENT_KEYWORDS,
  EDUCATIONAL_TECHNOLOGY_KEYWORDS,
  TRAINING_DEVELOPMENT_KEYWORDS,
} from './other-backgrounds';

// Import all for aggregation - Computer Science
import { FRONTEND_KEYWORDS, getFrontendPatterns } from './frontend';
import { BACKEND_KEYWORDS, getBackendPatterns } from './backend';
import { DATABASE_KEYWORDS, getDatabasePatterns } from './database';
import { DEVOPS_KEYWORDS, getDevopsPatterns } from './devops';
import { TESTING_KEYWORDS, getTestingPatterns } from './testing';
import { ARCHITECTURE_KEYWORDS, getArchitecturePatterns } from './architecture';
import { MOBILE_KEYWORDS, getMobilePatterns } from './mobile';
import { ML_AI_KEYWORDS, getMlAiPatterns } from './ml-ai';
import { SECURITY_KEYWORDS, getSecurityPatterns } from './security';
import { DATA_ANALYTICS_KEYWORDS, getDataAnalyticsPatterns } from './data-analytics';

// Import all for aggregation - Other Backgrounds
import { MBA_BUSINESS_KEYWORDS, getMbaBusinessPatterns } from './mba-business';
import { ENGINEERING_KEYWORDS, getEngineeringPatterns } from './engineering';
import { DESIGN_KEYWORDS, getDesignPatterns } from './design';
import { MARKETING_KEYWORDS, getMarketingPatterns } from './marketing';

// Import common/universal keywords
import {
  COMMON_KEYWORDS,
  getCommonPatterns,
  COMMUNICATION_SKILLS_KEYWORDS,
  LEADERSHIP_SKILLS_KEYWORDS,
  TEAMWORK_SKILLS_KEYWORDS,
  PROBLEM_SOLVING_KEYWORDS,
  ORGANIZATION_SKILLS_KEYWORDS,
  ADAPTABILITY_KEYWORDS,
  WORK_ETHIC_KEYWORDS,
  REMOTE_WORK_KEYWORDS,
  OFFICE_TOOLS_KEYWORDS,
  CUSTOMER_SERVICE_KEYWORDS,
  EDUCATION_KEYWORDS,
} from './common';

// Import other backgrounds
import {
  HEALTHCARE_KEYWORDS,
  getHealthcarePatterns,
  CLINICAL_SKILLS_KEYWORDS,
  PATIENT_CARE_KEYWORDS,
  HEALTHCARE_TECHNOLOGY_KEYWORDS,
  HEALTHCARE_COMPLIANCE_KEYWORDS,
  HEALTHCARE_ADMIN_KEYWORDS,
  HEALTHCARE_CERTIFICATIONS_KEYWORDS,
} from './other-backgrounds';
import {
  FINANCE_KEYWORDS,
  getFinancePatterns,
  FINANCIAL_ANALYSIS_KEYWORDS,
  ACCOUNTING_KEYWORDS,
  BUDGETING_FORECASTING_KEYWORDS,
  INVESTMENT_BANKING_KEYWORDS,
  FINANCIAL_COMPLIANCE_KEYWORDS,
  FINANCE_TOOLS_KEYWORDS,
} from './other-backgrounds';
import {
  LEGAL_KEYWORDS,
  getLegalPatterns,
  LEGAL_PRACTICE_KEYWORDS,
  LEGAL_RESEARCH_KEYWORDS,
  CONTRACT_MANAGEMENT_KEYWORDS,
  LEGAL_TOOLS_KEYWORDS,
  LEGAL_COMPLIANCE_KEYWORDS,
} from './other-backgrounds';
import {
  EDUCATION_KEYWORDS as EDUCATION_FIELD_KEYWORDS,
  getEducationPatterns,
  TEACHING_INSTRUCTION_KEYWORDS,
  CURRICULUM_DESIGN_KEYWORDS,
  STUDENT_MANAGEMENT_KEYWORDS,
  EDUCATIONAL_TECHNOLOGY_KEYWORDS,
  TRAINING_DEVELOPMENT_KEYWORDS,
} from './other-backgrounds';

import type { KeywordEntry } from '@shared/types/background.types';

/**
 * Create a regex pattern for keyword matching
 * Handles special characters like "/" better than simple word boundaries
 */
export function createKeywordPattern(terms: string[]): RegExp {
  const escapedTerms = terms.map((t) => {
    // Escape special regex characters
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // For terms with "/" or "-", use more flexible boundaries
    if (t.includes('/') || t.includes('-')) {
      // Use word boundary OR start/end of string OR whitespace
      return escaped;
    }
    return escaped;
  });

  // Use case-insensitive matching with word boundaries
  // For complex terms, the boundary handling is in the individual term escaping
  const pattern = new RegExp(
    `(?:^|[\\s,;.!?()\\[\\]"'])(${escapedTerms.join('|')})(?:$|[\\s,;.!?()\\[\\]"'])`,
    'gi'
  );
  return pattern;
}

// Import specific skill area keywords
import {
  MANAGEMENT_LEADERSHIP_KEYWORDS,
  OPERATIONS_KEYWORDS,
  STRATEGY_KEYWORDS,
  FINANCE_ACCOUNTING_KEYWORDS,
  PROJECT_MANAGEMENT_KEYWORDS,
  COMMUNICATION_KEYWORDS,
} from './mba-business';
import {
  TECHNICAL_DESIGN_KEYWORDS,
  PROJECT_ENGINEERING_KEYWORDS,
  QUALITY_COMPLIANCE_KEYWORDS,
  MANUFACTURING_KEYWORDS,
  SAFETY_KEYWORDS,
  TECHNICAL_ANALYSIS_KEYWORDS,
} from './engineering';
import {
  UX_DESIGN_KEYWORDS,
  UI_DESIGN_KEYWORDS,
  GRAPHIC_DESIGN_KEYWORDS,
  DESIGN_TOOLS_KEYWORDS,
  MOTION_DESIGN_KEYWORDS,
} from './design';
import {
  DIGITAL_MARKETING_KEYWORDS,
  CONTENT_MARKETING_KEYWORDS,
  SOCIAL_MEDIA_KEYWORDS,
  BRAND_MARKETING_KEYWORDS,
  MARKETING_ANALYTICS_KEYWORDS,
  MARKETING_TOOLS_KEYWORDS,
} from './marketing';

/**
 * Skill area to keywords mapping
 */
export const SKILL_AREA_KEYWORDS: Record<string, KeywordEntry[]> = {
  // Computer Science skill areas
  frontend: FRONTEND_KEYWORDS,
  backend: BACKEND_KEYWORDS,
  database: DATABASE_KEYWORDS,
  devops: DEVOPS_KEYWORDS,
  testing: TESTING_KEYWORDS,
  architecture: ARCHITECTURE_KEYWORDS,
  mobile: MOBILE_KEYWORDS,
  'ml-ai': ML_AI_KEYWORDS,
  security: SECURITY_KEYWORDS,

  // Data Analytics skill areas
  'data-analysis': DATA_ANALYTICS_KEYWORDS,
  'data-visualization': DATA_ANALYTICS_KEYWORDS,
  'sql-databases': DATABASE_KEYWORDS,
  'bi-tools': DATA_ANALYTICS_KEYWORDS,
  programming: [...BACKEND_KEYWORDS, ...FRONTEND_KEYWORDS],
  'ml-statistics': ML_AI_KEYWORDS,
  'data-engineering': [...DATABASE_KEYWORDS, ...DEVOPS_KEYWORDS],

  // MBA / Business skill areas
  'management-leadership': MANAGEMENT_LEADERSHIP_KEYWORDS,
  operations: OPERATIONS_KEYWORDS,
  strategy: STRATEGY_KEYWORDS,
  'finance-accounting': FINANCE_ACCOUNTING_KEYWORDS,
  'project-management': PROJECT_MANAGEMENT_KEYWORDS,
  communication: COMMUNICATION_KEYWORDS,

  // Engineering (Non-Software) skill areas
  'technical-design': TECHNICAL_DESIGN_KEYWORDS,
  'project-engineering': PROJECT_ENGINEERING_KEYWORDS,
  'quality-compliance': QUALITY_COMPLIANCE_KEYWORDS,
  manufacturing: MANUFACTURING_KEYWORDS,
  safety: SAFETY_KEYWORDS,
  'technical-analysis': TECHNICAL_ANALYSIS_KEYWORDS,

  // Design / Creative skill areas
  'ux-design': UX_DESIGN_KEYWORDS,
  'ui-design': UI_DESIGN_KEYWORDS,
  'graphic-design': GRAPHIC_DESIGN_KEYWORDS,
  'design-tools': DESIGN_TOOLS_KEYWORDS,
  'motion-design': MOTION_DESIGN_KEYWORDS,

  // Marketing / Communications skill areas
  'digital-marketing': DIGITAL_MARKETING_KEYWORDS,
  'content-marketing': CONTENT_MARKETING_KEYWORDS,
  'social-media': SOCIAL_MEDIA_KEYWORDS,
  'brand-marketing': BRAND_MARKETING_KEYWORDS,
  'marketing-analytics': MARKETING_ANALYTICS_KEYWORDS,
  'marketing-tools': MARKETING_TOOLS_KEYWORDS,

  // Common / Universal skill areas (apply to ALL backgrounds)
  'communication-skills': COMMUNICATION_SKILLS_KEYWORDS,
  'leadership-skills': LEADERSHIP_SKILLS_KEYWORDS,
  'teamwork-skills': TEAMWORK_SKILLS_KEYWORDS,
  'problem-solving-skills': PROBLEM_SOLVING_KEYWORDS,
  'organization-skills': ORGANIZATION_SKILLS_KEYWORDS,
  'adaptability-skills': ADAPTABILITY_KEYWORDS,
  'work-ethic': WORK_ETHIC_KEYWORDS,
  'remote-work': REMOTE_WORK_KEYWORDS,
  'office-tools': OFFICE_TOOLS_KEYWORDS,
  'customer-service-skills': CUSTOMER_SERVICE_KEYWORDS,
  education: EDUCATION_KEYWORDS,

  // Healthcare skill areas
  'clinical-skills': CLINICAL_SKILLS_KEYWORDS,
  'patient-care': PATIENT_CARE_KEYWORDS,
  'healthcare-technology': HEALTHCARE_TECHNOLOGY_KEYWORDS,
  'healthcare-compliance': HEALTHCARE_COMPLIANCE_KEYWORDS,
  'healthcare-admin': HEALTHCARE_ADMIN_KEYWORDS,
  'healthcare-certifications': HEALTHCARE_CERTIFICATIONS_KEYWORDS,
  healthcare: HEALTHCARE_KEYWORDS,

  // Finance skill areas
  'financial-analysis': FINANCIAL_ANALYSIS_KEYWORDS,
  accounting: ACCOUNTING_KEYWORDS,
  'budgeting-forecasting': BUDGETING_FORECASTING_KEYWORDS,
  'investment-banking': INVESTMENT_BANKING_KEYWORDS,
  'financial-compliance': FINANCIAL_COMPLIANCE_KEYWORDS,
  'finance-tools': FINANCE_TOOLS_KEYWORDS,
  finance: FINANCE_KEYWORDS,

  // Legal skill areas
  'legal-practice': LEGAL_PRACTICE_KEYWORDS,
  'legal-research': LEGAL_RESEARCH_KEYWORDS,
  'contract-management': CONTRACT_MANAGEMENT_KEYWORDS,
  'legal-tools': LEGAL_TOOLS_KEYWORDS,
  'legal-compliance': LEGAL_COMPLIANCE_KEYWORDS,
  legal: LEGAL_KEYWORDS,

  // Education skill areas
  'teaching-instruction': TEACHING_INSTRUCTION_KEYWORDS,
  'curriculum-design': CURRICULUM_DESIGN_KEYWORDS,
  'student-management': STUDENT_MANAGEMENT_KEYWORDS,
  'educational-technology': EDUCATIONAL_TECHNOLOGY_KEYWORDS,
  'training-development': TRAINING_DEVELOPMENT_KEYWORDS,
  'education-field': EDUCATION_FIELD_KEYWORDS,
};

/**
 * Get keywords for a specific skill area
 */
export function getKeywordsForSkillArea(skillAreaId: string): KeywordEntry[] {
  // Check tech skill areas first
  const techKeywords = SKILL_AREA_KEYWORDS[skillAreaId];
  if (techKeywords) return techKeywords;

  // Fall back to non-tech keywords
  return getNonTechKeywordsForArea(skillAreaId);
}

/**
 * Non-tech skill area keywords for dynamic pattern generation
 * These map to SKILL_AREA_INDICATORS in layered-scorer.ts
 */
const NON_TECH_KEYWORDS: Record<string, string[]> = {
  'retail-operations': [
    'retail',
    'store operations',
    'merchandising',
    'inventory management',
    'pos',
    'point of sale',
    'cash register',
    'cashier',
    'checkout',
    'shrink prevention',
    'loss prevention',
    'planogram',
    'stock replenishment',
    'pricing',
    'markdown',
    'visual merchandising',
    'shelf management',
    'receiving',
    'backroom',
    'floor',
  ],
  'customer-service': [
    'customer service',
    'customer experience',
    'customer satisfaction',
    'client service',
    'customer support',
    'call center',
    'help desk',
    'complaint resolution',
    'escalation',
    'service recovery',
    'nps',
    'csat',
    'customer feedback',
    'customer relations',
    'guest services',
    'customer-facing',
    'client relations',
  ],
  'management-leadership': [
    'management',
    'leadership',
    'supervisor',
    'team lead',
    'direct reports',
    'coaching',
    'mentoring',
    'training',
    'performance review',
    'hiring',
    'staffing',
    'scheduling',
    'delegation',
    'motivation',
    'conflict resolution',
    'decision making',
    'accountability',
    'team management',
    'people management',
  ],
  operations: [
    'operations',
    'process improvement',
    'workflow',
    'efficiency',
    'productivity',
    'logistics',
    'supply chain',
    'vendor management',
    'compliance',
    'audit',
    'quality control',
    'sop',
    'kpi',
    'continuous improvement',
    'lean',
    'six sigma',
    'operational excellence',
    'process optimization',
  ],
  'finance-accounting': [
    'accounting',
    'finance',
    'budget',
    'forecasting',
    'p&l',
    'profit and loss',
    'revenue',
    'expense',
    'cost control',
    'financial reporting',
    'audit',
    'accounts payable',
    'accounts receivable',
    'reconciliation',
    'ledger',
    'gaap',
    'quickbooks',
    'sap',
    'erp',
    'invoicing',
    'billing',
    'bookkeeping',
  ],
  'sales-marketing': [
    'sales',
    'revenue',
    'quota',
    'pipeline',
    'lead generation',
    'prospecting',
    'closing',
    'negotiation',
    'crm',
    'salesforce',
    'marketing',
    'campaign',
    'branding',
    'promotion',
    'digital marketing',
    'seo',
    'social media',
    'content marketing',
    'advertising',
    'market research',
  ],
  'human-resources': [
    'hr',
    'human resources',
    'recruiting',
    'talent acquisition',
    'onboarding',
    'employee relations',
    'benefits administration',
    'compensation',
    'payroll',
    'hris',
    'performance management',
    'training and development',
    'engagement',
    'retention',
    'succession planning',
    'labor law',
    'eeoc',
    'diversity',
  ],
  healthcare: [
    'patient care',
    'clinical',
    'medical',
    'healthcare',
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
    'laboratory',
    'vital signs',
    'medication administration',
    'charting',
    'bedside manner',
    'patient safety',
    'infection control',
  ],
  administrative: [
    'administrative',
    'office management',
    'clerical',
    'reception',
    'calendar management',
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
    'meeting coordination',
    'travel arrangements',
    'expense reports',
    'document management',
  ],
};

/**
 * Generate patterns dynamically from keyword list
 */
function generatePatternsFromKeywords(keywords: string[]): [RegExp, string][] {
  return keywords.map((keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `(?:^|[\\s,;.!?()\\[\\]"'])(${escaped})(?:$|[\\s,;.!?()\\[\\]"'])`,
      'gi'
    );
    return [pattern, keyword] as [RegExp, string];
  });
}

/**
 * Get patterns for a specific skill area
 */
export function getPatternsForSkillArea(skillAreaId: string): [RegExp, string][] {
  switch (skillAreaId) {
    case 'frontend':
      return getFrontendPatterns();
    case 'backend':
      return getBackendPatterns();
    case 'database':
    case 'sql-databases':
      return getDatabasePatterns();
    case 'devops':
      return getDevopsPatterns();
    case 'testing':
      return getTestingPatterns();
    case 'architecture':
      return getArchitecturePatterns();
    case 'mobile':
      return getMobilePatterns();
    case 'ml-ai':
    case 'ml-statistics':
      return getMlAiPatterns();
    case 'security':
      return getSecurityPatterns();
    case 'data-analysis':
    case 'data-visualization':
    case 'bi-tools':
      return getDataAnalyticsPatterns();
    case 'programming':
      return [...getBackendPatterns(), ...getFrontendPatterns()];
    case 'data-engineering':
      return [...getDatabasePatterns(), ...getDevopsPatterns()];
    default:
      // Check non-tech skill areas
      if (NON_TECH_KEYWORDS[skillAreaId]) {
        return generatePatternsFromKeywords(NON_TECH_KEYWORDS[skillAreaId]);
      }
      return [];
  }
}

/**
 * Get keywords for non-tech skill areas
 */
export function getNonTechKeywordsForArea(skillAreaId: string): KeywordEntry[] {
  const keywords = NON_TECH_KEYWORDS[skillAreaId];
  if (!keywords) return [];

  return keywords.map((name) => ({
    name,
    variations: [name],
    weight: 1.0, // Default weight
    isCore: false,
  }));
}

/**
 * Get all patterns across all skill areas
 * Useful for general ATS scanning when skill areas aren't specified
 */
export function getAllPatterns(): [RegExp, string][] {
  const allPatterns: [RegExp, string][] = [];
  const seen = new Set<string>();

  const addPatterns = (patterns: [RegExp, string][]) => {
    for (const [pattern, name] of patterns) {
      if (!seen.has(name)) {
        seen.add(name);
        allPatterns.push([pattern, name]);
      }
    }
  };

  // Computer Science
  addPatterns(getFrontendPatterns());
  addPatterns(getBackendPatterns());
  addPatterns(getDatabasePatterns());
  addPatterns(getDevopsPatterns());
  addPatterns(getTestingPatterns());
  addPatterns(getArchitecturePatterns());
  addPatterns(getMobilePatterns());
  addPatterns(getMlAiPatterns());
  addPatterns(getSecurityPatterns());
  addPatterns(getDataAnalyticsPatterns());

  // MBA / Business
  addPatterns(getMbaBusinessPatterns());

  // Engineering
  addPatterns(getEngineeringPatterns());

  // Design
  addPatterns(getDesignPatterns());

  // Marketing
  addPatterns(getMarketingPatterns());

  // Common / Universal (soft skills, office tools)
  addPatterns(getCommonPatterns());

  // Other backgrounds (Healthcare, Finance, Legal, Education)
  addPatterns(getHealthcarePatterns());
  addPatterns(getFinancePatterns());
  addPatterns(getLegalPatterns());
  addPatterns(getEducationPatterns());

  return allPatterns;
}

/**
 * Get all keywords (flattened)
 */
export function getAllKeywords(): KeywordEntry[] {
  const allKeywords: KeywordEntry[] = [];
  const seen = new Set<string>();

  const addKeywords = (keywords: KeywordEntry[]) => {
    for (const kw of keywords) {
      if (!seen.has(kw.name)) {
        seen.add(kw.name);
        allKeywords.push(kw);
      }
    }
  };

  // Computer Science
  addKeywords(FRONTEND_KEYWORDS);
  addKeywords(BACKEND_KEYWORDS);
  addKeywords(DATABASE_KEYWORDS);
  addKeywords(DEVOPS_KEYWORDS);
  addKeywords(TESTING_KEYWORDS);
  addKeywords(ARCHITECTURE_KEYWORDS);
  addKeywords(MOBILE_KEYWORDS);
  addKeywords(ML_AI_KEYWORDS);
  addKeywords(SECURITY_KEYWORDS);
  addKeywords(DATA_ANALYTICS_KEYWORDS);

  // MBA / Business
  addKeywords(MBA_BUSINESS_KEYWORDS);

  // Engineering
  addKeywords(ENGINEERING_KEYWORDS);

  // Design
  addKeywords(DESIGN_KEYWORDS);

  // Marketing
  addKeywords(MARKETING_KEYWORDS);

  // Common / Universal (soft skills, office tools)
  addKeywords(COMMON_KEYWORDS);

  // Other backgrounds
  addKeywords(HEALTHCARE_KEYWORDS);
  addKeywords(FINANCE_KEYWORDS);
  addKeywords(LEGAL_KEYWORDS);
  addKeywords(EDUCATION_FIELD_KEYWORDS);

  return allKeywords;
}

/**
 * Get skill area ID from a keyword name
 */
export function getSkillAreaForKeyword(keywordName: string): string | null {
  const normalizedName = keywordName.toLowerCase();

  // Check each skill area
  for (const [areaId, keywords] of Object.entries(SKILL_AREA_KEYWORDS)) {
    for (const kw of keywords) {
      if (
        kw.name.toLowerCase() === normalizedName ||
        kw.variations.some((v) => v.toLowerCase() === normalizedName)
      ) {
        return areaId;
      }
    }
  }

  return null;
}

/**
 * Keyword lookup by name (case-insensitive)
 */
export function findKeywordByName(name: string): KeywordEntry | null {
  const normalizedName = name.toLowerCase();

  for (const kw of getAllKeywords()) {
    if (
      kw.name.toLowerCase() === normalizedName ||
      kw.variations.some((v) => v.toLowerCase() === normalizedName)
    ) {
      return kw;
    }
  }

  return null;
}

/**
 * Count total keywords
 */
export function getKeywordCount(): number {
  return getAllKeywords().length;
}

/**
 * Get keyword statistics by skill area
 */
export function getKeywordStats(): Record<string, { total: number; core: number }> {
  const stats: Record<string, { total: number; core: number }> = {};

  const areas = [
    // Computer Science
    { id: 'frontend', keywords: FRONTEND_KEYWORDS },
    { id: 'backend', keywords: BACKEND_KEYWORDS },
    { id: 'database', keywords: DATABASE_KEYWORDS },
    { id: 'devops', keywords: DEVOPS_KEYWORDS },
    { id: 'testing', keywords: TESTING_KEYWORDS },
    { id: 'architecture', keywords: ARCHITECTURE_KEYWORDS },
    { id: 'mobile', keywords: MOBILE_KEYWORDS },
    { id: 'ml-ai', keywords: ML_AI_KEYWORDS },
    { id: 'security', keywords: SECURITY_KEYWORDS },
    { id: 'data-analytics', keywords: DATA_ANALYTICS_KEYWORDS },
    // MBA / Business
    { id: 'management-leadership', keywords: MANAGEMENT_LEADERSHIP_KEYWORDS },
    { id: 'operations', keywords: OPERATIONS_KEYWORDS },
    { id: 'strategy', keywords: STRATEGY_KEYWORDS },
    { id: 'finance-accounting', keywords: FINANCE_ACCOUNTING_KEYWORDS },
    { id: 'project-management', keywords: PROJECT_MANAGEMENT_KEYWORDS },
    { id: 'communication', keywords: COMMUNICATION_KEYWORDS },
    // Engineering
    { id: 'technical-design', keywords: TECHNICAL_DESIGN_KEYWORDS },
    { id: 'project-engineering', keywords: PROJECT_ENGINEERING_KEYWORDS },
    { id: 'quality-compliance', keywords: QUALITY_COMPLIANCE_KEYWORDS },
    { id: 'manufacturing', keywords: MANUFACTURING_KEYWORDS },
    { id: 'safety', keywords: SAFETY_KEYWORDS },
    { id: 'technical-analysis', keywords: TECHNICAL_ANALYSIS_KEYWORDS },
    // Design
    { id: 'ux-design', keywords: UX_DESIGN_KEYWORDS },
    { id: 'ui-design', keywords: UI_DESIGN_KEYWORDS },
    { id: 'graphic-design', keywords: GRAPHIC_DESIGN_KEYWORDS },
    { id: 'design-tools', keywords: DESIGN_TOOLS_KEYWORDS },
    { id: 'motion-design', keywords: MOTION_DESIGN_KEYWORDS },
    // Marketing
    { id: 'digital-marketing', keywords: DIGITAL_MARKETING_KEYWORDS },
    { id: 'content-marketing', keywords: CONTENT_MARKETING_KEYWORDS },
    { id: 'social-media', keywords: SOCIAL_MEDIA_KEYWORDS },
    { id: 'brand-marketing', keywords: BRAND_MARKETING_KEYWORDS },
    { id: 'marketing-analytics', keywords: MARKETING_ANALYTICS_KEYWORDS },
    { id: 'marketing-tools', keywords: MARKETING_TOOLS_KEYWORDS },
    // Common / Universal
    { id: 'communication-skills', keywords: COMMUNICATION_SKILLS_KEYWORDS },
    { id: 'leadership-skills', keywords: LEADERSHIP_SKILLS_KEYWORDS },
    { id: 'teamwork-skills', keywords: TEAMWORK_SKILLS_KEYWORDS },
    { id: 'problem-solving', keywords: PROBLEM_SOLVING_KEYWORDS },
    { id: 'organization-skills', keywords: ORGANIZATION_SKILLS_KEYWORDS },
    { id: 'adaptability', keywords: ADAPTABILITY_KEYWORDS },
    { id: 'work-ethic', keywords: WORK_ETHIC_KEYWORDS },
    { id: 'remote-work', keywords: REMOTE_WORK_KEYWORDS },
    { id: 'office-tools', keywords: OFFICE_TOOLS_KEYWORDS },
    { id: 'customer-service', keywords: CUSTOMER_SERVICE_KEYWORDS },
    { id: 'education', keywords: EDUCATION_KEYWORDS },
  ];

  for (const { id, keywords } of areas) {
    stats[id] = {
      total: keywords.length,
      core: keywords.filter((kw) => kw.isCore).length,
    };
  }

  return stats;
}
