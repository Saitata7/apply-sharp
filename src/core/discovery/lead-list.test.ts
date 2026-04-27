import { describe, expect, it } from 'vitest';
import { rankLeads, type SponsorIndex } from './lead-list';
import type { NewsSignal } from './news-signal';

const NOW = new Date('2026-04-25T00:00:00Z');

function sig(overrides: Partial<NewsSignal> = {}): NewsSignal {
  return {
    companyKey: 'baseten',
    companyDisplay: 'Baseten',
    trigger: 'funding',
    triggerLabel: 'raised $40M',
    publishedAt: '2026-04-20T00:00:00Z',
    sourceUrl: 'https://example.com/x',
    sourceName: 'HN',
    ...overrides,
  };
}

describe('rankLeads', () => {
  it('ranks sponsor-match companies above non-sponsors when triggers are equal', () => {
    const sponsors: SponsorIndex = {
      baseten: {
        displayName: 'Baseten Labs Inc.',
        filings: 50,
        latestFy: 'FY2025',
        topJobTitles: ['AI Engineer', 'ML Engineer'],
      },
    };
    const signals: NewsSignal[] = [
      sig({ companyKey: 'baseten', companyDisplay: 'Baseten' }),
      sig({ companyKey: 'unknown-co', companyDisplay: 'Unknown Co' }),
    ];
    const leads = rankLeads(signals, sponsors, { now: NOW, roleKeywords: ['ai engineer'] });
    expect(leads[0].companyKey).toBe('baseten');
    expect(leads[0].sponsorMatch).toBe(true);
    expect(leads[1].sponsorMatch).toBe(false);
  });

  it('boosts companies with high filing volume', () => {
    const sponsors: SponsorIndex = {
      'huge-sponsor': { displayName: 'HugeSponsor', filings: 500, latestFy: 'FY2025' },
      'small-sponsor': { displayName: 'SmallSponsor', filings: 5, latestFy: 'FY2025' },
    };
    const signals: NewsSignal[] = [
      sig({ companyKey: 'small-sponsor', companyDisplay: 'SmallSponsor' }),
      sig({ companyKey: 'huge-sponsor', companyDisplay: 'HugeSponsor' }),
    ];
    const leads = rankLeads(signals, sponsors, { now: NOW });
    expect(leads[0].companyDisplay).toBe('HugeSponsor');
    expect(leads[0].score).toBeGreaterThan(leads[1].score);
  });

  it('soft-penalizes sponsors when none of their top titles match keywords', () => {
    const sponsors: SponsorIndex = {
      'on-target': {
        displayName: 'OnTarget',
        filings: 100,
        latestFy: 'FY2025',
        topJobTitles: ['AI Engineer'],
      },
      'off-target': {
        displayName: 'OffTarget',
        filings: 100,
        latestFy: 'FY2025',
        topJobTitles: ['Accountant', 'Marketing Lead'],
      },
    };
    const signals: NewsSignal[] = [
      sig({ companyKey: 'on-target', companyDisplay: 'OnTarget' }),
      sig({ companyKey: 'off-target', companyDisplay: 'OffTarget' }),
    ];
    const leads = rankLeads(signals, sponsors, {
      now: NOW,
      roleKeywords: ['ai engineer', 'ml engineer'],
    });
    const on = leads.find((l) => l.companyKey === 'on-target')!;
    const off = leads.find((l) => l.companyKey === 'off-target')!;
    expect(on.score).toBeGreaterThan(off.score);
    expect(off.reason).toMatch(/adjacent roles/);
  });

  it('still surfaces leads when sponsor index is empty', () => {
    const signals: NewsSignal[] = [sig()];
    const leads = rankLeads(signals, {}, { now: NOW });
    expect(leads).toHaveLength(1);
    expect(leads[0].sponsorMatch).toBe(false);
    expect(leads[0].reason).toMatch(/no DOL sponsor record/);
  });

  it('decays recency: 70-day-old loses the recency bonus', () => {
    const fresh = sig({ companyKey: 'a', companyDisplay: 'A', publishedAt: NOW.toISOString() });
    const old = sig({
      companyKey: 'b',
      companyDisplay: 'B',
      publishedAt: '2026-02-10T00:00:00Z', // 74 days before NOW
    });
    const leads = rankLeads([fresh, old], {}, { now: NOW });
    const a = leads.find((l) => l.companyKey === 'a')!;
    const b = leads.find((l) => l.companyKey === 'b')!;
    expect(a.score).toBeGreaterThan(b.score);
  });

  it('respects topN cap', () => {
    const signals: NewsSignal[] = [];
    for (let i = 0; i < 15; i++) {
      signals.push(
        sig({
          companyKey: `co-${i}`,
          companyDisplay: `Co ${i}`,
          publishedAt: `2026-04-${10 + i}T00:00:00Z`,
        })
      );
    }
    expect(rankLeads(signals, {}, { now: NOW, topN: 5 })).toHaveLength(5);
    expect(rankLeads(signals, {}, { now: NOW })).toHaveLength(10);
  });

  it('builds a linkedin jobs deep-link with the role keywords', () => {
    const leads = rankLeads(
      [sig()],
      {},
      {
        now: NOW,
        roleKeywords: ['ai engineer', 'ml engineer'],
      }
    );
    expect(leads[0].linkedinJobsUrl).toMatch(/linkedin\.com\/jobs\/search/);
    expect(leads[0].linkedinJobsUrl).toContain(encodeURIComponent('ai engineer'));
    expect(leads[0].linkedinJobsUrl).toContain('Baseten');
  });

  it('weights funding higher than launch / acquisition / expansion', () => {
    const signals: NewsSignal[] = [
      sig({ companyKey: 'fund', companyDisplay: 'Fund', trigger: 'funding' }),
      sig({ companyKey: 'launch', companyDisplay: 'Launch', trigger: 'launch' }),
      sig({ companyKey: 'acq', companyDisplay: 'Acq', trigger: 'acquisition' }),
      sig({ companyKey: 'exp', companyDisplay: 'Exp', trigger: 'expansion' }),
    ];
    const leads = rankLeads(signals, {}, { now: NOW });
    expect(leads[0].trigger).toBe('funding');
  });
});
