import { describe, it, expect } from 'vitest';
import { scanRedFlags } from './red-flag-scanner';
import type { MasterProfile, EnrichedExperience } from '@shared/types/master-profile.types';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeExperience(overrides: Partial<EnrichedExperience> = {}): EnrichedExperience {
  return {
    id: '1',
    company: 'Acme Inc',
    title: 'Software Engineer',
    normalizedTitle: 'Software Engineer',
    location: 'Remote',
    employmentType: 'full-time',
    startDate: '2022-01-01',
    endDate: '2024-01-01',
    isCurrent: false,
    durationMonths: 24,
    description: 'Built things',
    achievements: [
      { statement: 'Increased revenue by 20%', isQuantified: true, keywords: [] },
      { statement: 'Led team of 5 engineers', isQuantified: true, keywords: [] },
      { statement: 'Shipped new payment system', isQuantified: false, keywords: [] },
    ],
    responsibilities: [],
    technologiesUsed: [],
    skillsGained: [],
    relevanceMap: {},
    ...overrides,
  };
}

function makeProfile(overrides: Partial<MasterProfile> = {}): MasterProfile {
  return {
    id: 'test-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    sourceDocument: {
      fileName: 'test.pdf',
      fileType: 'pdf',
      uploadedAt: new Date(),
      rawText: 'test resume text',
      checksum: 'abc123',
    },
    personal: {
      fullName: 'John Doe',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '555-0100',
      location: { city: 'SF', state: 'CA', country: 'US', formatted: 'SF, CA' },
      linkedInUrl: 'https://linkedin.com/in/johndoe',
      githubUrl: 'https://github.com/johndoe',
    },
    careerContext: {
      summary:
        'Senior software engineer with 8 years of experience building scalable distributed systems at high-growth fintech companies. Led migration of monolith to microservices architecture serving 2M daily users, reducing deployment time by 80% and improving system reliability to 99.9% uptime.',
      careerTrajectory: 'ascending',
      yearsOfExperience: 8,
      seniorityLevel: 'senior',
      primaryDomain: 'Backend Engineering',
      secondaryDomains: ['DevOps'],
      industryExperience: ['Fintech'],
      bestFitRoles: [],
      strengthAreas: ['Backend', 'Architecture'],
      growthAreas: ['Frontend'],
      writingStyle: {
        tone: 'professional',
        complexity: 'moderate',
        preferredVoice: 'first-person',
      },
      topAccomplishments: [],
      uniqueValueProps: [],
    },
    experience: [
      makeExperience({
        id: '1',
        company: 'OldCo',
        title: 'Software Engineer',
        normalizedTitle: 'Software Engineer',
        startDate: '2018-01-01',
        endDate: '2020-06-01',
        durationMonths: 30,
      }),
      makeExperience({
        id: '2',
        company: 'NewCo',
        title: 'Senior Software Engineer',
        normalizedTitle: 'Senior Software Engineer',
        startDate: '2020-07-01',
        isCurrent: true,
        durationMonths: 48,
      }),
    ],
    skills: {
      technical: [],
      tools: [],
      frameworks: [],
      soft: [],
      programmingLanguages: [],
      naturalLanguages: [],
      clusters: [],
    },
    education: [
      {
        id: '1',
        institution: 'State University',
        degree: 'BS Computer Science',
        normalizedDegree: 'BS',
        field: 'Computer Science',
        startDate: '2014',
        endDate: '2018',
        relevanceMap: {},
      },
    ],
    projects: [],
    certifications: [],
    answerBank: { commonQuestions: [], patterns: [], customAnswers: {} },
    autofillData: {
      workAuthorization: 'citizen',
      workAuthorizationText: 'US Citizen',
      requiresSponsorship: false,
      canStartImmediately: true,
      linkedInConsent: true,
      portfolioConsent: true,
      backgroundCheckConsent: true,
      drugTestConsent: true,
      currentlyEmployed: true,
      remotePreference: 'remote',
      willingToRelocate: false,
    },
    generatedProfiles: [],
    backgroundConfig: undefined,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('scanRedFlags', () => {
  describe('baseline', () => {
    it('returns no flags for a clean profile', () => {
      const profile = makeProfile();
      const result = scanRedFlags(profile);
      expect(result.flags).toHaveLength(0);
      expect(result.score).toBe(100);
      expect(result.summary.total).toBe(0);
    });
  });

  describe('employment gaps', () => {
    it('detects 14-month gap as error', () => {
      const profile = makeProfile({
        experience: [
          makeExperience({
            id: '1',
            company: 'OldCo',
            startDate: '2018-01-01',
            endDate: '2019-06-01',
            durationMonths: 18,
          }),
          makeExperience({
            id: '2',
            company: 'NewCo',
            startDate: '2020-08-01',
            endDate: '2023-01-01',
            durationMonths: 30,
          }),
        ],
      });
      const result = scanRedFlags(profile);
      const gapFlags = result.flags.filter((f) => f.category === 'employment-gap');
      expect(gapFlags).toHaveLength(1);
      expect(gapFlags[0].severity).toBe('error');
      expect(gapFlags[0].message).toContain('14-month');
    });

    it('detects 7-month gap as warning', () => {
      const profile = makeProfile({
        experience: [
          makeExperience({
            id: '1',
            company: 'OldCo',
            startDate: '2019-01-01',
            endDate: '2020-01-01',
            durationMonths: 12,
          }),
          makeExperience({
            id: '2',
            company: 'NewCo',
            startDate: '2020-08-01',
            endDate: '2023-01-01',
            durationMonths: 30,
          }),
        ],
      });
      const result = scanRedFlags(profile);
      const gapFlags = result.flags.filter((f) => f.category === 'employment-gap');
      expect(gapFlags).toHaveLength(1);
      expect(gapFlags[0].severity).toBe('warning');
    });

    it('ignores gaps under 6 months', () => {
      const profile = makeProfile({
        experience: [
          makeExperience({
            id: '1',
            company: 'OldCo',
            startDate: '2019-01-01',
            endDate: '2020-01-01',
            durationMonths: 12,
          }),
          makeExperience({
            id: '2',
            company: 'NewCo',
            startDate: '2020-04-01',
            endDate: '2023-01-01',
            durationMonths: 33,
          }),
        ],
      });
      const result = scanRedFlags(profile);
      const gapFlags = result.flags.filter((f) => f.category === 'employment-gap');
      expect(gapFlags).toHaveLength(0);
    });

    it('handles single role with no gaps', () => {
      const profile = makeProfile({
        experience: [makeExperience({ id: '1' })],
      });
      const result = scanRedFlags(profile);
      const gapFlags = result.flags.filter((f) => f.category === 'employment-gap');
      expect(gapFlags).toHaveLength(0);
    });
  });

  describe('job hopping', () => {
    it('flags 3+ short full-time roles as warning', () => {
      const profile = makeProfile({
        experience: [
          makeExperience({ id: '1', company: 'A', durationMonths: 10 }),
          makeExperience({ id: '2', company: 'B', durationMonths: 12 }),
          makeExperience({ id: '3', company: 'C', durationMonths: 8 }),
          makeExperience({ id: '4', company: 'D', durationMonths: 30 }),
        ],
      });
      const result = scanRedFlags(profile);
      const hopFlags = result.flags.filter((f) => f.category === 'job-hopping');
      expect(hopFlags).toHaveLength(1);
      expect(hopFlags[0].severity).toBe('warning');
      expect(hopFlags[0].message).toContain('3');
    });

    it('does not flag short contract roles', () => {
      const profile = makeProfile({
        experience: [
          makeExperience({ id: '1', company: 'A', durationMonths: 6, employmentType: 'contract' }),
          makeExperience({ id: '2', company: 'B', durationMonths: 4, employmentType: 'contract' }),
          makeExperience({ id: '3', company: 'C', durationMonths: 8, employmentType: 'freelance' }),
          makeExperience({ id: '4', company: 'D', durationMonths: 36 }),
        ],
      });
      const result = scanRedFlags(profile);
      const hopFlags = result.flags.filter((f) => f.category === 'job-hopping');
      expect(hopFlags).toHaveLength(0);
    });

    it('flags 2 short roles as info', () => {
      const profile = makeProfile({
        experience: [
          makeExperience({ id: '1', company: 'A', durationMonths: 10 }),
          makeExperience({ id: '2', company: 'B', durationMonths: 12 }),
          makeExperience({ id: '3', company: 'C', durationMonths: 36 }),
        ],
      });
      const result = scanRedFlags(profile);
      const hopFlags = result.flags.filter((f) => f.category === 'job-hopping');
      expect(hopFlags).toHaveLength(1);
      expect(hopFlags[0].severity).toBe('info');
    });
  });

  describe('contact info', () => {
    it('flags missing email as error', () => {
      const profile = makeProfile({
        personal: {
          ...makeProfile().personal,
          email: '',
        },
      });
      const result = scanRedFlags(profile);
      const contactFlags = result.flags.filter(
        (f) => f.category === 'contact-info' && f.message.includes('email')
      );
      expect(contactFlags).toHaveLength(1);
      expect(contactFlags[0].severity).toBe('error');
    });

    it('flags missing phone as warning', () => {
      const profile = makeProfile({
        personal: {
          ...makeProfile().personal,
          phone: '',
        },
      });
      const result = scanRedFlags(profile);
      const phoneFlags = result.flags.filter(
        (f) => f.category === 'contact-info' && f.message.includes('phone')
      );
      expect(phoneFlags).toHaveLength(1);
      expect(phoneFlags[0].severity).toBe('warning');
    });

    it('flags missing LinkedIn as warning', () => {
      const profile = makeProfile({
        personal: {
          ...makeProfile().personal,
          linkedInUrl: undefined,
        },
      });
      const result = scanRedFlags(profile);
      const linkedinFlags = result.flags.filter(
        (f) => f.category === 'contact-info' && f.message.includes('LinkedIn')
      );
      expect(linkedinFlags).toHaveLength(1);
      expect(linkedinFlags[0].severity).toBe('warning');
    });
  });

  describe('summary / generic language', () => {
    it('flags missing summary as error', () => {
      const profile = makeProfile({
        careerContext: {
          ...makeProfile().careerContext!,
          summary: '',
        },
      });
      const result = scanRedFlags(profile);
      const summaryFlags = result.flags.filter(
        (f) => f.category === 'generic-language' && f.message.includes('Missing')
      );
      expect(summaryFlags).toHaveLength(1);
      expect(summaryFlags[0].severity).toBe('error');
    });

    it('flags short summary as warning', () => {
      const profile = makeProfile({
        careerContext: {
          ...makeProfile().careerContext!,
          summary: 'Senior engineer with backend experience.',
        },
      });
      const result = scanRedFlags(profile);
      const shortFlags = result.flags.filter(
        (f) => f.category === 'generic-language' && f.message.includes('brief')
      );
      expect(shortFlags).toHaveLength(1);
      expect(shortFlags[0].severity).toBe('warning');
    });

    it('detects generic phrases in summary', () => {
      const profile = makeProfile({
        careerContext: {
          ...makeProfile().careerContext!,
          summary:
            'Results-driven team player with a proven track record of delivering excellent communication skills and fast learner abilities across multiple organizations and industries over many years.',
        },
      });
      const result = scanRedFlags(profile);
      const genericFlags = result.flags.filter(
        (f) => f.category === 'generic-language' && f.message.includes('generic')
      );
      expect(genericFlags).toHaveLength(1);
      expect(genericFlags[0].severity).toBe('warning');
      expect(genericFlags[0].message).toContain('results-driven');
    });
  });

  describe('career progression', () => {
    it('detects title regression (2+ level drop)', () => {
      const profile = makeProfile({
        experience: [
          makeExperience({
            id: '1',
            title: 'Senior Engineer',
            normalizedTitle: 'Senior Engineer',
            startDate: '2018-01-01',
            endDate: '2020-01-01',
            durationMonths: 24,
          }),
          makeExperience({
            id: '2',
            title: 'Junior Developer',
            normalizedTitle: 'Junior Developer',
            startDate: '2020-02-01',
            endDate: '2023-01-01',
            durationMonths: 35,
          }),
        ],
      });
      const result = scanRedFlags(profile);
      const progressionFlags = result.flags.filter((f) => f.category === 'career-progression');
      expect(progressionFlags).toHaveLength(1);
      expect(progressionFlags[0].severity).toBe('warning');
      expect(progressionFlags[0].message).toContain('regression');
    });

    it('does not flag lateral moves', () => {
      const profile = makeProfile({
        experience: [
          makeExperience({
            id: '1',
            title: 'Senior Frontend Engineer',
            normalizedTitle: 'Senior Frontend Engineer',
            startDate: '2018-01-01',
            endDate: '2020-01-01',
            durationMonths: 24,
          }),
          makeExperience({
            id: '2',
            title: 'Senior Backend Engineer',
            normalizedTitle: 'Senior Backend Engineer',
            startDate: '2020-02-01',
            endDate: '2023-01-01',
            durationMonths: 35,
          }),
        ],
      });
      const result = scanRedFlags(profile);
      const progressionFlags = result.flags.filter((f) => f.category === 'career-progression');
      expect(progressionFlags).toHaveLength(0);
    });
  });

  describe('missing content', () => {
    it('flags role with 0 achievements as error', () => {
      const profile = makeProfile({
        experience: [
          makeExperience({
            id: '1',
            achievements: [],
            responsibilities: [],
          }),
        ],
      });
      const result = scanRedFlags(profile);
      const contentFlags = result.flags.filter(
        (f) => f.category === 'missing-content' && f.severity === 'error'
      );
      expect(contentFlags).toHaveLength(1);
    });

    it('flags role with 1 bullet as warning', () => {
      const profile = makeProfile({
        experience: [
          makeExperience({
            id: '1',
            achievements: [{ statement: 'Did stuff', isQuantified: false, keywords: [] }],
            responsibilities: [],
          }),
        ],
      });
      const result = scanRedFlags(profile);
      const contentFlags = result.flags.filter(
        (f) => f.category === 'missing-content' && f.severity === 'warning'
      );
      expect(contentFlags).toHaveLength(1);
    });
  });

  describe('scoring', () => {
    it('deducts correctly: 10 per error, 5 per warning, 2 per info', () => {
      // Missing email (error) + missing phone (warning) + no portfolio (info) = -10-5-2 = 83
      const profile = makeProfile({
        personal: {
          ...makeProfile().personal,
          email: '',
          phone: '',
          githubUrl: undefined,
          portfolioUrl: undefined,
        },
      });
      const result = scanRedFlags(profile);
      const errors = result.summary.errors;
      const warnings = result.summary.warnings;
      const info = result.summary.info;
      expect(result.score).toBe(100 - errors * 10 - warnings * 5 - info * 2);
    });

    it('floors score at 0', () => {
      // Create a profile with many errors to exceed 100 points deduction
      const profile = makeProfile({
        personal: {
          fullName: '',
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          location: { city: '', state: '', country: '', formatted: '' },
        },
        careerContext: {
          ...makeProfile().careerContext!,
          summary: '',
        },
        experience: Array.from({ length: 8 }, (_, i) =>
          makeExperience({
            id: String(i),
            company: `Co${i}`,
            achievements: [],
            responsibilities: [],
          })
        ),
      });
      const result = scanRedFlags(profile);
      expect(result.score).toBe(0);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sorting', () => {
    it('sorts flags by severity: errors first, then warnings, then info', () => {
      const profile = makeProfile({
        personal: {
          ...makeProfile().personal,
          email: '', // error
          phone: '', // warning
          linkedInUrl: '', // warning
          githubUrl: undefined,
          portfolioUrl: undefined, // info
        },
      });
      const result = scanRedFlags(profile);
      expect(result.flags.length).toBeGreaterThan(0);
      const severities = result.flags.map((f) => f.severity);
      const errorIdx = severities.indexOf('error');
      const warnIdx = severities.indexOf('warning');
      const infoIdx = severities.indexOf('info');
      if (errorIdx >= 0 && warnIdx >= 0) expect(errorIdx).toBeLessThan(warnIdx);
      if (warnIdx >= 0 && infoIdx >= 0) expect(warnIdx).toBeLessThan(infoIdx);
    });
  });
});
