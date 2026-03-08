/**
 * Proactive Profile Reviewer
 *
 * After a profile is created (via upload or conversation), this runs
 * automatically to provide a brutal honest review:
 * - Gap analysis vs common job requirements in their field
 * - Weak bullets that won't survive ATS or interviewer scrutiny
 * - Comparative positioning ("For Senior Backend roles, you're missing X, Y")
 * - Specific improvement suggestions with priority ordering
 * - Red flags: employment gaps, title inconsistencies, skill mismatches
 *
 * Displayed as a "Profile Health" dashboard with actionable items.
 */

import type { MasterProfile } from '@shared/types/master-profile.types';
import { validateAllClaims, type ClaimsReport } from './claims-validator';
import { scanRedFlags, type RedFlagReport } from '../resume/red-flag-scanner';

// ── Types ──────────────────────────────────────────────────────────────────

export type HealthLevel = 'excellent' | 'good' | 'needs-work' | 'critical';

export interface ProfileHealthReport {
  overallScore: number;
  level: HealthLevel;
  summary: string;

  // Sub-reports
  claimsReport: ClaimsReport;
  redFlagReport: RedFlagReport;
  completenessReport: CompletenessReport;
  strengthsReport: StrengthsReport;

  // Prioritized action items
  actionItems: ActionItem[];
}

export interface ActionItem {
  priority: 'high' | 'medium' | 'low';
  category: ActionCategory;
  title: string;
  description: string;
  suggestion: string;
}

export type ActionCategory =
  | 'weak_bullet'
  | 'missing_info'
  | 'red_flag'
  | 'skill_gap'
  | 'incomplete_section'
  | 'defensibility';

export interface CompletenessReport {
  score: number;
  sections: SectionCompleteness[];
}

export interface SectionCompleteness {
  name: string;
  isPresent: boolean;
  isComplete: boolean;
  issues: string[];
}

export interface StrengthsReport {
  topStrengths: string[];
  uniqueValueProps: string[];
  strongestBullets: string[];
}

// ── Main Function ──────────────────────────────────────────────────────────

/**
 * Run a comprehensive profile health review.
 * Returns actionable insights sorted by priority.
 */
export function reviewProfileHealth(profile: MasterProfile): ProfileHealthReport {
  // Run sub-analyses
  const claimsReport = runClaimsAnalysis(profile);
  const redFlagReport = runRedFlagAnalysis(profile);
  const completenessReport = checkCompleteness(profile);
  const strengthsReport = identifyStrengths(profile);

  // Build action items from all sub-reports
  const actionItems = buildActionItems(claimsReport, redFlagReport, completenessReport, profile);

  // Calculate overall score (weighted average)
  const overallScore = Math.round(
    claimsReport.overallScore * 0.3 +
      redFlagReport.score * 0.25 +
      completenessReport.score * 0.25 +
      (strengthsReport.topStrengths.length > 0 ? 80 : 40) * 0.2
  );

  const level: HealthLevel =
    overallScore >= 85
      ? 'excellent'
      : overallScore >= 70
        ? 'good'
        : overallScore >= 50
          ? 'needs-work'
          : 'critical';

  const summary = buildSummary(level, actionItems, strengthsReport);

  return {
    overallScore,
    level,
    summary,
    claimsReport,
    redFlagReport,
    completenessReport,
    strengthsReport,
    actionItems,
  };
}

// ── Sub-analyses ───────────────────────────────────────────────────────────

function runClaimsAnalysis(profile: MasterProfile): ClaimsReport {
  const experiences = (profile.experience || []).map((exp) => ({
    company: exp.company || '',
    title: exp.title || '',
    achievements: (exp.achievements || []).map(
      (a) => (typeof a === 'string' ? a : (a as { text?: string }).text) || ''
    ),
  }));
  return validateAllClaims(experiences);
}

function runRedFlagAnalysis(profile: MasterProfile): RedFlagReport {
  return scanRedFlags(profile);
}

