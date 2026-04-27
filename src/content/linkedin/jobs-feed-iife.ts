/**
 * LinkedIn jobs-feed signal IIFE.
 *
 * Bundled by scripts/build-jobs-feed-iife.mjs into dist/assets/jobs-feed-iife.js
 * and injected by background/index.ts:maybeInjectLinkedInJobsFeed when the user
 * is on /jobs/search or /jobs/collections/* AND the feature flag
 * linkedin.jobsFeedSignals is enabled.
 *
 * Why an IIFE and not a manifest content script: see the comment in
 * scripts/build-sidebar-iife.mjs. Adding linkedin.com to manifest
 * content_scripts.matches re-leaks the WAR fingerprint surface that the
 * Apr 2026 commit 25d9ba2 closed for default-install users. Opt-in users
 * accept the slightly higher detection risk; default-install users get zero
 * LinkedIn surface.
 *
 * What this script does:
 * 1. Walks the jobs left-rail, scrapes each visible card's signals.
 * 2. Posts the batch to the background SCORE_JOB_CARDS_BATCH handler.
 * 3. Renders a small HIGH/MEDIUM/LOW badge inside each card with a hover
 *    tooltip that lists the ledger reasons.
 * 4. Re-runs on infinite-scroll mutations (debounced) so newly loaded
 *    cards get badged the same way.
 * 5. Re-renders existing badges every 60s so a freshly-stale post (24h25m
 *    old becomes 24h26m old) updates its tier without a page reload.
 *
 * Anti-fingerprint posture (mirrors reply-pilot):
 * - Symbol-keyed load guard, never a named global.
 * - Random per-session class names so LinkedIn's BrowserGate cannot
 *   pattern-match on a fixed string.
 * - WeakSet of badged cards instead of data-* attributes on the DOM.
 * - 800 to 2000ms jittered start delay so the injection timing is not
 *   a fixed-offset side channel.
 * - All styles in a single <style> element appended to documentElement.
 *   No inline styles per badge (smaller surface, easier to remove).
 */

