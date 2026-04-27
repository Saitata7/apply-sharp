/**
 * Feed-signal handler.
 *
 * Background-side endpoint for the LinkedIn jobs feed badge IIFE
 * (src/content/linkedin/jobs-feed-iife.ts). The IIFE scrapes one batch of
 * cards per MutationObserver tick and posts them here. We:
 *
 *   1. Pull the active MasterProfile / ResumeProfile to derive UserContext
 *      (target roles, target companies, location, accepts-remote).
 *   2. Score each card with the pure feed scorer.
 *   3. Cross-check against the application tracker for reposting (if the
 *      user already applied to this exact company+title, the card is a
 *      strong ghost candidate even when posting age looks fresh).
 *   4. Return one score per input card. The IIFE renders badges.
 *
 * Stays cheap: no AI, no fetch, no per-card round-trip. One IDB lookup per
 * unique (normalizedCompany, normalizedTitle) pair, deduped before the loop.
 *
 * Distinct from handleScoreGhostJob which runs the full ghost pipeline on
 * a single job page (with AI vagueness + layoff news fetch). This handler
 * is the cheap-batch sibling for the feed surface.
 */

import type { MessageResponse } from '@shared/utils/messaging';
import {
  scoreFeedJob,
  type FeedJobScore,
  type FeedJobSignals,
  type UserContext,
} from '@core/signals/feed-job-signal';
import {
  isSameRolePosting,
  normalizeCompany,
  normalizeTitle,
} from '@core/ghost-job-detector/reposting-normalizer';
import { applicationRepo, masterProfileRepo, profileRepo } from '@storage/index';

export interface ScoreJobCardsBatchPayload {
  cards: FeedJobSignals[];
}

export interface ScoredJobCard {
  urn?: string;
  score: FeedJobScore;
}

export interface ScoreJobCardsBatchResult {
  scores: ScoredJobCard[];
}

/**
 * Build UserContext from whichever profile the user has active. Falls back
 * to ResumeProfile when MasterProfile is absent (older installs). Empty
 * fields stay empty so the scorer treats them as "user has not configured".
 */
async function buildUserContext(): Promise<UserContext> {
  const ctx: UserContext = {
    targetRoles: [],
    excludedRoles: [],
    targetCompanies: [],
    excludedCompanies: [],
    acceptsRemote: true,
  };

  try {
    const master = await masterProfileRepo.getActive();
    if (master) {
      // Prefer user-curated role profiles. Fall back to AI-derived bestFitRoles
      // when the user has not created any role profiles yet.
      const fromRoleProfiles = (master.roleProfiles ?? [])
        .filter((rp) => rp.isActive !== false)
        .map((rp) => rp.targetRole)
        .filter((t): t is string => Boolean(t));
      const fromBestFit = (master.careerContext?.bestFitRoles ?? [])
        .map((rf) => rf.title)
        .filter((t): t is string => Boolean(t));
      ctx.targetRoles = fromRoleProfiles.length ? fromRoleProfiles : fromBestFit;
      ctx.userLocation = master.personal?.location?.formatted;
    }
  } catch {
    // fall through to ResumeProfile
  }

  try {
    const active = await profileRepo.getDefault();
    if (active) {
      // Merge ResumeProfile data on top of MasterProfile when present. The
      // ResumeProfile is the only place targetCompanies live today.
      if (!ctx.targetRoles?.length) {
        ctx.targetRoles = (active.targetRoles ?? []).filter(Boolean);
      }
      ctx.targetCompanies = (active.targetCompanies ?? []).filter(Boolean);
      if (!ctx.userLocation) {
        ctx.userLocation = active.personal?.location;
      }
    }
  } catch {
    // best-effort; the scorer tolerates an empty context.
  }

  return ctx;
}

/**
 * Returns true when the user has a prior application in their tracker that
 * matches this card's normalized (company, title). The match is the same
 * canonicalize-then-equals used by the deep ghost scorer so we stay
 * consistent across surfaces.
 *
 * The handler dedupes lookups by normalized key so 25 cards from 8 distinct
 * companies cost at most 8 IDB reads instead of 25.
 */
