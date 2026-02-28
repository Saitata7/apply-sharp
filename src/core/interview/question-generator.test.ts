import { describe, it, expect } from 'vitest';
import { getCategoryLabel, getDifficultyColor, buildProfileContext } from './question-generator';
import type { MasterProfile } from '@shared/types/master-profile.types';

// ── Helper: build a mock MasterProfile ──────────────────────────────────

function makeProfile(overrides: Partial<MasterProfile> = {}): MasterProfile {
  return {
    id: 'test-id',
    createdAt: new Date(),
    updatedAt: new Date(),
    sourceDocument: {
      fileName: 'resume.pdf',
      fileType: 'pdf',
      uploadedAt: new Date(),
      rawText: 'raw text',
      checksum: 'abc123',
    },
    personal: {
      fullName: 'Jane Doe',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: '555-0100',
      location: { city: 'Austin', state: 'TX', country: 'US', formatted: 'Austin, TX' },
    },
    careerContext: {
      summary: 'Senior software engineer with 8 years of experience building scalable systems.',
      careerTrajectory: 'ascending',
      yearsOfExperience: 8,
      seniorityLevel: 'senior',
      primaryDomain: 'Backend Engineering',
      secondaryDomains: ['DevOps'],
      industryExperience: ['Fintech', 'E-commerce'],
      bestFitRoles: [
        {
          title: 'Senior Backend Engineer',
          fitScore: 90,
          reasons: ['strong fit'],
          yearsRelevantExp: 6,
        },
      ],
      strengthAreas: ['Distributed Systems', 'API Design', 'Mentoring'],
      growthAreas: ['Public Speaking', 'ML/AI'],
      writingStyle: {
        tone: 'professional',
        complexity: 'moderate',
        preferredVoice: 'first-person',
      },
      topAccomplishments: [
        {
          statement: 'Led migration to microservices',
          impact: 'Reduced deploy time by 80%',
          skills: ['Go', 'Kubernetes'],
          relevantFor: ['backend'],
        },
        {
          statement: 'Built real-time data pipeline',
          impact: 'Processed 2M events/day',
          skills: ['Kafka', 'Python'],
          relevantFor: ['data'],
        },
      ],
      uniqueValueProps: ['Strong at cross-team collaboration'],
    },
    experience: [
      {
        id: 'exp1',
        company: 'TechCorp',
        companyContext: 'Series C fintech startup',
        title: 'Senior Backend Engineer',
        normalizedTitle: 'Senior Backend Engineer',
        location: 'Austin, TX',
        employmentType: 'full-time',
        startDate: '2021-01',
        isCurrent: true,
        durationMonths: 36,
        description: 'Led backend platform team',
        achievements: [
          {
            statement: 'Migrated monolith to microservices serving 2M daily users',
            isQuantified: true,
            metrics: { value: '2M', type: 'number' },
            keywords: ['microservices'],
          },
          {
            statement: 'Reduced API latency by 40% through caching strategy',
            isQuantified: true,
            metrics: { value: '40%', type: 'percentage' },
            keywords: ['performance'],
          },
        ],
        responsibilities: ['Platform architecture'],
        technologiesUsed: [
          { skill: 'Go', proficiency: 'expert', yearsUsed: 3, context: 'Primary language' },
        ],
        skillsGained: ['Go'],
        relevanceMap: { backend: 95 },
      },
      {
        id: 'exp2',
        company: 'StartupABC',
        title: 'Software Engineer',
        normalizedTitle: 'Software Engineer',
        location: 'Remote',
        employmentType: 'full-time',
        startDate: '2018-03',
        endDate: '2020-12',
        isCurrent: false,
        durationMonths: 34,
        description: 'Full stack development',
        achievements: [
          {
            statement: 'Built CI/CD pipeline reducing deploy failures by 60%',
            isQuantified: true,
            keywords: ['CI/CD'],
          },
        ],
        responsibilities: ['Feature development'],
        technologiesUsed: [],
        skillsGained: ['Python'],
        relevanceMap: { fullstack: 80 },
      },
    ],
    skills: {
      technical: [
        {
          name: 'Go',
          normalizedName: 'Go',
          category: 'language',
          yearsOfExperience: 3,
          proficiency: 'expert',
          lastUsed: 'current',
          evidenceFrom: ['exp1'],
          aliases: ['Golang'],
        },
        {
          name: 'Python',
          normalizedName: 'Python',
          category: 'language',
          yearsOfExperience: 5,
          proficiency: 'advanced',
          lastUsed: '2020',
          evidenceFrom: ['exp2'],
          aliases: [],
        },
        {
          name: 'Kubernetes',
          normalizedName: 'Kubernetes',
          category: 'devops',
          yearsOfExperience: 3,
          proficiency: 'advanced',
          lastUsed: 'current',
          evidenceFrom: ['exp1'],
          aliases: ['k8s'],
        },
      ],
      tools: [],
      frameworks: [],
      soft: [{ name: 'Leadership', evidence: ['Led team of 5'], relevance: ['senior'] }],
      programmingLanguages: [],
      naturalLanguages: [{ language: 'English', proficiency: 'native' }],
      clusters: [],
    },
    education: [],
    projects: [],
    certifications: [],
    answerBank: { commonQuestions: [], patterns: [], customAnswers: {} },
    autofillData: {
      workAuthorization: 'citizen',
      workAuthorizationText: 'US Citizen',
      requiresSponsorship: false,
      canStartImmediately: true,
      remotePreference: 'remote',
      linkedInConsent: true,
      portfolioConsent: true,
      backgroundCheckConsent: true,
      drugTestConsent: true,
      currentlyEmployed: true,
    },
    generatedProfiles: [],
    ...overrides,
  } as MasterProfile;
}

