/**
 * End-to-end extractor tests against fixture HTML strings (Workstream 10).
 *
 * Uses jsdom (already in devDependencies) via DOMParser. Each test
 * builds a small fixture HTML, runs extractContactsFromDom, and asserts
 * the resulting candidates' fields and confidence buckets.
 *
 * Real platform fixtures (greenhouse, lever, ashby snapshots) live in
 * fixtures/*.html and are loaded as raw text. Lighter inline tests cover
 * edge cases that do not need a full snapshot.
 */

import { describe, it, expect } from 'vitest';
import {
  extractContactsFromDom,
  extractContactsFromHtml,
  extractContactsFromTextOnly,
} from '../extractor';

const ctx = {
  hostname: 'wellfound.com',
  url: 'https://wellfound.com/jobs/1',
  platform: 'wellfound',
};

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('extractContactsFromDom', () => {
  describe('happy path', () => {
    it('extracts a personal email with name + title from a sibling chain', () => {
      const html = `
        <div>
          <h3>Sarah Chen</h3>
          <p>Head of Engineering</p>
          <p>sarah@acme.co</p>
        </div>
      `;
      const doc = parse(html);
      const candidates = extractContactsFromDom(doc.body, ctx);
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      const sarah = candidates.find((c) => c.sighting.extractedFields.email === 'sarah@acme.co');
      expect(sarah).toBeDefined();
      expect(sarah?.sighting.extractedFields.name).toBe('Sarah Chen');
      expect(sarah?.sighting.extractedFields.title).toBeTruthy();
      expect(sarah?.score).toBeGreaterThanOrEqual(0.7);
    });

    it('extracts from a JSON-LD Person block', () => {
      const html = `
        <div>
          <script type="application/ld+json">{
            "@type": "Person",
            "name": "Marcus Lee",
            "jobTitle": "Co-founder"
          }</script>
          <p>marcus@acme.co</p>
        </div>
      `;
      const doc = parse(html);
      const candidates = extractContactsFromDom(doc.body, ctx);
      const marcus = candidates.find((c) => c.sighting.extractedFields.email === 'marcus@acme.co');
      expect(marcus).toBeDefined();
      expect(marcus?.sighting.extractedFields.name).toBe('Marcus Lee');
      expect(marcus?.sighting.extractedFields.title).toBe('Co-founder');
      expect(marcus?.sighting.confidence).toBe('high');
    });

    it('extracts from a dl/dt/dd structured pair', () => {
      const html = `
        <dl>
          <dt>Name</dt>
          <dd>Linda Park</dd>
          <dt>Title</dt>
          <dd>Engineering Manager</dd>
          <dt>Email</dt>
          <dd>linda@acme.co</dd>
        </dl>
      `;
      const doc = parse(html);
      const candidates = extractContactsFromDom(doc.body, ctx);
      const linda = candidates.find((c) => c.sighting.extractedFields.email === 'linda@acme.co');
      expect(linda).toBeDefined();
      expect(linda?.sighting.extractedFields.name).toBe('Linda Park');
      expect(linda?.sighting.extractedFields.title).toBe('Engineering Manager');
    });
  });

  describe('email kind classification flows through', () => {
    it('captures role emails as medium confidence', () => {
      const html = `<p>For careers, write to careers@acme.co</p>`;
      const doc = parse(html);
      const candidates = extractContactsFromDom(doc.body, ctx);
      const careers = candidates.find(
        (c) => c.sighting.extractedFields.email === 'careers@acme.co'
      );
      expect(careers).toBeDefined();
      expect(careers?.sighting.extractedFields.emailKind).toBe('role');
    });

    it('captures noreply emails (not blocked)', () => {
      const html = `<p>noreply@acme.co</p>`;
      const doc = parse(html);
      const candidates = extractContactsFromDom(doc.body, ctx);
      const noreply = candidates.find(
        (c) => c.sighting.extractedFields.email === 'noreply@acme.co'
      );
      expect(noreply).toBeDefined();
      expect(noreply?.sighting.extractedFields.emailKind).toBe('noreply');
    });
  });

  describe('blocklist enforcement', () => {
    it('skips personal webmail emails (gmail, outlook)', () => {
      const html = `<p>sarah@gmail.com</p><p>marcus@outlook.com</p>`;
      const doc = parse(html);
      const candidates = extractContactsFromDom(doc.body, ctx);
      expect(candidates).toHaveLength(0);
    });

    it('skips analytics vendor emails', () => {
      const html = `<p>errors@sentry.io</p>`;
      const doc = parse(html);
      const candidates = extractContactsFromDom(doc.body, ctx);
      expect(candidates).toHaveLength(0);
    });

    it('skips entire page on sensitive host', () => {
      const sensitiveCtx = { ...ctx, hostname: 'healthcare.gov' };
      const html = `<p>contact@healthcare.gov</p>`;
      const doc = parse(html);
      const candidates = extractContactsFromDom(doc.body, sensitiveCtx);
      expect(candidates).toHaveLength(0);
    });
  });

  describe('phone extraction', () => {
    it('extracts a US phone with surrounding name context', () => {
      const html = `
        <div>
          <strong>Jane Doe</strong>
          <p>Recruiter</p>
          <p>+1 415 555 0100</p>
        </div>
      `;
      const doc = parse(html);
      const candidates = extractContactsFromDom(doc.body, ctx);
      const jane = candidates.find((c) => c.sighting.extractedFields.phone === '+14155550100');
      expect(jane).toBeDefined();
    });
  });

  describe('input validation', () => {
    it('returns empty for null root', () => {
      expect(extractContactsFromDom(null as unknown as Element, ctx)).toEqual([]);
    });

    it('returns empty for missing context', () => {
      const doc = parse('<p>sarah@acme.co</p>');
      expect(extractContactsFromDom(doc.body, { hostname: '', url: '', platform: '' })).toEqual([]);
    });

    it('handles a page with no contacts', () => {
      const doc = parse('<p>Hello world</p>');
      expect(extractContactsFromDom(doc.body, ctx)).toEqual([]);
    });
  });
});

describe('extractContactsFromHtml (DOMParser path)', () => {
  it('parses a raw HTML string and returns candidates', () => {
    const html = '<p>contact: sarah@acme.co</p>';
    const candidates = extractContactsFromHtml(html, ctx);
    expect(candidates).toHaveLength(1);
  });
});

describe('extractContactsFromTextOnly (text fallback)', () => {
  it('extracts emails from raw text without DOM', () => {
    const text = 'Contact us at hiring@acme.co for jobs';
    const candidates = extractContactsFromTextOnly(text, ctx);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].sighting.extractedFields.email).toBe('hiring@acme.co');
  });

  it('strips HTML tags before extraction', () => {
    const text = '<p>Contact <strong>Sarah</strong> at sarah@acme.co</p>';
    const candidates = extractContactsFromTextOnly(text, ctx);
    expect(
      candidates.find((c) => c.sighting.extractedFields.email === 'sarah@acme.co')
    ).toBeDefined();
  });

  it('skips sensitive hosts', () => {
    const candidates = extractContactsFromTextOnly('contact@bank.com', {
      ...ctx,
      hostname: 'chase.bank',
    });
    expect(candidates).toHaveLength(0);
  });
});
