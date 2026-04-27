/**
 * JD vagueness signal.
 *
 * Reads the AI vagueness analysis (if any) and translates it into a signal.
 * Pure function - no AI calls here. The handler runs the AI batch in the
 * full phase via runVaguenessSignal() and passes the result in.
 *
 * Both the AI path and the deterministic heuristic fallback emit the same
 * VaguenessResult shape, so the signal logic is identical.
 */

import type { GhostSignal, ScoreInput } from '../types';

const HIGH_VAGUENESS_THRESHOLD = 0.6;

export function scoreJDVagueness(input: ScoreInput): GhostSignal {
  const v = input.vaguenessAnalysis;
  if (!v) {
    return {
      kind: 'jd_vagueness',
      triggered: false,
      weight: 0,
      confidence: 'low',
      reason: 'JD vagueness not yet checked',
    };
  }

  if (v.score < HIGH_VAGUENESS_THRESHOLD) {
    return {
      kind: 'jd_vagueness',
      triggered: false,
      weight: 0,
      confidence: v.source === 'ai' ? 'medium' : 'low',
      reason: 'Job description looks specific',
    };
  }

  return {
    kind: 'jd_vagueness',
    triggered: true,
    weight: input.weights.jd_vagueness,
    confidence: v.source === 'ai' ? 'medium' : 'low',
    reason: `Job description is vague (${Math.round(v.score * 100)}% vagueness score)`,
    evidence: v.vaguePhrases.slice(0, 3).join(' / '),
  };
}

/**
 * Deterministic heuristic fallback when no AI provider is available.
 * Returns a VaguenessResult shaped identically to the AI path so the signal
 * logic above is unchanged.
 *
 * Heuristic: count vague filler phrases and divide by total phrase count.
 * Crude but stable; flags JDs that are 100% buzzwords.
 */
const VAGUE_PHRASE_PATTERNS: RegExp[] = [
  /\b(any|various|multiple|several)\s+(stack|technolog|languag|framework)/i,
  /\b(fast[- ]paced|dynamic|innovative|cutting[- ]edge|world[- ]class)\s+environment/i,
  /\b(strong\s+(communication|leadership)|team\s+player|self[- ]start|wear\s+many\s+hats)/i,
  /\bproblem[- ]solv/i,
  /\bpassionate\s+about/i,
  /\bability\s+to\s+work\s+(independently|in\s+a\s+team)/i,
  /\bother\s+duties\s+as\s+assigned/i,
  /\bnice\s+to\s+have\b/i,
];

export function heuristicVagueness(jdText: string): {
  score: number;
  vaguePhrases: string[];
  source: 'heuristic';
} {
  const text = (jdText || '').slice(0, 5000);
  if (text.length < 50) {
    return { score: 0, vaguePhrases: [], source: 'heuristic' };
  }

  const matches: string[] = [];
  for (const re of VAGUE_PHRASE_PATTERNS) {
    const m = text.match(re);
    if (m) matches.push(m[0]);
  }

  // Density relative to JD length: a 200-word JD with 4 vague phrases is
  // worse than a 1000-word JD with 4 vague phrases.
  const wordCount = text.split(/\s+/).length;
  const densityScore = matches.length / Math.max(50, wordCount / 20);
  const score = Math.min(1, densityScore);

  return { score, vaguePhrases: matches, source: 'heuristic' };
}
