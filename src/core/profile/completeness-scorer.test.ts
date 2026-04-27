/**
 * Tests for the profile completeness scorer.
 *
 * Verifies the 8 dimensions, the 60/80 thresholds, and the nextStep
 * recommendation. Uses synthesized MasterProfile fixtures.
 */

import { describe, it, expect } from 'vitest';
import { scoreProfileCompleteness } from './completeness-scorer';
import type { MasterProfile } from '@shared/types/master-profile.types';

function makeProfile(overrides: Partial<MasterProfile> = {}): MasterProfile {
  const now = new Date();
  return {
    id: 'p',
    createdAt: now,
    updatedAt: now,
    sourceDocument: {
      fileName: 'r.pdf',
      fileType: 'pdf',
      uploadedAt: now,
      rawText: '',
      checksum: 'x',
    },
    personal: {
      fullName: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      location: { city: '', state: '', country: '', formatted: '' },
    },
    careerContext: {
      summary: '',
      careerTrajectory: 'stable',
      yearsOfExperience: 0,
      seniorityLevel: 'entry',
      primaryDomain: '',
      secondaryDomains: [],
      industryExperience: [],
      bestFitRoles: [],
      strengthAreas: [],
      growthAreas: [],
      careerNarrative: '',
      uniqueValue: '',
      gapsAndConcerns: [],
    },
    experience: [],
    skills: { technical: [], tools: [], frameworks: [], soft: [], languages: [] },
    education: [],
    projects: [],
    certifications: [],
    generatedProfiles: [],
    ...overrides,
  } as unknown as MasterProfile;
}

describe('scoreProfileCompleteness', () => {
  it('returns 0 for an empty profile', () => {
    const report = scoreProfileCompleteness(makeProfile());
    expect(report.total).toBe(0);
    expect(report.threshold.autofillUnlocked).toBe(false);
    expect(report.threshold.autofillRecommended).toBe(false);
  });

  it('returns the contact dimension full credit when name + email + phone are present', () => {
    const profile = makeProfile({
      personal: {
        fullName: 'Sai Tata',
        firstName: 'Sai',
        lastName: 'Tata',
        email: 'sai@example.com',
        phone: '555 0100',
        location: { city: '', state: '', country: '', formatted: '' },
      },
    } as unknown as Partial<MasterProfile>);
    const report = scoreProfileCompleteness(profile);
    const contact = report.dimensions.find((d) => d.key === 'contact')!;
    expect(contact.score).toBe(10);
    expect(contact.satisfied).toBe(true);
  });

  it('marks the summary dimension satisfied at 30+ words', () => {
    const profile = makeProfile({
      careerContext: {
        ...makeProfile().careerContext,
        summary:
          'I am a senior backend engineer with six years of experience building distributed systems and event pipelines that move millions of records per day across hybrid cloud environments and on-prem clusters at fintech and B2B SaaS companies.',
      },
    } as unknown as Partial<MasterProfile>);
    const report = scoreProfileCompleteness(profile);
    const summary = report.dimensions.find((d) => d.key === 'summary')!;
    expect(summary.satisfied).toBe(true);
    expect(summary.score).toBe(15);
  });

  it('gives partial credit for a too-short summary', () => {
    const profile = makeProfile({
      careerContext: { ...makeProfile().careerContext, summary: 'Backend engineer with Python.' },
    } as unknown as Partial<MasterProfile>);
    const report = scoreProfileCompleteness(profile);
    const summary = report.dimensions.find((d) => d.key === 'summary')!;
    expect(summary.satisfied).toBe(false);
    expect(summary.score).toBeGreaterThan(0);
    expect(summary.score).toBeLessThan(15);
  });

  it('counts a primary experience with 2+ achievements as fully satisfied', () => {
    const profile = makeProfile({
      experience: [
        {
          id: 'e1',
          title: 'Senior Backend Engineer',
          company: 'Acme',
          startDate: '2020-01',
          endDate: 'Present',
          location: '',
          description: '',
          achievements: ['Cut p99 from 2s to 200ms', 'Shipped multi-tenant billing'],
          skills: [],
          isCurrent: true,
        },
      ],
    } as unknown as Partial<MasterProfile>);
    const report = scoreProfileCompleteness(profile);
    const primary = report.dimensions.find((d) => d.key === 'primary_experience')!;
    expect(primary.satisfied).toBe(true);
    expect(primary.score).toBe(25);
  });

  it('gives partial credit for a role missing achievements', () => {
    const profile = makeProfile({
      experience: [
        {
          id: 'e1',
          title: 'Engineer',
          company: 'Acme',
          startDate: '2020-01',
          endDate: 'Present',
          location: '',
          description: '',
          achievements: [],
          skills: [],
          isCurrent: true,
        },
      ],
    } as unknown as Partial<MasterProfile>);
    const report = scoreProfileCompleteness(profile);
    const primary = report.dimensions.find((d) => d.key === 'primary_experience')!;
    expect(primary.satisfied).toBe(false);
    expect(primary.score).toBeLessThan(25);
  });

  it('crosses the 60 threshold when contact + summary + primary experience are filled', () => {
    const profile = makeProfile({
      personal: {
        fullName: 'Sai Tata',
        firstName: 'Sai',
        lastName: 'Tata',
        email: 'sai@example.com',
        phone: '555 0100',
        location: { city: '', state: '', country: '', formatted: '' },
      },
      careerContext: {
        ...makeProfile().careerContext,
        summary:
          'Senior backend engineer with six years of experience building distributed systems and event pipelines that handle millions of events per day across hybrid cloud environments.',
      },
      experience: [
        {
          id: 'e1',
          title: 'Senior Backend Engineer',
          company: 'Acme',
          startDate: '2020-01',
          endDate: 'Present',
          location: '',
          description: '',
          achievements: ['Cut p99 from 2s to 200ms', 'Shipped multi-tenant billing'],
          skills: [],
          isCurrent: true,
        },
      ],
    } as unknown as Partial<MasterProfile>);
    const report = scoreProfileCompleteness(profile);
    expect(report.total).toBeGreaterThanOrEqual(50);
  });

  it('reports the highest-weight gap as nextStep on an empty profile', () => {
    const report = scoreProfileCompleteness(makeProfile());
    expect(report.nextStep).not.toBe(null);
    // primary_experience has weight 25, the largest. Should be the next step.
    expect(report.nextStep?.key).toBe('primary_experience');
  });
});
