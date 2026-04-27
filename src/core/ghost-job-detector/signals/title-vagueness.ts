/**
 * Title vagueness signal.
 *
 * Weak signal but free: certain title patterns correlate with low-intent
 * postings. "Ninja", "rockstar", "guru", and titles cramming 3+ disciplines
 * are all tells that the role is undefined or that the listing is generic
 * pipelining.
 *
 * Pure regex; no allocations beyond the match. Confidence is intentionally
 * 'low' so this signal alone never moves a job out of the green bucket.
 */

import type { GhostSignal, ScoreInput } from '../types';

// "champion" was removed in iter-2: "Customer Success Champion" is a real
// title in many SaaS companies and the false-positive rate was too high.
// The remaining tokens are reliably AI/buzzword tells.
const VAGUE_TOKENS = /\b(ninja|rockstar|guru|wizard|jedi|samurai)\b/i;
const MULTI_ROLE = /\b(and|\/|\+|or)\b/i;

export function scoreTitleVagueness(input: ScoreInput): GhostSignal {
  const title = (input.job.title || '').trim();
  if (!title) {
    return {
      kind: 'title_vagueness',
      triggered: false,
      weight: 0,
      confidence: 'low',
      reason: 'Title not extracted',
    };
  }

  const tokens: string[] = [];
  const vague = VAGUE_TOKENS.exec(title);
  if (vague) tokens.push(vague[0].toLowerCase());

  // "Backend Engineer / Full Stack / DevOps" - three or more multi-role
  // separators in a single title is a tell.
  const separatorCount = (title.match(/[/+]/g) || []).length;
  const multiRoleHit = separatorCount >= 2 || (separatorCount >= 1 && MULTI_ROLE.test(title));

  if (tokens.length === 0 && !multiRoleHit) {
    return {
      kind: 'title_vagueness',
      triggered: false,
      weight: 0,
      confidence: 'low',
      reason: 'Title looks specific',
    };
  }

  const reasons: string[] = [];
  if (tokens.length > 0) reasons.push(`buzzword "${tokens[0]}"`);
  if (multiRoleHit) reasons.push('multi-role title');

  return {
    kind: 'title_vagueness',
    triggered: true,
    weight: input.weights.title_vagueness,
    confidence: 'low',
    reason: `Title vagueness: ${reasons.join(', ')}`,
    evidence: title.slice(0, 200),
  };
}
