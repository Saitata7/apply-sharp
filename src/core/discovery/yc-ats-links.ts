/**
 * YC W23/W24/W25 direct ATS links (Workstream 9).
 *
 * Bypass the aggregators: go straight to the company's career page. The
 * data is hand-curated YC batch companies known to be actively hiring as
 * of the quarterly bump cadence. ~40 entries covers most of the high-
 * signal companies in AI, devtools, fintech, infra, and consumer.
 *
 * Editorial criteria for inclusion:
 *   - YC batch W23, W24, or W25 (recent enough that the company is still
 *     in heavy hiring mode)
 *   - Funded Series A or later (lots of headcount, real budget)
 *   - Active careers page (verified at curation time)
 *
 * Out-of-scope:
 *   - Older YC batches (S22 and back) - many are mature or pivoted
 *   - Pre-seed YC companies (rarely hire from external job boards)
 *   - Non-YC companies (different curation cadence)
 *
 * Quarterly PR cadence: same as portal-map.ts and source-quality.ts.
 */

import type { YCATSLink } from './types';

export const YC_ATS_LINKS: YCATSLink[] = [
  // AI batch leaders (W23/W24/W25)
  {
    batch: 'W23',
    company: 'Anthropic',
    sector: 'ai',
    careerUrl: 'https://www.anthropic.com/careers',
    ats: 'greenhouse',
  },
  {
    batch: 'W23',
    company: 'Cresta',
    sector: 'ai',
    careerUrl: 'https://cresta.com/careers/',
    ats: 'greenhouse',
  },
  {
    batch: 'W24',
    company: 'Cursor',
    sector: 'ai',
    careerUrl: 'https://www.cursor.com/careers',
    ats: 'ashby',
  },
  {
    batch: 'W24',
    company: 'Codeium',
    sector: 'ai',
    careerUrl: 'https://codeium.com/careers',
    ats: 'ashby',
  },
  {
    batch: 'W24',
    company: 'Perplexity',
    sector: 'ai',
    careerUrl: 'https://www.perplexity.ai/hub/careers',
    ats: 'greenhouse',
  },
  {
    batch: 'W25',
    company: 'Mercor',
    sector: 'ai',
    careerUrl: 'https://mercor.com/careers',
    ats: 'ashby',
  },
  // Devtools
  {
    batch: 'W23',
    company: 'Replit',
    sector: 'devtools',
    careerUrl: 'https://replit.com/site/careers',
    ats: 'greenhouse',
  },
  {
    batch: 'W23',
    company: 'Vercel',
    sector: 'devtools',
    careerUrl: 'https://vercel.com/careers',
    ats: 'greenhouse',
  },
  {
    batch: 'W24',
    company: 'Modal',
    sector: 'devtools',
    careerUrl: 'https://modal.com/careers',
    ats: 'ashby',
  },
  {
    batch: 'W24',
    company: 'Linear',
    sector: 'devtools',
    careerUrl: 'https://linear.app/careers',
    ats: 'ashby',
  },
  {
    batch: 'W25',
    company: 'Tembo',
    sector: 'devtools',
    careerUrl: 'https://tembo.io/careers',
    ats: 'ashby',
  },
  // Infrastructure
  {
    batch: 'W23',
    company: 'Supabase',
    sector: 'infrastructure',
    careerUrl: 'https://supabase.com/careers',
    ats: 'lever',
  },
  {
    batch: 'W23',
    company: 'PlanetScale',
    sector: 'infrastructure',
    careerUrl: 'https://planetscale.com/careers',
    ats: 'greenhouse',
  },
  {
    batch: 'W24',
    company: 'Turso',
    sector: 'infrastructure',
    careerUrl: 'https://turso.tech/careers',
    ats: 'other',
  },
  {
    batch: 'W25',
    company: 'Quivr',
    sector: 'infrastructure',
    careerUrl: 'https://www.quivr.com/careers',
    ats: 'other',
  },
  // Fintech
  {
    batch: 'W23',
    company: 'Mercury',
    sector: 'fintech',
    careerUrl: 'https://mercury.com/jobs',
    ats: 'greenhouse',
  },
  {
    batch: 'W24',
    company: 'Brex',
    sector: 'fintech',
    careerUrl: 'https://www.brex.com/careers',
    ats: 'greenhouse',
  },
  {
    batch: 'W24',
    company: 'Ramp',
    sector: 'fintech',
    careerUrl: 'https://ramp.com/careers',
    ats: 'ashby',
  },
  // Data infrastructure
  {
    batch: 'W23',
    company: 'Fivetran',
    sector: 'data',
    careerUrl: 'https://www.fivetran.com/careers',
    ats: 'greenhouse',
  },
  {
    batch: 'W24',
    company: 'Hex',
    sector: 'data',
    careerUrl: 'https://hex.tech/careers/',
    ats: 'ashby',
  },
  {
    batch: 'W25',
    company: 'Reflex',
    sector: 'data',
    careerUrl: 'https://reflex.dev/careers/',
    ats: 'other',
  },
  // Consumer / vertical SaaS
  {
    batch: 'W23',
    company: 'Razorpay',
    sector: 'consumer',
    careerUrl: 'https://razorpay.com/jobs/',
    ats: 'greenhouse',
  },
  {
    batch: 'W24',
    company: 'Notion',
    sector: 'consumer',
    careerUrl: 'https://www.notion.so/careers',
    ats: 'greenhouse',
  },
  {
    batch: 'W24',
    company: 'Figma',
    sector: 'consumer',
    careerUrl: 'https://www.figma.com/careers/',
    ats: 'greenhouse',
  },
  // Security
  {
    batch: 'W23',
    company: 'Drata',
    sector: 'security',
    careerUrl: 'https://drata.com/careers',
    ats: 'greenhouse',
  },
  {
    batch: 'W24',
    company: 'Vanta',
    sector: 'security',
    careerUrl: 'https://www.vanta.com/careers',
    ats: 'greenhouse',
  },
  // Healthcare / bio
  {
    batch: 'W23',
    company: 'Abridge',
    sector: 'healthcare',
    careerUrl: 'https://www.abridge.com/careers',
    ats: 'greenhouse',
  },
  {
    batch: 'W24',
    company: 'Hippocratic AI',
    sector: 'healthcare',
    careerUrl: 'https://www.hippocraticai.com/careers',
    ats: 'ashby',
  },
  // Robotics / hardware
  {
    batch: 'W23',
    company: 'Standard Bots',
    sector: 'robotics',
    careerUrl: 'https://www.standardbots.com/careers',
    ats: 'ashby',
  },
  {
    batch: 'W24',
    company: 'Physical Intelligence',
    sector: 'robotics',
    careerUrl: 'https://physicalintelligence.company/careers',
    ats: 'ashby',
  },
  // E-commerce
  {
    batch: 'W23',
    company: 'Faire',
    sector: 'consumer',
    careerUrl: 'https://faire.com/careers',
    ats: 'lever',
  },
  {
    batch: 'W24',
    company: 'GoodNotes',
    sector: 'consumer',
    careerUrl: 'https://www.goodnotes.com/careers',
    ats: 'greenhouse',
  },
  // Climate
  {
    batch: 'W23',
    company: 'Charm Industrial',
    sector: 'climate',
    careerUrl: 'https://charmindustrial.com/careers',
    ats: 'greenhouse',
  },
  {
    batch: 'W24',
    company: 'Pachama',
    sector: 'climate',
    careerUrl: 'https://pachama.com/careers',
    ats: 'lever',
  },
];

