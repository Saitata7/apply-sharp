import { describe, it, expect } from 'vitest';
import { extractPhones, regionFromContext } from '../phone-regex';

describe('extractPhones', () => {
  describe('US phone numbers', () => {
    it('extracts +1-415-555-0100', () => {
      const r = extractPhones('Call +1-415-555-0100');
      expect(r).toHaveLength(1);
      expect(r[0].e164).toBe('+14155550100');
      expect(r[0].countryCode).toBe('US');
    });

    it('extracts (415) 555-0100', () => {
      const r = extractPhones('(415) 555-0100');
      expect(r).toHaveLength(1);
      expect(r[0].e164).toBe('+14155550100');
    });

    it('extracts 415.555.0100', () => {
      const r = extractPhones('Phone: 415.555.0100');
      expect(r).toHaveLength(1);
      expect(r[0].e164).toBe('+14155550100');
    });

    it('extracts 415 555 0100 (spaces)', () => {
      const r = extractPhones('415 555 0100');
      expect(r).toHaveLength(1);
      expect(r[0].e164).toBe('+14155550100');
    });
  });

  describe('international phone numbers', () => {
    it('extracts UK +44 20 7946 0958', () => {
      const r = extractPhones('+44 20 7946 0958');
      expect(r.length).toBeGreaterThanOrEqual(1);
      expect(r[0].e164).toMatch(/^\+44/);
      expect(r[0].countryCode).toBe('GB');
    });

    it('extracts French +33 1 42 86 82 00', () => {
      const r = extractPhones('+33 1 42 86 82 00');
      expect(r.length).toBeGreaterThanOrEqual(1);
      expect(r[0].e164).toMatch(/^\+33/);
    });

    it('extracts German +49 30 12345678', () => {
      const r = extractPhones('+49 30 12345678');
      expect(r.length).toBeGreaterThanOrEqual(1);
      expect(r[0].e164).toMatch(/^\+49/);
    });
  });

  describe('confidence downgrade', () => {
    it('downgrades 1-800 toll-free to low confidence', () => {
      const r = extractPhones('1-800-555-0199');
      if (r.length > 0) {
        expect(r[0].confidence).toBe('low');
      }
    });

    it('marks regular numbers as high confidence', () => {
      const r = extractPhones('+1-415-555-0100');
      expect(r[0].confidence).toBe('high');
    });
  });

  describe('false-positive defense', () => {
    it('rejects ISO date 2026-04-15T12:00:00', () => {
      const r = extractPhones('2026-04-15T12:00:00');
      expect(r).toHaveLength(0);
    });

    it('rejects price $1,499.00', () => {
      const r = extractPhones('Price: $1,499.00');
      expect(r).toHaveLength(0);
    });

    it('rejects order id 2024-0415-8829', () => {
      const r = extractPhones('Order: 2024-0415-8829');
      expect(r).toHaveLength(0);
    });

    it('rejects ZIP code 94103', () => {
      const r = extractPhones('94103');
      expect(r).toHaveLength(0);
    });

    it('rejects ZIP+4 94103-1234', () => {
      const r = extractPhones('94103-1234');
      expect(r).toHaveLength(0);
    });

    it('rejects random short numbers', () => {
      const r = extractPhones('item 1234');
      expect(r).toHaveLength(0);
    });
  });

  describe('input validation', () => {
    it('handles empty input', () => {
      expect(extractPhones('')).toEqual([]);
    });

    it('handles null input safely', () => {
      expect(extractPhones(null as unknown as string)).toEqual([]);
    });

    it('handles non-string input safely', () => {
      expect(extractPhones(42 as unknown as string)).toEqual([]);
    });

    it('handles oversized input without hanging', () => {
      const big = 'a'.repeat(50_000);
      expect(() => extractPhones(big)).not.toThrow();
    });
  });

  describe('dedup', () => {
    it('dedupes the same number in multiple formats', () => {
      const text = 'Call (415) 555-0100 or 415-555-0100 or +14155550100';
      const r = extractPhones(text);
      expect(r).toHaveLength(1);
    });
  });

  describe('match index', () => {
    it('preserves index for anchor walking', () => {
      const text = 'First +1-415-555-0100 second +1-628-555-0123';
      const r = extractPhones(text);
      expect(r.length).toBeGreaterThanOrEqual(1);
      if (r.length === 2) {
        expect(r[0].index).toBeLessThan(r[1].index);
      }
    });
  });
});

describe('regionFromContext', () => {
  it('parses lang attribute en-GB', () => {
    expect(regionFromContext('en-GB')).toBe('GB');
  });

  it('parses lang attribute fr-FR', () => {
    expect(regionFromContext('fr-FR')).toBe('FR');
  });

  it('falls back to TLD .co.uk', () => {
    expect(regionFromContext(undefined, 'careers.example.co.uk')).toBe('GB');
  });

  it('falls back to TLD .de', () => {
    expect(regionFromContext(undefined, 'jobs.example.de')).toBe('DE');
  });

  it('falls back to TLD .com.au', () => {
    expect(regionFromContext(undefined, 'jobs.example.com.au')).toBe('AU');
  });

  it('defaults to US when no hints', () => {
    expect(regionFromContext()).toBe('US');
    expect(regionFromContext('en')).toBe('US'); // bare lang has no region
    expect(regionFromContext(undefined, 'example.com')).toBe('US');
  });
});