function checkCompleteness(profile: MasterProfile): CompletenessReport {
  const sections: SectionCompleteness[] = [];

  // Personal info
  const personalIssues: string[] = [];
  if (!profile.personal?.email) personalIssues.push('Missing email address');
  if (!profile.personal?.phone) personalIssues.push('Missing phone number');
  if (!profile.personal?.linkedInUrl) personalIssues.push('Missing LinkedIn URL');
  if (!profile.personal?.location?.formatted) personalIssues.push('Missing location');
  sections.push({
    name: 'Contact Information',
    isPresent: !!profile.personal?.fullName,
    isComplete: personalIssues.length === 0,
    issues: personalIssues,
  });

  // Career context / Summary
  const summaryIssues: string[] = [];
  if (!profile.careerContext?.summary) summaryIssues.push('Missing professional summary');
  if (profile.careerContext?.summary && profile.careerContext.summary.length < 50)
    summaryIssues.push('Summary is too short — aim for 2-3 sentences');
  sections.push({
    name: 'Professional Summary',
    isPresent: !!profile.careerContext?.summary,
    isComplete: summaryIssues.length === 0,
    issues: summaryIssues,
  });

  // Experience
  const expIssues: string[] = [];
  const experiences = profile.experience || [];
  if (experiences.length === 0) {
    expIssues.push('No work experience listed');
  } else {
    for (const exp of experiences) {
      const achievements = exp.achievements || [];
      if (achievements.length === 0) {
        expIssues.push(`${exp.company} — no achievement bullets`);
      } else if (achievements.length < 3) {
        expIssues.push(`${exp.company} — only ${achievements.length} bullets (aim for 3-5)`);
      }
    }
  }
  sections.push({
    name: 'Work Experience',
    isPresent: experiences.length > 0,
    isComplete: expIssues.length === 0,
    issues: expIssues,
  });

  // Skills
  const skillIssues: string[] = [];
  const skills = profile.skills;
  const totalSkills =
    (skills?.technical?.length || 0) +
    (skills?.tools?.length || 0) +
    (skills?.frameworks?.length || 0) +
    (skills?.programmingLanguages?.length || 0);
  if (totalSkills === 0) skillIssues.push('No technical skills listed');
  if (totalSkills < 5) skillIssues.push('Very few skills — most profiles have 10-20');
  sections.push({
    name: 'Skills',
    isPresent: totalSkills > 0,
    isComplete: skillIssues.length === 0,
    issues: skillIssues,
  });

  // Education
  const eduIssues: string[] = [];
  if (!profile.education || profile.education.length === 0) {
    eduIssues.push('No education listed');
  }
  sections.push({
    name: 'Education',
    isPresent: (profile.education || []).length > 0,
    isComplete: eduIssues.length === 0,
    issues: eduIssues,
  });

  // Projects (optional but recommended)
  sections.push({
    name: 'Projects',
    isPresent: (profile.projects || []).length > 0,
    isComplete: true,
    issues:
      (profile.projects || []).length === 0
        ? ['No projects listed — consider adding side projects or key work projects']
        : [],
  });

  // Calculate score
  const completeSections = sections.filter((s) => s.isComplete).length;
  const presentSections = sections.filter((s) => s.isPresent).length;
  const score = Math.round(
    (completeSections / sections.length) * 60 + (presentSections / sections.length) * 40
  );

  return { score, sections };
}

function identifyStrengths(profile: MasterProfile): StrengthsReport {
  const topStrengths: string[] = [];
  const uniqueValueProps: string[] = [];
  const strongestBullets: string[] = [];

  // From career context
  if (profile.careerContext?.strengthAreas) {
    topStrengths.push(...profile.careerContext.strengthAreas.slice(0, 5));
  }

  if (profile.careerContext?.uniqueValueProps) {
    uniqueValueProps.push(...profile.careerContext.uniqueValueProps.slice(0, 3));
  }

  // Find strongest bullets (with quantification and action verbs)
  for (const exp of profile.experience || []) {
    for (const achievement of exp.achievements || []) {
      const text = typeof achievement === 'string' ? achievement : '';
      if (!text) continue;
      // Simple heuristic: has numbers + starts with strong verb
      const hasNumbers = /\d+/.test(text);
      const hasStrongVerb =
        /^(spearheaded|orchestrated|architected|engineered|led|drove|built|designed|delivered|accelerated)/i.test(
          text
        );
      if (hasNumbers && hasStrongVerb) {
        strongestBullets.push(text);
      }
    }
  }

  return {
    topStrengths,
    uniqueValueProps,
    strongestBullets: strongestBullets.slice(0, 5),
  };
}

