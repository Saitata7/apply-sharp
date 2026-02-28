import { describe, it, expect } from 'vitest';
import type {
  EnrichedExperience,
  EnrichedEducation,
  EnrichedProject,
} from '@shared/types/master-profile.types';
import {
  computeYearsFromDates,
  getExperienceLevel,
  getRecommendedPages,
  getSectionOrder,
  computeBulletBudgets,
  computeEducationLayout,
  computeResumeLayout,
  formatResumeDate,
  normalizeSkillName,
  shortenUrl,
} from '../ResumeGenerator';

// ── Factories ───────────────────────────────────────────────────────────

function makeExperience(overrides: Partial<EnrichedExperience> = {}): EnrichedExperience {
  return {
    id: 'exp-1',
    company: 'Acme Corp',
    title: 'Software Engineer',
    normalizedTitle: 'Software Engineer',
    location: 'Remote',
    employmentType: 'full-time',
    startDate: '2022-01',
    endDate: '2024-06',
    isCurrent: false,
    durationMonths: 30,
    description: 'Built things',
    achievements: [],
    responsibilities: [],
    technologiesUsed: [],
    skillsGained: [],
    relevanceMap: {},
    ...overrides,
  };
}

function makeEducation(overrides: Partial<EnrichedEducation> = {}): EnrichedEducation {
  return {
    id: 'edu-1',
    institution: 'MIT',
    degree: 'BS Computer Science',
    normalizedDegree: 'BS',
    field: 'Computer Science',
    startDate: '2018-08',
    endDate: '2022-05',
    relevanceMap: {},
    ...overrides,
  };
}

function makeProject(overrides: Partial<EnrichedProject> = {}): EnrichedProject {
  return {
    id: 'proj-1',
    name: 'Side Project',
    description: 'A project',
    role: 'Creator',
    technologies: ['TypeScript'],
    highlights: ['Built it'],
    impact: 'Learned things',
    relevanceMap: {},
    ...overrides,
  };
}

// ── formatResumeDate ────────────────────────────────────────────────────

describe('formatResumeDate', () => {
  it('converts ISO format "2021-01" to "January 2021"', () => {
    expect(formatResumeDate('2021-01')).toBe('January 2021');
  });

  it('converts ISO format with day "2021-01-15" to "January 2021"', () => {
    expect(formatResumeDate('2021-01-15')).toBe('January 2021');
  });

  it('converts December ISO "2023-12" to "December 2023"', () => {
    expect(formatResumeDate('2023-12')).toBe('December 2023');
  });

  it('converts slash format "01/2024" to "January 2024"', () => {
    expect(formatResumeDate('01/2024')).toBe('January 2024');
  });

  it('converts "present" to "Present"', () => {
    expect(formatResumeDate('present')).toBe('Present');
  });

  it('converts "Current" to "Present" (case-insensitive)', () => {
    expect(formatResumeDate('Current')).toBe('Present');
  });

  it('returns year-only as-is', () => {
    expect(formatResumeDate('2024')).toBe('2024');
  });

  it('passes through already-formatted "January 2024"', () => {
    expect(formatResumeDate('January 2024')).toBe('January 2024');
  });

  it('passes through short month format "Jan 2024"', () => {
    expect(formatResumeDate('Jan 2024')).toBe('Jan 2024');
  });

  it('returns empty string for undefined', () => {
    expect(formatResumeDate(undefined)).toBe('');
  });

  it('returns empty string for garbage values', () => {
    expect(formatResumeDate('null')).toBe('');
    expect(formatResumeDate('undefined')).toBe('');
    expect(formatResumeDate('N/A')).toBe('');
    expect(formatResumeDate('')).toBe('');
  });
});

// ── getExperienceLevel ──────────────────────────────────────────────────

