/**
 * Feed-job signal scorer.
 *
 * Pure function. Given the cheap signals visible on a single LinkedIn jobs
 * search / collections card (no AI, no network, no IDB) plus minimal user
 * context, returns a tier (high|medium|low|skip) plus a ledger of why.
 *
 * Companion to the deep ghost-job scorer in src/core/ghost-job-detector.
 * That one runs once per JOB DETAIL page, costs an AI call, and is used
 * to make a final apply / skip decision. This one runs on EVERY card in
 * the left rail of /jobs/search and /jobs/collections/recommended so the
 * user can decide which cards are worth opening at all.
 *
 * Design rules:
 * - PURE. No chrome.* references, no fetch, no IDB. Inputs by value.
 * - Tolerant. Missing inputs degrade the confidence of a signal, never
 *   throw. The card always renders something.
 * - Points ledger, not thresholds. Each signal pushes points up or down,
 *   final sum maps to a tier. This way "great title match but very stale
 *   posting" lands in Medium with a visible ghost warning, instead of
 *   forcing the user to read the JD to find out the role is two months old.
 * - Ghost flag is independent of tier. A card can be MEDIUM with ghostFlag
 *   so the badge shows "Medium - ghost?" so the user is warned but not
 *   gated out (sometimes 60-day-old roles do still hire).
 *
 * Distinct from src/content/detectors/linkedin.ts which extracts a SINGLE
 * job page on the right detail panel. This module never touches the DOM.
 */

export type FeedTier = 'high' | 'medium' | 'low' | 'skip';

/**
 * One card's signals as scraped from the DOM. Every field optional so the
 * extractor can pass partial data when LinkedIn rotates a class or hides a
 * field. The scorer treats unknowns conservatively (no points either way).
 */
export interface FeedJobSignals {
  /** Stable card identity. urn:li:jobPosting:1234567890 or just the id. */
  urn?: string;
  title?: string;
  company?: string;
  /** Card-visible location string ("San Francisco, CA" / "Remote" / "United States"). */
  location?: string;
  /** Hours since posting, parsed from the "X ago" string on the card. */
  postedHoursAgo?: number;
  /** True when the card shows the Easy Apply badge. */
  easyApply?: boolean;
  /** True when the card is a Promoted (paid) listing rather than organic. */
  promoted?: boolean;
  /** Parsed applicants count from "Over N applicants" / "N applicants". */
  applicantsCount?: number;
  /** True when LinkedIn already shows the "Viewed" footer on the card. */
  alreadyViewed?: boolean;
  /**
   * True when the card carries the "Actively reviewing applicants" insight.
   * Strong positive signal: a recruiter is currently engaging with the
   * applicant pool, not letting the post sit. LinkedIn surfaces this on
   * the recommended rail (where posting age and applicants are hidden),
   * so it is the primary fresh-engagement signal in that surface.
   */
  activelyReviewing?: boolean;
  /**
   * True when the card displays a salary range (e.g. "$110K/yr - $160K/yr").
   * Salary-disclosed postings correlate with real hiring intent because
   * NY / CA / CO / WA mandates are on actual roles, not pipelining.
   */
  salaryVisible?: boolean;
}

/**
 * The user context the scorer needs. Pulled once per page from the active
 * MasterProfile / ResumeProfile in the background and passed in to every
 * card score. Empty arrays mean the user has not configured that signal,
 * not that everything fails.
 */
export interface UserContext {
  /** Roles the user is targeting. Matched as case-insensitive substrings. */
  targetRoles?: string[];
  /** Anti-targets. Cards matching these roles auto-Low (e.g. "principal" if you target "senior"). */
  excludedRoles?: string[];
  /** Companies the user actively wants. Matched as case-insensitive substrings. */
  targetCompanies?: string[];
  /** Companies the user has decided to skip permanently. */
  excludedCompanies?: string[];
  /** User's home base ("San Francisco, CA"). Same-city match is a small bonus. */
  userLocation?: string;
  /** True if the user is open to remote roles. Drives the Remote/Hybrid bonus. */
  acceptsRemote?: boolean;
  /** URNs the user already applied to OR explicitly dismissed via the badge X. */
  alreadyAppliedUrns?: Set<string>;
  /** URNs the user told us are ghosts (right-click "mark as ghost") so we never re-show. */
  dismissedGhostUrns?: Set<string>;
}

export interface LedgerEntry {
  label: string;
  /** Point delta. Positive boosts toward high, negative toward low. */
  delta: number;
}

export interface FeedJobScore {
  tier: FeedTier;
  /** Sum of ledger deltas. Useful for debugging and tooltip display. */
  points: number;
  /** Always populated. UI iterates this for the tooltip ("why this score"). */
  ledger: LedgerEntry[];
  /** Short human reasons, derived from the ledger. */
  reasons: string[];
  /** True when posting age, applicant volume, or other signals say "ghost-prone". */
  ghostFlag: boolean;
  /**
   * True when the ghost evidence is strong enough to force LOW regardless of
   * other signals (>60 days old, or 200+ applicants on a >7-day-old post).
   * Soft ghost (30-60 days only) leaves ghostHard false and only demotes
   * a HIGH down to MEDIUM so a great fit still surfaces with a warning.
   */
  ghostHard: boolean;
  /** Short tag for the ghost-flag tooltip ("> 60 days old", "200+ applicants on month-old post"). */
  ghostReason?: string;
  /** True when the user already applied to or dismissed this card. */
  alreadyHandled: boolean;
}

