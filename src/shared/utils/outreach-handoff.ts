/**
 * Outreach handoff (Workstream 10 iter-3).
 *
 * Shared writer / reader for the chrome.storage.local "outreachHandoff" key
 * used by ContactsCard (sidepanel) and the Contacts CRM page (options) to
 * pre-fill the Outreach composer with a captured contact.
 *
 * Iter-2 introduced two near-identical inline copies of this writer in
 * ContactsCard.tsx and Contacts.tsx. The Code reviewer flagged the drift
 * risk; iter-3 extracts both into this single util so the shape is
 * defined in exactly one place. The Outreach page consumes the same key
 * via readOutreachHandoff() on mount, then deletes it.
 *
 * Why chrome.storage.local instead of message passing? The Outreach page
 * is in a separate document (the options page) and may not be open yet
 * when the user clicks "Draft email". The handoff must survive an
 * options-page mount, which is why it lives in storage rather than as
 * a runtime message.
 */

const HANDOFF_KEY = 'outreachHandoff';
/** Drop handoffs older than this so a stale write does not pre-fill a future, unrelated session. */
const HANDOFF_MAX_AGE_MS = 5 * 60 * 1000;

export interface OutreachHandoff {
  /** Stable contact id from the contact repo (email/phone/nc hash). */
  contactId: string;
  recipientName?: string;
  recipientTitle?: string;
  recipientEmail?: string;
  companyName?: string;
  /** Job id the contact was associated with, when known (sidepanel path). */
  jobId?: string;
  /** Epoch ms when the handoff was written. Used for staleness check. */
  createdAt: number;
}

/**
 * Write a handoff to chrome.storage.local. Best-effort; errors are swallowed
 * with a console.warn so the calling button does not throw if storage is
 * temporarily unavailable.
 */
export async function writeOutreachHandoff(
  handoff: Omit<OutreachHandoff, 'createdAt'>
): Promise<void> {
  try {
    const payload: OutreachHandoff = { ...handoff, createdAt: Date.now() };
    await chrome.storage.local.set({ [HANDOFF_KEY]: payload });
  } catch (err) {
    console.warn('[outreach-handoff] write failed:', err);
  }
}

/**
 * Read and consume a handoff from chrome.storage.local. Returns null if no
 * handoff is present, if the stored blob is malformed, or if the handoff
 * is older than HANDOFF_MAX_AGE_MS.
 *
 * The key is removed for ANY non-empty stored value (valid, malformed, or
 * stale) so a corrupt blob cannot sit in storage forever waiting for a
 * future page mount. Iter-4 fix: previously the contactId guard returned
 * early before reaching the remove() call, leaking malformed blobs.
 */
export async function readOutreachHandoff(): Promise<OutreachHandoff | null> {
  try {
    const got = await chrome.storage.local.get(HANDOFF_KEY);
    const raw = got?.[HANDOFF_KEY] as OutreachHandoff | undefined;
    if (raw === undefined || raw === null) return null;
    // Remove BEFORE any validation so malformed/stale blobs are cleaned up
    // and a refresh does not re-apply the same handoff.
    await chrome.storage.local.remove(HANDOFF_KEY);
    if (typeof raw !== 'object' || !raw.contactId) return null;
    if (typeof raw.createdAt !== 'number' || Date.now() - raw.createdAt > HANDOFF_MAX_AGE_MS) {
      return null;
    }
    return raw;
  } catch (err) {
    console.warn('[outreach-handoff] read failed:', err);
    return null;
  }
}
