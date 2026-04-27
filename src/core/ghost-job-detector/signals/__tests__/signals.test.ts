/**
 * Per-signal unit tests (Workstream 8, iter-2 coverage gap fix).
 *
 * The scorer.test.ts file tests signals transitively through the
 * orchestrator. These tests exercise each signal in isolation so a
 * regression pinpoints the culprit immediately.
 */

import { describe, it, expect } from 'vitest';
import { scorePostingAge } from '../posting-age';
import { scoreSalarySpread } from '../salary-spread';
import { scoreReposting } from '../reposting';
import { scoreTitleVagueness } from '../title-vagueness';
import { scoreApplicantVolume } from '../applicant-volume';
import { scoreLayoffNews } from '../layoff-news';
import { scoreJDVagueness, heuristicVagueness } from '../jd-vagueness';
import { DEFAULT_WEIGHTS } from '../../scorer';
import type { ScoreInput } from '../../types';
import type { Application } from '@shared/types/application.types';

const NOW = new Date('2026-04-08T12:00:00Z');

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86_400_000);
}

function makeInput(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    job: {
      title: 'Senior Backend Engineer',
      company: 'Acme Corp',
      description: 'We need a backend engineer.',
      postedDate: daysAgo(10),
      salary: { min: 150_000, max: 220_000, currency: 'USD', period: 'annual' },
    },
    jdText: 'We need a backend engineer.',
    trackerHistory: [],
    layoffNews: [],
    vaguenessAnalysis: null,
    weights: DEFAULT_WEIGHTS,
    phase: 'full',
    ...overrides,
  };
}

describe('scorePostingAge', () => {
  it('does not trigger for a fresh posting', () => {
    const sig = scorePostingAge(
      makeInput({ job: { ...makeInput().job, postedDate: daysAgo(5) } }),
      NOW
    );
    expect(sig.triggered).toBe(false);
  });

  it('triggers gt30 weight at 30..59 days', () => {
    const sig = scorePostingAge(
      makeInput({ job: { ...makeInput().job, postedDate: daysAgo(45) } }),
      NOW
    );
    expect(sig.triggered).toBe(true);
    expect(sig.weight).toBe(DEFAULT_WEIGHTS.posting_age.gt30);
  });

  it('triggers gt60 weight at 60..89 days', () => {
    const sig = scorePostingAge(
      makeInput({ job: { ...makeInput().job, postedDate: daysAgo(75) } }),
      NOW
    );
    expect(sig.weight).toBe(DEFAULT_WEIGHTS.posting_age.gt60);
  });

  it('triggers gt90 weight at 90+ days', () => {
    const sig = scorePostingAge(
      makeInput({ job: { ...makeInput().job, postedDate: daysAgo(120) } }),
      NOW
    );
    expect(sig.weight).toBe(DEFAULT_WEIGHTS.posting_age.gt90);
  });

  it('returns neutral for missing postedDate', () => {
    const sig = scorePostingAge(
      makeInput({ job: { ...makeInput().job, postedDate: undefined } }),
      NOW
    );
    expect(sig.triggered).toBe(false);
  });

  it('coerces ISO string postedDate (regression test)', () => {
    const sig = scorePostingAge(
      makeInput({
        job: { ...makeInput().job, postedDate: daysAgo(70).toISOString() as unknown as Date },
      }),
      NOW
    );
    expect(sig.triggered).toBe(true);
  });
});

describe('scoreSalarySpread', () => {
  it('does not trigger for a normal range', () => {
    const sigs = scoreSalarySpread(makeInput());
    expect(sigs.find((s) => s.kind === 'salary_spread')?.triggered).toBe(false);
  });

  it('triggers for a 3.1x range', () => {
    const sigs = scoreSalarySpread(
      makeInput({
        job: {
          ...makeInput().job,
          salary: { min: 80_000, max: 250_000, currency: 'USD', period: 'annual' },
        },
      })
    );
    const spread = sigs.find((s) => s.kind === 'salary_spread');
    expect(spread?.triggered).toBe(true);
  });

  it('emits salary_missing for absent salary', () => {
    const sigs = scoreSalarySpread(makeInput({ job: { ...makeInput().job, salary: undefined } }));
    const missing = sigs.find((s) => s.kind === 'salary_missing');
    expect(missing?.triggered).toBe(true);
  });

  it('handles unparsed string salary gracefully', () => {
    const sigs = scoreSalarySpread(
      makeInput({
        job: { ...makeInput().job, salary: 'competitive' as unknown as undefined },
      })
    );
    expect(sigs).toHaveLength(2);
  });
});

