/**
 * Per-tab job context store (Workstream 7).
 *
 * In-memory map keyed by tab id, capped at 50 entries with LRU eviction so a
 * heavy tab user does not balloon background service-worker memory. The store
 * is intentionally NOT persisted: tab ids are ephemeral and the content script
 * re-emits JOB_DETECTED on every page load, so a service worker restart loses
 * nothing the user cannot recover by switching tabs.
 *
 * The store is the single source of truth that the side panel reads via
 * GET_TAB_JOB_CONTEXT and subscribes to via the 'sidepanel-tab-context' port.
 *
 * Why a separate module:
 *  - Pure logic, fully unit-testable without chrome.* mocks (the chrome.tabs
 *    listener wiring lives in background/index.ts and just calls into this).
 *  - Re-used by background/index.ts and by the message handler.
 *  - Bounded (50-entry LRU) so the worst-case memory footprint is predictable.
 */

import type { TabJobContext, SidePanelPortMessage } from '@shared/types/sidepanel.types';

const MAX_ENTRIES = 50;

/**
 * LRU map: insertion order is preserved by Map, and we re-insert on get/set
 * so the most recently touched tab is always the last entry. When we exceed
 * MAX_ENTRIES we evict from the front (oldest).
 */
class LRUTabContextMap {
  private store = new Map<number, TabJobContext>();

  set(tabId: number, ctx: TabJobContext): void {
    // Re-insert to mark as most-recently-used
    if (this.store.has(tabId)) this.store.delete(tabId);
    this.store.set(tabId, ctx);
    // Evict oldest until size is within budget
    while (this.store.size > MAX_ENTRIES) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) break;
      this.store.delete(oldestKey);
    }
  }

  get(tabId: number): TabJobContext | null {
    const ctx = this.store.get(tabId) ?? null;
    if (ctx) {
      // Touch to mark as most-recently-used
      this.store.delete(tabId);
      this.store.set(tabId, ctx);
    }
    return ctx;
  }

  has(tabId: number): boolean {
    return this.store.has(tabId);
  }

  delete(tabId: number): boolean {
    return this.store.delete(tabId);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  /** For tests only: read the internal order without touching LRU. */
  _entries(): Array<[number, TabJobContext]> {
    return Array.from(this.store.entries());
  }
}

const tabContextMap = new LRUTabContextMap();

/**
 * Subscribers list. Each port hangs a callback so we can broadcast
 * CONTEXT_UPDATE messages on writes. Cleared when the port disconnects.
 */
type Subscriber = (msg: SidePanelPortMessage) => void;
const subscribers = new Set<Subscriber>();

export function subscribe(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function broadcast(msg: SidePanelPortMessage): void {
  for (const cb of subscribers) {
    try {
      cb(msg);
    } catch (err) {
      // Subscriber may be a closed port; the disconnect listener cleans it up.
      console.warn('[TabContextStore] subscriber threw, removing:', err);
      subscribers.delete(cb);
    }
  }
}

/**
 * Field caps. Defense against memory DoS via hostile content scripts: with
 * a 50-entry LRU, an unbounded jobTitle could push worst-case background
 * memory to ~50 * 10MB = 500MB. Caps below keep worst-case at ~50 * ~6KB
 * = ~300KB total. Iter-2 fix per security review.
 */
const FIELD_CAPS = {
  jobId: 256,
  jobTitle: 512,
  companyName: 256,
  platform: 64,
  url: 1024,
  jobDescription: 2048,
  postedDate: 64,
  salary: 256,
} as const;

function capString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.slice(0, max);
}

/**
 * Write a tab's job context. Called from the JOB_DETECTED message handler.
 * Broadcasts a CONTEXT_UPDATE to all subscribers so the side panel re-renders.
 *
 * Validates and bounds every string field: rejects empty job titles, rejects
 * negative tab ids, caps every string at FIELD_CAPS to defend against memory
 * DoS via hostile content scripts.
 */
export function setTabJobContext(tabId: number, ctx: TabJobContext): void {
  if (!Number.isInteger(tabId) || tabId < 0) {
    console.warn('[TabContextStore] invalid tab id:', tabId);
    return;
  }
  if (!ctx?.jobTitle || typeof ctx.jobTitle !== 'string') {
    console.warn('[TabContextStore] missing or invalid jobTitle');
    return;
  }
  // Cap every string field. The cap is enforced HERE (not at the message
  // handler) so any future write path also gets the protection.
  const bounded: TabJobContext = {
    jobId: capString(ctx.jobId, FIELD_CAPS.jobId) ?? '',
    jobTitle: capString(ctx.jobTitle, FIELD_CAPS.jobTitle) ?? '',
    companyName: capString(ctx.companyName, FIELD_CAPS.companyName) ?? '',
    platform: capString(ctx.platform, FIELD_CAPS.platform) ?? 'unknown',
    url: capString(ctx.url, FIELD_CAPS.url) ?? '',
    jobDescription: capString(ctx.jobDescription, FIELD_CAPS.jobDescription),
    postedDate: capString(ctx.postedDate, FIELD_CAPS.postedDate),
    salary: capString(ctx.salary, FIELD_CAPS.salary),
    capturedAt: ctx.capturedAt || Date.now(),
  };
  if (!bounded.jobTitle) {
    console.warn('[TabContextStore] jobTitle empty after cap; rejecting write');
    return;
  }
  tabContextMap.set(tabId, bounded);
  broadcast({ type: 'CONTEXT_UPDATE', tabId, context: bounded });
}

export function getTabJobContext(tabId: number): TabJobContext | null {
  if (!Number.isInteger(tabId) || tabId < 0) return null;
  return tabContextMap.get(tabId);
}

/**
 * Clear a tab's context. Called from chrome.tabs.onRemoved and from
 * chrome.tabs.onUpdated when the tab navigates to a new page.
 */
export function clearTabJobContext(tabId: number): void {
  if (tabContextMap.delete(tabId)) {
    broadcast({ type: 'CONTEXT_UPDATE', tabId, context: null });
  }
}

/**
 * Notify subscribers that the active tab changed. The side panel uses this
 * to re-fetch its current context if the active tab id is now different.
 */
export function notifyTabActivated(tabId: number): void {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  broadcast({ type: 'TAB_CHANGED', tabId });
}

/** Test-only: reset internal state. */
export function _resetTabContextStore(): void {
  tabContextMap.clear();
  subscribers.clear();
}

/** Test-only: read internal map size for assertions. */
export function _tabContextStoreSize(): number {
  return tabContextMap.size;
}

/** Test-only: read internal entries in LRU order. */
export function _tabContextStoreEntries(): Array<[number, TabJobContext]> {
  return tabContextMap._entries();
}
