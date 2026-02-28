/**
 * Master Profile Types
 * Represents the complete career context extracted from resume
 * Used to generate role-specific profiles on demand
 */

import type { UserBackgroundConfig } from './background.types';

export interface MasterProfile {
  id: string;
  createdAt: Date;
  updatedAt: Date;

  // Source document info
  sourceDocument: {
    fileName: string;
    fileType: 'pdf' | 'docx' | 'txt';
    uploadedAt: Date;
    rawText: string;
    checksum: string; // To detect if document changed
  };

  // Extracted personal info
  personal: ExtendedPersonalInfo;

  // Career context - the "understanding" of the candidate
  careerContext: CareerContext;

  // 4-Layer Background Configuration (Background → Role → Skill Areas → Keywords)
  backgroundConfig?: UserBackgroundConfig;

  // Structured experience with enriched data
  experience: EnrichedExperience[];

  // Skills with years of experience and proficiency
  skills: SkillsWithContext;

  // Education with relevance scoring
  education: EnrichedEducation[];

  // Projects and accomplishments
  projects: EnrichedProject[];

  // Certifications with verification status
  certifications: Certification[];

  // Answer bank for common questions
  answerBank?: AnswerBank;

  // Autofill preferences
  autofillData?: ExtendedAutofillData;

  // Generated role-specific profiles
  generatedProfiles: GeneratedProfile[];
}

export interface ExtendedPersonalInfo {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: {
    city: string;
    state: string;
    country: string;
    zipCode?: string;
    formatted: string;
  };
  linkedInUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  twitterUrl?: string;
  websiteUrl?: string;
}

/**
 * Career Context - The AI "understanding" of the candidate
 * Similar to how Cursor understands a codebase
 */
export interface CareerContext {
  // Career narrative
  summary: string; // AI-generated professional summary
  careerTrajectory: 'ascending' | 'pivoting' | 'stable' | 'returning'; // Career pattern
  yearsOfExperience: number;
  seniorityLevel: 'entry' | 'mid' | 'senior' | 'lead' | 'principal' | 'executive';

  // Domain expertise
  primaryDomain: string; // e.g., "Backend Engineering", "Data Science"
  secondaryDomains: string[]; // e.g., ["DevOps", "Machine Learning"]
  industryExperience: string[]; // e.g., ["Fintech", "Healthcare", "E-commerce"]

  // Role fit analysis
  bestFitRoles: RoleFit[];
  strengthAreas: string[]; // Top 5 strengths
  growthAreas: string[]; // Areas for improvement (honest assessment)

  // Communication style (for humanized content)
  writingStyle: {
    tone: 'professional' | 'conversational' | 'technical' | 'creative';
    complexity: 'simple' | 'moderate' | 'complex';
    preferredVoice: 'first-person' | 'third-person';
  };

  // Key accomplishments (quantified where possible)
  topAccomplishments: Accomplishment[];

  // Unique value proposition
  uniqueValueProps: string[];
}

export interface RoleFit {
  title: string; // e.g., "Senior Backend Engineer"
  fitScore: number; // 0-100
  reasons: string[];
  yearsRelevantExp: number;
}

export interface Accomplishment {
  statement: string;
  impact: string; // Quantified impact
  skills: string[]; // Skills demonstrated
  relevantFor: string[]; // Role types this is relevant for
}

export interface EnrichedExperience {
  id: string;
  company: string;
  companyContext?: string; // e.g., "Series B fintech startup"
  title: string;
  normalizedTitle: string; // Standardized title for matching
  location: string;
  employmentType: 'full-time' | 'part-time' | 'contract' | 'internship' | 'freelance';
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  durationMonths: number;

  // Enhanced description
  description: string;
  achievements: AchievementItem[];
  responsibilities: string[];

  // Skills used in this role
  technologiesUsed: SkillUsage[];
  skillsGained: string[];

  // Relevance scoring for different role types
  relevanceMap: Record<string, number>; // e.g., { "backend": 90, "fullstack": 75 }
}

export interface AchievementItem {
  statement: string;
  isQuantified: boolean;
  metrics?: {
    value: string;
    type: 'percentage' | 'number' | 'currency' | 'time';
  };
  keywords: string[];
}

export interface SkillUsage {
  skill: string;
  proficiency: 'basic' | 'intermediate' | 'advanced' | 'expert';
  yearsUsed: number;
  context: string; // How it was used
}

export interface SkillsWithContext {
  // Technical skills with depth
  technical: SkillDetail[];

  // Tools and technologies
  tools: SkillDetail[];

  // Frameworks and libraries
  frameworks: SkillDetail[];

  // Soft skills with evidence
  soft: SoftSkillDetail[];

  // Languages (programming)
  programmingLanguages: SkillDetail[];

  // Natural languages
  naturalLanguages: LanguageSkill[];

  // Skill clusters for matching
  clusters: SkillCluster[];
}

export interface SkillDetail {
  name: string;
  normalizedName: string; // e.g., "ReactJS" -> "React"
  category: string; // e.g., "frontend", "database", "cloud"
  yearsOfExperience: number;
  proficiency: 'basic' | 'intermediate' | 'advanced' | 'expert';
  lastUsed: string; // Date or "current"
  evidenceFrom: string[]; // Job IDs where this skill was used
  aliases: string[]; // e.g., ["React", "ReactJS", "React.js"]
}

export interface SoftSkillDetail {
  name: string;
  evidence: string[]; // Examples demonstrating this skill
  relevance: string[]; // Role types where this matters
}

export interface LanguageSkill {
  language: string;
  proficiency: 'basic' | 'conversational' | 'professional' | 'native';
}

