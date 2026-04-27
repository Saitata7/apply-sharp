/**
 * Feature flags tests.
 *
 * Verifies the chrome.storage.local-backed flag system handles:
 *   - bundled defaults when chrome.storage is missing (test runtime)
 *   - explicit set / read / reset
 *   - bulk read of all flags
 *   - tolerance of malformed values
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isFeatureEnabled,
  setFeatureEnabled,
  resetFeatureFlag,
  getAllFeatureFlags,
  DEFAULT_FLAGS,
} from './feature-flags';

interface FakeStorageArea {
  store: Record<string, unknown>;
  get: (keys: string | string[] | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
}

function makeFakeStorage(): FakeStorageArea {
  const store: Record<string, unknown> = {};
  return {
    store,
    async get(keys) {
      if (keys === null) return { ...store };
      const out: Record<string, unknown> = {};
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) {
        if (k in store) out[k] = store[k];
      }
      return out;
    },
    async set(items) {
      Object.assign(store, items);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) {
        delete store[k];
      }
    },
  };
}

describe('feature-flags', () => {
  let storage: FakeStorageArea;

  beforeEach(() => {
    storage = makeFakeStorage();
    (globalThis as unknown as { chrome: { storage: { local: FakeStorageArea } } }).chrome = {
      storage: { local: storage },
    };
  });

  describe('isFeatureEnabled', () => {
    it('returns the bundled default for an unread flag', async () => {
      expect(await isFeatureEnabled('sidepanel.v1')).toBe(DEFAULT_FLAGS['sidepanel.v1']);
      expect(await isFeatureEnabled('discovery.ghostJob')).toBe(true);
    });

    it('returns false when the flag is set to false', async () => {
      await setFeatureEnabled('discovery.ghostJob', false);
      expect(await isFeatureEnabled('discovery.ghostJob')).toBe(false);
    });

    it('returns true when explicitly set to true', async () => {
      await setFeatureEnabled('sidepanel.v1', true);
      expect(await isFeatureEnabled('sidepanel.v1')).toBe(true);
    });

    it('falls back to default when chrome.storage is missing', async () => {
      delete (globalThis as unknown as { chrome?: unknown }).chrome;
      expect(await isFeatureEnabled('discovery.hnWhosHiring')).toBe(
        DEFAULT_FLAGS['discovery.hnWhosHiring']
      );
    });
  });

  describe('resetFeatureFlag', () => {
    it('reverts to the bundled default after reset', async () => {
      await setFeatureEnabled('discovery.hnWhosHiring', false);
      expect(await isFeatureEnabled('discovery.hnWhosHiring')).toBe(false);
      await resetFeatureFlag('discovery.hnWhosHiring');
      expect(await isFeatureEnabled('discovery.hnWhosHiring')).toBe(true);
    });
  });

  describe('getAllFeatureFlags', () => {
    it('returns every flag with its current value', async () => {
      await setFeatureEnabled('discovery.ghostJob', false);
      const all = await getAllFeatureFlags();
      expect(all['discovery.ghostJob']).toBe(false);
      expect(all['sidepanel.v1']).toBe(true);
      expect(all['discovery.portalRecommender']).toBe(true);
    });

    it('returns all defaults when storage is empty', async () => {
      const all = await getAllFeatureFlags();
      expect(all).toEqual(DEFAULT_FLAGS);
    });

    it('returns defaults when chrome.storage is missing', async () => {
      delete (globalThis as unknown as { chrome?: unknown }).chrome;
      const all = await getAllFeatureFlags();
      expect(all).toEqual(DEFAULT_FLAGS);
    });
  });

  describe('error tolerance', () => {
    it('returns default when storage.get throws', async () => {
      vi.spyOn(storage, 'get').mockRejectedValue(new Error('storage corrupted'));
      expect(await isFeatureEnabled('sidepanel.v1')).toBe(true);
    });

    it('does not throw when storage.set fails', async () => {
      vi.spyOn(storage, 'set').mockRejectedValue(new Error('quota exceeded'));
      await expect(setFeatureEnabled('discovery.ghostJob', false)).resolves.toBeUndefined();
    });
  });
});
