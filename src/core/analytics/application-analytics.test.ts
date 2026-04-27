/**
 * Tests for application analytics. Pure functions, fast unit tests against
 * synthetic Application fixtures.
 */

import { describe, it, expect } from 'vitest';
import {
  getApplyRate,
  getResponseRateByResumeVersion,
  getGhostRateByPlatform,
  getTimeToFirstResponse,
  getFunnelStats,
} from './application-analytics';
import type { Application } from '@shared/types/application.types';

const DAY = 86_400_000;

function makeApp(overrides: Partial<Application>): Application {
  const now = new Date();
  return {
    id: overrides.id ?? crypto.randomUUID(),
    jobId: 'job-x',
    profileId: 'profile-x',
    status: 'submitted',
    statusHistory: [],
    autofillUsed: false,
    submittedVia: 'manual',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('getApplyRate', () => {
  it('counts apps in the last N days', () => {
    const apps = [
      makeApp({ appliedAt: new Date(Date.now() - 1 * DAY) }),
      makeApp({ appliedAt: new Date(Date.now() - 5 * DAY) }),
      makeApp({ appliedAt: new Date(Date.now() - 31 * DAY) }), // outside window
      makeApp({}), // never applied
    ];
    const result = getApplyRate(apps, 30);
    expect(result.total).toBe(2);
    expect(result.avgPerDay).toBeCloseTo(2 / 30);
    expect(result.avgPerWeek).toBeCloseTo((2 / 30) * 7);
  });

  it('groups counts by date', () => {
    const today = new Date();
    const yesterday = new Date(Date.now() - DAY);
    const apps = [
      makeApp({ appliedAt: today }),
      makeApp({ appliedAt: today }),
      makeApp({ appliedAt: yesterday }),
    ];
    const result = getApplyRate(apps, 30);
    expect(result.perDay).toHaveLength(2);
  });
});

describe('getResponseRateByResumeVersion', () => {
  it('groups by resumeVersionId and computes the rate', () => {
    const apps = [
      makeApp({ resumeVersionId: 'v1', status: 'submitted' }),
      makeApp({ resumeVersionId: 'v1', status: 'interview' }),
      makeApp({ resumeVersionId: 'v1', status: 'rejected' }),
      makeApp({ resumeVersionId: 'v2', status: 'submitted' }),
      makeApp({ resumeVersionId: 'v2', status: 'submitted' }),
      makeApp({ resumeVersionId: 'v2', status: 'offer' }),
    ];
    const rows = getResponseRateByResumeVersion(apps);
    expect(rows).toHaveLength(2);
    const v1 = rows.find((r) => r.version === 'v1')!;
    const v2 = rows.find((r) => r.version === 'v2')!;
    // v1: 3 applied, 2 responses (interview + rejected) => 2/3
    expect(v1.applied).toBe(3);
    expect(v1.responses).toBe(2);
    expect(v1.rate).toBeCloseTo(2 / 3);
    // v2: 3 applied, 1 response (offer) => 1/3
    expect(v2.applied).toBe(3);
    expect(v2.responses).toBe(1);
    expect(v2.rate).toBeCloseTo(1 / 3);
  });

  it('sorts by rate descending (best resume first)', () => {
    const apps = [
      makeApp({ resumeVersionId: 'low', status: 'submitted' }),
      makeApp({ resumeVersionId: 'low', status: 'submitted' }),
      makeApp({ resumeVersionId: 'high', status: 'interview' }),
      makeApp({ resumeVersionId: 'high', status: 'offer' }),
    ];
    const rows = getResponseRateByResumeVersion(apps);
    expect(rows[0].version).toBe('high');
    expect(rows[1].version).toBe('low');
  });

  it('does not count saved/in_progress as applied', () => {
    const apps = [
      makeApp({ resumeVersionId: 'v1', status: 'saved' }),
      makeApp({ resumeVersionId: 'v1', status: 'in_progress' }),
      makeApp({ resumeVersionId: 'v1', status: 'submitted' }),
    ];
    const rows = getResponseRateByResumeVersion(apps);
    expect(rows[0].applied).toBe(1);
  });

  it('never produces a rate above 100% (numerator and denominator share the same subset)', () => {
    // Mix saved/in_progress (excluded from applied) with applied apps that
    // have responses. The buggy version counted responses from the full
    // list while only counting applied from the filtered subset, producing
    // rates above 1.0 in some seeds.
    const apps = [
      makeApp({ resumeVersionId: 'v1', status: 'saved' }), // excluded
      makeApp({ resumeVersionId: 'v1', status: 'in_progress' }), // excluded
      makeApp({ resumeVersionId: 'v1', status: 'submitted' }), // applied, no response
      makeApp({ resumeVersionId: 'v1', status: 'interview' }), // applied + response
    ];
    const rows = getResponseRateByResumeVersion(apps);
    const v1 = rows.find((r) => r.version === 'v1')!;
    expect(v1.applied).toBe(2);
    expect(v1.responses).toBe(1);
    expect(v1.rate).toBeLessThanOrEqual(1);
    expect(v1.rate).toBeCloseTo(0.5);
  });
});

describe('getGhostRateByPlatform', () => {
  it('computes ghost rate per source', () => {
    const apps = [
      makeApp({ source: 'wellfound', status: 'ghosted', appliedAt: new Date() }),
      makeApp({ source: 'wellfound', status: 'ghosted', appliedAt: new Date() }),
      makeApp({ source: 'wellfound', status: 'interview', appliedAt: new Date() }),
      makeApp({ source: 'greenhouse', status: 'submitted', appliedAt: new Date() }),
      makeApp({ source: 'greenhouse', status: 'offer', appliedAt: new Date() }),
    ];
    const rows = getGhostRateByPlatform(apps);
    const wf = rows.find((r) => r.platform === 'wellfound')!;
    const gh = rows.find((r) => r.platform === 'greenhouse')!;
    expect(wf.applied).toBe(3);
    expect(wf.ghosted).toBe(2);
    expect(wf.rate).toBeCloseTo(2 / 3);
    expect(gh.ghosted).toBe(0);
    expect(gh.rate).toBe(0);
  });
});

describe('getTimeToFirstResponse', () => {
  it('returns null when no responses exist', () => {
    const apps = [makeApp({ appliedAt: new Date() })];
    const result = getTimeToFirstResponse(apps);
    expect(result.avgDays).toBe(null);
    expect(result.count).toBe(0);
  });

  it('computes average days from submit to first non-submit status change', () => {
    const submittedAt = new Date(Date.now() - 10 * DAY);
    const respondedAt = new Date(Date.now() - 7 * DAY); // 3 days later
    const apps = [
      makeApp({
        appliedAt: submittedAt,
        statusHistory: [{ from: 'submitted', to: 'under_review', changedAt: respondedAt }],
      }),
    ];
    const result = getTimeToFirstResponse(apps);
    expect(result.avgDays).toBeCloseTo(3, 0);
    expect(result.count).toBe(1);
  });

  it('computes a TRUE median for even-length response samples', () => {
    // Response durations: 2, 4, 6, 8 days. True median = (4 + 6) / 2 = 5.
    // The buggy version returned sorted[n/2] = 6.
    const apps = [2, 4, 6, 8].map((days) =>
      makeApp({
        appliedAt: new Date(Date.now() - 30 * DAY),
        statusHistory: [
          {
            from: 'submitted',
            to: 'under_review',
            changedAt: new Date(Date.now() - (30 - days) * DAY),
          },
        ],
      })
    );
    const result = getTimeToFirstResponse(apps);
    expect(result.median).toBeCloseTo(5, 0);
    expect(result.avgDays).toBeCloseTo(5, 0);
    expect(result.count).toBe(4);
  });

  it('returns the middle value for odd-length samples', () => {
    const apps = [1, 3, 9].map((days) =>
      makeApp({
        appliedAt: new Date(Date.now() - 30 * DAY),
        statusHistory: [
          {
            from: 'submitted',
            to: 'under_review',
            changedAt: new Date(Date.now() - (30 - days) * DAY),
          },
        ],
      })
    );
    const result = getTimeToFirstResponse(apps);
    expect(result.median).toBeCloseTo(3, 0);
  });
});

describe('getFunnelStats', () => {
  it('counts each stage and computes conversion', () => {
    const apps = [
      makeApp({ status: 'submitted' }),
      makeApp({ status: 'under_review' }),
      makeApp({
        status: 'interview',
        statusHistory: [{ from: 'submitted', to: 'under_review', changedAt: new Date() }],
      }),
      makeApp({
        status: 'offer',
        statusHistory: [
          { from: 'submitted', to: 'under_review', changedAt: new Date() },
          { from: 'under_review', to: 'interview', changedAt: new Date() },
        ],
      }),
    ];
    const stats = getFunnelStats(apps);
    // submitted: all 4 (statusHistory or status)
    expect(stats.find((s) => s.stage === 'submitted')!.count).toBe(4);
    // under_review: 3 (1 directly + 2 via history)
    expect(stats.find((s) => s.stage === 'under_review')!.count).toBe(3);
    // interview: 2
    expect(stats.find((s) => s.stage === 'interview')!.count).toBe(2);
    // offer: 1
    expect(stats.find((s) => s.stage === 'offer')!.count).toBe(1);
  });
});
