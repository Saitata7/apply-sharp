import { describe, it, expect } from 'vitest';
import { recommendPortals } from './portal-recommender';
import { VALIDATED_PORTAL_MAP } from './portal-map';
import { DEAD_SOURCES, AFFILIATE_SPAM_SOURCES, getSkipList } from './source-quality';
import type { DiscoveryProfile } from './types';

const senior_backend_remote_us: DiscoveryProfile = {
  role: 'backend',
  seniority: 'senior',
  geo: 'us',
  workType: 'remote',
};

describe('recommendPortals', () => {
  it('returns YC + Wellfound + HN as the top 3 for senior backend remote US', () => {
    const result = recommendPortals(senior_backend_remote_us);
    expect(result.length).toBeGreaterThanOrEqual(3);
    const top3 = result.slice(0, 3).map((r) => r.sourceName);
    expect(top3[0]).toBe('Y Combinator Work at a Startup');
    expect(top3[1]).toBe('Wellfound');
    expect(top3[2]).toBe('Hacker News Who is Hiring');
  });

  it('caps results at 7', () => {
    const result = recommendPortals(senior_backend_remote_us);
    expect(result.length).toBeLessThanOrEqual(7);
  });

  it('returns sources sorted by ascending rank', () => {
    const result = recommendPortals(senior_backend_remote_us);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].rank).toBeGreaterThanOrEqual(result[i - 1].rank);
    }
  });

  it('returns no duplicate source names', () => {
    const result = recommendPortals(senior_backend_remote_us);
    const names = result.map((r) => r.sourceName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('returns LinkedIn as a wildcard fallback for unranked profiles', () => {
    const result = recommendPortals({
      role: 'qa',
      seniority: 'mid',
      geo: 'us',
      workType: 'remote',
    });
    const names = result.map((r) => r.sourceName);
    // LinkedIn wildcard should appear since QA mid has no specific entries
    expect(names.some((n) => n.includes('LinkedIn'))).toBe(true);
  });

  it('returns We Work Remotely as a top result for remote-global', () => {
    const result = recommendPortals({
      role: 'backend',
      seniority: 'senior',
      geo: 'remote-global',
      workType: 'remote',
    });
    expect(result.map((r) => r.sourceName)).toContain('We Work Remotely');
  });

  it('returns Welcome to the Jungle for EU profiles', () => {
    const result = recommendPortals({
      role: 'backend',
      seniority: 'senior',
      geo: 'eu',
      workType: 'remote',
    });
    expect(result.map((r) => r.sourceName)).toContain('Welcome to the Jungle');
  });

  it('returns Built In for onsite US profiles', () => {
    const result = recommendPortals({
      role: 'backend',
      seniority: 'senior',
      geo: 'us',
      workType: 'onsite',
    });
    expect(result.map((r) => r.sourceName)).toContain('Built In (city tech)');
  });

  it('returns empty for missing profile dimensions', () => {
    expect(recommendPortals({} as DiscoveryProfile)).toEqual([]);
    expect(
      recommendPortals({
        role: 'backend',
        seniority: 'senior',
        geo: 'us',
      } as DiscoveryProfile)
    ).toEqual([]);
  });

  it('returns ML-specific sources for ml-engineering role', () => {
    const result = recommendPortals({
      role: 'ml-engineering',
      seniority: 'senior',
      geo: 'us',
      workType: 'remote',
    });
    const names = result.map((r) => r.sourceName);
    expect(names).toContain('Y Combinator Work at a Startup (AI track)');
  });

  it('returns Kaggle Jobs for data-science role', () => {
    const result = recommendPortals({
      role: 'data-science',
      seniority: 'senior',
      geo: 'us',
      workType: 'remote',
    });
    expect(result.map((r) => r.sourceName)).toContain('Kaggle Jobs');
  });
});

describe('portal-map data integrity', () => {
  it('every entry uses https URLs', () => {
    for (const e of VALIDATED_PORTAL_MAP) {
      expect(e.sourceUrl).toMatch(/^https:\/\//i);
    }
  });

  it('every entry has a positive integer rank', () => {
    for (const e of VALIDATED_PORTAL_MAP) {
      expect(Number.isInteger(e.rank)).toBe(true);
      expect(e.rank).toBeGreaterThanOrEqual(1);
    }
  });

  it('every entry has a non-empty sourceName', () => {
    for (const e of VALIDATED_PORTAL_MAP) {
      expect(e.sourceName.trim().length).toBeGreaterThan(0);
    }
  });

  it('the validated map has at least 30 entries', () => {
    expect(VALIDATED_PORTAL_MAP.length).toBeGreaterThanOrEqual(30);
  });
});

describe('source-quality', () => {
  it('every dead source has a deadSince date in YYYY-MM format', () => {
    for (const d of DEAD_SOURCES) {
      expect(d.deadSince).toMatch(/^\d{4}-\d{2}$/);
      expect(d.name.trim().length).toBeGreaterThan(0);
      expect(d.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it('every affiliate spam source has a non-empty reason', () => {
    for (const a of AFFILIATE_SPAM_SOURCES) {
      expect(a.name.trim().length).toBeGreaterThan(0);
      expect(a.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it('Stack Overflow Jobs is in the dead list', () => {
    expect(DEAD_SOURCES.some((d) => d.name === 'Stack Overflow Jobs')).toBe(true);
  });

  it('Glassdoor is in the dead list', () => {
    expect(DEAD_SOURCES.some((d) => d.name.includes('Glassdoor'))).toBe(true);
  });

  it('getSkipList returns at least 10 items', () => {
    const list = getSkipList();
    expect(list.length).toBeGreaterThanOrEqual(10);
  });
});
