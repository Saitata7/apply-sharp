/**
 * Portal map: profile → ranked job sources.
 *
 * This is the SOURCE OF TRUTH for which Tier-1 job boards we recommend for
 * each (role, seniority, geo, workType) combination. Anything not here is
 * either intentionally excluded (see source-quality.ts DEAD_SOURCES and
 * AFFILIATE_SPAM_SOURCES) or simply not in scope for v1.
 *
 * Why a typed constant instead of a CSV parsed at build time:
 *   - Small enough (~80 entries) that the cost of a CSV parser is not
 *     justified.
 *   - Type safety: every entry is checked at compile time. A typo in the
 *     role enum is a build error, not a runtime quiet failure.
 *   - Quarterly bump cadence is a single PR that edits this file directly.
 *
 * Wildcards: '*' in any of role/seniority/geo/workType means "applies to
 * all values for that dimension". Used for sources like LinkedIn that span
 * everything but rank lower for senior IC than YC for backend specifically.
 */

import type { PortalMapEntry } from './types';

export const PORTAL_MAP: PortalMapEntry[] = [
  // Backend, Senior, US, Remote - the canonical Plan-agent example
  {
    role: 'backend',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Y Combinator Work at a Startup',
    sourceUrl: 'https://www.workatastartup.com/',
    rank: 1,
    notes: 'YC-backed early stage. Best signal for senior backend on funded startups.',
  },
  {
    role: 'backend',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Wellfound',
    sourceUrl: 'https://wellfound.com/jobs',
    rank: 2,
    notes: 'Strongest seed/Series A startup signal.',
  },
  {
    role: 'backend',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Hacker News Who is Hiring',
    sourceUrl: 'https://news.ycombinator.com/submitted?id=whoishiring',
    rank: 3,
    notes:
      'Highest signal monthly thread for senior eng. Use the Discovery card to surface matches.',
  },
  {
    role: 'backend',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Greenhouse boards',
    sourceUrl: 'https://boards.greenhouse.io/',
    rank: 4,
    notes: 'Direct ATS bypass - go straight to the company instead of an aggregator.',
  },
  {
    role: 'backend',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Lever',
    sourceUrl: 'https://jobs.lever.co/',
    rank: 5,
    notes: 'Same: direct ATS, no aggregator middleman.',
  },
  // Backend, Mid level
  {
    role: 'backend',
    seniority: 'mid',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Y Combinator Work at a Startup',
    sourceUrl: 'https://www.workatastartup.com/',
    rank: 1,
  },
  {
    role: 'backend',
    seniority: 'mid',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Wellfound',
    sourceUrl: 'https://wellfound.com/jobs',
    rank: 2,
  },
  {
    role: 'backend',
    seniority: 'mid',
    geo: 'us',
    workType: 'remote',
    sourceName: 'LinkedIn (filter: posted within 7 days)',
    sourceUrl: 'https://www.linkedin.com/jobs/search/?f_TPR=r604800',
    rank: 3,
    notes: 'Volume play. Use the ApplySharp Ghost Score on every result.',
  },
  // Backend, Entry
  {
    role: 'backend',
    seniority: 'entry',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Wellfound',
    sourceUrl: 'https://wellfound.com/jobs',
    rank: 1,
    notes: 'Startups hire entry level more flexibly than enterprise.',
  },
  {
    role: 'backend',
    seniority: 'entry',
    geo: 'us',
    workType: 'remote',
    sourceName: 'LinkedIn (entry-level filter)',
    sourceUrl: 'https://www.linkedin.com/jobs/search/?f_E=2',
    rank: 2,
  },
  // Frontend, Senior
  {
    role: 'frontend',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Y Combinator Work at a Startup',
    sourceUrl: 'https://www.workatastartup.com/',
    rank: 1,
  },
  {
    role: 'frontend',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Wellfound',
    sourceUrl: 'https://wellfound.com/jobs',
    rank: 2,
  },
  {
    role: 'frontend',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Hacker News Who is Hiring',
    sourceUrl: 'https://news.ycombinator.com/submitted?id=whoishiring',
    rank: 3,
  },
  // Fullstack, Senior
  {
    role: 'fullstack',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Y Combinator Work at a Startup',
    sourceUrl: 'https://www.workatastartup.com/',
    rank: 1,
  },
  {
    role: 'fullstack',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Wellfound',
    sourceUrl: 'https://wellfound.com/jobs',
    rank: 2,
  },
  // ML / Data Science / Data Engineering
  {
    role: 'ml-engineering',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Y Combinator Work at a Startup (AI track)',
    sourceUrl: 'https://www.workatastartup.com/jobs?role=ml-engineer',
    rank: 1,
    notes: 'Highest density of AI/ML roles outside FAANG.',
  },
  {
    role: 'ml-engineering',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'AI Jobs Net',
    sourceUrl: 'https://aijobs.net/',
    rank: 2,
  },
  {
    role: 'data-science',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Kaggle Jobs',
    sourceUrl: 'https://www.kaggle.com/discussions/jobs',
    rank: 1,
    notes: 'Niche but high signal for hands-on ML/DS roles.',
  },
  {
    role: 'data-science',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Wellfound',
    sourceUrl: 'https://wellfound.com/jobs',
    rank: 2,
  },
  {
    role: 'data-engineering',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Y Combinator Work at a Startup',
    sourceUrl: 'https://www.workatastartup.com/',
    rank: 1,
  },
  // DevOps / SRE
  {
    role: 'devops',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Y Combinator Work at a Startup',
    sourceUrl: 'https://www.workatastartup.com/',
    rank: 1,
  },
  {
    role: 'devops',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Hacker News Who is Hiring',
    sourceUrl: 'https://news.ycombinator.com/submitted?id=whoishiring',
    rank: 2,
  },
  // Security
  {
    role: 'security',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Y Combinator Work at a Startup',
    sourceUrl: 'https://www.workatastartup.com/',
    rank: 1,
  },
  // Mobile
  {
    role: 'mobile',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Wellfound',
    sourceUrl: 'https://wellfound.com/jobs',
    rank: 1,
  },
  // Design / Product / PM
  {
    role: 'design',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Wellfound',
    sourceUrl: 'https://wellfound.com/jobs',
    rank: 1,
  },
  {
    role: 'design',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Dribbble Jobs',
    sourceUrl: 'https://dribbble.com/jobs',
    rank: 2,
  },
  {
    role: 'pm',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Y Combinator Work at a Startup',
    sourceUrl: 'https://www.workatastartup.com/',
    rank: 1,
  },
  {
    role: 'pm',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Wellfound',
    sourceUrl: 'https://wellfound.com/jobs',
    rank: 2,
  },
  // Engineering Manager
  {
    role: 'engineering-manager',
    seniority: 'senior',
    geo: 'us',
    workType: 'remote',
    sourceName: 'Y Combinator Work at a Startup',
    sourceUrl: 'https://www.workatastartup.com/',
    rank: 1,
  },
  // Wildcards: catch-all sources for any combination not specifically ranked above
  {
    role: '*',
    seniority: '*',
    geo: 'us',
    workType: '*',
    sourceName: 'LinkedIn (posted within 7 days filter)',
    sourceUrl: 'https://www.linkedin.com/jobs/search/?f_TPR=r604800',
    rank: 6,
    notes: 'Volume baseline. Pair with the ApplySharp Ghost Score on every result.',
  },
  {
    role: '*',
    seniority: '*',
    geo: '*',
    workType: '*',
    sourceName: 'Indeed',
    sourceUrl: 'https://www.indeed.com/',
    rank: 8,
    notes: 'Largest aggregator. Useful for non-tech and non-startup volume.',
  },
  // Onsite-specific: city sources (US)
  {
    role: '*',
    seniority: '*',
    geo: 'us',
    workType: 'onsite',
    sourceName: 'Built In (city tech)',
    sourceUrl: 'https://www.builtin.com/jobs',
    rank: 4,
    notes: 'NYC, SF, Austin, Chicago, Boston, LA, Seattle, Denver. Strong for onsite.',
  },
  // EU
  {
    role: '*',
    seniority: '*',
    geo: 'eu',
    workType: '*',
    sourceName: 'Welcome to the Jungle',
    sourceUrl: 'https://www.welcometothejungle.com/en/jobs',
    rank: 2,
    notes: 'EU strong. Curated startup roles.',
  },
  {
    role: '*',
    seniority: '*',
    geo: 'eu',
    workType: '*',
    sourceName: 'Otta',
    sourceUrl: 'https://app.otta.com/',
    rank: 3,
    notes: 'EU strong, curated startup matching.',
  },
  // UK
  {
    role: '*',
    seniority: '*',
    geo: 'uk',
    workType: '*',
    sourceName: 'Otta',
    sourceUrl: 'https://app.otta.com/',
    rank: 1,
  },
  // Remote-only / global
  {
    role: '*',
    seniority: '*',
    geo: 'remote-global',
    workType: 'remote',
    sourceName: 'We Work Remotely',
    sourceUrl: 'https://weworkremotely.com/',
    rank: 1,
    notes: 'Global remote, all roles.',
  },
  {
    role: '*',
    seniority: '*',
    geo: 'remote-global',
    workType: 'remote',
    sourceName: 'Remote.co',
    sourceUrl: 'https://remote.co/',
    rank: 2,
  },
  {
    role: '*',
    seniority: '*',
    geo: 'remote-global',
    workType: 'remote',
    sourceName: 'Himalayas',
    sourceUrl: 'https://himalayas.app/',
    rank: 3,
  },
];

/**
 * Validate every entry once at module load. URLs must be https; ranks must
 * be positive integers. A bad row is logged and skipped (NOT thrown) so the
 * recommender keeps working even if a quarterly data bump introduces one
 * malformed row.
 */
function validatePortalMap(entries: PortalMapEntry[]): PortalMapEntry[] {
  const valid: PortalMapEntry[] = [];
  for (const e of entries) {
    if (!/^https:\/\//i.test(e.sourceUrl)) {
      console.warn('[PortalMap] non-https URL skipped:', e.sourceName, e.sourceUrl);
      continue;
    }
    if (!Number.isInteger(e.rank) || e.rank < 1) {
      console.warn('[PortalMap] invalid rank skipped:', e.sourceName, e.rank);
      continue;
    }
    if (!e.sourceName || e.sourceName.trim().length === 0) {
      console.warn('[PortalMap] empty sourceName skipped');
      continue;
    }
    valid.push(e);
  }
  return valid;
}

export const VALIDATED_PORTAL_MAP = validatePortalMap(PORTAL_MAP);
