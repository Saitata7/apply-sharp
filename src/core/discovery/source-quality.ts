/**
 * Source quality curation: which job sources are dead, which are affiliate
 * spam. Surfaced in the Discovery card as a "Skip these - we checked"
 * dismissable info banner. The brand value: ApplySharp tells the user the
 * truth about what is actually worth their time.
 *
 * This is editorial data, not heuristic. We hand-curate it because the
 * "10 hidden job boards" Instagram lists are a marketing genre, not
 * research. ~40% of those lists' recommendations are dead.
 *
 * Quarterly bump cadence: same as portal-map.ts. A dead source coming back
 * online (rare) gets removed from this list and added to the portal map.
 */

import type { DeadSource, AffiliateSpamSource } from './types';

export const DEAD_SOURCES: DeadSource[] = [
  {
    name: 'Stack Overflow Jobs',
    deadSince: '2022-03',
    reason: 'Service shut down March 2022; the URL still resolves but no listings.',
  },
  {
    name: 'Glassdoor Jobs',
    deadSince: '2024-01',
    reason: 'Search index has been broken since the Fishbowl merger; very stale results.',
  },
  {
    name: 'GitHub Jobs',
    deadSince: '2021-05',
    reason: 'Sunset by GitHub in 2021. Existing pages 410 Gone.',
  },
  {
    name: 'Mashable Jobs',
    deadSince: '2022-08',
    reason: 'Discontinued; URL redirects to homepage.',
  },
  {
    name: 'Authentic Jobs',
    deadSince: '2023-09',
    reason: 'No new postings in over 18 months; appears abandoned.',
  },
  {
    name: 'CrunchBoard',
    deadSince: '2021-12',
    reason: 'TechCrunch shut down its job board.',
  },
  {
    name: 'GlassdoorTrends',
    deadSince: '2024-01',
    reason: 'Same as Glassdoor parent; index broken.',
  },
];

export const AFFILIATE_SPAM_SOURCES: AffiliateSpamSource[] = [
  {
    name: 'Jobcase',
    reason: 'Pure rescraper of Indeed and SimplyHired with no original sourcing.',
  },
  {
    name: 'Neuvoo',
    reason: 'Aggregator-of-aggregators; 90% duplicates of Indeed listings.',
  },
  {
    name: 'CareerBuilder',
    reason: 'Heavy affiliate ad load; very stale listings; auto-rejects most resumes.',
  },
  {
    name: 'ZipRecruiter Premium upsell pages',
    reason: 'Forces premium signup; the underlying listings are aggregator data.',
  },
  {
    name: 'Snagajob (for tech roles)',
    reason: 'Hourly/retail focused; tech listings are scraped duplicates.',
  },
  {
    name: 'Talentify',
    reason: 'Aggregator with affiliate revenue; no direct ATS connections.',
  },
  {
    name: 'Lensa',
    reason: 'Heavy email-marketing aggregator with no original listings.',
  },
];

/**
 * Combined "skip these" list rendered in the side panel banner. Stable
 * order so the UI does not flicker between sessions.
 */
export function getSkipList(): Array<{ name: string; reason: string; kind: 'dead' | 'spam' }> {
  return [
    ...DEAD_SOURCES.map((d) => ({ name: d.name, reason: d.reason, kind: 'dead' as const })),
    ...AFFILIATE_SPAM_SOURCES.map((a) => ({
      name: a.name,
      reason: a.reason,
      kind: 'spam' as const,
    })),
  ];
}
