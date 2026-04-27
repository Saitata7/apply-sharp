/**
 * Company research for autofill v2.
 *
 * When the autofill prompt needs to write a "Why this company?" answer, it needs
 * concrete facts about the company, not the literal string "the company" that the
 * old per-field path at learning-handlers.ts:246 was passing in.
 *
 * Three tiers, in order:
 *
 *   1. The model already knows. The prompt explicitly tells the model to use what
 *      it knows about a named company and never invent facts. Covers ~70% of YC and
 *      well-known startups for free.
 *
 *   2. Fetch the company's own homepage + /about page, run through Defuddle for
 *      clean text extraction, cache forever in chrome.storage.local keyed by domain.
 *      ~5KB per company, real verifiable content, no paid API.
 *
 *   3. Fall back to Jina AI Reader (https://r.jina.ai/) which is a free no-key
 *      reader proxy. Used only when the direct fetch fails (CORS, JS-rendered).
 *
 * Do NOT integrate Crunchbase, Clearbit (dead since April 2025), or LinkedIn
 * company pages (ToS + the BrowserGate fingerprinting issue).
 */

import Defuddle from 'defuddle';

const CACHE_KEY_PREFIX = 'company-research:';
const MAX_TEXT_LENGTH = 4000;
const FETCH_TIMEOUT_MS = 8000;
/** Hard cap on every fetched body. A hostile homepage cannot stream a
 *  multi-GB response into the worker, regardless of Content-Length spoofing.
 *  256KB comfortably fits any real homepage / about page. */
const FETCH_BODY_BYTE_LIMIT = 256 * 1024;

export interface CompanyResearch {
  /** 1 = model knowledge only, 2 = direct fetch + defuddle, 3 = Jina fallback. */
  tier: 1 | 2 | 3;
  /** Cleaned text the prompt can paste in. May be empty for tier 1. */
  text: string;
  /** Resolved domain, if known. */
  domain: string | null;
  /** Cache age, ISO timestamp. */
  fetchedAt: string;
}

interface CachedEntry {
  research: CompanyResearch;
  cachedAt: number;
}

/**
 * Heuristic: derive a likely company domain from the company name and the JD URL.
 *
 * Tries (in order):
 *   - JD URL host if it is the company itself (e.g. careers.acme.com → acme.com)
 *   - Company name normalized to a .com guess (acme inc → acme.com)
 *
 * Returns null if confidence is too low. The caller will downgrade to tier 1.
 */
export function deriveDomain(companyName: string, jdUrl: string | undefined): string | null {
  if (jdUrl) {
    try {
      const u = new URL(jdUrl);
      // Strip common ATS / careers subdomains so we land on the apex.
      const host = u.hostname.replace(/^(jobs|careers|apply|boards|www)\./, '');
      // If the host already looks like a company domain (not an ATS), use it.
      const ATS_HOSTS = [
        'greenhouse.io',
        'lever.co',
        'workday.com',
        'myworkdayjobs.com',
        'ashbyhq.com',
        'smartrecruiters.com',
        'workable.com',
        'icims.com',
        'taleo.net',
        'bamboohr.com',
        'jazzhr.com',
        'jobvite.com',
        'breezy.hr',
        'rippling.com',
        'recruitee.com',
        'wellfound.com',
        'workatastartup.com',
        'himalayas.app',
        'linkedin.com',
        'indeed.com',
      ];
      if (!ATS_HOSTS.some((ats) => host === ats || host.endsWith(`.${ats}`))) {
        return host;
      }
    } catch {
      // Invalid URL, fall through to name-based guess
    }
  }

  if (!companyName) return null;
  // Strip common legal suffixes and punctuation.
  const slug = companyName
    .toLowerCase()
    .replace(/[,.]/g, '')
    .replace(/\b(inc|llc|ltd|corp|corporation|gmbh|co|sa|nv|ag|plc|limited)\b/gi, '')
    .trim()
    .replace(/\s+/g, '');
  if (!slug || slug.length < 2) return null;
  return `${slug}.com`;
}

async function readCache(domain: string): Promise<CompanyResearch | null> {
  try {
    const key = CACHE_KEY_PREFIX + domain;
    const stored = await chrome.storage.local.get(key);
    const entry = stored?.[key] as CachedEntry | undefined;
    return entry?.research ?? null;
  } catch {
    return null;
  }
}