export interface SkillCluster {
  name: string; // e.g., "Cloud Infrastructure"
  skills: string[];
  strength: number; // 0-100
  relevantRoles: string[];
}

export interface EnrichedEducation {
  id: string;
  institution: string;
  degree: string;
  normalizedDegree: string; // e.g., "BS" | "MS" | "PhD"
  field: string;
  startDate: string;
  endDate: string;
  gpa?: number;
  honors?: string[];
  relevantCoursework?: string[];
  activities?: string[];
  relevanceMap: Record<string, number>; // Relevance for different role types
}

export interface EnrichedProject {
  id: string;
  name: string;
  description: string;
  role: string; // What was their role
  technologies: string[];
  url?: string;
  highlights: string[];
  impact: string;
  dateRange?: string;
  relevanceMap: Record<string, number>;
}

export interface Certification {
  name: string;
  issuer: string;
  dateObtained?: string;
  expirationDate?: string;
  credentialId?: string;
  credentialUrl?: string;
  isValid: boolean;
  relevanceMap: Record<string, number>;
}

/**
 * Answer Bank - Pre-computed answers for common questions
 * Saves tokens by reusing instead of regenerating
 */
export interface AnswerBank {
  // Common question templates with cached answers
  commonQuestions: CachedAnswer[];

  // Question patterns for matching
  patterns: QuestionPattern[];

  // Custom Q&A added by user
  customAnswers: Record<string, string>;
}

export interface CachedAnswer {
  questionType: CommonQuestionType;
  question: string;
  answer: string;
  shortAnswer?: string; // For character-limited fields
  generatedAt: Date;
  usageCount: number;
}

export type CommonQuestionType =
  | 'why_interested'
  | 'greatest_strength'
  | 'greatest_weakness'
  | 'leadership_example'
  | 'conflict_resolution'
  | 'challenge_overcome'
  | 'failure_learned'
  | 'teamwork_example'
  | 'why_leaving'
  | 'salary_expectations'
  | 'career_goals'
  | 'technical_achievement'
  | 'work_style'
  | 'handle_pressure'
  | 'diversity_contribution';

export interface QuestionPattern {
  type: CommonQuestionType;
  patterns: string[]; // Regex patterns to match
  keywords: string[];
}

export interface ExtendedAutofillData {
  // Work authorization
  workAuthorization: 'citizen' | 'permanent_resident' | 'visa' | 'other';
  workAuthorizationText: string; // Full text response
  requiresSponsorship: boolean;
  visaType?: string;

  // Availability
  availableStartDate?: string;
  noticePeriod?: string;
  canStartImmediately: boolean;

  // Address (for autofill)
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;

  // Location preferences
  willingToRelocate: boolean;
  relocationPreferences?: string[];
  remotePreference: 'remote' | 'hybrid' | 'onsite' | 'flexible';
  travelWillingness?: 'none' | 'minimal' | 'moderate' | 'extensive';

  // Compensation
  salaryExpectations?: {
    min: number;
    max: number;
    currency: string;
    negotiable: boolean;
  };
  hourlyRate?: {
    min: number;
    max: number;
    currency: string;
  };

  // Demographics (optional, for EEO forms)
  demographics?: {
    gender?: string;
    pronouns?: string;
    ethnicity?: string;
    race?: string;
    veteranStatus?: string;
    disabilityStatus?: string;
  };

  // Social/work preferences
  linkedInConsent: boolean;
  portfolioConsent: boolean;
  backgroundCheckConsent: boolean;
  drugTestConsent: boolean;

  // Security & Background
  securityClearance?: 'none' | 'public_trust' | 'secret' | 'top_secret' | 'ts_sci';
  canPassBackgroundCheck?: boolean;
  canPassDrugTest?: boolean;

  // Languages spoken
  languages?: string[];

  // Pre-filled common fields
  preferredName?: string;
  currentlyEmployed: boolean;
  reasonForLeaving?: string;
  yearsOfExperienceText?: string;
}

/**
 * Generated Profile - Role-specific variant of the master profile
 */
export interface GeneratedProfile {
  id: string;
  masterProfileId: string;
  createdAt: Date;
  updatedAt: Date;

  // Profile identity
  name: string; // e.g., "Full Stack Engineer - 5+ yrs"
  targetRole: string;
  targetIndustries: string[];
  isActive: boolean;

  // Tailored content
  tailoredSummary: string;
  highlightedSkills: string[];
  selectedExperiences: string[]; // IDs of experiences to emphasize
  selectedProjects: string[]; // IDs of projects to include

  // ATS optimization
  atsKeywords: string[];
  atsScore?: number;

  // Usage tracking
  applicationsUsed: number;
  lastUsed?: Date;
}

/**
 * Resume Parser Result
 */
export interface ResumeParseResult {
  success: boolean;
  rawText: string;
  structured?: Partial<MasterProfile>;
  confidence: number; // 0-1, how confident the parser is
  errors?: string[];
  warnings?: string[];
}

/**
 * AI Analysis Request
 */
export interface ProfileAnalysisRequest {
  rawText: string;
  existingData?: Partial<MasterProfile>;
  targetRoles?: string[];
  analysisDepth: 'quick' | 'standard' | 'deep';
}

/**
 * AI Analysis Result
 */
export interface ProfileAnalysisResult {
  careerContext: CareerContext;
  enrichedExperience: EnrichedExperience[];
  skillsWithContext: SkillsWithContext;
  suggestedProfiles: Array<{
    name: string;
    targetRole: string;
    fitScore: number;
    reasoning: string;
  }>;
  tokensUsed: number;
}