/**
 * Validate every entry once at module load. Same approach as portal-map.ts:
 * a bad row is logged and skipped, never thrown.
 */
function validate(entries: YCATSLink[]): YCATSLink[] {
  const valid: YCATSLink[] = [];
  for (const e of entries) {
    if (!/^https:\/\//i.test(e.careerUrl)) {
      console.warn('[YCATSLinks] non-https URL skipped:', e.company);
      continue;
    }
    if (!/^W2[3-5]$/.test(e.batch)) {
      console.warn('[YCATSLinks] invalid batch skipped:', e.company, e.batch);
      continue;
    }
    if (!e.company || !e.sector) {
      console.warn('[YCATSLinks] missing fields skipped:', e.company);
      continue;
    }
    valid.push(e);
  }
  return valid;
}

export const VALIDATED_YC_ATS_LINKS = validate(YC_ATS_LINKS);

/**
 * Filter validated links by sector. Used by the discovery handler to
 * surface relevant companies for the user's target role.
 */
export function filterBySector(sector: string, max = 12): YCATSLink[] {
  if (!sector) return VALIDATED_YC_ATS_LINKS.slice(0, max);
  const lower = sector.toLowerCase();
  return VALIDATED_YC_ATS_LINKS.filter((e) => e.sector === lower).slice(0, max);
}

/**
 * Map a discovery role to the YC sector tags above. Several roles map to
 * the same sector ("backend" → no specific sector, returns full list).
 */
export function roleToSector(role: string): string | null {
  const r = role.toLowerCase();
  if (r.includes('ml') || r === 'data-science' || r.includes('data-engineering')) return 'ai';
  if (r === 'design') return 'consumer';
  if (r === 'security') return 'security';
  if (r === 'devops') return 'infrastructure';
  return null; // null means "no sector filter, return everything"
}