async function buildRepostLookup(
  cards: FeedJobSignals[]
): Promise<(card: FeedJobSignals) => boolean> {
  const keyFor = (c: { company?: string; title?: string }): string =>
    `${normalizeCompany(c.company)}::${normalizeTitle(c.title)}`;

  const uniqueKeys = new Set<string>();
  const keyedCards: Array<{ key: string; company?: string; title?: string }> = [];
  for (const c of cards) {
    if (!c.company || !c.title) continue;
    const k = keyFor(c);
    if (uniqueKeys.has(k)) continue;
    uniqueKeys.add(k);
    keyedCards.push({ key: k, company: c.company, title: c.title });
  }

  const repostKeys = new Set<string>();
  await Promise.all(
    keyedCards.map(async ({ key, company, title }) => {
      try {
        const matches = await applicationRepo.findByCompanyAndTitle(
          normalizeCompany(company),
          normalizeTitle(title),
          isSameRolePosting
        );
        if (matches.length > 0) repostKeys.add(key);
      } catch (err) {
        // Best-effort. A failed lookup should not gate the card.
        console.debug('[FeedSignal] repost lookup failed:', err);
      }
    })
  );

  return (card: FeedJobSignals) => {
    if (!card.company || !card.title) return false;
    return repostKeys.has(keyFor(card));
  };
}

/**
 * Apply the reposting cross-check to a per-card score. When the user has
 * already applied to this exact role, that is a stronger ghost signal than
 * any age threshold (~80% of reposts in research are pipelining). We force
 * hard ghost so the badge surfaces as LOW with a clear reason.
 */
function applyRepostFlag(score: FeedJobScore, isRepost: boolean): FeedJobScore {
  if (!isRepost) return score;
  const next: FeedJobScore = {
    ...score,
    ghostFlag: true,
    ghostHard: true,
    ghostReason: score.ghostReason ?? 'reposted - you already applied here',
    tier: 'low',
    ledger: [...score.ledger, { label: 'reposted (you already applied)', delta: -3 }],
    reasons: [...score.reasons, 'ghost: reposted - you already applied here'],
    points: score.points - 3,
  };
  return next;
}

// One-shot log so the user can see in the service-worker console which
// target roles / companies / location the scorer is using. Without this,
// "everything shows low" looks like a bug when the real cause is an empty
// targetRoles list. Reset on flag toggle so it logs again if the user
// updates their profile.
let loggedUserCtxOnce = false;

export async function handleScoreJobCardsBatch(
  payload: ScoreJobCardsBatchPayload
): Promise<MessageResponse<ScoreJobCardsBatchResult>> {
  if (!payload?.cards?.length) {
    return { success: true, data: { scores: [] } };
  }

  const cards = payload.cards;
  const [userCtx, isRepost] = await Promise.all([buildUserContext(), buildRepostLookup(cards)]);

  if (!loggedUserCtxOnce) {
    loggedUserCtxOnce = true;
    console.info('[ApplySharp jobs-feed] scoring with user context:', {
      targetRoles: userCtx.targetRoles,
      targetCompanies: userCtx.targetCompanies,
      excludedRoles: userCtx.excludedRoles,
      userLocation: userCtx.userLocation,
      acceptsRemote: userCtx.acceptsRemote,
    });
    if (!userCtx.targetRoles?.length) {
      console.warn(
        '[ApplySharp jobs-feed] no targetRoles configured. Every card will score neutral on title-match. ' +
          'Set MasterProfile.roleProfiles[].targetRole or careerContext.bestFitRoles[].title, OR set ResumeProfile.targetRoles.'
      );
    }
  }

  const scores: ScoredJobCard[] = cards.map((card) => {
    const base = scoreFeedJob(card, userCtx);
    const finalScore = applyRepostFlag(base, isRepost(card));
    return { urn: card.urn, score: finalScore };
  });

  return { success: true, data: { scores } };
}