describe('getExperienceLevel', () => {
  it('returns "entry" for 0-3 years', () => {
    expect(getExperienceLevel(0)).toBe('entry');
    expect(getExperienceLevel(2)).toBe('entry');
    expect(getExperienceLevel(3)).toBe('entry');
  });

  it('returns "mid" for 4-7 years', () => {
    expect(getExperienceLevel(4)).toBe('mid');
    expect(getExperienceLevel(7)).toBe('mid');
  });

  it('returns "senior" for 8-15 years', () => {
    expect(getExperienceLevel(8)).toBe('senior');
    expect(getExperienceLevel(15)).toBe('senior');
  });

  it('returns "executive" for 16+ years', () => {
    expect(getExperienceLevel(16)).toBe('executive');
    expect(getExperienceLevel(25)).toBe('executive');
  });
});

// ── getRecommendedPages ─────────────────────────────────────────────────

describe('getRecommendedPages', () => {
  it('returns 1 page for 0-7 years', () => {
    expect(getRecommendedPages(0)).toBe(1);
    expect(getRecommendedPages(5)).toBe(1);
    expect(getRecommendedPages(7)).toBe(1);
  });

  it('returns 2 pages for 8+ years', () => {
    expect(getRecommendedPages(8)).toBe(2);
    expect(getRecommendedPages(15)).toBe(2);
    expect(getRecommendedPages(25)).toBe(2);
  });
});

// ── normalizeSkillName ──────────────────────────────────────────────────

describe('normalizeSkillName', () => {
  it('uppercases known acronyms', () => {
    expect(normalizeSkillName('aws')).toBe('AWS');
    expect(normalizeSkillName('sql')).toBe('SQL');
    expect(normalizeSkillName('ci/cd')).toBe('CI/CD');
    expect(normalizeSkillName('html')).toBe('HTML');
    expect(normalizeSkillName('graphql')).toBe('GraphQL');
    expect(normalizeSkillName('devops')).toBe('DevOps');
  });

  it('applies proper casing to product names', () => {
    expect(normalizeSkillName('kubernetes')).toBe('Kubernetes');
    expect(normalizeSkillName('react')).toBe('React');
    expect(normalizeSkillName('postgresql')).toBe('PostgreSQL');
    expect(normalizeSkillName('node.js')).toBe('Node.js');
    expect(normalizeSkillName('typescript')).toBe('TypeScript');
    expect(normalizeSkillName('javascript')).toBe('JavaScript');
  });

  it('handles compound "or" phrases', () => {
    expect(normalizeSkillName('kafka or rabbitmq')).toBe('Kafka, RabbitMQ');
  });

  it('handles compound "and" phrases', () => {
    expect(normalizeSkillName('grafana and loki')).toBe('Grafana, Loki');
  });

  it('title-cases unknown lowercase phrases', () => {
    expect(normalizeSkillName('test driven')).toBe('Test Driven');
  });

  it('title-cases hyphenated phrases', () => {
    expect(normalizeSkillName('test-driven')).toBe('Test-Driven');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeSkillName('')).toBe('');
  });

  it('passes through already-correct casing', () => {
    expect(normalizeSkillName('AWS')).toBe('AWS');
    expect(normalizeSkillName('React')).toBe('React');
  });

  it('handles multi-word product names', () => {
    expect(normalizeSkillName('spring boot')).toBe('Spring Boot');
    expect(normalizeSkillName('github actions')).toBe('GitHub Actions');
  });

  it('handles gRPC casing', () => {
    expect(normalizeSkillName('grpc')).toBe('gRPC');
  });
});

// ── shortenUrl ──────────────────────────────────────────────────────────

describe('shortenUrl', () => {
  it('strips https protocol', () => {
    expect(shortenUrl('https://github.com/user')).toBe('github.com/user');
  });

  it('strips http protocol', () => {
    expect(shortenUrl('http://example.com')).toBe('example.com');
  });

  it('strips www prefix', () => {
    expect(shortenUrl('https://www.linkedin.com/in/user')).toBe('linkedin.com/in/user');
  });

  it('strips trailing slash', () => {
    expect(shortenUrl('https://example.com/')).toBe('example.com');
  });

  it('returns empty string for undefined', () => {
    expect(shortenUrl(undefined)).toBe('');
  });
});

// ── getSectionOrder ─────────────────────────────────────────────────────

