/**
 * HN sanitizer tests - security boundary, exhaustive coverage required.
 *
 * The sanitizer is the only thing standing between Algolia-fetched HN
 * comments and the privileged extension origin's React render. Every
 * known XSS vector for innerHTML must be tested here.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeHNComment } from './hn-sanitizer';

describe('sanitizeHNComment', () => {
  describe('happy path', () => {
    it('preserves allowed tags p, i, b, code', () => {
      const input = '<p>We are <b>hiring</b> a <i>backend</i> engineer with <code>Go</code></p>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).toContain('<p>');
      expect(htmlSafe).toContain('<b>');
      expect(htmlSafe).toContain('<i>');
      expect(htmlSafe).toContain('<code>');
    });

    it('preserves valid https anchor with href and adds rel/target', () => {
      const input = '<a href="https://example.com/jobs">Apply here</a>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).toContain('href="https://example.com/jobs"');
      expect(htmlSafe).toContain('rel="noopener noreferrer"');
      expect(htmlSafe).toContain('target="_blank"');
    });

    it('preserves http anchors as well as https', () => {
      const input = '<a href="http://example.com">link</a>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).toContain('href="http://example.com"');
    });
  });

  describe('XSS vectors', () => {
    it('strips javascript: hrefs', () => {
      const input = '<a href="javascript:alert(1)">click</a>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('javascript:');
      expect(htmlSafe).not.toContain('href');
    });

    it('strips data: hrefs', () => {
      const input = '<a href="data:text/html,<script>alert(1)</script>">click</a>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('data:');
    });

    it('strips vbscript: hrefs', () => {
      const input = '<a href="vbscript:msgbox(1)">click</a>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('vbscript:');
    });

    it('strips entire script tag and content', () => {
      const input = 'Hello<script>alert("xss")</script>world';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('<script');
      expect(htmlSafe).not.toContain('alert');
      expect(htmlSafe).toContain('Hello');
      expect(htmlSafe).toContain('world');
    });

    it('strips entire style tag and content', () => {
      const input = 'Hello<style>body{display:none}</style>world';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('<style');
      expect(htmlSafe).not.toContain('display:none');
    });

    it('strips iframe tags', () => {
      const input = '<iframe src="https://evil.com"></iframe>OK';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('iframe');
      expect(htmlSafe).toContain('OK');
    });

    it('strips form/input/button tags', () => {
      const input = '<form><input type="text"><button>go</button></form>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('<form');
      expect(htmlSafe).not.toContain('<input');
      expect(htmlSafe).not.toContain('<button');
    });

    it('strips SVG tags (potential XSS via SVG)', () => {
      const input = '<svg onload="alert(1)"></svg>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('svg');
      expect(htmlSafe).not.toContain('onload');
    });

    it('strips event handler attributes on allowed tags', () => {
      const input = '<p onclick="alert(1)">hello</p>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).toContain('<p>');
      expect(htmlSafe).not.toContain('onclick');
    });

    it('strips style attribute on allowed tags', () => {
      const input = '<p style="background:url(javascript:alert(1))">x</p>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('style');
      expect(htmlSafe).not.toContain('javascript:');
    });

    it('strips img tags entirely (not in allowlist)', () => {
      const input = '<img src=x onerror=alert(1)>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('img');
      expect(htmlSafe).not.toContain('onerror');
    });

    it('strips a tag without href', () => {
      const input = '<a>no href</a>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('<a');
    });

    it('strips a tag with relative href (not http/https)', () => {
      const input = '<a href="/relative">link</a>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('<a ');
    });

    it('handles uppercase tag names', () => {
      const input = '<SCRIPT>alert(1)</SCRIPT>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toMatch(/script/i);
    });

    it('caps oversized input at 16KB scan and 2KB output', () => {
      const huge = '<p>' + 'x'.repeat(50_000) + '</p>';
      const { htmlSafe } = sanitizeHNComment(huge);
      expect(htmlSafe.length).toBeLessThanOrEqual(2048);
    });
  });

  describe('plain text extraction', () => {
    it('produces plain text with all tags removed', () => {
      const input = '<p>We are <b>hiring</b> in <a href="https://x.com">NYC</a></p>';
      const { plain } = sanitizeHNComment(input);
      expect(plain).toBe('We are hiring in NYC');
    });

    it('decodes common entities', () => {
      const input = '&amp; &lt;tag&gt; &quot;quoted&quot;';
      const { plain } = sanitizeHNComment(input);
      expect(plain).toContain('&');
      expect(plain).toContain('<tag>');
      expect(plain).toContain('"quoted"');
    });
  });

  describe('null/empty input', () => {
    it('handles null', () => {
      expect(sanitizeHNComment(null)).toEqual({ htmlSafe: '', plain: '' });
    });

    it('handles undefined', () => {
      expect(sanitizeHNComment(undefined)).toEqual({ htmlSafe: '', plain: '' });
    });

    it('handles empty string', () => {
      expect(sanitizeHNComment('')).toEqual({ htmlSafe: '', plain: '' });
    });

    it('handles non-string input safely', () => {
      expect(sanitizeHNComment(123 as unknown as string)).toEqual({ htmlSafe: '', plain: '' });
    });
  });

  // Iter-2 hardening: bypass vectors flagged in the WS7-9 review.
  describe('iter-2 bypass vectors', () => {
    it('strips HTML comments', () => {
      const input = 'before<!-- malicious payload -->after';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('<!--');
      expect(htmlSafe).toContain('before');
      expect(htmlSafe).toContain('after');
    });

    it('strips conditional comments (mXSS via IE conditionals)', () => {
      const input = '<!--[if IE]><script>alert(1)</script><![endif]-->safe';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('<script');
      expect(htmlSafe).not.toContain('alert');
      expect(htmlSafe).toContain('safe');
    });

    it('strips processing instructions', () => {
      const input = '<?xml version="1.0"?>real text';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('<?');
      expect(htmlSafe).toContain('real text');
    });

    it('strips noscript tags (mXSS protection)', () => {
      const input = '<noscript><img src=x onerror=alert(1)></noscript>safe';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('<noscript');
      expect(htmlSafe).not.toContain('onerror');
      expect(htmlSafe).toContain('safe');
    });

    it('strips math foreign content', () => {
      const input = '<math><mi xlink:href="javascript:alert(1)">x</mi></math>safe';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('<math');
    });

    it('strips template tags', () => {
      const input = '<template><script>alert(1)</script></template>safe';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('<template');
      expect(htmlSafe).not.toContain('<script');
    });

    it('rejects anchor with unquoted href', () => {
      const input = '<a href=javascript:alert(1)>click</a>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('javascript');
      expect(htmlSafe).not.toContain('href');
    });

    it('rejects anchor with whitespace inside href value', () => {
      const input = '<a href="javascript :alert(1)">click</a>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toContain('javascript');
    });

    it('rejects nested-tag reconstruction attempt', () => {
      // After the inner <script>...</script> is stripped, the outer
      // remnants must not re-form into a script tag.
      const input = '<scr<script>ipt>alert(1)</scr</script>ipt>';
      const { htmlSafe } = sanitizeHNComment(input);
      expect(htmlSafe).not.toMatch(/<script/i);
    });

    it('does not mangle legitimate text containing javascript: as a substring', () => {
      // Iter-2 fix: previous version stripped the literal substring globally
      // and corrupted "Learn JavaScript: a primer" into "Learn  a primer".
      const input = '<p>Learn JavaScript: a primer on data: structures</p>';
      const { htmlSafe, plain } = sanitizeHNComment(input);
      expect(plain).toContain('Learn JavaScript: a primer');
      expect(plain).toContain('data: structures');
      expect(htmlSafe).toContain('Learn JavaScript');
    });

    it('idempotent: re-sanitizing safe output produces the same output', () => {
      const input = '<p>Hi <b>there</b> <a href="https://example.com">link</a></p>';
      const once = sanitizeHNComment(input);
      const twice = sanitizeHNComment(once.htmlSafe);
      expect(twice.htmlSafe).toBe(once.htmlSafe);
    });
  });
});