// ── Action Item Builder ────────────────────────────────────────────────────

function buildActionItems(
  claimsReport: ClaimsReport,
  redFlagReport: RedFlagReport,
  completenessReport: CompletenessReport,
  profile: MasterProfile
): ActionItem[] {
  const items: ActionItem[] = [];

  // From completeness — missing sections
  for (const section of completenessReport.sections) {
    if (!section.isPresent) {
      items.push({
        priority: section.name === 'Work Experience' ? 'high' : 'medium',
        category: 'incomplete_section',
        title: `Missing: ${section.name}`,
        description: section.issues[0] || `${section.name} section is missing`,
        suggestion: `Add your ${section.name.toLowerCase()} to strengthen your profile.`,
      });
    } else if (!section.isComplete) {
      for (const issue of section.issues) {
        items.push({
          priority: 'medium',
          category: 'missing_info',
          title: `Incomplete: ${section.name}`,
          description: issue,
          suggestion: `Complete your ${section.name.toLowerCase()} — recruiters notice gaps.`,
        });
      }
    }
  }

  // From claims — weak bullets
  for (const claim of claimsReport.claims) {
    if (claim.level === 'weak') {
      items.push({
        priority: 'high',
        category: 'weak_bullet',
        title: 'Weak bullet — not defensible',
        description: `"${claim.text.substring(0, 80)}..."`,
        suggestion: claim.suggestedImprovement || 'Add specifics: metrics, scope, or context.',
      });
    }
  }

  // From red flags
  for (const flag of redFlagReport.flags || []) {
    items.push({
      priority: flag.severity === 'error' ? 'high' : 'medium',
      category: 'red_flag',
      title: flag.message || 'Red flag detected',
      description: flag.details || flag.message || '',
      suggestion: flag.suggestion || 'Address this before applying.',
    });
  }

  // Skill gaps for target roles
  const bestFitRoles = profile.careerContext?.bestFitRoles || [];
  if (bestFitRoles.length > 0) {
    const topRole = bestFitRoles[0];
    if (topRole && typeof topRole === 'object' && 'fitScore' in topRole) {
      const fitScore = (topRole as { fitScore?: number }).fitScore || 0;
      if (fitScore < 70) {
        items.push({
          priority: 'medium',
          category: 'skill_gap',
          title: `Fit gap for top target role`,
          description: `Your strongest role fit is ${fitScore}/100. Consider strengthening relevant skills.`,
          suggestion: 'Focus on the skills and experiences most relevant to your target role.',
        });
      }
    }
  }

  // Sort by priority
  const priorityOrder: Record<string, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return items;
}

// ── Summary Builder ────────────────────────────────────────────────────────

function buildSummary(
  level: HealthLevel,
  actionItems: ActionItem[],
  strengthsReport: StrengthsReport
): string {
  const highPriority = actionItems.filter((i) => i.priority === 'high').length;

  switch (level) {
    case 'excellent':
      return `Your profile is strong. ${strengthsReport.topStrengths.length > 0 ? `Key strengths: ${strengthsReport.topStrengths.slice(0, 3).join(', ')}.` : ''} Minor tweaks could make it even better.`;
    case 'good':
      return `Your profile is solid but has ${highPriority > 0 ? `${highPriority} high-priority items` : 'room for improvement'}. Focus on making your bullets more defensible with specific metrics and context.`;
    case 'needs-work':
      return `Your profile needs attention. ${highPriority} items require immediate action — especially weak bullets that won't survive interviewer scrutiny.`;
    case 'critical':
      return `Your profile has significant gaps. ${highPriority} critical issues need to be addressed before applying. Focus on completing missing sections and strengthening weak claims.`;
  }
}