describe('getSectionOrder', () => {
  it('places education before experience for entry level', () => {
    const sections = getSectionOrder('entry', true, false);
    const types = sections.map((s) => s.type);
    expect(types.indexOf('education')).toBeLessThan(types.indexOf('experience'));
  });

  it('places skills before experience for mid level', () => {
    const sections = getSectionOrder('mid', false, false);
    const types = sections.map((s) => s.type);
    expect(types.indexOf('skills')).toBeLessThan(types.indexOf('experience'));
  });

  it('places education after experience for senior level', () => {
    const sections = getSectionOrder('senior', false, false);
    const types = sections.map((s) => s.type);
    expect(types.indexOf('education')).toBeGreaterThan(types.indexOf('experience'));
  });

  it('includes projects section when hasProjects is true (entry)', () => {
    const sections = getSectionOrder('entry', true, false);
    const projectSection = sections.find((s) => s.type === 'projects');
    expect(projectSection?.visible).toBe(true);
  });

  it('hides projects when hasProjects is false', () => {
    const sections = getSectionOrder('entry', false, false);
    const projectSection = sections.find((s) => s.type === 'projects');
    expect(projectSection?.visible).toBe(false);
  });

  it('includes certifications when hasCerts is true', () => {
    const sections = getSectionOrder('mid', false, true);
    const certSection = sections.find((s) => s.type === 'certifications');
    expect(certSection?.visible).toBe(true);
  });

  it('always starts with name, contact, summary', () => {
    for (const level of ['entry', 'mid', 'senior', 'executive'] as const) {
      const sections = getSectionOrder(level, false, false);
      expect(sections[0].type).toBe('name');
      expect(sections[1].type).toBe('contact');
      expect(sections[2].type).toBe('summary');
    }
  });

  it('omits projects section for senior/executive', () => {
    const senior = getSectionOrder('senior', true, false);
    expect(senior.find((s) => s.type === 'projects')).toBeUndefined();

    const exec = getSectionOrder('executive', true, false);
    expect(exec.find((s) => s.type === 'projects')).toBeUndefined();
  });
});

// ── computeBulletBudgets ────────────────────────────────────────────────

