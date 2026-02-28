import { describe, it, expect } from 'vitest';
import type { MasterProfile } from '@shared/types/master-profile.types';
import { getEmailTypeLabel, getEmailTypes, buildEmailContext } from './email-templates';
import type { EmailGenerationPayload } from './email-templates';

// ── Factory ─────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<MasterProfile> = {}): MasterProfile {
  return {
    id: 'p1',
    name: 'Test Profile',
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
    personal: {
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-0100',
      location: 'San Francisco, CA',
    },
    experience: [
      {
        id: 'exp-1',
        company: 'TechCorp',
        title: 'Senior Software Engineer',
        normalizedTitle: 'Senior Software Engineer',
        location: 'Remote',
        employmentType: 'full-time',
        startDate: '2020-01',
        isCurrent: true,
        durationMonths: 60,
        description: 'Led backend team',
        achievements: [],
        responsibilities: [],
        technologiesUsed: [],
        skillsGained: [],
        relevanceMap: {},
      },
    ],
    education: [],
    skills: {
      technical: ['TypeScript', 'Python', 'AWS'],
      tools: ['Docker', 'Kubernetes'],
      frameworks: ['React', 'Node.js'],
    },
    careerContext: {
      summary: 'Senior engineer with 8 years experience',
      careerTrajectory: 'ascending',
      yearsOfExperience: 8,
      seniorityLevel: 'senior',
      primaryDomain: 'Backend Engineering',
      secondaryDomains: [],
      industryExperience: ['Technology'],
      bestFitRoles: [],
      strengthAreas: ['Backend'],
      growthAreas: ['ML'],
    },
    generatedProfiles: [],
    projects: [],
    certifications: [],
    answerBank: { answers: [] },
    ...overrides,
  } as MasterProfile;
}

function makePayload(overrides: Partial<EmailGenerationPayload> = {}): EmailGenerationPayload {
  return {
    emailType: 'follow_up',
    jobDescription: 'Looking for a senior engineer...',
    companyName: 'Acme Inc',
    jobTitle: 'Senior Backend Engineer',
    ...overrides,
  };
}

// ── getEmailTypeLabel ───────────────────────────────────────────────────

describe('getEmailTypeLabel', () => {
  it('returns correct label for thank_you', () => {
    expect(getEmailTypeLabel('thank_you')).toBe('Thank You (Post-Interview)');
  });

  it('returns correct label for follow_up', () => {
    expect(getEmailTypeLabel('follow_up')).toBe('Application Follow-Up');
  });

  it('returns correct label for networking', () => {
    expect(getEmailTypeLabel('networking')).toBe('Networking / Referral Request');
  });

  it('returns correct label for cold_outreach', () => {
    expect(getEmailTypeLabel('cold_outreach')).toBe('Cold Outreach to Hiring Manager');
  });

  it('returns correct label for post_rejection', () => {
    expect(getEmailTypeLabel('post_rejection')).toBe('Post-Rejection (Graceful)');
  });
});

// ── getEmailTypes ───────────────────────────────────────────────────────

describe('getEmailTypes', () => {
  it('returns all 5 email types', () => {
    const types = getEmailTypes();
    expect(types).toHaveLength(5);
    expect(types.map((t) => t.value)).toEqual([
      'thank_you',
      'follow_up',
      'networking',
      'cold_outreach',
      'post_rejection',
    ]);
  });

  it('each type has a non-empty label', () => {
    for (const type of getEmailTypes()) {
      expect(type.label.length).toBeGreaterThan(0);
    }
  });
});

// ── buildEmailContext ───────────────────────────────────────────────────

describe('buildEmailContext', () => {
  it('extracts full context from complete profile', () => {
    const ctx = buildEmailContext(makeProfile(), makePayload());
    expect(ctx.candidateName).toBe('Jane Doe');
    expect(ctx.candidateTitle).toBe('Senior Software Engineer');
    expect(ctx.yearsExperience).toBe(8);
    expect(ctx.topSkills).toContain('TypeScript');
    expect(ctx.topSkills).toContain('Docker');
    expect(ctx.recentCompany).toBe('TechCorp');
    expect(ctx.companyName).toBe('Acme Inc');
    expect(ctx.jobTitle).toBe('Senior Backend Engineer');
  });

  it('uses defaults for missing personal info', () => {
    const profile = makeProfile({ personal: undefined as never });
    const ctx = buildEmailContext(profile, makePayload());
    expect(ctx.candidateName).toBe('the candidate');
  });

  it('uses defaults for missing career context', () => {
    const profile = makeProfile({ careerContext: undefined as never });
    const ctx = buildEmailContext(profile, makePayload());
    expect(ctx.yearsExperience).toBe(0);
  });

  it('uses defaults for empty skills', () => {
    const profile = makeProfile({ skills: undefined as never });
    const ctx = buildEmailContext(profile, makePayload());
    expect(ctx.topSkills).toHaveLength(0);
  });

  it('limits skills to 10', () => {
    const manySkills = Array.from({ length: 20 }, (_, i) => `skill-${i}`);
    const profile = makeProfile();
    // Override skills directly via cast
    (profile as unknown as Record<string, unknown>).skills = {
      technical: manySkills,
      tools: [],
      frameworks: [],
    };
    const ctx = buildEmailContext(profile, makePayload());
    expect(ctx.topSkills.length).toBeLessThanOrEqual(10);
  });

  it('uses recipient name from payload when provided', () => {
    const ctx = buildEmailContext(makeProfile(), makePayload({ recipientName: 'Sarah Chen' }));
    expect(ctx.recipientName).toBe('Sarah Chen');
  });

  it('defaults recipient to Hiring Manager', () => {
    const ctx = buildEmailContext(makeProfile(), makePayload());
    expect(ctx.recipientName).toBe('Hiring Manager');
  });

  it('handles empty experience array', () => {
    const profile = makeProfile({ experience: [] });
    const ctx = buildEmailContext(profile, makePayload());
    expect(ctx.recentCompany).toBe('');
    expect(ctx.candidateTitle).toBe('Backend Engineering'); // falls back to careerContext.primaryDomain
  });

  it('handles missing experience and career context', () => {
    const profile = makeProfile({ experience: [], careerContext: undefined as never });
    const ctx = buildEmailContext(profile, makePayload());
    expect(ctx.candidateTitle).toBe('Professional');
  });
});
