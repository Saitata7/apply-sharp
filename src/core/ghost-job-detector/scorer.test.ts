/**
 * Ghost scorer fixture tests.
 *
 * Six canonical fixtures cover the main score buckets and signal interactions:
 *   1. Clean fresh job → green, score < 20
 *   2. Old posting (60+ days) → amber
 *   3. Reposted job → red even without other signals
 *   4. Layoff news + old → red, very high
 *   5. Vague JD only → amber
 *   6. All-bad job (every signal triggered) → capped at 100, red
 *
 * The scorer is a pure function so we just construct ScoreInput and assert.
 * No mocks, no IDB, no fetches.
 */

import { describe, it, expect } from 'vitest';
import { scoreGhostJob, DEFAULT_WEIGHTS } from './scorer';
import type { ScoreInput, GhostWeights } from './types';
import type { ExtractedJob } from '@shared/types/job.types';
import type { Application } from '@shared/types/application.types';

// Use real wall-clock now so signal functions (which call new Date()
// internally) compute the same age the fixtures expect. Mocking Date is
// avoided here because the scorer is otherwise pure and easier to reason
// about with real time.
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function makeJob(overrides: Partial<ExtractedJob> = {}): ExtractedJob {
  return {
    title: 'Senior Backend Engineer',
    company: 'Acme Corp',
    description: 'We need a backend engineer to build microservices in Go and Python.',
    postedDate: daysAgo(5),
    salary: { min: 150_000, max: 220_000, currency: 'USD', period: 'annual' },
    ...overrides,
  };
}

function makeInput(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    job: makeJob(),
    jdText: 'We need a backend engineer.',
    trackerHistory: [],
    layoffNews: [],
    vaguenessAnalysis: null,
    weights: DEFAULT_WEIGHTS as GhostWeights,
    phase: 'full',
    ...overrides,
  };
}

function makePriorApp(company: string, title: string, daysOld = 30): Application {
  return {
    id: 'app-1',
    jobId: 'job-1',
    profileId: 'p',
    status: 'submitted',
    appliedAt: daysAgo(daysOld),
    statusHistory: [],
    jdSnapshot: {
      title,
      company,
      jdText: '',
      url: 'https://example.com',
      capturedAt: daysAgo(daysOld),
    },
  } as unknown as Application;
}

// Allow scorer to use a mockable "now" by passing layoffNews dates
// relative to the fixed NOW.

