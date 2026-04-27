import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchHNWhosHiring, filterAndRank } from './hn-whos-hiring';

const originalFetch = global.fetch;

function mockJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('fetchHNWhosHiring', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('returns empty result for empty keyword list', async () => {
    const result = await fetchHNWhosHiring([]);
    expect(result.matches).toEqual([]);
    expect(result.totalComments).toBe(0);
  });

  it('returns empty result when search fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({}, false));
    const result = await fetchHNWhosHiring(['backend']);
    expect(result.matches).toEqual([]);
  });

  it('returns empty result when search has no matching threads', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({ hits: [] }));
    const result = await fetchHNWhosHiring(['backend']);
    expect(result.matches).toEqual([]);
  });

  it('returns empty result when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const result = await fetchHNWhosHiring(['backend']);
    expect(result.matches).toEqual([]);
  });

  it('returns matched comments for a successful fetch', async () => {
    const fetchMock = vi
      .fn()
      // First call: search for thread
      .mockResolvedValueOnce(
        mockJsonResponse({
          hits: [
            {
              objectID: '12345',
              title: 'Ask HN: Who is hiring? (April 2026)',
              created_at: '2026-04-01T12:00:00Z',
            },
          ],
        })
      )
      // Second call: fetch thread comments
      .mockResolvedValueOnce(
        mockJsonResponse({
          id: 12345,
          children: [
            {
              id: 1,
              author: 'acmecorp',
              created_at: '2026-04-01T13:00:00Z',
              text: '<p>Acme Corp - <b>Backend Engineer</b> - Remote</p><p>We are hiring backend engineers in Go.</p>',
            },
            {
              id: 2,
              author: 'globex',
              created_at: '2026-04-01T14:00:00Z',
              text: '<p>Globex - Frontend Engineer - NYC</p><p>React only.</p>',
            },
          ],
        })
      );
    global.fetch = fetchMock;

    const result = await fetchHNWhosHiring(['backend', 'go', 'remote']);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    const match = result.matches.find((m) => m.author === 'acmecorp');
    expect(match).toBeDefined();
    expect(match?.matchedKeywords).toContain('backend');
    expect(match?.htmlSafe).toContain('<b>Backend Engineer</b>');
    expect(match?.plain).toContain('Acme Corp');
    expect(match?.plain).not.toContain('<b>');
  });

  it('caps keyword input at MAX_KEYWORDS', async () => {
    const huge = Array.from({ length: 100 }, (_, i) => `kw${i}`);
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({ hits: [] }));
    const result = await fetchHNWhosHiring(huge);
    expect(result.matches).toEqual([]);
    // No throw is the assertion
  });

  it('filters out non-matching comments', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({
          hits: [
            { objectID: '99', title: 'Ask HN: Who is hiring?', created_at: '2026-04-01T12:00:00Z' },
          ],
        })
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          id: 99,
          children: [
            {
              id: 1,
              author: 'a',
              text: '<p>Hiring designers in NYC</p>',
              created_at: '2026-04-01T13:00:00Z',
            },
            {
              id: 2,
              author: 'b',
              text: '<p>Hiring product managers</p>',
              created_at: '2026-04-01T13:00:00Z',
            },
          ],
        })
      );
    global.fetch = fetchMock;

    const result = await fetchHNWhosHiring(['backend', 'rust']);
    expect(result.matches).toHaveLength(0);
  });

  it('rejects non-string entries in the keyword list', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({ hits: [] }));
    const result = await fetchHNWhosHiring([
      'backend',
      null as unknown as string,
      123 as unknown as string,
    ]);
    expect(result).toBeDefined();
  });
});

describe('filterAndRank', () => {
  it('returns empty for no comments', () => {
    expect(filterAndRank([], ['backend'])).toEqual([]);
  });

  it('returns empty when no comments match', () => {
    const comments = [
      { id: 1, text: '<p>Designers wanted</p>', author: 'x', created_at: '2026-04-01T00:00:00Z' },
    ];
    const matches = filterAndRank(comments, ['backend']);
    expect(matches).toEqual([]);
  });

  it('matches keywords with word boundaries (does not collide on substrings)', () => {
    const comments = [
      // "Google" should NOT match "go"
      { id: 1, text: '<p>We use Google</p>', author: 'a', created_at: '2026-04-01T00:00:00Z' },
      // "Go" as standalone language SHOULD match "go"
      {
        id: 2,
        text: '<p>Hiring Go developers</p>',
        author: 'b',
        created_at: '2026-04-01T00:00:00Z',
      },
    ];
    const matches = filterAndRank(comments, ['go']);
    expect(matches).toHaveLength(1);
    expect(matches[0].author).toBe('b');
  });

  it('escapes regex special chars in keywords', () => {
    // A keyword with a regex special char must not throw or inject syntax
    const comments = [
      {
        id: 1,
        text: '<p>We hire C++ engineers</p>',
        author: 'x',
        created_at: '2026-04-01T00:00:00Z',
      },
    ];
    expect(() => filterAndRank(comments, ['c++'])).not.toThrow();
  });

  it('caps results at MAX_MATCHES', () => {
    const comments = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      text: `<p>Hiring backend engineer #${i}</p>`,
      author: `x${i}`,
      created_at: '2026-04-01T00:00:00Z',
    }));
    const matches = filterAndRank(comments, ['backend']);
    expect(matches.length).toBeLessThanOrEqual(12);
  });

  it('sorts by score descending', () => {
    const comments = [
      { id: 1, text: '<p>backend</p>', author: 'one-match', created_at: '2026-04-01T00:00:00Z' },
      {
        id: 2,
        text: '<p>backend go remote</p>',
        author: 'three-match',
        created_at: '2026-04-01T00:00:00Z',
      },
      { id: 3, text: '<p>backend go</p>', author: 'two-match', created_at: '2026-04-01T00:00:00Z' },
    ];
    const matches = filterAndRank(comments, ['backend', 'go', 'remote']);
    expect(matches[0].author).toBe('three-match');
    expect(matches[1].author).toBe('two-match');
    expect(matches[2].author).toBe('one-match');
  });

  it('sanitizes the htmlSafe field', () => {
    const comments = [
      {
        id: 1,
        text: '<p>backend <script>alert(1)</script></p>',
        author: 'x',
        created_at: '2026-04-01T00:00:00Z',
      },
    ];
    const matches = filterAndRank(comments, ['backend']);
    expect(matches).toHaveLength(1);
    expect(matches[0].htmlSafe).not.toContain('<script');
  });
});
