/**
 * Ghost Job handlers (Workstream 8).
 *
 * Background message handler that orchestrates the pure ghost-job scorer
 * with the I/O it needs:
 *   - tracker history via applicationRepo.findByCompanyAndTitle
 *   - layoff news via fetchLayoffNews (which wraps Google News RSS plus
 *     ISO-week IDB cache)
 *   - JD vagueness via Gemini Nano (with deterministic heuristic fallback)
 *
 * Two phases per the WS8 plan:
 *   - cheap: deterministic local signals only, runs in <50ms on every job
 *   - full: adds layoff news + AI vagueness, gated by user click or by the
 *     cheap score crossing a suspicion threshold
 *
 * The handler never throws to the message router. All failures degrade to
 * either a cheap-only score or a neutral score with the reason embedded.
 */

import type { MessageResponse } from '@shared/utils/messaging';
import type { ExtractedJob } from '@shared/types/job.types';
import type {
  GhostScore,
  LayoffNewsItem,
  ScoreInput,
  VaguenessResult,
} from '@core/ghost-job-detector/types';
import { scoreGhostJob, DEFAULT_WEIGHTS } from '@core/ghost-job-detector/scorer';
import {
  isSameRolePosting,
  normalizeCompany,
  normalizeTitle,
} from '@core/ghost-job-detector/reposting-normalizer';
import { fetchLayoffNews, refreshLayoffNews } from '@core/ghost-job-detector/layoff-fetcher';
import { heuristicVagueness } from '@core/ghost-job-detector/signals/jd-vagueness';
import { applicationRepo } from '@storage/index';
import { detectBestProvider } from '@/ai';

interface ScoreGhostJobPayload {
  job: ExtractedJob;
  phase: 'cheap' | 'full';
  /** Optional: bypass the layoff cache (refresh button). */
  refreshLayoffs?: boolean;
  /** Optional: applicant count surfaced from a popup-driven LinkedIn capture. */
  applicantCount?: number;
}

// Auto-escalate threshold lives in weights.json (DEFAULT_WEIGHTS.auto_escalate_threshold)
// so signal tuning never needs a code change.

export async function handleScoreGhostJob(
  payload: ScoreGhostJobPayload
): Promise<MessageResponse<GhostScore>> {
  try {
    if (!payload?.job?.title || !payload?.job?.company) {
      return { success: false, error: 'Job is missing title or company' };
    }
    const requestedPhase: 'cheap' | 'full' = payload.phase ?? 'cheap';
    const job = payload.job;

    // 1. Tracker history (cheap, local IDB)
    const normalizedCompany = normalizeCompany(job.company);
    const normalizedTitle = normalizeTitle(job.title);
    let trackerHistory: Awaited<ReturnType<typeof applicationRepo.findByCompanyAndTitle>> = [];
    try {
      trackerHistory = await applicationRepo.findByCompanyAndTitle(
        normalizedCompany,
        normalizedTitle,
        isSameRolePosting
      );
    } catch (err) {
      console.warn('[GhostJobHandler] tracker history fetch failed:', err);
    }

    // Phase 1: cheap score (always runs)
    const cheapInput: ScoreInput = {
      job,
      jdText: job.description ?? '',
      trackerHistory,
      layoffNews: null,
      vaguenessAnalysis: null,
      weights: DEFAULT_WEIGHTS,
      applicantCount: payload.applicantCount,
      phase: 'cheap',
    };
    const cheapScore = scoreGhostJob(cheapInput);

    // If the caller asked for cheap-only, return now.
    // If the caller asked for full, OR cheap auto-escalates, run the full pipeline.
    const shouldRunFull =
      requestedPhase === 'full' || cheapScore.total >= DEFAULT_WEIGHTS.auto_escalate_threshold;
    if (!shouldRunFull) {
      return { success: true, data: cheapScore };
    }

    // 2. Layoff news (network, IDB-cached). Refresh path bypasses the cache.
    let layoffNews: LayoffNewsItem[] = [];
    try {
      layoffNews = payload.refreshLayoffs
        ? await refreshLayoffNews(job.company)
        : await fetchLayoffNews(job.company);
    } catch (err) {
      console.warn('[GhostJobHandler] layoff fetch failed:', err);
      layoffNews = [];
    }

    // 3. JD vagueness - try Gemini Nano (or whatever the cost router selects)
    //    with a deterministic heuristic fallback when no AI provider is
    //    available. The AI path is wrapped in a try/catch so a provider
    //    outage falls back gracefully.
    let vagueness: VaguenessResult;
    try {
      vagueness = await runVaguenessSignal(job.description ?? '');
    } catch (err) {
      console.warn('[GhostJobHandler] vagueness AI failed, using heuristic:', err);
      vagueness = heuristicVagueness(job.description ?? '');
    }

    const fullInput: ScoreInput = {
      ...cheapInput,
      layoffNews,
      vaguenessAnalysis: vagueness,
      phase: 'full',
    };
    const fullScore = scoreGhostJob(fullInput);
    return { success: true, data: fullScore };
  } catch (err) {
    console.error('[GhostJobHandler] unexpected failure:', err);
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Run the vagueness analysis.
 *
 * Currently runs the deterministic heuristic across the board. The cost
 * router seam below is preserved so the future Nano-batched call drops in
 * at the same point - but since the AI prompt builder for vagueness has
 * not landed yet, we do NOT advertise an AI path in the UI. The button
 * label was renamed in iter-2 from "Check layoff news + AI vagueness" to
 * "Check layoff news + JD vagueness" to remove the trust leak.
 *
 * Returning the same VaguenessResult shape from either path means the
 * scoring signal logic stays identical when the AI call eventually lands.
 */
async function runVaguenessSignal(jdText: string): Promise<VaguenessResult> {
  const text = (jdText || '').slice(0, 8000);
  if (text.length < 50) {
    return { score: 0, vaguePhrases: [], source: 'heuristic' };
  }
  try {
    // detectBestProvider() is intentionally still called so a future
    // contributor can wire the Nano vagueness call without restructuring
    // the handler. The result is currently unused; we always return the
    // heuristic so the UI never claims AI work it does not perform.
    void (await detectBestProvider());
    return heuristicVagueness(text);
  } catch {
    return heuristicVagueness(text);
  }
}