async function writeCache(domain: string, research: CompanyResearch): Promise<void> {
  try {
    const key = CACHE_KEY_PREFIX + domain;
    await chrome.storage.local.set({ [key]: { research, cachedAt: Date.now() } });
  } catch (err) {
    console.warn('[CompanyResearch] Cache write failed:', err);
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read at most FETCH_BODY_BYTE_LIMIT bytes from a Response and return the
 * decoded text. Aborts the stream early if it grows past the cap, so a
 * hostile homepage cannot stall or OOM the worker. Falls back to
 * `response.text()` for runtimes without `response.body`.
 */
async function readBoundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const full = await response.text();
    return full.slice(0, FETCH_BODY_BYTE_LIMIT * 2);
  }
  const decoder = new TextDecoder('utf-8');
  let received = 0;
  let text = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (received >= FETCH_BODY_BYTE_LIMIT) {
      try {
        await reader.cancel();
      } catch {
        // best effort
      }
      break;
    }
  }
  text += decoder.decode();
  return text;
}

async function tryDirectFetch(domain: string): Promise<string | null> {
  try {
    const homepage = await fetchWithTimeout(`https://${domain}/`, FETCH_TIMEOUT_MS);
    if (!homepage.ok) return null;
    const html = await readBoundedText(homepage);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const result = new Defuddle(doc).parse();
    let text = (result?.content ?? '').trim();
    if (!text || text.length < 200) return null;

    // Try to also pull /about for richer copy.
    try {
      const about = await fetchWithTimeout(`https://${domain}/about`, FETCH_TIMEOUT_MS);
      if (about.ok) {
        const aboutHtml = await readBoundedText(about);
        const aboutDoc = new DOMParser().parseFromString(aboutHtml, 'text/html');
        const aboutResult = new Defuddle(aboutDoc).parse();
        const aboutText = (aboutResult?.content ?? '').trim();
        if (aboutText && aboutText.length > 200) {
          text = `${text}\n\n${aboutText}`;
        }
      }
    } catch {
      // /about is best-effort
    }

    return text.slice(0, MAX_TEXT_LENGTH);
  } catch {
    return null;
  }
}

async function tryJinaReader(domain: string): Promise<string | null> {
  try {
    const r = await fetchWithTimeout(`https://r.jina.ai/https://${domain}/`, FETCH_TIMEOUT_MS);
    if (!r.ok) return null;
    const text = (await readBoundedText(r)).trim();
    if (!text || text.length < 200) return null;
    return text.slice(0, MAX_TEXT_LENGTH);
  } catch {
    return null;
  }
}

/**
 * Public entry point. Returns research for a company name + optional JD url.
 *
 * The function is intentionally never throwing: every failure mode degrades to a
 * lower tier, and the worst case (no domain at all) returns tier 1 with an
 * instructional string the prompt can use directly.
 */
export async function researchCompany(
  companyName: string,
  jdUrl?: string
): Promise<CompanyResearch> {
  const fetchedAt = new Date().toISOString();
  const domain = deriveDomain(companyName, jdUrl);

  if (!domain) {
    return {
      tier: 1,
      text: `No company domain available. Use only what you already know about "${companyName}". Do not invent specifics.`,
      domain: null,
      fetchedAt,
    };
  }

  const cached = await readCache(domain);
  if (cached) return cached;

  const direct = await tryDirectFetch(domain);
  if (direct) {
    const research: CompanyResearch = { tier: 2, text: direct, domain, fetchedAt };
    await writeCache(domain, research);
    return research;
  }

  const jina = await tryJinaReader(domain);
  if (jina) {
    const research: CompanyResearch = { tier: 3, text: jina, domain, fetchedAt };
    await writeCache(domain, research);
    return research;
  }

  // Last resort: tier 1 with a strict instruction. Do NOT cache this so the next
  // call gets a fresh chance to fetch.
  return {
    tier: 1,
    text: `Could not fetch ${domain}. Use what you know about "${companyName}" and the job description. Do not invent specifics.`,
    domain,
    fetchedAt,
  };
}