/** Match a string against a list of needles, case-insensitive substring. */
function matchesAny(haystack: string | undefined, needles: string[] | undefined): boolean {
  if (!haystack || !needles?.length) return false;
  const h = haystack.toLowerCase();
  return needles.some((n) => n && h.includes(n.toLowerCase()));
}

/** Heuristic location classifier. Conservative: unknown stays unknown. */
function classifyLocation(
  location: string | undefined,
  userLocation: string | undefined
): { kind: 'remote' | 'hybrid' | 'sameCity' | 'usOther' | 'foreign' | 'unknown'; raw: string } {
  if (!location) return { kind: 'unknown', raw: '' };
  const lower = location.toLowerCase();

  if (/\bremote\b/.test(lower)) return { kind: 'remote', raw: location };
  if (/\bhybrid\b/.test(lower)) return { kind: 'hybrid', raw: location };

  if (userLocation) {
    const userCity = userLocation.split(',')[0]?.trim().toLowerCase();
    if (userCity && lower.includes(userCity)) return { kind: 'sameCity', raw: location };
  }

  // Very rough US vs not-US heuristic. We never claim foreign without strong signal.
  // If you want better international handling, swap this for a proper country list.
  const looksUS =
    /, [a-z]{2}$/.test(lower) ||
    /united states/.test(lower) ||
    /\busa\b/.test(lower) ||
    /\bus\b/.test(lower);
  if (looksUS) return { kind: 'usOther', raw: location };

  // Unknown rather than foreign. Not penalizing on weak evidence is the safer default.
  return { kind: 'unknown', raw: location };
}

const VERY_FRESH_HOURS = 24;
const FRESH_HOURS = 24 * 7;
const STALE_HOURS = 24 * 30;
const VERY_STALE_HOURS = 24 * 60;

