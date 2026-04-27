/**
 * Contact repo tests (Workstream 10, iter-2 coverage gap fix).
 *
 * Uses fake-indexeddb to exercise the real IDB transaction path. The
 * idb-client.ts module reads chrome.storage in production but the
 * fake-indexeddb shim provides the indexedDB global directly so the
 * production code path runs unchanged in tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Stub chrome global to avoid `chrome is not defined` in idb-client cleanup paths
beforeEach(() => {
  (
    globalThis as unknown as {
      chrome: { storage: { local: { get: ReturnType<typeof vi.fn> } } };
    }
  ).chrome = {
    storage: { local: { get: vi.fn().mockResolvedValue({}) } },
  };
});

import { contactRepo } from './contact.repo';
import type { ContactSighting } from '@shared/types/contact.types';

function makeSighting(overrides: Partial<ContactSighting> = {}): ContactSighting {
  return {
    capturedAt: new Date().toISOString(),
    sourceUrl: 'https://example.com',
    platform: 'wellfound',
    confidence: 'high',
    extractedFields: {
      email: 'sarah@acme.co',
      name: 'Sarah Chen',
      title: 'Head of Engineering',
    },
    ...overrides,
  };
}

describe('contactRepo.saveSighting', () => {
  it('creates a new contact on first sighting', async () => {
    const result = await contactRepo.saveSighting(makeSighting(), 'job-1');
    expect(result.id).toMatch(/^email:/);
    expect(result.sightings).toHaveLength(1);
    expect(result.jobIds).toEqual(['job-1']);
    expect(result.canonical.name).toBe('Sarah Chen');
  });

  it('merges a second sighting into the existing contact', async () => {
    await contactRepo.saveSighting(
      makeSighting({ extractedFields: { email: 'merge1@acme.co', name: 'Bob' } }),
      'job-1'
    );
    const second = await contactRepo.saveSighting(
      makeSighting({
        extractedFields: { email: 'merge1@acme.co', title: 'CEO' },
      }),
      'job-2'
    );
    expect(second.sightings).toHaveLength(2);
    expect(second.jobIds).toEqual(['job-1', 'job-2']);
    expect(second.canonical.name).toBe('Bob');
    expect(second.canonical.title).toBe('CEO');
  });

  it('dedupes jobIds on repeat sighting in same job', async () => {
    await contactRepo.saveSighting(
      makeSighting({ extractedFields: { email: 'dup@acme.co' } }),
      'job-x'
    );
    const second = await contactRepo.saveSighting(
      makeSighting({ extractedFields: { email: 'dup@acme.co' } }),
      'job-x'
    );
    expect(second.jobIds).toEqual(['job-x']);
  });
});

describe('contactRepo.bulkSaveSightings', () => {
  it('handles within-batch duplicates correctly', async () => {
    const out = await contactRepo.bulkSaveSightings([
      {
        sighting: makeSighting({ extractedFields: { email: 'batch@acme.co', name: 'Alice' } }),
        jobId: 'job-1',
      },
      {
        sighting: makeSighting({ extractedFields: { email: 'batch@acme.co', title: 'CTO' } }),
        jobId: 'job-1',
      },
    ]);
    // Both writes target the same id; the second sees the first via the
    // single readwrite transaction
    expect(out).toHaveLength(2);
    const final = await contactRepo.getById(out[0].id);
    expect(final?.sightings).toHaveLength(2);
    expect(final?.canonical.name).toBe('Alice');
    expect(final?.canonical.title).toBe('CTO');
  });

  it('returns empty for empty input', async () => {
    expect(await contactRepo.bulkSaveSightings([])).toEqual([]);
  });
});

describe('contactRepo.getByJobId', () => {
  it('returns contacts associated with a specific job', async () => {
    await contactRepo.saveSighting(
      makeSighting({ extractedFields: { email: 'find@acme.co' } }),
      'job-find'
    );
    const results = await contactRepo.getByJobId('job-find');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((c) => c.canonical.email === 'find@acme.co')).toBe(true);
  });

  it('returns empty for an unknown job id', async () => {
    expect(await contactRepo.getByJobId('does-not-exist')).toEqual([]);
  });
});

describe('contactRepo.archive + unarchive', () => {
  it('soft-deletes via archivedAt', async () => {
    const c = await contactRepo.saveSighting(
      makeSighting({ extractedFields: { email: 'arch@acme.co' } }),
      'job-1'
    );
    const archived = await contactRepo.archive(c.id);
    expect(archived?.archivedAt).toBeTruthy();
  });

  it('unarchive clears archivedAt', async () => {
    const c = await contactRepo.saveSighting(
      makeSighting({ extractedFields: { email: 'unarch@acme.co' } }),
      'job-1'
    );
    await contactRepo.archive(c.id);
    const restored = await contactRepo.unarchive(c.id);
    expect(restored?.archivedAt).toBeUndefined();
  });
});

describe('contactRepo.getListView', () => {
  beforeEach(async () => {
    // Wipe and re-seed
    const all = await contactRepo.getAll();
    if (all.length > 0) {
      await contactRepo.bulkRemove(all.map((c) => c.id));
    }
    await contactRepo.saveSighting(
      makeSighting({
        extractedFields: { email: 'sarah@acme.co', name: 'Sarah Chen', emailKind: 'personal' },
      }),
      'job-1'
    );
    await contactRepo.saveSighting(
      makeSighting({
        extractedFields: { email: 'careers@acme.co', emailKind: 'role' },
      }),
      'job-2'
    );
  });

  it('returns a list view filtered by emailKind', async () => {
    const personal = await contactRepo.getListView({ emailKind: 'personal' });
    expect(personal.length).toBeGreaterThanOrEqual(1);
    expect(personal.every((c) => c.emailKind === 'personal')).toBe(true);
  });

  it('searches by name (case-insensitive)', async () => {
    const results = await contactRepo.getListView({ search: 'sarah' });
    expect(results.some((c) => c.name === 'Sarah Chen')).toBe(true);
  });

  it('returns empty when search has no matches', async () => {
    const results = await contactRepo.getListView({ search: 'no_such_contact_xyz' });
    expect(results).toEqual([]);
  });
});

describe('contactRepo.bulkRemove', () => {
  it('hard-deletes by id list', async () => {
    const c1 = await contactRepo.saveSighting(
      makeSighting({ extractedFields: { email: 'rm1@acme.co' } }),
      'job-1'
    );
    const c2 = await contactRepo.saveSighting(
      makeSighting({ extractedFields: { email: 'rm2@acme.co' } }),
      'job-1'
    );
    const removed = await contactRepo.bulkRemove([c1.id, c2.id]);
    expect(removed).toBe(2);
    expect(await contactRepo.getById(c1.id)).toBeUndefined();
    expect(await contactRepo.getById(c2.id)).toBeUndefined();
  });
});
