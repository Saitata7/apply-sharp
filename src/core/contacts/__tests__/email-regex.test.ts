import { describe, it, expect } from 'vitest';
import { extractEmails, normalizeEmail, classifyEmail } from '../email-regex';

describe('extractEmails', () => {
  describe('happy path', () => {
    it('extracts a single email from plain text', () => {
      const r = extractEmails('Contact us at sarah@acme.co for details.');
      expect(r).toHaveLength(1);
      expect(r[0].email).toBe('sarah@acme.co');
      expect(r[0].kind).toBe('personal');
      expect(r[0].domain).toBe('acme.co');
      expect(r[0].localPart).toBe('sarah');
    });

    it('extracts multiple emails and dedupes by normalized form', () => {
      const r = extractEmails('Reach Sarah@Acme.co or marcus@acme.co or sarah@acme.co again');
      expect(r).toHaveLength(2);
      const emails = r.map((m) => m.email).sort();
      expect(emails).toEqual(['marcus@acme.co', 'sarah@acme.co']);
    });

    it('strips trailing punctuation', () => {
      const r = extractEmails('Email: sarah@acme.co.');
      expect(r[0].email).toBe('sarah@acme.co');
    });

    it('strips trailing parentheses', () => {
      const r = extractEmails('(sarah@acme.co)');
      expect(r[0].email).toBe('sarah@acme.co');
    });

    it('handles plus addressing in raw match (normalization strips it)', () => {
      const r = extractEmails('sarah+jobs@acme.co');
      expect(r[0].email).toBe('sarah@acme.co');
    });

    it('handles dotted gmail addresses', () => {
      const r = extractEmails('s.a.r.a.h@gmail.com');
      expect(r[0].email).toBe('sarah@gmail.com');
    });
  });

  describe('classification', () => {
    it('classifies hiring@ as role', () => {
      const r = extractEmails('Send to hiring@acme.co');
      expect(r[0].kind).toBe('role');
    });

    it('classifies careers@ as role', () => {
      const r = extractEmails('careers@acme.co');
      expect(r[0].kind).toBe('role');
    });

    it('classifies info@ as role', () => {
      const r = extractEmails('info@acme.co');
      expect(r[0].kind).toBe('role');
    });

    it('classifies noreply@ as noreply', () => {
      const r = extractEmails('noreply@acme.co');
      expect(r[0].kind).toBe('noreply');
    });

    it('classifies do-not-reply@ as noreply', () => {
      const r = extractEmails('do-not-reply@acme.co');
      expect(r[0].kind).toBe('noreply');
    });

    it('classifies postmaster@ as noreply', () => {
      const r = extractEmails('postmaster@acme.co');
      expect(r[0].kind).toBe('noreply');
    });

    it('classifies real names as personal', () => {
      const r = extractEmails('sarah.chen@acme.co');
      expect(r[0].kind).toBe('personal');
    });
  });

  describe('blocklist', () => {
    it('marks gmail.com as blocked', () => {
      const r = extractEmails('user@gmail.com');
      expect(r[0].isBlocked).toBe(true);
    });

    it('marks outlook.com as blocked', () => {
      const r = extractEmails('user@outlook.com');
      expect(r[0].isBlocked).toBe(true);
    });

    it('marks proton.me as blocked', () => {
      const r = extractEmails('user@proton.me');
      expect(r[0].isBlocked).toBe(true);
    });

    it('marks icloud.com as blocked', () => {
      const r = extractEmails('user@icloud.com');
      expect(r[0].isBlocked).toBe(true);
    });

    it('marks sentry.io as blocked (analytics)', () => {
      const r = extractEmails('errors@sentry.io');
      expect(r[0].isBlocked).toBe(true);
    });

    it('does NOT mark a real company domain as blocked', () => {
      const r = extractEmails('sarah@acme.co');
      expect(r[0].isBlocked).toBe(false);
    });
  });

  describe('rejection of garbage', () => {
    it('rejects @foo.123 (numeric TLD)', () => {
      const r = extractEmails('user@foo.123');
      expect(r).toHaveLength(0);
    });

    it('handles a long chain of dotted parts safely (TLD cap)', () => {
      const r = extractEmails('user@foo.bar.baz.qux');
      // 'qux' is a valid TLD by length; the regex should still parse cleanly
      expect(Array.isArray(r)).toBe(true);
    });

    it('rejects empty input', () => {
      expect(extractEmails('')).toEqual([]);
    });

    it('rejects null input safely', () => {
      expect(extractEmails(null as unknown as string)).toEqual([]);
    });

    it('rejects non-string input safely', () => {
      expect(extractEmails(123 as unknown as string)).toEqual([]);
    });

    it('rejects bare @ symbols', () => {
      const r = extractEmails('@@@@');
      expect(r).toEqual([]);
    });

    it('handles oversized input without hanging', () => {
      // 50KB of garbage (well above any real page) plus an email at the end.
      // The 1MB internal cap is exercised; we just want to confirm no hang.
      const big = 'a'.repeat(50_000) + ' sarah@acme.co';
      const r = extractEmails(big);
      expect(r.some((m) => m.email === 'sarah@acme.co')).toBe(true);
    });

    it('ReDoS regression: 100KB of repeated alphanumerics finishes in <500ms', () => {
      // Iter-1 security review measured 12.7s on this exact input with the
      // unbounded regex. The bounded version should complete near-instantly.
      // 500ms is generous for slow CI; real time is ~5ms on a laptop.
      const pathological = 'a'.repeat(100_000);
      const start = Date.now();
      const r = extractEmails(pathological);
      const elapsed = Date.now() - start;
      expect(r).toEqual([]);
      expect(elapsed).toBeLessThan(500);
    });

    it('ReDoS regression: 200KB pathological input finishes in <1s', () => {
      // Even at 2x the previous test, the bounded regex should be linear
      // in input size. Iter-1 regex took ~50s on this size.
      const pathological = 'a'.repeat(200_000);
      const start = Date.now();
      const r = extractEmails(pathological);
      const elapsed = Date.now() - start;
      expect(r).toEqual([]);
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe('multiple emails in one block', () => {
    it('extracts multiple emails from a footer-style block', () => {
      // hiring@ -> role, press@ -> personal (not in role list), support@ -> noreply
      const text = `
        For hiring questions: hiring@acme.co
        For press: press@acme.co
        For support: support@acme.co
      `;
      const r = extractEmails(text);
      expect(r).toHaveLength(3);
      const kinds = r.map((m) => m.kind).sort();
      expect(kinds).toEqual(['noreply', 'personal', 'role']);
    });

    it('preserves match index for anchor walking', () => {
      const text = 'Contact sarah@acme.co or marcus@acme.co';
      const r = extractEmails(text);
      expect(r[0].index).toBeLessThan(r[1].index);
    });
  });
});

describe('normalizeEmail', () => {
  it('lowercases', () => {
    expect(normalizeEmail('Sarah@Acme.CO')).toBe('sarah@acme.co');
  });

  it('trims', () => {
    expect(normalizeEmail('  sarah@acme.co  ')).toBe('sarah@acme.co');
  });

  it('strips +addressing', () => {
    expect(normalizeEmail('sarah+jobs@acme.co')).toBe('sarah@acme.co');
  });

  it('strips dots in gmail.com local part', () => {
    expect(normalizeEmail('s.a.r.a.h@gmail.com')).toBe('sarah@gmail.com');
  });

  it('preserves dots in non-gmail domains', () => {
    expect(normalizeEmail('s.a.r.a.h@acme.co')).toBe('s.a.r.a.h@acme.co');
  });

  it('returns empty string for invalid input', () => {
    expect(normalizeEmail('not-an-email')).toBe('');
    expect(normalizeEmail('')).toBe('');
    expect(normalizeEmail('@acme.co')).toBe('');
    expect(normalizeEmail('sarah@')).toBe('');
  });
});

describe('classifyEmail', () => {
  it('classifies role local parts', () => {
    expect(classifyEmail('careers@x.co')).toBe('role');
    expect(classifyEmail('hiring@x.co')).toBe('role');
    expect(classifyEmail('info@x.co')).toBe('role');
  });

  it('classifies noreply local parts', () => {
    expect(classifyEmail('noreply@x.co')).toBe('noreply');
    expect(classifyEmail('do-not-reply@x.co')).toBe('noreply');
  });

  it('defaults to personal for real names', () => {
    expect(classifyEmail('sarah.chen@x.co')).toBe('personal');
  });
});

// Iter-2: unwrapObfuscation tests deleted along with the function. See
// the comment block in src/core/contacts/email-regex.ts for the rationale
// (false-positive hazard in " AT " plus the function was never wired
// into the production extraction path).
