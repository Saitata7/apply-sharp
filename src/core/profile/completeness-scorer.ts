/**
 * Profile completeness scoring.
 *
 * Returns a 0..100 score across 8 weighted dimensions. Used by the profile
 * onboarding UI to:
 *
 *   - Show a completeness ring with the 80% target line
 *   - Block autofill below 60 (UI hides the autofill button)
 *   - Warn but allow at 60..80
 *   - Unlock everything at 80+
 *
 * The 8 dimensions and their weights are:
 *
 *   contact info          (10)  email + phone + name = required for any apply
 *   summary               (15)  career narrative, the most important block
 *   primary experience    (25)  at least one role with achievements
 *   experience depth      (10)  at least two roles
 *   skills with categories(10)  technical skills present
 *   education             (10)  at least one entry
 *   projects              (10)  at least one project (or extra experience)
 *   defensibility average (10)  every bullet defensible (claims-validator)
 *
 * Total = 100. The 80 threshold is documented in chrome-agent.md.
 */

import type { MasterProfile } from '@shared/types/master-profile.types';

export interface CompletenessDimension {
  key:
    | 'contact'
    | 'summary'
    | 'primary_experience'
    | 'experience_depth'
    | 'skills'
    | 'education'
    | 'projects'
    | 'defensibility';
  label: string;
  weight: number;
  score: number; // 0..weight (not 0..100)
  satisfied: boolean;
  /** Why the dimension is incomplete, surfaced to the user. */
  gap?: string;
}

export interface CompletenessReport {
  total: number; // 0..100
  threshold: {
    autofillUnlocked: boolean; // total >= 60
    autofillRecommended: boolean; // total >= 80
  };
  dimensions: CompletenessDimension[];
  /** Highest-leverage missing dimension, used to drive the next interview question. */
  nextStep: CompletenessDimension | null;
}

const AUTOFILL_MIN = 60;
const AUTOFILL_RECOMMENDED = 80;

function scoreContact(profile: MasterProfile): CompletenessDimension {
  const personal = profile.personal;
  const has = {
    name: !!(personal?.fullName || (personal?.firstName && personal?.lastName)),
    email: !!personal?.email,
    phone: !!personal?.phone,
  };
  const present = Object.values(has).filter(Boolean).length;
  const score = present === 3 ? 10 : present * 3; // 0, 3, 6, or 10
  return {
    key: 'contact',
    label: 'Contact info',
    weight: 10,
    score,
    satisfied: present === 3,
    gap: present < 3 ? 'Missing email, phone, or name' : undefined,
  };
}

function scoreSummary(profile: MasterProfile): CompletenessDimension {
  const summary = profile.careerContext?.summary?.trim() ?? '';
  const wordCount = summary.split(/\s+/).filter(Boolean).length;
  const satisfied = wordCount >= 30;
  return {
    key: 'summary',
    label: 'Professional summary',
    weight: 15,
    score: satisfied ? 15 : Math.min(15, Math.floor((wordCount / 30) * 15)),
    satisfied,
    gap: satisfied ? undefined : 'Career summary is missing or too short (target: 30+ words)',
  };
}

function scorePrimaryExperience(profile: MasterProfile): CompletenessDimension {
  const exp = profile.experience?.[0];
  if (!exp) {
    return {
      key: 'primary_experience',
      label: 'Most recent role',
      weight: 25,
      score: 0,
      satisfied: false,
      gap: 'No experience entries yet',
    };
  }
  const hasTitle = !!exp.title;
  const hasCompany = !!exp.company;
  const achievementCount = (exp.achievements ?? []).length;
  const hasAchievements = achievementCount >= 2;
  const present = [hasTitle, hasCompany, hasAchievements].filter(Boolean).length;
  const score = present === 3 ? 25 : present === 2 ? 15 : present === 1 ? 8 : 0;
  return {
    key: 'primary_experience',
    label: 'Most recent role',
    weight: 25,
    score,
    satisfied: present === 3,
    gap: !hasAchievements
      ? 'Most recent role is missing achievements (target: at least 2 bullets)'
      : !hasTitle
        ? 'Most recent role is missing a title'
        : !hasCompany
          ? 'Most recent role is missing a company'
          : undefined,
  };
}