// ── getCategoryLabel ────────────────────────────────────────────────────

describe('getCategoryLabel', () => {
  it('returns correct label for all 6 categories', () => {
    expect(getCategoryLabel('behavioral')).toBe('Behavioral');
    expect(getCategoryLabel('technical')).toBe('Technical');
    expect(getCategoryLabel('role_specific')).toBe('Role-Specific');
    expect(getCategoryLabel('company_culture')).toBe('Company & Culture');
    expect(getCategoryLabel('weakness_gap')).toBe('Weakness / Gap');
    expect(getCategoryLabel('curveball')).toBe('Curveball');
  });
});

// ── getDifficultyColor ──────────────────────────────────────────────────

describe('getDifficultyColor', () => {
  it('returns green for easy', () => {
    expect(getDifficultyColor('easy')).toBe('#10b981');
  });

  it('returns amber for medium', () => {
    expect(getDifficultyColor('medium')).toBe('#f59e0b');
  });

  it('returns red for hard', () => {
    expect(getDifficultyColor('hard')).toBe('#ef4444');
  });
});

// ── buildProfileContext ─────────────────────────────────────────────────

describe('buildProfileContext', () => {
  it('extracts correct fields from a full profile', () => {
    const profile = makeProfile();
    const ctx = buildProfileContext(profile);

    expect(ctx.name).toBe('Jane Doe');
    expect(ctx.title).toBe('Senior Backend Engineer');
    expect(ctx.seniority).toBe('senior');
    expect(ctx.yearsExperience).toBe(8);
    expect(ctx.skills).toContain('Go');
    expect(ctx.skills).toContain('Python');
    expect(ctx.skills).toContain('Kubernetes');
    expect(ctx.strengthAreas).toContain('Distributed Systems');
    expect(ctx.growthAreas).toContain('Public Speaking');
  });

  it('includes recent experience summaries', () => {
    const profile = makeProfile();
    const ctx = buildProfileContext(profile);

    expect(ctx.recentExperience).toContain('TechCorp');
    expect(ctx.recentExperience).toContain('Series C fintech startup');
    expect(ctx.recentExperience).toContain('microservices');
  });

  it('includes accomplishments with impact', () => {
    const profile = makeProfile();
    const ctx = buildProfileContext(profile);

    expect(ctx.accomplishments).toContain('Led migration to microservices');
    expect(ctx.accomplishments).toContain('Reduced deploy time by 80%');
  });

  it('handles missing personal info gracefully', () => {
    const profile = makeProfile({ personal: undefined as unknown as MasterProfile['personal'] });
    const ctx = buildProfileContext(profile);

    expect(ctx.name).toBe('the candidate');
  });

  it('handles empty experience array', () => {
    const profile = makeProfile({ experience: [] });
    const ctx = buildProfileContext(profile);

    expect(ctx.title).toBe('Software Professional');
    expect(ctx.recentExperience).toBe('');
  });

  it('handles missing skills', () => {
    const profile = makeProfile({ skills: undefined as unknown as MasterProfile['skills'] });
    const ctx = buildProfileContext(profile);

    expect(ctx.skills).toBe('');
  });

  it('handles missing career context', () => {
    const profile = makeProfile({
      careerContext: undefined as unknown as MasterProfile['careerContext'],
    });
    const ctx = buildProfileContext(profile);

    expect(ctx.seniority).toBe('mid');
    expect(ctx.yearsExperience).toBe(0);
    expect(ctx.strengthAreas).toBe('');
    expect(ctx.growthAreas).toBe('');
    expect(ctx.accomplishments).toBe('');
  });

  it('limits skills to 15', () => {
    const manySkills = Array.from({ length: 20 }, (_, i) => ({
      name: `Skill${i}`,
      normalizedName: `skill${i}`,
      category: 'tech',
      yearsOfExperience: 1,
      proficiency: 'basic' as const,
      lastUsed: 'current',
      evidenceFrom: [],
      aliases: [],
    }));
    const profile = makeProfile({
      skills: {
        technical: manySkills,
        tools: [],
        frameworks: [],
        soft: [],
        programmingLanguages: [],
        naturalLanguages: [],
        clusters: [],
      },
    });
    const ctx = buildProfileContext(profile);

    const skillCount = ctx.skills.split(',').length;
    expect(skillCount).toBeLessThanOrEqual(15);
  });

  it('limits experience to 3 most recent', () => {
    const manyJobs = Array.from({ length: 5 }, (_, i) => ({
      id: `exp${i}`,
      company: `Company${i}`,
      title: `Title${i}`,
      normalizedTitle: `Title${i}`,
      location: 'Remote',
      employmentType: 'full-time' as const,
      startDate: `${2020 - i}-01`,
      isCurrent: i === 0,
      durationMonths: 12,
      description: '',
      achievements: [{ statement: `Achievement ${i}`, isQuantified: false, keywords: [] }],
      responsibilities: [],
      technologiesUsed: [],
      skillsGained: [],
      relevanceMap: {},
    }));
    const profile = makeProfile({ experience: manyJobs });
    const ctx = buildProfileContext(profile);

    expect(ctx.recentExperience).toContain('Company0');
    expect(ctx.recentExperience).toContain('Company2');
    expect(ctx.recentExperience).not.toContain('Company3');
  });
});
