/**
 * Salary spread + missing-salary signals.
 *
 * Real hiring managers have budgets. A salary range with a 2.5x or wider
 * spread ($90k-$240k) is a soft tell that the listing is fishing for talent
 * pipelines or that the role is undefined. Missing salary entirely is a
 * weaker signal - many legitimate listings omit salary outside the 8 US
 * states that legally require it.
 *
 * Reads ExtractedJob.salary which already gets parsed by LinkedIn and
 * Indeed detectors into { min, max, currency, period }.
 */

import type { GhostSignal, ScoreInput } from '../types';

const SPREAD_THRESHOLD = 2.5;

export function scoreSalarySpread(input: ScoreInput): GhostSignal[] {
  const salary = input.job.salary;
  const signals: GhostSignal[] = [];

  if (!salary || (typeof salary === 'object' && !salary.min && !salary.max)) {
    signals.push({
      kind: 'salary_missing',
      triggered: true,
      weight: input.weights.salary_missing,
      confidence: 'low',
      reason: 'No salary listed',
    });
    // No spread analysis possible if salary is missing
    signals.push({
      kind: 'salary_spread',
      triggered: false,
      weight: 0,
      confidence: 'low',
      reason: 'Salary spread not analyzed (no salary)',
    });
    return signals;
  }

  // salary may be a parsed object {min, max, currency} or a raw string
  if (typeof salary === 'string') {
    signals.push({
      kind: 'salary_missing',
      triggered: false,
      weight: 0,
      confidence: 'low',
      reason: 'Salary listed as text',
    });
    signals.push({
      kind: 'salary_spread',
      triggered: false,
      weight: 0,
      confidence: 'low',
      reason: 'Salary spread not analyzed (unstructured)',
    });
    return signals;
  }

  signals.push({
    kind: 'salary_missing',
    triggered: false,
    weight: 0,
    confidence: 'high',
    reason: 'Salary listed',
  });

  // Iter-2 fix: explicit Number.isFinite guard so a NaN/Infinity in
  // salary.min/max cannot reach the division. Previously the &&
  // chain relied on JS truthiness which is fragile.
  if (Number.isFinite(salary.min) && Number.isFinite(salary.max) && (salary.min as number) > 0) {
    const min = salary.min as number;
    const max = salary.max as number;
    const ratio = max / min;
    if (Number.isFinite(ratio) && ratio >= SPREAD_THRESHOLD) {
      const fmt = (n: number) =>
        salary.currency === 'USD'
          ? `$${Math.round(n / 1000)}k`
          : `${Math.round(n / 1000)}k ${salary.currency}`;
      signals.push({
        kind: 'salary_spread',
        triggered: true,
        weight: input.weights.salary_spread,
        confidence: 'medium',
        reason: `Salary range is unusually wide (${fmt(min)}-${fmt(max)}, ${ratio.toFixed(1)}x spread)`,
        evidence: `${min}-${max} ${salary.currency}`,
      });
      return signals;
    }
  }

  signals.push({
    kind: 'salary_spread',
    triggered: false,
    weight: 0,
    confidence: 'medium',
    reason: 'Salary spread is reasonable',
  });
  return signals;
}
