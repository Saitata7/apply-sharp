/**
 * Contact handlers (Workstream 10).
 *
 * Background message handlers for the Contact CRM. The content script
 * extracts contact candidates and sends them here via SAVE_CONTACTS;
 * the side panel queries via GET_CONTACTS / GET_CONTACTS_FOR_JOB; the
 * Options Contacts page does the bulk operations.
 *
 * The race-free EXTRACT_CONTACTS_FOR_JOB trigger is in
 * src/background/index.ts (after JOB_DETECTED persists), not here.
 */

import type { MessageResponse } from '@shared/utils/messaging';
import type {
  Contact,
  ContactSighting,
  ContactsFilter,
  ContactListView,
  SaveContactPayload,
} from '@shared/types/contact.types';
import { contactRepo } from '@storage/index';
import { exportContactsCSV, exportContactsVCard } from '@storage/export-import';
import { isFeatureEnabled } from '@shared/feature-flags';

/**
 * Save one or more contact sightings. Called by the content script
 * after extractContactsFromDom returns candidates. Each item is merged
 * via contactRepo.saveSighting (which dedupes + recomputes canonical).
 *
 * Gated by the contacts.passiveExtraction feature flag. If the flag is
 * off, the handler returns success but does not write anything. This
 * keeps the content script simple: it always sends, the background
 * decides whether to persist.
 */
export async function handleSaveContacts(payload: {
  items: SaveContactPayload[];
}): Promise<MessageResponse<{ savedCount: number }>> {
  try {
    if (!payload?.items || !Array.isArray(payload.items)) {
      return { success: false, error: 'items array required' };
    }
    const enabled = await isFeatureEnabled('contacts.passiveExtraction');
    if (!enabled) {
      return { success: true, data: { savedCount: 0 } };
    }
    const sightings: Array<{ sighting: ContactSighting; jobId?: string }> = [];
    for (const item of payload.items) {
      if (!item?.sighting?.extractedFields) continue;
      // Stamp capturedAt at the background side so the timestamp is
      // authoritative (content scripts can have skewed clocks).
      const stamped: ContactSighting = {
        ...item.sighting,
        capturedAt: new Date().toISOString(),
      };
      sightings.push({ sighting: stamped, jobId: item.jobId });
    }
    const saved = await contactRepo.bulkSaveSightings(sightings);
    return { success: true, data: { savedCount: saved.length } };
  } catch (err) {
    console.error('[ContactHandler] saveContacts failed:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function handleGetContacts(
  payload: { filter?: ContactsFilter } | undefined
): Promise<MessageResponse<ContactListView[]>> {
  try {
    const list = await contactRepo.getListView(payload?.filter ?? {});
    return { success: true, data: list };
  } catch (err) {
    console.error('[ContactHandler] getContacts failed:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function handleGetContactsForJob(payload: {
  jobId: string;
}): Promise<MessageResponse<Contact[]>> {
  try {
    if (!payload?.jobId) {
      return { success: false, error: 'jobId required' };
    }
    const contacts = await contactRepo.getByJobId(payload.jobId);
    // Filter out archived from the side panel view by default
    return { success: true, data: contacts.filter((c) => !c.archivedAt) };
  } catch (err) {
    console.error('[ContactHandler] getContactsForJob failed:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function handleGetContactById(payload: {
  id: string;
}): Promise<MessageResponse<Contact | null>> {
  try {
    if (!payload?.id) return { success: false, error: 'id required' };
    const c = await contactRepo.getById(payload.id);
    return { success: true, data: c ?? null };
  } catch (err) {
    console.error('[ContactHandler] getContactById failed:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function handleUpdateContact(payload: {
  id: string;
  updates: Partial<Contact>;
}): Promise<MessageResponse<Contact | null>> {
  try {
    if (!payload?.id) return { success: false, error: 'id required' };
    const updated = await contactRepo.update(payload.id, payload.updates);
    return { success: true, data: updated ?? null };
  } catch (err) {
    console.error('[ContactHandler] updateContact failed:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function handleArchiveContact(payload: {
  id: string;
}): Promise<MessageResponse<Contact | null>> {
  try {
    const archived = await contactRepo.archive(payload.id);
    return { success: true, data: archived ?? null };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function handleBulkDeleteContacts(payload: {
  ids: string[];
}): Promise<MessageResponse<{ deletedCount: number }>> {
  try {
    if (!payload?.ids || !Array.isArray(payload.ids)) {
      return { success: false, error: 'ids array required' };
    }
    const count = await contactRepo.bulkRemove(payload.ids);
    return { success: true, data: { deletedCount: count } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Trigger contact extraction in a specific tab. Sent FROM the
 * background TO the content script after JOB_DETECTED has persisted
 * the job (so the contact extractor knows the jobId for association).
 *
 * The content script lazy-imports the extractor module and runs it
 * against the live DOM, then sends SAVE_CONTACTS back to the
 * background. This handler just kicks off the request.
 */
export async function handleExtractContactsForJob(payload: {
  tabId: number;
  jobId: string;
}): Promise<MessageResponse<{ triggered: boolean }>> {
  try {
    if (!payload?.tabId || !payload?.jobId) {
      return { success: false, error: 'tabId and jobId required' };
    }
    const enabled = await isFeatureEnabled('contacts.passiveExtraction');
    if (!enabled) {
      return { success: true, data: { triggered: false } };
    }
    try {
      await chrome.tabs.sendMessage(payload.tabId, {
        type: 'EXTRACT_CONTACTS_FOR_JOB',
        payload: { jobId: payload.jobId },
      });
    } catch {
      // Tab may have closed or content script may not be loaded
      return { success: true, data: { triggered: false } };
    }
    return { success: true, data: { triggered: true } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Workstream 10 iter-2: export the contacts CRM as a CSV string. The
 * Options page calls this handler, then triggers a Blob download from
 * the returned text. Filename and Blob lifecycle are owned by the UI
 * because the background service worker has no DOM and cannot create
 * download URLs directly.
 */
export async function handleExportContactsCSV(): Promise<MessageResponse<{ csv: string }>> {
  try {
    const csv = await exportContactsCSV();
    return { success: true, data: { csv } };
  } catch (err) {
    console.error('[ContactHandler] CSV export failed:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function handleExportContactsVCard(): Promise<MessageResponse<{ vcard: string }>> {
  try {
    const vcard = await exportContactsVCard();
    return { success: true, data: { vcard } };
  } catch (err) {
    console.error('[ContactHandler] vCard export failed:', err);
    return { success: false, error: (err as Error).message };
  }
}
