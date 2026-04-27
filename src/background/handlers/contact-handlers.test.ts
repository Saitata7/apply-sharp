/**
 * Contact handlers tests (Workstream 10, iter-2 coverage gap fix).
 *
 * Mocks the contactRepo, the export helpers, and the feature flag.
 * Verifies the orchestration logic without touching IDB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted; the factory cannot reference top-level variables.
// We use vi.hoisted() to declare the mock objects in a hoisted block,
// then reference them inside the factory.
const { repoMock, exportCsvMock, exportVCardMock, flagMock } = vi.hoisted(() => ({
  repoMock: {
    bulkSaveSightings: vi.fn().mockResolvedValue([]),
    getListView: vi.fn().mockResolvedValue([]),
    getByJobId: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(null),
    archive: vi.fn().mockResolvedValue(null),
    bulkRemove: vi.fn().mockResolvedValue(0),
  },
  exportCsvMock: vi.fn().mockResolvedValue('csv,here'),
  exportVCardMock: vi.fn().mockResolvedValue('BEGIN:VCARD'),
  flagMock: vi.fn().mockResolvedValue(true),
}));

vi.mock('@storage/index', () => ({
  contactRepo: repoMock,
}));

vi.mock('@storage/export-import', () => ({
  exportContactsCSV: () => exportCsvMock(),
  exportContactsVCard: () => exportVCardMock(),
}));

vi.mock('@shared/feature-flags', () => ({
  isFeatureEnabled: () => flagMock(),
}));

import {
  handleSaveContacts,
  handleGetContacts,
  handleGetContactsForJob,
  handleArchiveContact,
  handleBulkDeleteContacts,
  handleExportContactsCSV,
  handleExportContactsVCard,
  handleExtractContactsForJob,
} from './contact-handlers';

beforeEach(() => {
  Object.values(repoMock).forEach((fn) => fn.mockClear());
  exportCsvMock.mockClear().mockResolvedValue('csv,here');
  exportVCardMock.mockClear().mockResolvedValue('BEGIN:VCARD');
  flagMock.mockClear().mockResolvedValue(true);
});

describe('handleSaveContacts', () => {
  it('rejects missing items array', async () => {
    const result = await handleSaveContacts({} as never);
    expect(result.success).toBe(false);
  });

  it('returns savedCount: 0 when feature flag is OFF (no-op)', async () => {
    flagMock.mockResolvedValueOnce(false);
    const result = await handleSaveContacts({
      items: [
        {
          sighting: {
            sourceUrl: 'x',
            platform: 'wellfound',
            extractedFields: { email: 'a@b.co' },
            confidence: 'high',
          } as never,
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data?.savedCount).toBe(0);
    expect(repoMock.bulkSaveSightings).not.toHaveBeenCalled();
  });

  it('saves sightings when feature flag is ON', async () => {
    repoMock.bulkSaveSightings.mockResolvedValueOnce([{ id: 'email:abc' }]);
    const result = await handleSaveContacts({
      items: [
        {
          sighting: {
            sourceUrl: 'https://example.com',
            platform: 'wellfound',
            extractedFields: { email: 'sarah@acme.co' },
            confidence: 'high',
          } as never,
          jobId: 'job-1',
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data?.savedCount).toBe(1);
    expect(repoMock.bulkSaveSightings).toHaveBeenCalledTimes(1);
  });

  it('skips items with missing extractedFields', async () => {
    const result = await handleSaveContacts({
      items: [{ sighting: null as never }, { sighting: { extractedFields: null } as never }],
    });
    expect(result.success).toBe(true);
    expect(repoMock.bulkSaveSightings).toHaveBeenCalledWith([]);
  });
});

describe('handleGetContacts', () => {
  it('passes filter through to repo', async () => {
    repoMock.getListView.mockResolvedValueOnce([{ id: '1' }]);
    const result = await handleGetContacts({ filter: { search: 'sarah' } });
    expect(result.success).toBe(true);
    expect(repoMock.getListView).toHaveBeenCalledWith({ search: 'sarah' });
  });

  it('uses empty filter when none provided', async () => {
    await handleGetContacts(undefined);
    expect(repoMock.getListView).toHaveBeenCalledWith({});
  });
});

describe('handleGetContactsForJob', () => {
  it('rejects missing jobId', async () => {
    const result = await handleGetContactsForJob({ jobId: '' });
    expect(result.success).toBe(false);
  });

  it('filters out archived contacts', async () => {
    repoMock.getByJobId.mockResolvedValueOnce([{ id: '1', archivedAt: '2026-01-01' }, { id: '2' }]);
    const result = await handleGetContactsForJob({ jobId: 'job-1' });
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0].id).toBe('2');
  });
});

describe('handleArchiveContact', () => {
  it('archives via repo', async () => {
    repoMock.archive.mockResolvedValueOnce({ id: '1', archivedAt: '2026-04-09' });
    const result = await handleArchiveContact({ id: '1' });
    expect(result.success).toBe(true);
    expect(repoMock.archive).toHaveBeenCalledWith('1');
  });
});

describe('handleBulkDeleteContacts', () => {
  it('rejects missing ids', async () => {
    const result = await handleBulkDeleteContacts({} as never);
    expect(result.success).toBe(false);
  });

  it('removes via repo and returns count', async () => {
    repoMock.bulkRemove.mockResolvedValueOnce(3);
    const result = await handleBulkDeleteContacts({ ids: ['a', 'b', 'c'] });
    expect(result.success).toBe(true);
    expect(result.data?.deletedCount).toBe(3);
  });
});

describe('handleExportContactsCSV', () => {
  it('returns CSV string from the helper', async () => {
    const result = await handleExportContactsCSV();
    expect(result.success).toBe(true);
    expect(result.data?.csv).toBe('csv,here');
  });

  it('handles helper exception', async () => {
    exportCsvMock.mockRejectedValueOnce(new Error('IDB blew up'));
    const result = await handleExportContactsCSV();
    expect(result.success).toBe(false);
  });
});

describe('handleExportContactsVCard', () => {
  it('returns vCard string from the helper', async () => {
    const result = await handleExportContactsVCard();
    expect(result.success).toBe(true);
    expect(result.data?.vcard).toBe('BEGIN:VCARD');
  });
});

describe('handleExtractContactsForJob', () => {
  beforeEach(() => {
    (
      globalThis as unknown as { chrome: { tabs: { sendMessage: ReturnType<typeof vi.fn> } } }
    ).chrome = {
      tabs: { sendMessage: vi.fn().mockResolvedValue(undefined) },
    };
  });

  it('rejects missing tabId or jobId', async () => {
    const result = await handleExtractContactsForJob({ tabId: 0, jobId: '' });
    expect(result.success).toBe(false);
  });

  it('returns triggered: false when feature flag is OFF', async () => {
    flagMock.mockResolvedValueOnce(false);
    const result = await handleExtractContactsForJob({ tabId: 1, jobId: 'job-1' });
    expect(result.success).toBe(true);
    expect(result.data?.triggered).toBe(false);
  });

  it('triggers extraction when feature flag is ON', async () => {
    const result = await handleExtractContactsForJob({ tabId: 1, jobId: 'job-1' });
    expect(result.success).toBe(true);
    expect(result.data?.triggered).toBe(true);
  });

  it('survives a chrome.tabs.sendMessage failure (tab closed)', async () => {
    (
      globalThis as unknown as { chrome: { tabs: { sendMessage: ReturnType<typeof vi.fn> } } }
    ).chrome.tabs.sendMessage = vi.fn().mockRejectedValue(new Error('Tab closed'));
    const result = await handleExtractContactsForJob({ tabId: 1, jobId: 'job-1' });
    expect(result.success).toBe(true);
    expect(result.data?.triggered).toBe(false);
  });
});
