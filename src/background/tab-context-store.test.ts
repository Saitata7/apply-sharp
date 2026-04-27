/**
 * Tab context store unit tests (Workstream 7).
 *
 * Covers:
 *   - basic set/get/clear lifecycle
 *   - LRU eviction at the 50-entry cap
 *   - input validation (invalid tab id, missing job title)
 *   - JD bounding (oversized snippets capped at 2KB)
 *   - subscribe/broadcast on writes and clears
 *   - notifyTabActivated broadcasts TAB_CHANGED
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setTabJobContext,
  getTabJobContext,
  clearTabJobContext,
  notifyTabActivated,
  subscribe,
  _resetTabContextStore,
  _tabContextStoreSize,
  _tabContextStoreEntries,
} from './tab-context-store';
import type { TabJobContext, SidePanelPortMessage } from '@shared/types/sidepanel.types';

function makeCtx(overrides: Partial<TabJobContext> = {}): TabJobContext {
  return {
    jobId: 'linkedin-1',
    jobTitle: 'Senior Backend Engineer',
    companyName: 'Acme Corp',
    platform: 'linkedin',
    url: 'https://www.linkedin.com/jobs/view/1',
    capturedAt: Date.now(),
    ...overrides,
  };
}

describe('tab-context-store', () => {
  beforeEach(() => {
    _resetTabContextStore();
  });

  describe('set and get', () => {
    it('stores and retrieves a context for a tab', () => {
      setTabJobContext(42, makeCtx());
      const got = getTabJobContext(42);
      expect(got).not.toBeNull();
      expect(got?.jobTitle).toBe('Senior Backend Engineer');
    });

    it('returns null for an unknown tab id', () => {
      expect(getTabJobContext(999)).toBeNull();
    });

    it('overwrites the existing context for the same tab', () => {
      setTabJobContext(1, makeCtx({ jobTitle: 'Old' }));
      setTabJobContext(1, makeCtx({ jobTitle: 'New' }));
      expect(getTabJobContext(1)?.jobTitle).toBe('New');
      expect(_tabContextStoreSize()).toBe(1);
    });
  });

  describe('input validation', () => {
    it('rejects negative tab ids', () => {
      setTabJobContext(-1, makeCtx());
      expect(_tabContextStoreSize()).toBe(0);
    });

    it('rejects non-integer tab ids', () => {
      setTabJobContext(1.5, makeCtx());
      expect(_tabContextStoreSize()).toBe(0);
    });

    it('rejects context without a job title', () => {
      setTabJobContext(1, makeCtx({ jobTitle: '' }));
      expect(_tabContextStoreSize()).toBe(0);
    });

    it('caps oversized job description at 2KB', () => {
      const huge = 'x'.repeat(10_000);
      setTabJobContext(1, makeCtx({ jobDescription: huge }));
      const got = getTabJobContext(1);
      expect(got?.jobDescription?.length).toBe(2048);
    });

    it('caps oversized jobTitle at 512 chars (memory DoS defense)', () => {
      const huge = 'x'.repeat(100_000);
      setTabJobContext(1, makeCtx({ jobTitle: huge }));
      const got = getTabJobContext(1);
      expect(got?.jobTitle.length).toBe(512);
    });

    it('caps oversized companyName at 256 chars', () => {
      const huge = 'x'.repeat(100_000);
      setTabJobContext(1, makeCtx({ companyName: huge }));
      const got = getTabJobContext(1);
      expect(got?.companyName.length).toBe(256);
    });

    it('caps oversized url at 1024 chars', () => {
      const huge = 'https://example.com/' + 'x'.repeat(100_000);
      setTabJobContext(1, makeCtx({ url: huge }));
      const got = getTabJobContext(1);
      expect(got?.url.length).toBe(1024);
    });

    it('worst-case 50-entry LRU stays bounded under hostile input', () => {
      // 50 tabs * (~3KB total bounded fields) = ~150KB worst case
      const huge = 'x'.repeat(100_000);
      for (let i = 0; i < 50; i++) {
        setTabJobContext(i, makeCtx({ jobTitle: huge, companyName: huge, url: huge }));
      }
      const totalBytes = _tabContextStoreEntries().reduce((acc, [, ctx]) => {
        return (
          acc +
          (ctx.jobTitle?.length ?? 0) +
          (ctx.companyName?.length ?? 0) +
          (ctx.url?.length ?? 0)
        );
      }, 0);
      // 50 * (512 + 256 + 1024) = 89_600
      expect(totalBytes).toBeLessThanOrEqual(50 * (512 + 256 + 1024));
    });

    it('returns null for negative get', () => {
      expect(getTabJobContext(-5)).toBeNull();
    });
  });

  describe('LRU eviction', () => {
    it('caps the store at 50 entries and evicts the oldest', () => {
      for (let i = 0; i < 60; i++) {
        setTabJobContext(i, makeCtx({ jobId: `job-${i}` }));
      }
      expect(_tabContextStoreSize()).toBe(50);
      // The first 10 inserted (0..9) should be evicted
      expect(getTabJobContext(0)).toBeNull();
      expect(getTabJobContext(9)).toBeNull();
      expect(getTabJobContext(10)).not.toBeNull();
      expect(getTabJobContext(59)).not.toBeNull();
    });

    it('marks recently-touched entries as most-recently-used on get', () => {
      for (let i = 0; i < 50; i++) {
        setTabJobContext(i, makeCtx());
      }
      // Touch tab 0 - it should NOT be evicted by the next insert
      getTabJobContext(0);
      setTabJobContext(100, makeCtx());
      expect(getTabJobContext(0)).not.toBeNull();
      // Tab 1 (the next-oldest) should now be the eviction target
      expect(getTabJobContext(1)).toBeNull();
    });

    it('keeps insertion order in _entries() consistent with LRU', () => {
      setTabJobContext(1, makeCtx());
      setTabJobContext(2, makeCtx());
      setTabJobContext(3, makeCtx());
      getTabJobContext(1); // touch 1 → 1 becomes most recent
      const entries = _tabContextStoreEntries();
      const ids = entries.map(([k]) => k);
      expect(ids[ids.length - 1]).toBe(1);
    });
  });

  describe('clear', () => {
    it('removes a tab from the store', () => {
      setTabJobContext(1, makeCtx());
      clearTabJobContext(1);
      expect(getTabJobContext(1)).toBeNull();
      expect(_tabContextStoreSize()).toBe(0);
    });

    it('is a no-op when the tab is not in the store', () => {
      expect(() => clearTabJobContext(999)).not.toThrow();
      expect(_tabContextStoreSize()).toBe(0);
    });
  });

  describe('subscribe / broadcast', () => {
    it('broadcasts CONTEXT_UPDATE on set', () => {
      const messages: SidePanelPortMessage[] = [];
      const unsub = subscribe((m) => messages.push(m));
      setTabJobContext(1, makeCtx({ jobTitle: 'Push Update' }));
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: 'CONTEXT_UPDATE',
        tabId: 1,
      });
      if (messages[0].type === 'CONTEXT_UPDATE') {
        expect(messages[0].context?.jobTitle).toBe('Push Update');
      }
      unsub();
    });

    it('broadcasts CONTEXT_UPDATE with null context on clear', () => {
      const messages: SidePanelPortMessage[] = [];
      setTabJobContext(1, makeCtx());
      const unsub = subscribe((m) => messages.push(m));
      clearTabJobContext(1);
      expect(messages).toHaveLength(1);
      if (messages[0].type === 'CONTEXT_UPDATE') {
        expect(messages[0].context).toBeNull();
      }
      unsub();
    });

    it('broadcasts TAB_CHANGED on notifyTabActivated', () => {
      const messages: SidePanelPortMessage[] = [];
      const unsub = subscribe((m) => messages.push(m));
      notifyTabActivated(7);
      expect(messages).toEqual([{ type: 'TAB_CHANGED', tabId: 7 }]);
      unsub();
    });

    it('does not crash when a subscriber throws - removes the bad subscriber', () => {
      const good = vi.fn();
      const bad = vi.fn(() => {
        throw new Error('boom');
      });
      subscribe(bad);
      subscribe(good);
      setTabJobContext(1, makeCtx());
      // good still called
      expect(good).toHaveBeenCalledTimes(1);
      // bad removed; second write only reaches good
      setTabJobContext(2, makeCtx());
      expect(good).toHaveBeenCalledTimes(2);
      expect(bad).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe stops further messages', () => {
      const messages: SidePanelPortMessage[] = [];
      const unsub = subscribe((m) => messages.push(m));
      unsub();
      setTabJobContext(1, makeCtx());
      expect(messages).toHaveLength(0);
    });
  });
});
