import { describe, expect, it } from 'vitest';
import { scoreFeedJob, type FeedJobSignals, type UserContext } from './feed-job-signal';

const ctx: UserContext = {
  targetRoles: ['backend engineer', 'ai engineer', 'senior software engineer'],
  excludedRoles: ['principal', 'staff'],
  targetCompanies: ['Baseten', 'CVector'],
  excludedCompanies: ['Crossover'],
  userLocation: 'Austin, TX',
  acceptsRemote: true,
};

describe('scoreFeedJob', () => {
  it('high tier on fresh, target-role, target-company, low-applicant remote', () => {
    const signals: FeedJobSignals = {
      urn: 'urn:li:jobPosting:1',
      title: 'Senior Backend Engineer',
      company: 'Baseten',
      location: 'Remote',
      postedHoursAgo: 6,
      applicantsCount: 8,
    };
    const result = scoreFeedJob(signals, ctx);
    expect(result.tier).toBe('high');
    expect(result.ghostFlag).toBe(false);
    expect(result.reasons.some((r) => r.includes('Baseten'))).toBe(true);
  });

  it('skips entirely when company is excluded', () => {
    const signals: FeedJobSignals = {
      title: 'Senior Backend Engineer',
      company: 'Crossover',
      location: 'Remote',
      postedHoursAgo: 1,
    };
    expect(scoreFeedJob(signals, ctx).tier).toBe('skip');
  });

  it('low tier with ghost flag when posting is over 60 days old', () => {
    const signals: FeedJobSignals = {
      urn: 'urn:li:jobPosting:2',
      title: 'Senior Backend Engineer',
      company: 'Some Company',
      location: 'Remote',
      postedHoursAgo: 24 * 75,
      applicantsCount: 50,
    };
    const result = scoreFeedJob(signals, ctx);
    expect(result.ghostFlag).toBe(true);
    expect(result.ghostReason).toMatch(/75 days/);
    expect(result.tier).toBe('low');
  });

  it('soft ghost (30 to 60 days) only demotes high to medium', () => {
    const signals: FeedJobSignals = {
      urn: 'urn:li:jobPosting:3',
      title: 'Senior Backend Engineer',
      company: 'Baseten',
      location: 'Remote',
      postedHoursAgo: 24 * 35,
      applicantsCount: 12,
    };
    const result = scoreFeedJob(signals, ctx);
    expect(result.ghostFlag).toBe(true);
    expect(result.ghostHard).toBe(false);
    expect(result.tier).toBe('medium');
  });

  it('hard ghost (over 60 days) forces low even with strong matches', () => {
    const signals: FeedJobSignals = {
      urn: 'urn:li:jobPosting:3b',
      title: 'Senior Backend Engineer',
      company: 'Baseten',
      location: 'Remote',
      postedHoursAgo: 24 * 75,
      applicantsCount: 12,
    };
    const result = scoreFeedJob(signals, ctx);
    expect(result.ghostHard).toBe(true);
    expect(result.tier).toBe('low');
  });

  it('flags ghost when high applicant volume hits an aging post', () => {
    const signals: FeedJobSignals = {
      urn: 'urn:li:jobPosting:4',
      title: 'Senior Backend Engineer',
      company: 'NoName Co',
      location: 'Remote',
      postedHoursAgo: 24 * 14,
      applicantsCount: 350,
    };
    const result = scoreFeedJob(signals, ctx);
    expect(result.ghostFlag).toBe(true);
    expect(result.ghostReason).toMatch(/applicants/);
  });

  it('penalizes excluded role even when other signals are positive', () => {
    const signals: FeedJobSignals = {
      title: 'Principal Backend Engineer',
      company: 'Baseten',
      location: 'Remote',
      postedHoursAgo: 4,
    };
    const result = scoreFeedJob(signals, ctx);
    expect(result.ledger.some((l) => l.delta < 0 && /excluded role/.test(l.label))).toBe(true);
  });

  it('treats already-applied as low with greyed reason', () => {
    const signals: FeedJobSignals = {
      urn: 'urn:li:jobPosting:5',
      title: 'Senior Backend Engineer',
      company: 'Baseten',
      location: 'Remote',
      postedHoursAgo: 2,
    };
    const result = scoreFeedJob(signals, {
      ...ctx,
      alreadyAppliedUrns: new Set(['urn:li:jobPosting:5']),
    });
    expect(result.alreadyHandled).toBe(true);
    expect(result.tier).toBe('low');
  });

  it('handles unknown signals gracefully', () => {
    const result = scoreFeedJob({}, {});
    expect(result.tier).toBe('low');
    expect(result.ghostFlag).toBe(false);
    expect(result.points).toBe(0);
  });

  it('does not penalize remote when user accepts remote', () => {
    const signals: FeedJobSignals = {
      title: 'Senior Backend Engineer',
      company: 'NoName',
      location: 'Remote',
      postedHoursAgo: 12,
    };
    const result = scoreFeedJob(signals, ctx);
    expect(result.ledger.some((l) => l.label === 'remote role' && l.delta > 0)).toBe(true);
  });

  it('boosts same-city local roles', () => {
    const signals: FeedJobSignals = {
      title: 'Senior Backend Engineer',
      company: 'NoName',
      location: 'Austin, Texas',
      postedHoursAgo: 12,
    };
    const result = scoreFeedJob(signals, ctx);
    expect(result.ledger.some((l) => /local/i.test(l.label))).toBe(true);
  });
});
