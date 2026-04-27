import { describe, it, expect } from 'vitest';
import { YC_ATS_LINKS, VALIDATED_YC_ATS_LINKS, filterBySector, roleToSector } from './yc-ats-links';

describe('yc-ats-links data integrity', () => {
  it('every entry uses https URLs', () => {
    for (const e of VALIDATED_YC_ATS_LINKS) {
      expect(e.careerUrl).toMatch(/^https:\/\//i);
    }
  });

  it('every entry has a valid W23-W25 batch', () => {
    for (const e of VALIDATED_YC_ATS_LINKS) {
      expect(e.batch).toMatch(/^W2[3-5]$/);
    }
  });

  it('every entry has a non-empty company and sector', () => {
    for (const e of VALIDATED_YC_ATS_LINKS) {
      expect(e.company.trim().length).toBeGreaterThan(0);
      expect(e.sector.trim().length).toBeGreaterThan(0);
    }
  });

  it('the validated set has at least 30 entries', () => {
    expect(VALIDATED_YC_ATS_LINKS.length).toBeGreaterThanOrEqual(30);
  });

  it('the unvalidated and validated sets are equal length when input is clean', () => {
    expect(VALIDATED_YC_ATS_LINKS.length).toBe(YC_ATS_LINKS.length);
  });
});

describe('filterBySector', () => {
  it('returns only AI sector when filtered', () => {
    const ai = filterBySector('ai');
    expect(ai.length).toBeGreaterThan(0);
    for (const e of ai) {
      expect(e.sector).toBe('ai');
    }
  });

  it('returns only devtools sector when filtered', () => {
    const dev = filterBySector('devtools');
    expect(dev.length).toBeGreaterThan(0);
    for (const e of dev) {
      expect(e.sector).toBe('devtools');
    }
  });

  it('returns the full set (capped) when sector is missing', () => {
    const all = filterBySector('');
    expect(all.length).toBeGreaterThan(0);
    expect(all.length).toBeLessThanOrEqual(12);
  });

  it('caps results at the max', () => {
    const all = filterBySector('', 5);
    expect(all.length).toBeLessThanOrEqual(5);
  });

  it('returns empty for an unknown sector', () => {
    expect(filterBySector('unknownsector')).toEqual([]);
  });
});

describe('roleToSector', () => {
  it('maps ml-engineering to ai', () => {
    expect(roleToSector('ml-engineering')).toBe('ai');
  });

  it('maps data-science to ai', () => {
    expect(roleToSector('data-science')).toBe('ai');
  });

  it('maps design to consumer', () => {
    expect(roleToSector('design')).toBe('consumer');
  });

  it('maps security to security', () => {
    expect(roleToSector('security')).toBe('security');
  });

  it('maps devops to infrastructure', () => {
    expect(roleToSector('devops')).toBe('infrastructure');
  });

  it('returns null for backend (no specific sector)', () => {
    expect(roleToSector('backend')).toBeNull();
  });

  it('returns null for an unknown role', () => {
    expect(roleToSector('unknown')).toBeNull();
  });
});
