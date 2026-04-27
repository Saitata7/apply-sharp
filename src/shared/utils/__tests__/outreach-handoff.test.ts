/**
 * outreach-handoff util tests (Workstream 10 iter-3).
 *
 * Verifies the shared writer/reader that closes the loop between the
 * sidepanel ContactsCard / Contacts CRM page and the Outreach composer.
 * The handoff lives in chrome.storage.local because the Outreach page
 * may not be mounted when the user clicks "Draft email", so a runtime
 * message would race the page mount.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeOutreachHandoff, readOutreachHandoff } from '../outreach-handoff';

interface FakeStorage {
  store: Record<string, unknown>;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

let fake: FakeStorage;

beforeEach(() => {
  fake = {
    store: {},
    set: vi.fn().mockImplementation((obj: Record<string, unknown>) => {
      Object.assign(fake.store, obj);
      return Promise.resolve();
    }),
    get: vi.fn().mockImplementation((key: string) => {
      return Promise.resolve(key in fake.store ? { [key]: fake.store[key] } : {});
    }),
    remove: vi.fn().mockImplementation((key: string) => {
      delete fake.store[key];
      return Promise.resolve();
    }),
  };
  (
    globalThis as unknown as {
      chrome: { storage: { local: FakeStorage } };
    }
  ).chrome = {
    storage: { local: fake },
  };
});

describe('writeOutreachHandoff', () => {
  it('writes the handoff under the outreachHandoff key with createdAt', async () => {
    await writeOutreachHandoff({
      contactId: 'email:abc',
      recipientName: 'Sarah Chen',
      recipientEmail: 'sarah@acme.co',
      companyName: 'Acme Corp',
      jobId: 'wellfound-1',
    });
    expect(fake.set).toHaveBeenCalledTimes(1);
    const written = fake.store.outreachHandoff as { contactId: string; createdAt: number };
    expect(written.contactId).toBe('email:abc');
    expect(typeof written.createdAt).toBe('number');
    expect(written.createdAt).toBeGreaterThan(0);
  });

  it('swallows storage errors so the calling button does not throw', async () => {
    fake.set.mockRejectedValueOnce(new Error('quota exceeded'));
    await expect(
      writeOutreachHandoff({ contactId: 'x', recipientEmail: 'y@z.co' })
    ).resolves.toBeUndefined();
  });
});

describe('readOutreachHandoff', () => {
  it('returns null when no handoff is stored', async () => {
    const got = await readOutreachHandoff();
    expect(got).toBeNull();
  });

  it('returns the handoff and removes it on first read', async () => {
    await writeOutreachHandoff({
      contactId: 'email:abc',
      recipientEmail: 'sarah@acme.co',
    });
    const got = await readOutreachHandoff();
    expect(got?.contactId).toBe('email:abc');
    expect(got?.recipientEmail).toBe('sarah@acme.co');
    // Removed after read
    expect(fake.remove).toHaveBeenCalledWith('outreachHandoff');
    expect(fake.store.outreachHandoff).toBeUndefined();
    // A second read should be null (single-use semantic)
    const second = await readOutreachHandoff();
    expect(second).toBeNull();
  });

  it('drops handoffs older than 5 minutes', async () => {
    fake.store.outreachHandoff = {
      contactId: 'email:stale',
      recipientEmail: 'stale@acme.co',
      createdAt: Date.now() - 6 * 60 * 1000, // 6 minutes old
    };
    const got = await readOutreachHandoff();
    expect(got).toBeNull();
    // Stale handoff should still be removed (cleanup)
    expect(fake.remove).toHaveBeenCalledWith('outreachHandoff');
  });

  it('returns null for malformed handoffs (missing contactId) AND removes the blob', async () => {
    // Iter-4 fix: a malformed blob without contactId used to sit in storage
    // forever because the early return ran before chrome.storage.local.remove.
    // The reader now removes the key BEFORE validation so corrupt blobs
    // cannot leak past the next read.
    fake.store.outreachHandoff = { recipientEmail: 'no-id@acme.co' };
    const got = await readOutreachHandoff();
    expect(got).toBeNull();
    expect(fake.remove).toHaveBeenCalledWith('outreachHandoff');
    expect(fake.store.outreachHandoff).toBeUndefined();
  });

  it('returns null when chrome.storage.get throws', async () => {
    fake.get.mockRejectedValueOnce(new Error('storage offline'));
    const got = await readOutreachHandoff();
    expect(got).toBeNull();
  });
});
