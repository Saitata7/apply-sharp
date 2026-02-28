export type JobPlatform =
  | 'linkedin'
  | 'indeed'
  | 'greenhouse'
  | 'lever'
  | 'workday'
  | 'dice'
  | 'monster'
  | 'generic';

export interface Job {
  id: string;
  externalId?: string;
  platform: JobPlatform;
  url: string;

  title: string;
  company: string;
  companyLogoUrl?: string;
  location: string;
  locationType: 'remote' | 'hybrid' | 'onsite' | 'unknown';

  description: string;
  descriptionHtml?: string;
  requirements: string[];
  responsibilities: string[];
  qualifications: JobQualifications;

  extractedSkills: ExtractedSkills;

  salary?: JobSalary;
  benefits?: string[];

  postedDate?: Date;
  applicationDeadline?: Date;
  employmentType: EmploymentType;
  experienceLevel?: ExperienceLevel;
  industry?: string;
  department?: string;
  sponsorshipStatus?: SponsorshipStatus;

  analysis?: JobAnalysis;

  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
}

export interface JobQualifications {
  required: string[];
  preferred: string[];
}

export interface ExtractedSkills {
  technical: string[];
  soft: string[];
  experience: string[];
}

export interface JobSalary {
  min?: number;
  max?: number;
  currency: string;
  period: 'hourly' | 'annual';
}

export type EmploymentType = 'full-time' | 'part-time' | 'contract' | 'internship' | 'unknown';
export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'lead' | 'executive';
export type SponsorshipStatus = 'available' | 'not_available' | 'unknown';

export interface JobAnalysis {
  analyzedAt: Date;
  profileScores: ProfileScore[];
  recommendedProfileId: string;
  insights: JobInsights;
  matchReasoning: string;
}

export interface ProfileScore {
  profileId: string;
  profileName: string;
  overallScore: number;
  skillMatch: number;
  experienceMatch: number;
  educationMatch: number;
  cultureFit: number;
  matchedSkills: string[];
  missingSkills: string[];
  relevantExperience: string[];
}

export interface JobInsights {
  strengths: string[];
  gaps: string[];
  suggestions: string[];
}

export interface ExtractedJob {
  title: string;
  company: string;
  location?: string;
  description: string;
  descriptionHtml?: string;
  salary?: JobSalary;
  employmentType?: EmploymentType;
  postedDate?: Date;
  sponsorshipStatus?: SponsorshipStatus;
}