describe('computeBulletBudgets', () => {
  it('returns empty roles and 0 budget for empty experience', () => {
    const result = computeBulletBudgets([], 1, 5);
    expect(result.roles).toHaveLength(0);
    expect(result.totalBudget).toBe(0);
  });

  it('gives most bullets to the first (most recent) role', () => {
    const exp = [
      makeExperience({
        id: 'recent',
        startDate: '2023-01',
        endDate: '2024-06',
        durationMonths: 18,
      }),
      makeExperience({ id: 'older', startDate: '2020-01', endDate: '2022-12', durationMonths: 36 }),
    ];
    const result = computeBulletBudgets(exp, 1, 5);
    const recentRole = result.roles.find((r) => r.expId === 'recent');
    const olderRole = result.roles.find((r) => r.expId === 'older');
    expect(recentRole!.maxBullets).toBeGreaterThanOrEqual(olderRole!.maxBullets);
  });

  it('caps short tenure roles (< 6 months) at 3 bullets', () => {
    const exp = [makeExperience({ durationMonths: 3, startDate: '2024-01', endDate: '2024-03' })];
    const result = computeBulletBudgets(exp, 2, 3);
    expect(result.roles[0].maxBullets).toBeLessThanOrEqual(3);
  });

  it('allows up to 7 bullets for long tenure (3+ years)', () => {
    const exp = [makeExperience({ durationMonths: 48, startDate: '2020-01', endDate: '2024-01' })];
    const result = computeBulletBudgets(exp, 2, 5);
    expect(result.roles[0].maxBullets).toBeLessThanOrEqual(7);
  });

  it('enforces 1-page budget cap (max ~18)', () => {
    const exp = Array.from({ length: 5 }, (_, i) =>
      makeExperience({
        id: `exp-${i}`,
        durationMonths: 36,
        startDate: `${2020 - i * 3}-01`,
        endDate: `${2023 - i * 3}-01`,
      })
    );
    const result = computeBulletBudgets(exp, 1, 12);
    expect(result.totalBudget).toBeLessThanOrEqual(18);
  });

  it('enforces 2-page budget cap (max ~35)', () => {
    const exp = Array.from({ length: 6 }, (_, i) =>
      makeExperience({
        id: `exp-${i}`,
        durationMonths: 36,
        startDate: `${2020 - i * 3}-01`,
        endDate: `${2023 - i * 3}-01`,
      })
    );
    const result = computeBulletBudgets(exp, 2, 15);
    expect(result.totalBudget).toBeLessThanOrEqual(35);
  });

  it('marks very old roles as early career (0 bullets) for senior candidates', () => {
    const now = new Date();
    const oldEndYear = now.getFullYear() - 12;
    const exp = [
      makeExperience({
        id: 'recent',
        startDate: '2022-01',
        isCurrent: true,
        durationMonths: 24,
      }),
      makeExperience({
        id: 'ancient',
        startDate: `${oldEndYear - 3}-01`,
        endDate: `${oldEndYear}-01`,
        durationMonths: 36,
      }),
    ];
    const result = computeBulletBudgets(exp, 2, 15);
    const ancient = result.roles.find((r) => r.expId === 'ancient');
    expect(ancient!.isEarlyCareer).toBe(true);
    expect(ancient!.maxBullets).toBe(0);
  });

  it('trims bullets from oldest roles first when over budget', () => {
    const exp = [
      makeExperience({ id: 'r1', durationMonths: 36, startDate: '2023-01', endDate: '2025-12' }),
      makeExperience({ id: 'r2', durationMonths: 36, startDate: '2020-01', endDate: '2022-12' }),
      makeExperience({ id: 'r3', durationMonths: 36, startDate: '2017-01', endDate: '2019-12' }),
    ];
    const result = computeBulletBudgets(exp, 1, 8);
    // r3 (oldest) should have fewer bullets than r1 (newest)
    const r1 = result.roles.find((r) => r.expId === 'r1')!;
    const r3 = result.roles.find((r) => r.expId === 'r3')!;
    expect(r1.maxBullets).toBeGreaterThanOrEqual(r3.maxBullets);
  });

  it('handles single role correctly', () => {
    const exp = [makeExperience({ durationMonths: 24 })];
    const result = computeBulletBudgets(exp, 1, 3);
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0].maxBullets).toBeGreaterThan(0);
    expect(result.totalBudget).toBeGreaterThan(0);
  });
});

// ── computeEducationLayout ──────────────────────────────────────────────

describe('computeEducationLayout', () => {
  it('returns empty array for no education', () => {
    expect(computeEducationLayout([], 5)).toEqual([]);
  });

  it('shows GPA when >= 3.5 and graduated within 3 years', () => {
    const now = new Date();
    const recentGrad = `${now.getFullYear() - 1}-05`;
    const edu = [makeEducation({ gpa: 3.8, endDate: recentGrad })];
    const result = computeEducationLayout(edu, 1);
    expect(result[0].showGpa).toBe(true);
  });

  it('hides GPA when < 3.5', () => {
    const now = new Date();
    const recentGrad = `${now.getFullYear() - 1}-05`;
    const edu = [makeEducation({ gpa: 3.2, endDate: recentGrad })];
    const result = computeEducationLayout(edu, 1);
    expect(result[0].showGpa).toBe(false);
  });

  it('hides GPA when graduated more than 3 years ago', () => {
    const now = new Date();
    const oldGrad = `${now.getFullYear() - 5}-05`;
    const edu = [makeEducation({ gpa: 3.9, endDate: oldGrad })];
    const result = computeEducationLayout(edu, 5);
    expect(result[0].showGpa).toBe(false);
  });

  it('shows graduation date when < 10 years experience', () => {
    const edu = [makeEducation()];
    const result = computeEducationLayout(edu, 8);
    expect(result[0].showGraduationDate).toBe(true);
  });

  it('hides graduation date when >= 10 years experience', () => {
    const edu = [makeEducation()];
    const result = computeEducationLayout(edu, 12);
    expect(result[0].showGraduationDate).toBe(false);
  });

  it('shows coursework when <= 3 years experience and has coursework', () => {
    const edu = [makeEducation({ relevantCoursework: ['Algorithms', 'OS'] })];
    const result = computeEducationLayout(edu, 2);
    expect(result[0].showCoursework).toBe(true);
  });

  it('hides coursework when > 3 years experience', () => {
    const edu = [makeEducation({ relevantCoursework: ['Algorithms'] })];
    const result = computeEducationLayout(edu, 5);
    expect(result[0].showCoursework).toBe(false);
  });

  it('shows honors when <= 5 years and has honors', () => {
    const edu = [makeEducation({ honors: ['Magna Cum Laude'] })];
    const result = computeEducationLayout(edu, 4);
    expect(result[0].showHonors).toBe(true);
  });

  it('hides honors when > 5 years experience', () => {
    const edu = [makeEducation({ honors: ['Summa Cum Laude'] })];
    const result = computeEducationLayout(edu, 8);
    expect(result[0].showHonors).toBe(false);
  });
});

