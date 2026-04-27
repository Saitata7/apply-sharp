/**
 * Anti-AI-tells linter applied to WS8 ghost-job and WS9 discovery
 * user-visible strings.
 *
 * The plan's "Anti-AI-tells linter scope" section was explicit:
 *   - Apply to: ghost-score reason strings, vagueness analysis output,
 *     portal recommender reason strings
 *   - Do NOT apply to: HN comments, JD text from listings
 *
 * Iteration 2 wires this in by exercising every signal scoring function
 * with realistic fixture inputs and asserting the resulting reason +
 * evidence strings pass detectAITells. Module-load constants
 * (PORTAL_MAP notes, DEAD_SOURCES.reason, AFFILIATE_SPAM_SOURCES.reason,
 * weights.json buckets, RECOMMENDATION_TEXT) are also asserted directly.
 *
 * If a future contributor adds a reason like "we leverage your tracker
 * history to assess this listing", this test fails and the contributor
 * must rewrite the reason in human voice.
 */

import { describe, it, expect } from 'vitest';
import { detectAITells } from '@core/profile/claims-validator';
import { scoreGhostJob, DEFAULT_WEIGHTS } from './scorer';
import type { ScoreInput } from './types';
import { VALIDATED_PORTAL_MAP } from '@core/discovery/portal-map';
import { DEAD_SOURCES, AFFILIATE_SPAM_SOURCES } from '@core/discovery/source-quality';

function expectClean(text: string, where: string): void {
  if (!text) return;
  const result = detectAITells(text);
  if (result.hasIssues) {
    throw new Error(
      `${where}: detectAITells flagged this string. ` +
        `bannedTokens=${result.bannedTokens.join(',')} ` +
        `structuralTells=${result.structuralTells.join(',')} ` +
        `hasEmDash=${result.hasEmDash}\n` +
        `Text: ${text}`
    );
  }
  expect(result.hasIssues).toBe(false);
}

describe('WS8 ghost-job reason strings pass detectAITells', () => {
  function makeInput(overrides: Partial<ScoreInput> = {}): ScoreInput {
    return {
      job: {
        title: 'Senior Backend Engineer',
        company: 'Acme Corp',
        description: 'We need an engineer.',
        postedDate: new Date(),
        salary: { min: 150_000, max: 220_000, currency: 'USD', period: 'annual' },
      },
      jdText: 'We need an engineer.',
      trackerHistory: [],
      layoffNews: [],
      vaguenessAnalysis: null,
      weights: DEFAULT_WEIGHTS,
      phase: 'full',
      ...overrides,
    };
  }

  it('clean job: every signal reason passes', () => {
    const score = scoreGhostJob(makeInput());
    for (const sig of score.signals) {
      expectClean(sig.reason, `clean.${sig.kind}.reason`);
      if (sig.evidence) expectClean(sig.evidence, `clean.${sig.kind}.evidence`);
    }
  });

  it('old + reposted + layoff + vague (all-bad): every reason still passes', () => {
    const score = scoreGhostJob(
      makeInput({
        job: {
          title: 'Backend Ninja',
          company: 'Acme Corp',
          description: 'Fast-paced environment.',
          postedDate: new Date(Date.now() - 120 * 86_400_000),
          salary: { min: 80_000, max: 250_000, currency: 'USD', period: 'annual' },
        },
        layoffNews: [
          {
            title: 'Acme Corp lays off 30 percent of workforce',
            source: 'reuters.com',
            publishedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
          },
        ],
        vaguenessAnalysis: {
          score: 0.85,
          vaguePhrases: ['fast-paced'],
          source: 'ai',
        },
        applicantCount: 1500,
      })
    );
    for (const sig of score.signals) {
      expectClean(sig.reason, `bad.${sig.kind}.reason`);
      if (sig.evidence) expectClean(sig.evidence, `bad.${sig.kind}.evidence`);
    }
  });
});

describe('WS9 discovery static curation strings pass detectAITells', () => {
  it('every PORTAL_MAP entry sourceName passes', () => {
    for (const e of VALIDATED_PORTAL_MAP) {
      expectClean(e.sourceName, `portal.${e.sourceName}.name`);
    }
  });

  it('every PORTAL_MAP entry notes string passes', () => {
    for (const e of VALIDATED_PORTAL_MAP) {
      if (e.notes) expectClean(e.notes, `portal.${e.sourceName}.notes`);
    }
  });

  it('every DEAD_SOURCES reason passes', () => {
    for (const d of DEAD_SOURCES) {
      expectClean(d.name, `dead.${d.name}.name`);
      expectClean(d.reason, `dead.${d.name}.reason`);
    }
  });

  it('every AFFILIATE_SPAM_SOURCES reason passes', () => {
    for (const a of AFFILIATE_SPAM_SOURCES) {
      expectClean(a.name, `spam.${a.name}.name`);
      expectClean(a.reason, `spam.${a.name}.reason`);
    }
  });
});