describe('scoreReposting', () => {
  function makePrior(company: string, title: string, daysOld = 30): Application {
    return {
      id: 'app-x',
      jobId: 'job-x',
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

  it('does not trigger with no prior history', () => {
    const sig = scoreReposting(makeInput({ trackerHistory: [] }));
    expect(sig.triggered).toBe(false);
  });

  it('triggers with one prior at onePrior weight', () => {
    const sig = scoreReposting(
      makeInput({
        trackerHistory: [makePrior('Acme Corp', 'Senior Backend Engineer')],
      })
    );
    expect(sig.triggered).toBe(true);
    expect(sig.weight).toBe(DEFAULT_WEIGHTS.reposting.onePrior);
  });

  it('triggers with two priors at twoPlus weight', () => {
    const sig = scoreReposting(
      makeInput({
        trackerHistory: [
          makePrior('Acme Corp', 'Senior Backend Engineer', 90),
          makePrior('Acme Corp', 'Backend Engineer', 60),
        ],
      })
    );
    expect(sig.weight).toBe(DEFAULT_WEIGHTS.reposting.twoPlus);
  });

  it('does not match different companies', () => {
    const sig = scoreReposting(
      makeInput({ trackerHistory: [makePrior('Globex', 'Senior Backend Engineer')] })
    );
    expect(sig.triggered).toBe(false);
  });
});

describe('scoreTitleVagueness', () => {
  it('does not trigger for a clean title', () => {
    const sig = scoreTitleVagueness(makeInput());
    expect(sig.triggered).toBe(false);
  });

  it('triggers for "ninja" buzzword', () => {
    const sig = scoreTitleVagueness(
      makeInput({ job: { ...makeInput().job, title: 'Backend Ninja' } })
    );
    expect(sig.triggered).toBe(true);
  });

  it('triggers for multi-role title with two slashes', () => {
    const sig = scoreTitleVagueness(
      makeInput({ job: { ...makeInput().job, title: 'Backend / Frontend / DevOps' } })
    );
    expect(sig.triggered).toBe(true);
  });
});

describe('scoreApplicantVolume', () => {
  it('does not trigger when applicantCount is unknown', () => {
    const sig = scoreApplicantVolume(makeInput());
    expect(sig.triggered).toBe(false);
  });

  it('does not trigger below 500', () => {
    const sig = scoreApplicantVolume(makeInput({ applicantCount: 200 }));
    expect(sig.triggered).toBe(false);
  });

  it('triggers at 500+ with medium confidence', () => {
    const sig = scoreApplicantVolume(makeInput({ applicantCount: 700 }));
    expect(sig.triggered).toBe(true);
    expect(sig.confidence).toBe('medium');
  });

  it('triggers at 1000+ with high confidence', () => {
    const sig = scoreApplicantVolume(makeInput({ applicantCount: 1500 }));
    expect(sig.confidence).toBe('high');
  });
});

describe('scoreLayoffNews', () => {
  it('does not trigger when news is null (cheap phase)', () => {
    const sig = scoreLayoffNews(makeInput({ layoffNews: null }), NOW);
    expect(sig.triggered).toBe(false);
  });

  it('does not trigger when news list is empty', () => {
    const sig = scoreLayoffNews(makeInput({ layoffNews: [] }), NOW);
    expect(sig.triggered).toBe(false);
  });

  it('triggers on a recent layoff headline', () => {
    const sig = scoreLayoffNews(
      makeInput({
        layoffNews: [
          {
            title: 'Acme Corp lays off 200 engineers',
            source: 'reuters.com',
            publishedAt: daysAgo(20).toISOString(),
          },
        ],
      }),
      NOW
    );
    expect(sig.triggered).toBe(true);
  });

  it('does NOT trigger on an old (>90d) headline', () => {
    const sig = scoreLayoffNews(
      makeInput({
        layoffNews: [
          {
            title: 'Acme Corp announces layoffs',
            source: 'reuters.com',
            publishedAt: daysAgo(120).toISOString(),
          },
        ],
      }),
      NOW
    );
    expect(sig.triggered).toBe(false);
  });

  it('does NOT trigger on a non-layoff headline', () => {
    const sig = scoreLayoffNews(
      makeInput({
        layoffNews: [
          {
            title: 'Acme Corp raises Series C',
            source: 'reuters.com',
            publishedAt: daysAgo(20).toISOString(),
          },
        ],
      }),
      NOW
    );
    expect(sig.triggered).toBe(false);
  });
});

describe('scoreJDVagueness', () => {
  it('does not trigger when analysis is null (cheap phase)', () => {
    const sig = scoreJDVagueness(makeInput({ vaguenessAnalysis: null }));
    expect(sig.triggered).toBe(false);
  });

  it('does not trigger below 0.6 score', () => {
    const sig = scoreJDVagueness(
      makeInput({
        vaguenessAnalysis: { score: 0.4, vaguePhrases: [], source: 'heuristic' },
      })
    );
    expect(sig.triggered).toBe(false);
  });

  it('triggers at 0.85 score', () => {
    const sig = scoreJDVagueness(
      makeInput({
        vaguenessAnalysis: { score: 0.85, vaguePhrases: ['fast-paced'], source: 'heuristic' },
      })
    );
    expect(sig.triggered).toBe(true);
  });
});

describe('heuristicVagueness', () => {
  it('returns 0 for short text', () => {
    expect(heuristicVagueness('hi').score).toBe(0);
  });

  it('flags fast-paced + wear many hats as vague', () => {
    const text =
      'We are a fast-paced environment. You will wear many hats. Problem solving is key. Passionate about code.';
    const result = heuristicVagueness(text);
    expect(result.vaguePhrases.length).toBeGreaterThan(0);
    expect(result.source).toBe('heuristic');
  });
});
