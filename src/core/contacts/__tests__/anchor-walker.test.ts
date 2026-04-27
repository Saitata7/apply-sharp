/**
 * Anchor walker tests (Workstream 10, iter-2 coverage gap).
 *
 * Tests both walkFromAnchor (DOM-based) and walkFromAnchorTextOnly
 * (background-safe pure text). Iter-1 review flagged the absence of
 * these tests; the extractor.test.ts only exercised them transitively.
 */

import { describe, it, expect } from 'vitest';
import { walkFromAnchor, walkFromAnchorTextOnly } from '../anchor-walker';

const ctx = { hostname: 'wellfound.com' };

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function findEmailAnchor(doc: Document, email: string): Element | null {
  const all = doc.body.querySelectorAll('*');
  for (const el of all) {
    if ((el.textContent || '').includes(email)) {
      // Return the deepest match
      let deepest: Element = el;
      const children = el.querySelectorAll('*');
      for (const child of children) {
        if ((child.textContent || '').includes(email)) deepest = child;
      }
      return deepest;
    }
  }
  return null;
}

describe('walkFromAnchor (DOM)', () => {
  describe('happy paths', () => {
    it('extracts name from a sibling chain (h3 + p + email)', () => {
      const doc = parse(`
        <div>
          <h3>Sarah Chen</h3>
          <p>Head of Engineering</p>
          <p>sarah@acme.co</p>
        </div>
      `);
      const anchor = findEmailAnchor(doc, 'sarah@acme.co');
      expect(anchor).not.toBeNull();
      const result = walkFromAnchor(anchor!, ctx);
      expect(result.name).toBe('Sarah Chen');
    });

    it('extracts name from a strong tag', () => {
      const doc = parse(`
        <div>
          <strong>Marcus Lee</strong>
          <span>marcus@acme.co</span>
        </div>
      `);
      const anchor = findEmailAnchor(doc, 'marcus@acme.co');
      const result = walkFromAnchor(anchor!, ctx);
      expect(result.name).toBe('Marcus Lee');
    });

    it('extracts from JSON-LD Person schema', () => {
      const doc = parse(`
        <div>
          <script type="application/ld+json">{
            "@type": "Person",
            "name": "Linda Park",
            "jobTitle": "Engineering Manager"
          }</script>
          <p>linda@acme.co</p>
        </div>
      `);
      const anchor = findEmailAnchor(doc, 'linda@acme.co');
      const result = walkFromAnchor(anchor!, ctx);
      expect(result.name).toBe('Linda Park');
      expect(result.title).toBe('Engineering Manager');
      expect(result.confidence).toBe('high');
    });

    it('extracts from a dl/dt/dd structured pair', () => {
      const doc = parse(`
        <dl>
          <dt>Name</dt>
          <dd>Jane Doe</dd>
          <dt>Title</dt>
          <dd>Recruiter</dd>
          <dt>Email</dt>
          <dd>jane@acme.co</dd>
        </dl>
      `);
      const anchor = findEmailAnchor(doc, 'jane@acme.co');
      const result = walkFromAnchor(anchor!, ctx);
      expect(result.name).toBe('Jane Doe');
      expect(result.title).toBe('Recruiter');
    });

    it('extracts a title via role keyword in surrounding text', () => {
      const doc = parse(`
        <div>
          <h3>Bob Smith</h3>
          <p>Engineering Manager at Acme</p>
          <p>bob@acme.co</p>
        </div>
      `);
      const anchor = findEmailAnchor(doc, 'bob@acme.co');
      const result = walkFromAnchor(anchor!, ctx);
      expect(result.name).toBe('Bob Smith');
      expect(result.title).toContain('Engineering Manager');
    });
  });

  describe('rejection / fallback', () => {
    it('returns ambiguous=true when there is no name nearby', () => {
      const doc = parse(`<p>Random text careers@acme.co</p>`);
      const anchor = findEmailAnchor(doc, 'careers@acme.co');
      const result = walkFromAnchor(anchor!, ctx);
      expect(result.name).toBeUndefined();
      expect(result.ambiguous).toBe(true);
    });

    it('returns ambiguous=true when input is null', () => {
      const result = walkFromAnchor(null as unknown as Element, ctx);
      expect(result.confidence).toBe('low');
      expect(result.ambiguous).toBe(true);
    });

    it('does not match a single word as a name', () => {
      const doc = parse(`<div><h3>Sarah</h3><p>sarah@acme.co</p></div>`);
      const anchor = findEmailAnchor(doc, 'sarah@acme.co');
      const result = walkFromAnchor(anchor!, ctx);
      // "Sarah" alone should NOT match TitleCase First+Last pattern
      expect(result.name).toBeUndefined();
    });
  });
});

describe('walkFromAnchorTextOnly (text fallback)', () => {
  it('extracts a name preceding the anchor in inline text', () => {
    const text = 'Reach out to Sarah Chen for hiring questions: sarah@acme.co';
    const offset = text.indexOf('sarah@acme.co');
    const result = walkFromAnchorTextOnly(text, offset);
    expect(result.name).toBe('Sarah Chen');
  });

  it('extracts the LAST TitleCase name before the anchor', () => {
    // Multiple names; the closest one to the anchor wins
    const text = 'CEO John Wayne and Sarah Chen, Head of Engineering, sarah@acme.co';
    const offset = text.indexOf('sarah@acme.co');
    const result = walkFromAnchorTextOnly(text, offset);
    expect(result.name).toBe('Sarah Chen');
  });

  it('returns ambiguous when no name precedes the anchor', () => {
    const text = 'careers@acme.co';
    const result = walkFromAnchorTextOnly(text, 0);
    expect(result.name).toBeUndefined();
    expect(result.ambiguous).toBe(true);
  });

  it('handles negative offset safely', () => {
    const result = walkFromAnchorTextOnly('hello', -1);
    expect(result.confidence).toBe('low');
    expect(result.ambiguous).toBe(true);
  });

  it('handles empty input safely', () => {
    const result = walkFromAnchorTextOnly('', 0);
    expect(result.ambiguous).toBe(true);
  });

  it('extracts a title from a separator pattern after the name', () => {
    const text = 'Sarah Chen, Head of Engineering, sarah@acme.co';
    const offset = text.indexOf('sarah@acme.co');
    const result = walkFromAnchorTextOnly(text, offset);
    expect(result.name).toBe('Sarah Chen');
    expect(result.title).toContain('Head of Engineering');
  });
});