describe('scoreGhostJob', () => {
  describe('fixture 1: clean fresh job', () => {
    it('returns green bucket with score < 20', () => {
      const result = scoreGhostJob(makeInput());
      expect(result.bucket).toBe('green');
      expect(result.total).toBeLessThan(20);
      expect(result.recommendation).toBe('apply_normally');
      // 7 signals always present
      expect(result.signals.length).toBeGreaterThanOrEqual(7);
      // No signal should be triggered for a clean job
      expect(result.signals.filter((s) => s.triggered)).toHaveLength(0);
    });
  });

  describe('fixture 2: old posting (67 days)', () => {
    it('triggers posting_age (>60d) and lands in amber', () => {
      const result = scoreGhostJob(
        makeInput({
          job: makeJob({ postedDate: daysAgo(67) }),
        })
      );
      const ageSignal = result.signals.find((s) => s.kind === 'posting_age');
      expect(ageSignal?.triggered).toBe(true);
      expect(ageSignal?.weight).toBe(DEFAULT_WEIGHTS.posting_age.gt60);
      expect(result.bucket).toBe('amber');
      expect(result.total).toBe(DEFAULT_WEIGHTS.posting_age.gt60);
    });
  });

  describe('fixture 3: reposted job', () => {
    it('triggers reposting and lands in amber/red even without other signals', () => {
      const prior = makePriorApp('Acme Corp', 'Senior Backend Engineer', 60);
      const result = scoreGhostJob(makeInput({ trackerHistory: [prior] }));
      const repostSignal = result.signals.find((s) => s.kind === 'reposting');
      expect(repostSignal?.triggered).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(DEFAULT_WEIGHTS.reposting.onePrior);
      expect(['amber', 'red']).toContain(result.bucket);
    });

    it('uses twoPlus weight when 2+ priors exist', () => {
      const result = scoreGhostJob(
        makeInput({
          trackerHistory: [
            makePriorApp('Acme Corp', 'Senior Backend Engineer', 90),
            makePriorApp('Acme Corp', 'Backend Engineer', 60),
          ],
        })
      );
      const repostSignal = result.signals.find((s) => s.kind === 'reposting');
      expect(repostSignal?.triggered).toBe(true);
      expect(repostSignal?.weight).toBe(DEFAULT_WEIGHTS.reposting.twoPlus);
    });
  });

  describe('fixture 4: layoff news + old + reposted', () => {
    it('lands in red bucket with high total', () => {
      const result = scoreGhostJob(
        makeInput({
          job: makeJob({ postedDate: daysAgo(70) }),
          trackerHistory: [makePriorApp('Acme Corp', 'Senior Backend Engineer', 60)],
          layoffNews: [
            {
              title: 'Acme Corp announces 200 layoffs',
              source: 'TechCrunch',
              publishedAt: daysAgo(20).toISOString(),
              snippet: 'restructuring',
            },
          ],
        })
      );
      const layoffSignal = result.signals.find((s) => s.kind === 'layoff_news');
      expect(layoffSignal?.triggered).toBe(true);
      expect(result.bucket).toBe('red');
      // Plan acceptance criterion: 67-day reposted+layoff job returns >=65.
      // Tightened in iter-3 from the original >=60 floor.
      expect(result.total).toBeGreaterThanOrEqual(65);
      expect(result.recommendation).toBe('skip_likely_ghost');
    });
  });

  describe('fixture 5: vague JD only', () => {
    it('triggers jd_vagueness and contributes its weight', () => {
      const result = scoreGhostJob(
        makeInput({
          vaguenessAnalysis: {
            score: 0.85,
            vaguePhrases: ['fast-paced environment', 'wear many hats'],
            source: 'ai',
          },
        })
      );
      const vagueSignal = result.signals.find((s) => s.kind === 'jd_vagueness');
      expect(vagueSignal?.triggered).toBe(true);
      expect(vagueSignal?.weight).toBe(DEFAULT_WEIGHTS.jd_vagueness);
    });
  });

  describe('fixture 6: all-bad job (every signal triggered)', () => {
    it('caps at 100 and lands in red bucket', () => {
      const result = scoreGhostJob(
        makeInput({
          job: makeJob({
            title: 'Backend Ninja / Full Stack / DevOps',
            postedDate: daysAgo(120),
            salary: { min: 80_000, max: 250_000, currency: 'USD', period: 'annual' },
          }),
          trackerHistory: [
            makePriorApp('Acme Corp', 'Senior Backend Engineer', 90),
            makePriorApp('Acme Corp', 'Backend Engineer', 60),
          ],
          layoffNews: [
            {
              title: 'Acme Corp lays off 30% of workforce',
              source: 'Reuters',
              publishedAt: daysAgo(30).toISOString(),
            },
          ],
          vaguenessAnalysis: {
            score: 0.9,
            vaguePhrases: ['fast-paced', 'rockstar'],
            source: 'ai',
          },
          applicantCount: 1500,
        })
      );
      expect(result.total).toBe(100);
      expect(result.bucket).toBe('red');
      // At least 5 of the 8 signals should have triggered
      const triggered = result.signals.filter((s) => s.triggered);
      expect(triggered.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('error tolerance', () => {
    it('returns a neutral score when input is missing', () => {
      const result = scoreGhostJob(null as unknown as ScoreInput);
      expect(result.total).toBe(0);
      expect(result.bucket).toBe('green');
      expect(result.recommendation).toBe('apply_normally');
    });

    it('survives missing job fields', () => {
      const result = scoreGhostJob(
        makeInput({
          job: { title: 'X', company: 'Y', description: '' },
        })
      );
      expect(result.bucket).toBe('green');
    });

    it('coerces a string postedDate (regression: side panel forwards strings)', () => {
      // The TabJobContext sent from the side panel carries postedDate as
      // an ISO string, not a Date instance. The previous version of the
      // signal used `instanceof Date` and silently dropped string inputs,
      // killing the strongest ghost indicator on the entire UI surface.
      const isoString = daysAgo(70).toISOString();
      const result = scoreGhostJob(
        makeInput({
          job: makeJob({ postedDate: isoString as unknown as Date }),
        })
      );
      const ageSignal = result.signals.find((s) => s.kind === 'posting_age');
      expect(ageSignal?.triggered).toBe(true);
      expect(ageSignal?.weight).toBe(DEFAULT_WEIGHTS.posting_age.gt60);
    });

    it('handles a numeric postedDate timestamp', () => {
      const ts = daysAgo(40).getTime();
      const result = scoreGhostJob(
        makeInput({
          job: makeJob({ postedDate: ts as unknown as Date }),
        })
      );
      const ageSignal = result.signals.find((s) => s.kind === 'posting_age');
      expect(ageSignal?.triggered).toBe(true);
    });
  });

  describe('phase tracking', () => {
    it('records the cheap phase on cheap-only inputs', () => {
      const result = scoreGhostJob(
        makeInput({ phase: 'cheap', layoffNews: null, vaguenessAnalysis: null })
      );
      expect(result.phase).toBe('cheap');
    });
    it('records the full phase when both expensive signals are present', () => {
      const result = scoreGhostJob(
        makeInput({
          phase: 'full',
          layoffNews: [],
          vaguenessAnalysis: { score: 0.2, vaguePhrases: [], source: 'ai' },
        })
      );
      expect(result.phase).toBe('full');
    });
  });

  describe('signal completeness', () => {
    it('always emits a signal for each kind, triggered or not', () => {
      const result = scoreGhostJob(makeInput());
      const kinds = new Set(result.signals.map((s) => s.kind));
      // 7 signal functions, salary-spread emits 2 (salary_missing + salary_spread) -> 8 unique kinds
      expect(kinds).toContain('posting_age');
      expect(kinds).toContain('reposting');
      expect(kinds).toContain('title_vagueness');
      expect(kinds).toContain('applicant_volume');
      expect(kinds).toContain('layoff_news');
      expect(kinds).toContain('jd_vagueness');
      expect(kinds).toContain('salary_spread');
      expect(kinds).toContain('salary_missing');
    });
  });

  describe('phase-1 performance budget', () => {
    it('scores cheap phase against a 200-row tracker in <50ms', () => {
      // Plan acceptance criterion: phase-1 scoring runs in <50ms on the
      // slowest tracker. Construct a 200-row tracker and time the scorer.
      // The budget is generous: a real run should be ~5ms.
      const trackerHistory: Application[] = [];
      for (let i = 0; i < 200; i++) {
        trackerHistory.push(makePriorApp(`Company ${i}`, `Engineer ${i}`, i + 1));
      }
      // Add one matching prior so the reposting signal also runs the
      // hot loop, not just the empty-list early return.
      trackerHistory.push(makePriorApp('Acme Corp', 'Senior Backend Engineer', 90));

      const input = makeInput({
        trackerHistory,
        phase: 'cheap',
        layoffNews: null,
        vaguenessAnalysis: null,
      });

      const start = performance.now();
      // Run 10 iterations and take the average to smooth out test runner noise.
      let result;
      for (let i = 0; i < 10; i++) {
        result = scoreGhostJob(input);
      }
      const avgMs = (performance.now() - start) / 10;

      expect(result).toBeDefined();
      expect(avgMs).toBeLessThan(50);
    });
  });
});