export function scoreFeedJob(signals: FeedJobSignals, ctx: UserContext = {}): FeedJobScore {
  const ledger: LedgerEntry[] = [];
  let ghostFlag = false;
  let ghostHard = false;
  let ghostReason: string | undefined;
  let alreadyHandled = false;

  // ----- hard skips -----
  if (signals.urn && ctx.dismissedGhostUrns?.has(signals.urn)) {
    return {
      tier: 'skip',
      points: 0,
      ledger: [],
      reasons: ['dismissed by you'],
      ghostFlag: true,
      ghostHard: true,
      ghostReason: 'you marked this as ghost',
      alreadyHandled: true,
    };
  }
  if (matchesAny(signals.company, ctx.excludedCompanies)) {
    return {
      tier: 'skip',
      points: 0,
      ledger: [],
      reasons: [`${signals.company} is on your excluded companies list`],
      ghostFlag: false,
      ghostHard: false,
      alreadyHandled: false,
    };
  }

  // Already-applied surfaces as a visible greyed badge instead of skip so
  // the user sees we recognize the listing rather than thinking the badge
  // is missing. Mirrors reply-pilot's "alreadyCommented" treatment.
  if (signals.urn && ctx.alreadyAppliedUrns?.has(signals.urn)) {
    alreadyHandled = true;
    ledger.push({ label: 'you already applied', delta: 0 });
  }

  // ----- title match -----
  if (matchesAny(signals.title, ctx.excludedRoles)) {
    ledger.push({ label: `title matches an excluded role`, delta: -3 });
  } else if (matchesAny(signals.title, ctx.targetRoles)) {
    ledger.push({ label: 'title matches a target role', delta: 3 });
  } else if (signals.title) {
    // Soft penalty when the user has configured target roles and this isn't one.
    if (ctx.targetRoles?.length) {
      ledger.push({ label: 'title outside your target roles', delta: -1 });
    }
  }

  // ----- company tier -----
  if (matchesAny(signals.company, ctx.targetCompanies)) {
    ledger.push({ label: `${signals.company} is on your target list`, delta: 3 });
  }

  // ----- location -----
  const loc = classifyLocation(signals.location, ctx.userLocation);
  if (loc.kind === 'remote') {
    if (ctx.acceptsRemote !== false) {
      ledger.push({ label: 'remote role', delta: 2 });
    }
  } else if (loc.kind === 'hybrid') {
    if (
      loc.raw &&
      ctx.userLocation &&
      loc.raw.toLowerCase().includes(ctx.userLocation.split(',')[0]!.toLowerCase())
    ) {
      ledger.push({ label: `hybrid in ${ctx.userLocation.split(',')[0]}`, delta: 2 });
    } else {
      ledger.push({ label: 'hybrid role', delta: 0 });
    }
  } else if (loc.kind === 'sameCity') {
    ledger.push({ label: `local to ${ctx.userLocation?.split(',')[0]}`, delta: 2 });
  } else if (loc.kind === 'usOther' && ctx.acceptsRemote === false) {
    ledger.push({ label: 'on-site, different city', delta: -2 });
  }

  // ----- posting age (also drives ghost flag) -----
  const hours = signals.postedHoursAgo;
  if (typeof hours === 'number' && Number.isFinite(hours) && hours >= 0) {
    if (hours <= VERY_FRESH_HOURS) {
      ledger.push({ label: 'posted in the last 24h', delta: 3 });
    } else if (hours <= FRESH_HOURS) {
      ledger.push({ label: `posted ${Math.round(hours / 24)} days ago`, delta: 1 });
    } else if (hours <= STALE_HOURS) {
      ledger.push({ label: `posted ${Math.round(hours / 24)} days ago`, delta: 0 });
    } else if (hours <= VERY_STALE_HOURS) {
      ledger.push({ label: `posted ${Math.round(hours / 24)} days ago`, delta: -2 });
      ghostFlag = true;
      ghostReason = `${Math.round(hours / 24)} days old (ghost-prone)`;
    } else {
      ledger.push({ label: `posted ${Math.round(hours / 24)} days ago`, delta: -4 });
      ghostFlag = true;
      ghostHard = true;
      ghostReason = `${Math.round(hours / 24)} days old (likely ghost)`;
    }
  }

  // ----- promoted -----
  if (signals.promoted) {
    ledger.push({ label: 'promoted (paid listing)', delta: -1 });
  }

  // ----- easy apply -----
  if (signals.easyApply) {
    // Mild penalty: easy apply attracts higher volume which dilutes any individual app.
    // Not a deal-breaker; many real roles are easy apply.
    ledger.push({ label: 'easy apply (more competition)', delta: -1 });
  }

  // ----- applicant volume -----
  const apps = signals.applicantsCount;
  if (typeof apps === 'number' && Number.isFinite(apps)) {
    if (apps <= 25) {
      ledger.push({ label: `${apps} applicants (early)`, delta: 2 });
    } else if (apps <= 100) {
      ledger.push({ label: `${apps} applicants`, delta: 0 });
    } else if (apps <= 200) {
      ledger.push({ label: `${apps}+ applicants`, delta: -1 });
    } else {
      ledger.push({ label: `${apps}+ applicants (saturated)`, delta: -2 });
      // High applicant volume on an aging post is a stronger ghost signal
      // than either alone. Pipelining roles tend to accumulate hundreds of
      // applicants over weeks without any hire.
      if (typeof hours === 'number' && hours > FRESH_HOURS) {
        ghostFlag = true;
        ghostHard = true;
        ghostReason =
          ghostReason ?? `${apps}+ applicants on a ${Math.round(hours / 24)}-day-old post`;
      }
    }
  }

  // ----- already viewed -----
  if (signals.alreadyViewed && !alreadyHandled) {
    ledger.push({ label: 'you viewed this earlier', delta: -1 });
  }

  // ----- actively reviewing applicants -----
  // LinkedIn surfaces this insight when the recruiter has touched the
  // applicant list recently. On the recommended rail (where posting age
  // is hidden) this is the primary engagement signal.
  if (signals.activelyReviewing) {
    ledger.push({ label: 'recruiter actively reviewing', delta: 2 });
  }

  // ----- salary visible -----
  // Salary disclosure correlates with real hiring intent (NY/CA/CO/WA
  // mandates apply to actual roles, not talent pipelining). Small bonus.
  if (signals.salaryVisible) {
    ledger.push({ label: 'salary disclosed', delta: 1 });
  }

  // ----- sum and tier -----
  const points = ledger.reduce((acc, e) => acc + e.delta, 0);

  // Threshold tuning rationale: on /jobs/collections/recommended LinkedIn
  // hides posting age and applicant count, capping the upside of a card to
  // about +6 even when title + company + location + activelyReviewing all
  // align. A HIGH cutoff of 4 keeps the badge useful on that surface
  // without flooding /jobs/search with false positives (where the upside
  // ladder reaches +10 thanks to fresh + low-applicants signals).
  let tier: FeedTier;
  if (alreadyHandled) {
    tier = 'low';
  } else if (points >= 4) {
    tier = 'high';
  } else if (points >= 1) {
    tier = 'medium';
  } else {
    tier = 'low';
  }

  // Ghost demotion. Hard ghost (>60 days, or 200+ applicants on a >7-day-old
  // post) forces LOW so the user can blow past it without thinking. Soft
  // ghost (30-60 days only) just demotes a HIGH down to MEDIUM so a great
  // title+company+location fit still surfaces with a warning instead of
  // being hidden in the LOW bucket.
  if (ghostHard) {
    tier = 'low';
  } else if (ghostFlag && tier === 'high') {
    tier = 'medium';
  }

  const reasons = ledger.map((l) => l.label);
  if (ghostReason) reasons.push(`ghost: ${ghostReason}`);

  return {
    tier,
    points,
    ledger,
    reasons,
    ghostFlag,
    ghostHard,
    ghostReason,
    alreadyHandled,
  };
}
