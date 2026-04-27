/**
 * Applicant volume signal.
 *
 * "1000+ applicants" on LinkedIn is the canonical black-hole indicator. The
 * scorer never reads the LinkedIn DOM directly (banned per WS1 LinkedIn
 * fingerprint mitigation); the popup-driven extractor populates this only
 * when the user explicitly captures via the popup, and it lands on the
 * ScoreInput as `applicantCount`.
 *
 * Conservative threshold: we trigger at >=500 applicants (medium signal).
 * Above 1000 we boost to high confidence.
 */

import type { GhostSignal, ScoreInput } from '../types';

const HIGH_VOLUME_THRESHOLD = 500;
const VERY_HIGH_THRESHOLD = 1000;

export function scoreApplicantVolume(input: ScoreInput): GhostSignal {
  const count = input.applicantCount;
  if (typeof count !== 'number' || count <= 0) {
    return {
      kind: 'applicant_volume',
      triggered: false,
      weight: 0,
      confidence: 'low',
      reason: 'Applicant count unknown',
    };
  }

  if (count < HIGH_VOLUME_THRESHOLD) {
    return {
      kind: 'applicant_volume',
      triggered: false,
      weight: 0,
      confidence: 'medium',
      reason: `${count} applicants (typical)`,
    };
  }

  const confidence = count >= VERY_HIGH_THRESHOLD ? 'high' : 'medium';
  return {
    kind: 'applicant_volume',
    triggered: true,
    weight: input.weights.applicant_volume,
    confidence,
    reason: `${count >= VERY_HIGH_THRESHOLD ? '1000+' : count} applicants (black-hole risk)`,
    evidence: String(count),
  };
}