(function () {
  'use strict';

  const LOAD_GUARD = Symbol.for('apsh.jobsfeed.loaded');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((self as any)[LOAD_GUARD]) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (self as any)[LOAD_GUARD] = true;

  // ────────────────────────────────────────────────────────────────────
  // Per-session randomized identifiers. These are NOT secrets; they only
  // exist to defeat fixed-string pattern matching in fingerprinters.
  // ────────────────────────────────────────────────────────────────────
  const SESSION_ID = Math.random().toString(36).slice(2, 8);
  const HOST_CLASS = `apsh-h-${SESSION_ID}`;
  const STYLE_ID = `apsh-s-${SESSION_ID}`;

  // ────────────────────────────────────────────────────────────────────
  // Types kept inline so the IIFE has no module imports. Keep these
  // synced with src/core/signals/feed-job-signal.ts.
  // ────────────────────────────────────────────────────────────────────
  type FeedTier = 'high' | 'medium' | 'low' | 'skip';
  interface CardSignals {
    urn?: string;
    title?: string;
    company?: string;
    location?: string;
    postedHoursAgo?: number;
    easyApply?: boolean;
    promoted?: boolean;
    applicantsCount?: number;
    alreadyViewed?: boolean;
    activelyReviewing?: boolean;
    salaryVisible?: boolean;
  }
  interface LedgerEntry {
    label: string;
    delta: number;
  }
  interface FeedJobScore {
    tier: FeedTier;
    points: number;
    ledger: LedgerEntry[];
    reasons: string[];
    ghostFlag: boolean;
    ghostHard: boolean;
    ghostReason?: string;
    alreadyHandled: boolean;
  }
  interface ScoredCard {
    urn?: string;
    score: FeedJobScore;
  }

  const badgedCards = new WeakSet<Element>();

  // ────────────────────────────────────────────────────────────────────
  // Card discovery. LinkedIn rotates job-card class names every few
  // months so we use multiple candidates ordered by how stable each one
  // has been historically. The first matching selector wins.
  // ────────────────────────────────────────────────────────────────────
  const CARD_SELECTORS = [
    'div.job-card-container',
    'div.jobs-search-results__list-item',
    'li.scaffold-layout__list-item div[data-job-id]',
    'div[data-job-id]',
    'li[data-occludable-job-id]',
  ];

  function findCards(root: ParentNode): Element[] {
    const seen = new Set<Element>();
    for (const sel of CARD_SELECTORS) {
      root.querySelectorAll(sel).forEach((el) => {
        // The walk-up stabilizes the parent so two selectors that match
        // overlapping nodes still produce one entry per visual card.
        const card = el.closest('li, div.job-card-container') ?? el;
        if (card.querySelector('a[href*="/jobs/view/"]') || card.matches('[data-job-id]')) {
          seen.add(card);
        }
      });
    }
    return [...seen];
  }

  function getCardUrn(card: Element): string | undefined {
    const direct =
      card.getAttribute('data-job-id') ??
      card.getAttribute('data-occludable-job-id') ??
      card.querySelector('[data-job-id]')?.getAttribute('data-job-id') ??
      undefined;
    if (direct) return `urn:li:jobPosting:${direct}`;

    const link = card.querySelector('a[href*="/jobs/view/"]');
    const href = link?.getAttribute('href') ?? '';
    const m = href.match(/\/jobs\/view\/(\d+)/);
    return m ? `urn:li:jobPosting:${m[1]}` : undefined;
  }

  function textOf(el: Element | null | undefined): string {
    return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Card signal extractor. Multi-tier fallback for every field. Missing
   * fields stay undefined (not empty string) so the scorer can tell
   * "we have no signal" from "we have an empty signal".
   */
  function extractCardSignals(card: Element): CardSignals {
    const urn = getCardUrn(card);

    // Title extraction. The `aria-label` on the title <a> is the cleanest
    // source LinkedIn exposes (e.g. "Senior AI Engineer", no duplicates,
    // no "with verification" tail). Fall back to the visible <strong> text
    // inside the aria-hidden wrapper which avoids the visually-hidden
    // duplicate that doubles the title when read with .textContent.
    const titleAnchor =
      card.querySelector('a.job-card-list__title') ??
      card.querySelector('a.job-card-container__link') ??
      card.querySelector('a.job-card-list__title--link') ??
      card.querySelector('a[href*="/jobs/view/"]');
    let title =
      titleAnchor?.getAttribute('aria-label')?.trim() ??
      textOf(titleAnchor?.querySelector('span[aria-hidden="true"] strong')) ??
      textOf(titleAnchor);
    // LinkedIn sometimes appends accessibility tails like "with verification"
    // to aria-labels. Strip them so the signal scorer matches against the
    // visible title only.
    title = title
      .replace(/\s+with\s+verification$/i, '')
      .replace(/^(?:Promoted|Saved|Verified|Easy Apply|Viewed)\s+/i, '');

    const company =
      textOf(card.querySelector('.job-card-container__primary-description')) ||
      textOf(card.querySelector('.artdeco-entity-lockup__subtitle')) ||
      textOf(card.querySelector('[class*="job-card-container__company-name"]'));

    const location =
      textOf(
        card.querySelector(
          '.job-card-container__metadata-wrapper li, .artdeco-entity-lockup__caption li'
        )
      ) ||
      textOf(card.querySelector('.job-card-container__metadata-item')) ||
      textOf(card.querySelector('[class*="job-card-container__metadata"]'));

    const allText = card.textContent ?? '';

    const promoted = /\bPromoted\b/.test(allText) && !/\bPromoted by\b/.test(allText);
    const easyApply = /Easy Apply\b/.test(allText);
    const alreadyViewed = /\bViewed\b/.test(allText);

    // "Actively reviewing applicants" appears as both visible text and as
    // an aria-label on the insight icon. Match either so we still catch it
    // when LinkedIn rotates the visible label wording.
    const activelyReviewing =
      /Actively reviewing applicants/i.test(allText) ||
      card.querySelector('[aria-label*="Actively reviewing"]') !== null;

    // Salary line: $NN[K|,000] /yr or /year, optionally followed by a range.
    // Loose enough to catch "$110K/yr - $160K/yr", "$120,000/yr",
    // "$25/hr", and "$80K-$110K".
    const salaryVisible = /\$\s?\d[\d,.]*\s?(?:K|k|,\d{3})?(?:\s?\/\s?(?:yr|year|hr|hour))?/.test(
      allText
    );

    let applicantsCount: number | undefined;
    const applicantsMatch =
      allText.match(/Over\s+(\d+(?:,\d+)*)\s+applicants/i) ??
      allText.match(/(\d+(?:,\d+)*)\+?\s+applicants/i);
    if (applicantsMatch) {
      applicantsCount = parseInt(applicantsMatch[1].replace(/,/g, ''), 10);
    }

    const postedHoursAgo = parsePostedAge(card, allText);

    return {
      urn,
      title: title || undefined,
      company: company || undefined,
      location: location || undefined,
      postedHoursAgo,
      easyApply,
      promoted,
      applicantsCount,
      alreadyViewed,
      activelyReviewing,
      salaryVisible,
    };
  }

  /**
   * Parse a card's "X minutes/hours/days/weeks/months ago" string into a
   * float of hours. Prefer the <time datetime="..."> attribute when
   * present; fall back to the human string. Returns undefined when neither
   * is parseable so the scorer knows the age is unknown.
   */
  function parsePostedAge(card: Element, allText: string): number | undefined {
    const timeEl = card.querySelector('time[datetime]');
    const datetime = timeEl?.getAttribute('datetime');
    if (datetime) {
      const t = Date.parse(datetime);
      if (!Number.isNaN(t)) {
        const hours = (Date.now() - t) / 3_600_000;
        if (hours >= 0) return hours;
      }
    }

    // Strings LinkedIn renders, in order of frequency.
    const m =
      allText.match(/(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i) ??
      allText.match(/Posted\s+(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i);
    if (!m) {
      // Common "fresh" cases LinkedIn renders without a number.
      if (/just\s+now|moments?\s+ago/i.test(allText)) return 0.05;
      if (/\b(an?\s+hour\s+ago)\b/i.test(allText)) return 1;
      if (/\b(yesterday)\b/i.test(allText)) return 24;
      return undefined;
    }
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    switch (unit) {
      case 'minute':
        return n / 60;
      case 'hour':
        return n;
      case 'day':
        return n * 24;
      case 'week':
        return n * 24 * 7;
      case 'month':
        return n * 24 * 30;
      default:
        return undefined;
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Badge rendering. Each badge is a Shadow-DOM-backed <span> appended
  // into the card. Shadow DOM keeps LinkedIn CSS from accidentally
  // restyling it AND keeps our styles from leaking into the page.
  // ────────────────────────────────────────────────────────────────────
  const STYLE_TEXT = `
    :host {
      all: initial;
      display: inline-flex;
      vertical-align: middle;
      margin-left: 6px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
    }
    .b {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 7px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: help;
      user-select: none;
      position: relative;
      line-height: 1.4;
    }
    .b::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
    }
    .high  { background: rgba(40,140,60,.10); color: #1f6f37; box-shadow: inset 0 0 0 1px rgba(40,140,60,.25); }
    .high::before  { background: #2a7d3e; }
    .medium { background: rgba(200,130,20,.10); color: #8a5910; box-shadow: inset 0 0 0 1px rgba(200,130,20,.25); }
    .medium::before { background: #d8941f; }
    .low { background: rgba(140,30,30,.08); color: #8a3030; box-shadow: inset 0 0 0 1px rgba(140,30,30,.20); }
    .low::before { background: #a83838; }
    .done { background: rgba(110,110,120,.08); color: #6a6a75; box-shadow: inset 0 0 0 1px rgba(110,110,120,.18); }
    .done::before { background: #9a9aa5; }
    .ghost { box-shadow: inset 0 0 0 1px rgba(140,30,30,.45); }
    .tip {
      position: absolute;
      bottom: calc(100% + 6px);
      left: 0;
      min-width: 240px;
      max-width: 320px;
      padding: 10px 12px;
      background: #1a1a1f;
      color: #f3f3f0;
      font-size: 11px;
      font-weight: 400;
      line-height: 1.5;
      letter-spacing: 0;
      text-transform: none;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,.30);
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease;
      z-index: 9999999;
    }
    .b:hover .tip { opacity: 1; }
    .tip strong { display: block; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 4px; color: #aab; }
    .tip ul { margin: 0; padding: 0; list-style: none; }
    .tip li { padding: 2px 0; }
    .plus { color: #a7e0b4; }
    .minus { color: #f3a0a0; }
    .ghostline { margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,.10); color: #f3a0a0; }
  `;

  function tierLabel(score: FeedJobScore): string {
    if (score.alreadyHandled) return 'Done';
    return score.tier === 'high' ? 'High' : score.tier === 'medium' ? 'Med' : 'Low';
  }

  function bestHint(score: FeedJobScore): string | undefined {
    if (score.alreadyHandled) return 'applied';
    if (score.ghostHard) return score.ghostReason?.includes('apply') ? 'reposted' : 'ghost';
    if (score.ghostFlag) return 'aging';
    if (score.tier === 'high' || score.tier === 'medium') {
      const top = [...score.ledger].sort((a, b) => b.delta - a.delta)[0];
      if (top && top.delta > 0) return shorten(top.label);
    } else {
      const worst = [...score.ledger].sort((a, b) => a.delta - b.delta)[0];
      if (worst && worst.delta < 0) return shorten(worst.label);
    }
    return undefined;
  }

  function shorten(label: string): string {
    if (/excluded role/i.test(label)) return 'wrong role';
    if (/outside your target/i.test(label)) return 'off-target';
    if (/saturated/i.test(label)) return 'saturated';
    if (/applicants/i.test(label)) return 'crowded';
    if (/days ago/i.test(label)) return 'aging';
    if (/last 24h/i.test(label)) return 'fresh';
    if (/local/i.test(label)) return 'local';
    if (/remote/i.test(label)) return 'remote';
    if (/target list/i.test(label)) return 'target co';
    return label.split(/[\s(]/)[0].toLowerCase();
  }

  function renderBadge(card: Element, score: FeedJobScore): void {
    // Find a sensible mount: the title row keeps the badge near the eye
    // path. Fall back to the card itself for old layouts.
    const titleHost =
      card.querySelector('a.job-card-list__title') ??
      card.querySelector('a.job-card-container__link') ??
      card.querySelector('a[href*="/jobs/view/"]') ??
      card.firstElementChild ??
      card;

    // Remove any badge we placed on a previous tick so re-scoring updates in place.
    titleHost.parentElement?.querySelectorAll(`.${HOST_CLASS}`).forEach((el) => el.remove());

    if (score.tier === 'skip') return;

    const host = document.createElement('span');
    host.className = HOST_CLASS;
    const shadow = host.attachShadow({ mode: 'closed' });
    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = STYLE_TEXT;
    shadow.appendChild(styleEl);

    const badge = document.createElement('span');
    const variant = score.alreadyHandled
      ? 'done'
      : score.tier === 'high'
        ? 'high'
        : score.tier === 'medium'
          ? 'medium'
          : 'low';
    badge.className = `b ${variant}${score.ghostFlag ? ' ghost' : ''}`;

    const label = tierLabel(score);
    const hint = bestHint(score);
    badge.appendChild(document.createTextNode(hint ? `${label} · ${hint}` : label));

    const tip = document.createElement('span');
    tip.className = 'tip';
    const heading = document.createElement('strong');
    heading.textContent = score.alreadyHandled ? 'Already in your tracker' : `Signal: ${label}`;
    tip.appendChild(heading);

    const ul = document.createElement('ul');
    for (const entry of score.ledger) {
      const li = document.createElement('li');
      li.className = entry.delta > 0 ? 'plus' : entry.delta < 0 ? 'minus' : '';
      const arrow = entry.delta > 0 ? '+' : entry.delta < 0 ? '−' : '·';
      li.textContent = `${arrow} ${entry.label}`;
      ul.appendChild(li);
    }
    tip.appendChild(ul);

    if (score.ghostReason) {
      const ghost = document.createElement('div');
      ghost.className = 'ghostline';
      ghost.textContent = `Ghost: ${score.ghostReason}`;
      tip.appendChild(ghost);
    }
    badge.appendChild(tip);

    shadow.appendChild(badge);

    // Mount adjacent to the title link, after it, so the badge sits on the
    // same line on most layouts. If the title is wrapped in a parent that
    // does not allow inline children, fall back to appending to the card.
    if (titleHost.parentElement) {
      titleHost.parentElement.appendChild(host);
    } else {
      card.appendChild(host);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Scoring loop. We build the batch from the visible cards (skip the
  // ones we already badged this cycle) and post the whole array to the
  // background. The background returns an array of {urn, score} which we
  // map by urn so we are robust to LinkedIn re-ordering the rail.
  // ────────────────────────────────────────────────────────────────────
  let scanInFlight = false;

  async function scanAndScore(): Promise<void> {
    if (scanInFlight) return;
    if (!chrome.runtime?.id) return; // extension was reloaded; bail out
    scanInFlight = true;
    try {
      const cards = findCards(document);
      const targets: Array<{ card: Element; signals: CardSignals }> = [];
      for (const card of cards) {
        if (badgedCards.has(card)) continue;
        const signals = extractCardSignals(card);
        // Need at least a urn or a title before we waste a round-trip.
        if (!signals.urn && !signals.title) continue;
        targets.push({ card, signals });
      }
      console.info(`[ApplySharp jobs-feed] cards=${cards.length} new=${targets.length}`);
      if (!targets.length) return;

      const response = (await chrome.runtime
        .sendMessage({
          type: 'SCORE_JOB_CARDS_BATCH',
          payload: { cards: targets.map((t) => t.signals) },
        })
        .catch(() => null)) as {
        success: boolean;
        data?: { scores: ScoredCard[] };
        error?: string;
      } | null;

      if (!response?.success || !response.data) return;
      const byUrn = new Map<string, FeedJobScore>();
      for (const item of response.data.scores) {
        if (item.urn) byUrn.set(item.urn, item.score);
      }

      // Render against the same target list. Reading by index keeps us
      // robust to the background reordering output.
      response.data.scores.forEach((item, i) => {
        const target = targets[i];
        if (!target) return;
        renderBadge(target.card, item.score);
        badgedCards.add(target.card);
      });
    } finally {
      scanInFlight = false;
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Lifecycle. Jittered start, debounced MutationObserver, periodic
  // re-score so freshness updates without a reload.
  // ────────────────────────────────────────────────────────────────────
  function init(): void {
    const startDelay = 800 + Math.random() * 1200;
    // Visible startup line so the user can confirm in DevTools Console that
    // the IIFE was injected. Removing or silencing this would also be a
    // small fingerprint reduction; keep it for now while the feature is
    // beta and broken DOM matches need to be debugged from screenshots.
    console.info(`[ApplySharp jobs-feed] loaded, scanning in ~${Math.round(startDelay)}ms`);
    setTimeout(() => {
      void scanAndScore();

      let pending: ReturnType<typeof setTimeout> | undefined;
      const observer = new MutationObserver(() => {
        if (pending) clearTimeout(pending);
        pending = setTimeout(() => void scanAndScore(), 400);
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // Periodic re-score so the "posted X hours ago" tier updates as time
      // passes. Cards we already badged are skipped via WeakSet, which
      // means this is essentially free except when the rail loaded new
      // entries during the interval.
      const interval = setInterval(() => {
        if (!chrome.runtime?.id) {
          observer.disconnect();
          clearInterval(interval);
          return;
        }
        void scanAndScore();
      }, 60_000);
    }, startDelay);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