function scoreExperienceDepth(profile: MasterProfile): CompletenessDimension {
  const count = profile.experience?.length ?? 0;
  const satisfied = count >= 2;
  return {
    key: 'experience_depth',
    label: 'Experience depth',
    weight: 10,
    score: satisfied ? 10 : count === 1 ? 5 : 0,
    satisfied,
    gap: satisfied ? undefined : 'Add at least one more role for context',
  };
}

function scoreSkills(profile: MasterProfile): CompletenessDimension {
  const technical = profile.skills?.technical ?? [];
  const count = technical.length;
  const satisfied = count >= 5;
  return {
    key: 'skills',
    label: 'Technical skills',
    weight: 10,
    score: satisfied ? 10 : Math.min(10, count * 2),
    satisfied,
    gap: satisfied ? undefined : 'Add at least 5 technical skills',
  };
}

function scoreEducation(profile: MasterProfile): CompletenessDimension {
  const count = profile.education?.length ?? 0;
  const satisfied = count >= 1;
  return {
    key: 'education',
    label: 'Education',
    weight: 10,
    score: satisfied ? 10 : 0,
    satisfied,
    gap: satisfied ? undefined : 'Add at least one education entry (degree or certification)',
  };
}

function scoreProjects(profile: MasterProfile): CompletenessDimension {
  const count = profile.projects?.length ?? 0;
  const satisfied = count >= 1;
  return {
    key: 'projects',
    label: 'Projects',
    weight: 10,
    score: satisfied ? 10 : 0,
    satisfied,
    gap: satisfied ? undefined : 'Add at least one project to show real work',
  };
}

function scoreDefensibility(profile: MasterProfile): CompletenessDimension {
  // Average defensibility across every bullet that has a defensibility score
  // attached. The claims-validator runs separately and stores a score on each
  // achievement; if no scores exist yet, we award partial credit just for
  // having content.
  let total = 0;
  let counted = 0;
  for (const exp of profile.experience ?? []) {
    for (const a of exp.achievements ?? []) {
      const obj = a as { defensibilityScore?: number };
      if (typeof obj.defensibilityScore === 'number') {
        total += obj.defensibilityScore;
        counted++;
      }
    }
  }
  if (counted === 0) {
    // No defensibility scores yet. Give partial credit if any bullets exist.
    const hasAny = (profile.experience ?? []).flatMap((e) => e.achievements ?? []).length > 0;
    return {
      key: 'defensibility',
      label: 'Bullet defensibility',
      weight: 10,
      score: hasAny ? 5 : 0,
      satisfied: false,
      gap: 'Run the claims validator to score every bullet',
    };
  }
  const average = total / counted; // expected 0..100
  const satisfied = average >= 70;
  return {
    key: 'defensibility',
    label: 'Bullet defensibility',
    weight: 10,
    score: Math.round((average / 100) * 10),
    satisfied,
    gap: satisfied ? undefined : `Average defensibility is ${Math.round(average)}/100; aim for 70+`,
  };
}

const SCORERS: ((p: MasterProfile) => CompletenessDimension)[] = [
  scoreContact,
  scoreSummary,
  scorePrimaryExperience,
  scoreExperienceDepth,
  scoreSkills,
  scoreEducation,
  scoreProjects,
  scoreDefensibility,
];

export function scoreProfileCompleteness(profile: MasterProfile): CompletenessReport {
  const dimensions = SCORERS.map((fn) => fn(profile));
  const total = dimensions.reduce((acc, d) => acc + d.score, 0);

  // The next step is the highest-weight unsatisfied dimension. The interview
  // engine uses this to pick the next question.
  const nextStep =
    dimensions
      .filter((d) => !d.satisfied)
      .sort((a, b) => b.weight - a.weight + (b.weight - b.score - (a.weight - a.score)))[0] ?? null;

  return {
    total,
    threshold: {
      autofillUnlocked: total >= AUTOFILL_MIN,
      autofillRecommended: total >= AUTOFILL_RECOMMENDED,
    },
    dimensions,
    nextStep,
  };
}
