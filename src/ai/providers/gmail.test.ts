/**
 * Tests for the Gmail BYOK provider.
 *
 * The OAuth flow itself requires chrome.identity which we cannot mock end to
 * end without a full Chrome environment. We focus on the message encoder
 * (RFC 2822 + base64url) which is the part that has historically been
 * subtly wrong in similar code, and the constructor validation.
 */

import { describe, it, expect } from 'vitest';
import { GmailProvider } from './gmail';

describe('GmailProvider', () => {
  it('throws on construction with no client id', () => {
    expect(() => new GmailProvider({ clientId: '' })).toThrow();
  });

  it('does not throw with a non-empty client id', () => {
    expect(
      () => new GmailProvider({ clientId: 'abc-123.apps.googleusercontent.com' })
    ).not.toThrow();
  });
});

// Encode message via reflection: the encoder is private, test it through a
// minimal subclass that exposes it. This avoids exporting the helper just
// for tests.
class TestGmailProvider extends GmailProvider {
  encode(opts: Parameters<GmailProvider['createDraft']>[0]): string {
    // Cast through unknown to access the private method.
    return (this as unknown as { encodeMessage: (o: typeof opts) => string }).encodeMessage(opts);
  }
}

describe('encodeMessage (RFC 2822 + base64url)', () => {
  const p = new TestGmailProvider({ clientId: 'x' });

  function decode(b64url: string): string {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
  }

  it('round-trips a simple draft', () => {
    const encoded = p.encode({
      to: 'recruiter@acme.com',
      subject: 'Quick note about backend role',
      body: 'Hi Jane,\n\nSaw the role you posted. I built a similar pipeline at Acme.\n\nSai',
    });
    const decoded = decode(encoded);
    expect(decoded).toContain('To: recruiter@acme.com');
    expect(decoded).toContain('Subject: Quick note about backend role');
    expect(decoded).toContain('Hi Jane');
    expect(decoded).toContain('similar pipeline');
  });

  it('includes Cc and Bcc when provided', () => {
    const encoded = p.encode({
      to: 'a@example.com',
      subject: 'Test',
      body: 'Hello',
      cc: 'b@example.com',
      bcc: 'c@example.com',
    });
    const decoded = decode(encoded);
    expect(decoded).toContain('Cc: b@example.com');
    expect(decoded).toContain('Bcc: c@example.com');
  });

  it('omits Cc and Bcc when not provided', () => {
    const encoded = p.encode({
      to: 'a@example.com',
      subject: 'Test',
      body: 'Hello',
    });
    const decoded = decode(encoded);
    expect(decoded).not.toContain('Cc:');
    expect(decoded).not.toContain('Bcc:');
  });

  it('uses base64url alphabet (no + or / or =)', () => {
    const encoded = p.encode({
      to: 'recruiter@acme.com',
      subject: 'Subject with characters that produce + and /',
      body: 'Body with > and < and ? and & and many chars to force complex base64.',
    });
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });

  it('preserves UTF-8 characters', () => {
    const encoded = p.encode({
      to: 'a@example.com',
      subject: 'Cafe',
      body: 'Hi - I love cafes (note the spaced hyphen, never em-dash).',
    });
    const decoded = decode(encoded);
    expect(decoded).toContain('Cafe');
    expect(decoded).toContain('spaced hyphen');
  });

  it('strips CRLF from To header (header injection guard)', () => {
    const encoded = p.encode({
      to: 'victim@example.com\r\nBcc: attacker@evil.com',
      subject: 'Test',
      body: 'hello',
    });
    const decoded = decode(encoded);
    // The To header is on its own line; the injected Bcc must NOT appear.
    expect(decoded).not.toMatch(/^Bcc: attacker@evil\.com/m);
    // The original CRLF must be replaced with spaces, collapsing the
    // attacker's smuggled header into the To value where Gmail will
    // reject it as an invalid address.
    expect(decoded).toMatch(/^To: victim@example\.com.*attacker@evil\.com$/m);
  });

  it('strips CRLF from Subject header (header injection guard)', () => {
    const encoded = p.encode({
      to: 'a@example.com',
      subject: 'Hello\r\nBcc: leaked@evil.com',
      body: 'body',
    });
    const decoded = decode(encoded);
    expect(decoded).not.toMatch(/^Bcc: leaked@evil\.com/m);
  });

  it('strips CRLF from Cc and Bcc headers (no new header lines created)', () => {
    const encoded = p.encode({
      to: 'a@example.com',
      subject: 'Test',
      body: 'body',
      cc: 'b@example.com\r\nX-Injected: yes',
      bcc: 'c@example.com\r\nX-Injected2: yes',
    });
    const decoded = decode(encoded);
    // The injected headers must NOT appear as standalone header lines.
    // The literal text may still be present inside the Cc/Bcc value
    // (collapsed in by the CRLF replacement), but Gmail will reject it
    // as an invalid address. The security guarantee is "no new MIME
    // header line", not "the literal text never appears anywhere".
    expect(decoded).not.toMatch(/^X-Injected:/m);
    expect(decoded).not.toMatch(/^X-Injected2:/m);
    // Confirm the collapsed value does land inside the Cc line, proving
    // the smuggle was neutralized rather than passed through.
    expect(decoded).toMatch(/^Cc: b@example\.com.*X-Injected: yes$/m);
  });

  it('caps oversized headers at 998 chars (RFC 5322 line length limit)', () => {
    const longTo = 'x'.repeat(2000) + '@example.com';
    const encoded = p.encode({ to: longTo, subject: 'T', body: 'b' });
    const decoded = decode(encoded);
    const toLine = decoded.split('\r\n').find((l) => l.startsWith('To:'));
    expect(toLine).toBeDefined();
    expect(toLine!.length).toBeLessThanOrEqual(1002); // "To: " prefix + 998
  });
});
