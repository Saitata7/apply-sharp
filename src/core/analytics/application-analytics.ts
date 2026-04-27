/**
 * Application analytics.
 *
 * Pure functions, zero side effects, easy to unit-test. The killer
 * differentiator vs Simplify and Huntr is `getResponseRateByResumeVersion`:
 * neither competitor can compute this because they don't control the resume
 * versioning pipeline. ApplySharp does (resume-versions store + tailored
 * resume tracking via Application.resumeVersionId).
 */

import type { Application, ApplicationStatus, StatusChange } from '@shared/types/application.types';

const DAY_MS = 86_400_000;

const RESPONSE_STATUSES: ApplicationStatus[] = ['under_review', 'interview', 'offer', 'rejected'];

export interface ApplyRateResult {
  total: number;
  perDay: { date: string; count: number }[];
  avgPerDay: number;
  avgPerWeek: number;
}

export function getApplyRate(apps: Application[], periodDays: number = 30): ApplyRateResult {
  const cutoff = Date.now() - periodDays * DAY_MS;
  const inWindow = apps.filter((a) => a.appliedAt && new Date(a.appliedAt).getTime() >= cutoff);

  const perDay = new Map<string, number>();
  for (const app of inWindow) {
    const key = new Date(app.appliedAt!).toISOString().slice(0, 10);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  return {
    total: inWindow.length,
    perDay: [...perDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count })),
    avgPerDay: inWindow.length / periodDays,
    avgPerWeek: (inWindow.length / periodDays) * 7,
  };
}

export interface ResponseRateRow {
  version: string;
  applied: number;
  responses: number;
  rate: number;
}

/**
 * Group applications by resumeVersionId and compute the response rate per
 * version. The killer differentiator chart in the analytics dashboard.
 *
 * Both numerator and denominator are computed over the SAME subset (applied
 * applications). The previous version counted responses across the full
 * group while counting denominator only over applied apps, which produced
 * rates above 100% if a response somehow appeared on a saved/in_progress
 * row (the analytics seed and the manual status edits make this possible).
 */
export function getResponseRateByResumeVersion(apps: Application[]): ResponseRateRow[] {
  const groups = new Map<string, Application[]>();
  for (const app of apps) {
    const key = app.resumeVersionId ?? '__none__';
    const list = groups.get(key) ?? [];
    list.push(app);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([version, list]) => {
      const appliedList = list.filter((a) => a.status !== 'saved' && a.status !== 'in_progress');
      const applied = appliedList.length;
      const responses = appliedList.filter((a) => RESPONSE_STATUSES.includes(a.status)).length;
      return { version, applied, responses, rate: applied > 0 ? responses / applied : 0 };
    })
    .sort((a, b) => b.rate - a.rate);
}

export interface GhostRateRow {
  platform: string;
  applied: number;
  ghosted: number;
  rate: number;
}

export function getGhostRateByPlatform(apps: Application[]): GhostRateRow[] {
  const groups = new Map<string, Application[]>();
  for (const app of apps) {
    const key = app.source ?? 'other';
    const list = groups.get(key) ?? [];
    list.push(app);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([platform, list]) => {
      const applied = list.filter((a) => a.appliedAt).length;
      const ghosted = list.filter((a) => a.status === 'ghosted').length;
      return { platform, applied, ghosted, rate: applied > 0 ? ghosted / applied : 0 };
    })
    .sort((a, b) => b.rate - a.rate);
}

export interface TimeToFirstResponseResult {
  avgDays: number | null;
  median: number | null;
  count: number;
}

export function getTimeToFirstResponse(apps: Application[]): TimeToFirstResponseResult {
  const durations: number[] = [];
  for (const app of apps) {
    if (!app.appliedAt) continue;
    const firstResponse = (app.statusHistory ?? []).find(
      (s: StatusChange) => s.from === 'submitted' && s.to !== 'submitted'
    );
    if (firstResponse) {
      const days =
        (new Date(firstResponse.changedAt).getTime() - new Date(app.appliedAt).getTime()) / DAY_MS;
      if (days >= 0) durations.push(days);
    }
  }

  if (durations.length === 0) return { avgDays: null, median: null, count: 0 };
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = durations.reduce((acc, x) => acc + x, 0);
  // True median: average of the two middle values for even-length arrays.
  // The previous version returned the upper-middle (sorted[n/2]) which is
  // technically wrong and would skew small samples high.
  const n = sorted.length;
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  return {
    avgDays: sum / n,
    median,
    count: n,
  };
}

export interface FunnelRow {
  stage: ApplicationStatus;
  count: number;
  conversion: number;
}

const FUNNEL_STAGES: ApplicationStatus[] = ['submitted', 'under_review', 'interview', 'offer'];

/**
 * Funnel counts are monotonic: an application "reached stage X" if either
 *   (a) its current status is at stage X or beyond in the funnel order, OR
 *   (b) its statusHistory contains an entry whose `to` is X or beyond.
 *
 * This handles two real cases the test fixtures expose:
 *   - apps created at stage X without an explicit statusHistory entry
 *     (e.g. an interview happened but the user only updated the current status)
 *   - apps whose status moved backward (rejected after interview): they still
 *     count as having reached interview.
 */
export function getFunnelStats(apps: Application[]): FunnelRow[] {
  const stageOrder = new Map<string, number>();
  FUNNEL_STAGES.forEach((s, i) => stageOrder.set(s, i));

  const counts: Record<string, number> = Object.fromEntries(FUNNEL_STAGES.map((s) => [s, 0]));

  for (const app of apps) {
    // Find the maximum funnel stage this application has ever reached.
    let maxIdx = -1;
    const currentIdx = stageOrder.get(app.status);
    if (currentIdx !== undefined) maxIdx = Math.max(maxIdx, currentIdx);
    for (const h of app.statusHistory ?? []) {
      const idx = stageOrder.get(h.to);
      if (idx !== undefined) maxIdx = Math.max(maxIdx, idx);
    }
    // Also: rejected and ghosted imply the candidate was at least submitted.
    if (maxIdx === -1 && (app.status === 'rejected' || app.status === 'ghosted')) {
      maxIdx = 0;
    }
    if (maxIdx === -1) continue;

    for (let i = 0; i <= maxIdx; i++) {
      counts[FUNNEL_STAGES[i]]++;
    }
  }

  return FUNNEL_STAGES.map((stage, i) => ({
    stage,
    count: counts[stage],
    conversion:
      i === 0
        ? 1
        : counts[FUNNEL_STAGES[i - 1]] > 0
          ? counts[stage] / counts[FUNNEL_STAGES[i - 1]]
          : 0,
  }));
}
