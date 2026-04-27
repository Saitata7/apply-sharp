/**
 * Source quality data integrity tests (Workstream 9, iter-2 coverage gap fix).
 *
 * The DEAD_SOURCES and AFFILIATE_SPAM_SOURCES lists are editorial data
 * surfaced as user-visible curation. These tests verify the data shape
 * (every entry has a name and reason) and that the combined skip-list
 * never collides with the recommended portal map.
 */

import { describe, it, expect } from 'vitest';
import { DEAD_SOURCES, AFFILIATE_SPAM_SOURCES, getSkipList } from './source-quality';
import { VALIDATED_PORTAL_MAP } from './portal-map';

describe('DEAD_SOURCES', () => {
  it('every entry has a non-empty name', () => {
    for (const d of DEAD_SOURCES) {
      expect(d.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('every entry has a non-empty reason', () => {
    for (const d of DEAD_SOURCES) {
      expect(d.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it('every deadSince matches YYYY-MM format', () => {
    for (const d of DEAD_SOURCES) {
      expect(d.deadSince).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it('contains Stack Overflow Jobs (the canonical example)', () => {
    expect(DEAD_SOURCES.some((d) => d.name === 'Stack Overflow Jobs')).toBe(true);
  });
});

describe('AFFILIATE_SPAM_SOURCES', () => {
  it('every entry has a non-empty name', () => {
    for (const a of AFFILIATE_SPAM_SOURCES) {
      expect(a.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('every entry has a non-empty reason', () => {
    for (const a of AFFILIATE_SPAM_SOURCES) {
      expect(a.reason.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('getSkipList', () => {
  it('returns at least 10 combined entries', () => {
    expect(getSkipList().length).toBeGreaterThanOrEqual(10);
  });

  it('marks every entry as either dead or spam', () => {
    for (const item of getSkipList()) {
      expect(['dead', 'spam']).toContain(item.kind);
    }
  });

  it('skip list NEVER collides with the recommended portal map', () => {
    // We must not recommend a source we also tell the user to skip.
    const skipNames = new Set(getSkipList().map((s) => s.name.toLowerCase()));
    const portalNames = new Set(VALIDATED_PORTAL_MAP.map((p) => p.sourceName.toLowerCase()));
    for (const skip of skipNames) {
      expect(portalNames.has(skip)).toBe(false);
    }
  });
});
