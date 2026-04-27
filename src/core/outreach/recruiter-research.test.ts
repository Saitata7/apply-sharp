/**
 * Tests for the recruiter research aggregator.
 *
 * Network calls (Google News, GitHub, personal site, defuddle company fetch)
 * are mocked. We focus on:
 *   1. The Google News RSS parser (regex-based, easy to break on CDATA)
 *   2. The promptBlock stitcher (verifies the format is what the outreach
 *      prompt expects)
 *   3. The graceful-degradation behavior (every source independently fails)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { researchRecruiter } from './recruiter-research';

const MOCK_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss>
  <channel>
    <item>
      <title><![CDATA[Acme raises Series B at $200m valuation]]></title>
      <link>https://news.example.com/acme-series-b</link>
      <pubDate>Mon, 01 Apr 2026 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Acme launches new pricing tier</title>
      <link>https://blog.example.com/acme-pricing</link>
      <pubDate>Tue, 02 Apr 2026 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const MOCK_GITHUB_USER = {
  login: 'sai',
  name: 'Sai Tata',
  bio: 'Backend engineer',
  public_repos: 12,
  followers: 50,
};

const MOCK_GITHUB_REPOS = [
  {
    name: 'cool-cache',
    description: 'Fast in-memory cache',
    stargazers_count: 120,
    language: 'Rust',
    fork: false,
  },
  {
    name: 'side-quest',
    description: 'Toy project',
    stargazers_count: 5,
    language: 'Python',
    fork: false,
  },
  {
    name: 'forked-thing',
    description: 'A fork',
    stargazers_count: 999,
    language: 'Go',
    fork: true,
  },
];

beforeEach(() => {
  // Provide a fake chrome.storage.local so company-research's cache layer
  // does not throw.
  (globalThis as { chrome?: unknown }).chrome = {
    storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
  };
});

describe('researchRecruiter', () => {
  it('parses Google News RSS items including CDATA titles', async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes('news.google.com')) {
        return new Response(MOCK_RSS, { status: 200 });
      }
      // company-research will try to fetch the company website; return empty
      // so it falls through.
      return new Response('', { status: 500 });
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await researchRecruiter({
      companyName: 'Acme',
      jobUrl: 'https://acme.com/jobs/1',
    });
    expect(result.recentNews.length).toBeGreaterThanOrEqual(2);
    expect(result.recentNews[0].title).toContain('Acme raises Series B');
    expect(result.recentNews[0].url).toContain('news.example.com');
    expect(result.recentNews[1].title).toContain('Acme launches');
  });

  it('returns an empty news array when the RSS fetch fails', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const result = await researchRecruiter({ companyName: 'Acme' });
    expect(result.recentNews).toEqual([]);
    // Company research falls through to tier 1 (instructional fallback)
    expect(result.company.tier).toBe(1);
  });

  it('aggregates GitHub profile and excludes forks from top repos', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async (url: string) => {
      callCount++;
      if (url.includes('news.google.com')) {
        return new Response('', { status: 500 });
      }
      if (url.includes('api.github.com/users/sai/repos')) {
        return new Response(JSON.stringify(MOCK_GITHUB_REPOS), { status: 200 });
      }
      if (url.includes('api.github.com/users/sai')) {
        return new Response(JSON.stringify(MOCK_GITHUB_USER), { status: 200 });
      }
      return new Response('', { status: 500 });
    }) as unknown as typeof fetch;

    const result = await researchRecruiter({
      companyName: 'Acme',
      githubUsername: 'sai',
    });
    expect(callCount).toBeGreaterThan(0);
    expect(result.github).not.toBe(null);
    expect(result.github?.login).toBe('sai');
    expect(result.github?.topRepos).toHaveLength(2); // fork excluded
    expect(result.github?.topRepos[0].name).toBe('cool-cache'); // sorted by stars
  });

  it('builds a prompt block that the outreach prompt can paste in', async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes('news.google.com')) return new Response(MOCK_RSS, { status: 200 });
      return new Response('', { status: 500 });
    }) as unknown as typeof fetch;

    const result = await researchRecruiter({ companyName: 'Acme' });
    expect(result.promptBlock).toContain('Company: Acme');
    expect(result.promptBlock).toContain('Recent news headlines');
    expect(result.promptBlock).toContain('Acme raises Series B');
  });
});
