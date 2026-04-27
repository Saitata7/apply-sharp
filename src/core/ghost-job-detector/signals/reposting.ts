/**
 * Reposting signal.
 *
 * The single highest-leverage signal: if the user already has this exact
 * (company, normalized title) in their tracker, the listing has been
 * reposted. ~80% of reposted listings are ghosts (talent pipelining,
 * H1B compliance, or reposting after a hire fell through).
 *
 * Pure function: receives the tracker history as a parameter (the handler
 * fetches it via applicationRepo.findByCompanyAndTitle and passes it in).
 * Compares using the normalizer for exact-match-after-canonicalize.
 */

import type { GhostSignal, ScoreInput } from '../types';
import { isSameRolePosting } from '../reposting-normalizer';

export function scoreReposting(input: ScoreInput): GhostSignal {
  const { trackerHistory, job } = input;
  if (!trackerHistory || trackerHistory.length === 0) {
    return {
      kind: 'reposting',
      triggered: false,
      weight: 0,
      confidence: 'high',
      reason: 'No prior listing in your tracker',
    };
  }

  const target = { company: job.company || '', title: job.title || '' };
  const matches = trackerHistory.filter((app) => {
    const snap = app.jdSnapshot;
    if (!snap?.company || !snap?.title) return false;
    return isSameRolePosting(target, { company: snap.company, title: snap.title });
  });

  if (matches.length === 0) {
    return {
      kind: 'reposting',
      triggered: false,
      weight: 0,
      confidence: 'high',
      reason: 'No prior listing in your tracker',
    };
  }

  const w = input.weights.reposting;
  const weight = matches.length >= 2 ? w.twoPlus : w.onePrior;
  const oldestRaw: Date | string | undefined = matches
    .map((a) => a.jdSnapshot?.capturedAt as Date | string | undefined)
    .filter((v): v is Date | string => Boolean(v))
    .sort()[0];
  const oldestDate =
    oldestRaw instanceof Date
      ? oldestRaw.toISOString().slice(0, 10)
      : typeof oldestRaw === 'string'
        ? oldestRaw.slice(0, 10)
        : undefined;

  return {
    kind: 'reposting',
    triggered: true,
    weight,
    confidence: 'high',
    reason:
      matches.length === 1
        ? 'You have applied to this exact role before'
        : `Reposted ${matches.length} times in your tracker`,
    evidence: oldestDate ? `first seen ${oldestDate}` : undefined,
  };
}
