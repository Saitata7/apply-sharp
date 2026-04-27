import { describe, expect, it } from 'vitest';
import { extractNewsSignals, normalizeCompanyName, type RawNewsItem } from './news-signal';

describe('normalizeCompanyName', () => {
  it('strips inc / llc / corp suffixes case-insensitively', () => {
    expect(normalizeCompanyName('Baseten, Inc.')).toBe('baseten');
    expect(normalizeCompanyName('CVector LLC')).toBe('cvector');
    expect(normalizeCompanyName('Stripe, Inc')).toBe('stripe');
    expect(normalizeCompanyName('OpenAI Corp')).toBe('openai');
  });

  it('lowercases and hyphenates multi-word names', () => {
    expect(normalizeCompanyName('Anthropic AI')).toBe('anthropic-ai');
    expect(normalizeCompanyName("D'Souza Labs")).toBe('dsouza-labs');
  });

  it('handles unicode punctuation in headlines', () => {
    expect(normalizeCompanyName('Anthropic’s')).toBe('anthropics');
  });
});

describe('extractNewsSignals', () => {
  it('extracts company + funding when title matches Series pattern', () => {
    const items: RawNewsItem[] = [
      {
        title: 'Baseten raises $40M Series B for model serving',
        url: 'https://example.com/1',
        publishedAt: '2026-04-25T10:00:00Z',
        source: 'HN',
      },
    ];
    const signals = extractNewsSignals(items);
    expect(signals).toHaveLength(1);
    expect(signals[0].companyKey).toBe('baseten');
    expect(signals[0].trigger).toBe('funding');
    expect(signals[0].triggerLabel).toMatch(/40M/);
  });

  it('extracts launch trigger from product announcements', () => {
    const items: RawNewsItem[] = [
      {
        title: 'CVector launches new vector database for AI agents',
        publishedAt: '2026-04-20T00:00:00Z',
      },
    ];
    const signals = extractNewsSignals(items);
    expect(signals).toHaveLength(1);
    expect(signals[0].trigger).toBe('launch');
  });

  it('keeps the freshest story per company', () => {
    const items: RawNewsItem[] = [
      {
        title: 'Baseten raises $25M Series A',
        publishedAt: '2026-01-01T00:00:00Z',
      },
      {
        title: 'Baseten raises $40M Series B for inference',
        publishedAt: '2026-04-01T00:00:00Z',
      },
    ];
    const signals = extractNewsSignals(items);
    expect(signals).toHaveLength(1);
    expect(signals[0].triggerLabel).toMatch(/40M/);
  });

  it('strips outlet prefixes like "TechCrunch:" before matching', () => {
    const items: RawNewsItem[] = [
      {
        title: 'TechCrunch: Anthropic raises $4B from Amazon',
        publishedAt: '2026-04-01T00:00:00Z',
      },
    ];
    const signals = extractNewsSignals(items);
    expect(signals).toHaveLength(1);
    expect(signals[0].companyDisplay).toBe('Anthropic');
  });

  it('rejects sentence-leading words that look like a name', () => {
    const items: RawNewsItem[] = [
      { title: 'Today raises questions about AI funding pace' },
      { title: 'Show HN: my side project launches a calculator' },
      { title: 'New Series A trends report from Crunchbase' },
    ];
    expect(extractNewsSignals(items)).toHaveLength(0);
  });

  it('handles acquisitions', () => {
    const items: RawNewsItem[] = [
      {
        title: 'OpenAI acquires Rockset for vector search',
        publishedAt: '2026-04-01T00:00:00Z',
      },
    ];
    const signals = extractNewsSignals(items);
    expect(signals).toHaveLength(1);
    expect(signals[0].trigger).toBe('acquisition');
    expect(signals[0].companyDisplay).toBe('OpenAI');
  });

  it('handles expansion', () => {
    const items: RawNewsItem[] = [
      {
        title: 'Anthropic opens new office in London for European expansion',
        publishedAt: '2026-04-01T00:00:00Z',
      },
    ];
    const signals = extractNewsSignals(items);
    expect(signals).toHaveLength(1);
    expect(signals[0].trigger).toBe('expansion');
  });

  it('returns empty array on no matches', () => {
    const items: RawNewsItem[] = [
      { title: 'Why software engineering interviews are broken' },
      { title: 'Discussion: best practices for prompt engineering' },
    ];
    expect(extractNewsSignals(items)).toEqual([]);
  });

  it('sorts results newest-first', () => {
    const items: RawNewsItem[] = [
      {
        title: 'Older Co raises $10M seed',
        publishedAt: '2026-01-01T00:00:00Z',
      },
      {
        title: 'Newer Co raises $20M Series A',
        publishedAt: '2026-04-01T00:00:00Z',
      },
    ];
    const signals = extractNewsSignals(items);
    expect(signals[0].companyDisplay).toBe('Newer Co');
    expect(signals[1].companyDisplay).toBe('Older Co');
  });
});
