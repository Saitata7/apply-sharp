/**
 * Layoff news signal.
 *
 * Very strong indicator of a ghost listing. If a company laid off staff in
 * the last 90 days and is still posting an open req, that role is almost
 * always either (a) a backfill that will quietly close, (b) a compliance
 * posting (PERM/H1B), or (c) a reorganization placeholder.
 *
 * Pure function: receives the layoff news items as a parameter (the handler
 * fetches them via the layoff-fetcher which wraps the existing Google News
 * RSS plumbing from src/core/outreach/recruiter-research.ts and the
 * IndexedDB cache helper from src/background/research/company-research.ts).
 *
 * If layoffNews is null (cheap phase), returns triggered: false with a
 * neutral reason. The full phase fetches and re-runs.
 */

import type { GhostSignal, ScoreInput } from '../types';

const LAYOFF_KEYWORDS =
  /\b(layoffs?|lay(?:s|ing)? off|laid off|workforce reduction|job cuts|fires \d|let go|riffed|RIF|restructur|downsiz)/i;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function scoreLayoffNews(input: ScoreInput, now: Date = new Date()): GhostSignal {
  const news = input.layoffNews;
  if (news === null) {
    return {
      kind: 'layoff_news',
      triggered: false,
      weight: 0,
      confidence: 'low',
      reason: 'Layoff news not yet checked',
    };
  }

  if (news.length === 0) {
    return {
      kind: 'layoff_news',
      triggered: false,
      weight: 0,
      confidence: 'high',
      reason: 'No recent layoff news',
    };
  }

  const cutoff = now.getTime() - NINETY_DAYS_MS;
  const recent = news.filter((item) => {
    if (!item.publishedAt) return false;
    const t = Date.parse(item.publishedAt);
    if (Number.isNaN(t)) return false;
    if (t < cutoff) return false;
    const haystack = `${item.title} ${item.snippet ?? ''}`;
    return LAYOFF_KEYWORDS.test(haystack);
  });

  if (recent.length === 0) {
    return {
      kind: 'layoff_news',
      triggered: false,
      weight: 0,
      confidence: 'high',
      reason: 'No layoff news in last 90 days',
    };
  }

  // Pick the most recent matching item for the evidence string.
  const sorted = [...recent].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const top = sorted[0];
  const ageDays = Math.floor((now.getTime() - Date.parse(top.publishedAt)) / (24 * 60 * 60 * 1000));

  return {
    kind: 'layoff_news',
    triggered: true,
    weight: input.weights.layoff_news,
    confidence: 'high',
    reason: `Layoffs reported ${ageDays} days ago${top.source ? ` (${top.source})` : ''}`,
    evidence: top.title.slice(0, 200),
  };
}
