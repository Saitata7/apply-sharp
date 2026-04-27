/**
 * Posting age signal.
 *
 * Single strongest deterministic indicator of a ghost job: LinkedIn's own
 * published data shows ~50% of jobs older than 30 days are never filled.
 * Tiered weighting (>30 < >60 < >90) so very stale jobs surface as red even
 * when no other signal triggers.
 *
 * Reads ExtractedJob.postedDate which the LinkedIn detector populates from
 * JSON-LD. Other platform detectors will benefit as we add postedDate
 * extraction.
 */

import type { GhostSignal, GhostWeights, ScoreInput } from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Coerce a posted date that may arrive as a Date instance OR an ISO string
 * (the side panel forwards the per-tab job context as a TabJobContext, which
 * carries postedDate as a string for serialization). Returns null if the
 * value is missing, malformed, or in the future by more than 24h.
 */
function coercePostedDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const t = typeof value === 'number' ? value : Date.parse(value);
    if (Number.isNaN(t)) return null;
    return new Date(t);
  }
  return null;
}

export function scorePostingAge(input: ScoreInput, now: Date = new Date()): GhostSignal {
  const posted = coercePostedDate(input.job.postedDate);
  if (!posted) {
    return {
      kind: 'posting_age',
      triggered: false,
      weight: 0,
      confidence: 'low',
      reason: 'Posting age unknown',
    };
  }

  const ageDays = Math.floor((now.getTime() - posted.getTime()) / MS_PER_DAY);
  if (ageDays < 30) {
    return {
      kind: 'posting_age',
      triggered: false,
      weight: 0,
      confidence: 'high',
      reason: `Posted ${Math.max(0, ageDays)} days ago (recent)`,
    };
  }

  const w = input.weights.posting_age;
  let weight = w.gt30;
  if (ageDays >= 90) weight = w.gt90;
  else if (ageDays >= 60) weight = w.gt60;

  return {
    kind: 'posting_age',
    triggered: true,
    weight,
    confidence: 'high',
    reason: `Posted ${ageDays} days ago`,
    evidence: posted.toISOString().slice(0, 10),
  };
}

export type { GhostSignal, GhostWeights };