// ── computeYearsFromDates ───────────────────────────────────────────────

describe('computeYearsFromDates', () => {
  it('returns 0 for empty array', () => {
    expect(computeYearsFromDates([])).toBe(0);
  });

  it('calculates years from earliest start date', () => {
    const now = new Date();
    const fiveYearsAgo = `${now.getFullYear() - 5}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const exp = [makeExperience({ startDate: fiveYearsAgo, isCurrent: true })];
    const years = computeYearsFromDates(exp);
    expect(years).toBeGreaterThanOrEqual(4);
    expect(years).toBeLessThanOrEqual(6);
  });

  it('uses the earliest start date across multiple jobs', () => {
    const now = new Date();
    const tenYearsAgo = `${now.getFullYear() - 10}-01`;
    const fiveYearsAgo = `${now.getFullYear() - 5}-01`;
    const exp = [
      makeExperience({ id: 'recent', startDate: fiveYearsAgo }),
      makeExperience({ id: 'old', startDate: tenYearsAgo }),
    ];
    const years = computeYearsFromDates(exp);
    expect(years).toBeGreaterThanOrEqual(9);
    expect(years).toBeLessThanOrEqual(11);
  });

  it('handles invalid start dates gracefully', () => {
    const exp = [makeExperience({ startDate: 'not-a-date' })];
    const years = computeYearsFromDates(exp);
    expect(years).toBe(0);
  });
});

// ── computeResumeLayout ─────────────────────────────────────────────────

describe('computeResumeLayout', () => {
  it('returns entry-level layout with projects for junior candidates', () => {
    const result = computeResumeLayout({
      yearsOfExperience: 2,
      targetPages: 1,
      experience: [makeExperience({ durationMonths: 24 })],
      education: [makeEducation()],
      projects: [makeProject()],
      certifications: [],
    });
    expect(result.experienceLevel).toBe('entry');
    expect(result.showProjects).toBe(true);
    expect(result.recommendedPages).toBe(1);
  });

  it('returns senior-level layout without projects', () => {
    const result = computeResumeLayout({
      yearsOfExperience: 12,
      targetPages: 2,
      experience: [
        makeExperience({ id: 'e1', durationMonths: 48 }),
        makeExperience({ id: 'e2', durationMonths: 36 }),
      ],
      education: [makeEducation()],
      projects: [makeProject()],
      certifications: [],
    });
    expect(result.experienceLevel).toBe('senior');
    expect(result.showProjects).toBe(false);
    expect(result.recommendedPages).toBe(2);
  });

  it('includes all experience roles in layout', () => {
    const exp = [
      makeExperience({ id: 'e1', durationMonths: 24 }),
      makeExperience({ id: 'e2', durationMonths: 18 }),
      makeExperience({ id: 'e3', durationMonths: 12 }),
    ];
    const result = computeResumeLayout({
      yearsOfExperience: 5,
      targetPages: 1,
      experience: exp,
      education: [],
      projects: [],
      certifications: [],
    });
    expect(result.experienceRoles).toHaveLength(3);
  });

  it('includes education entries in layout', () => {
    const result = computeResumeLayout({
      yearsOfExperience: 3,
      targetPages: 1,
      experience: [],
      education: [makeEducation({ id: 'edu-1' }), makeEducation({ id: 'edu-2' })],
      projects: [],
      certifications: [],
    });
    expect(result.educationEntries).toHaveLength(2);
  });
});
