/**
 * Contact repository (Workstream 10).
 *
 * Mirrors the application.repo.ts pattern: thin IDB CRUD wrapper +
 * dedup-on-save + index-backed queries. The Contact entity is the
 * load-bearing edge that closes the discovery -> application -> outreach
 * loop, so this repo is the single source of truth for contact data.
 *
 * All write paths go through saveSighting() which:
 *   1. Computes the contact id via contactIdFor()
 *   2. Reads any existing contact with that id (atomic IDB transaction)
 *   3. Calls mergeSighting() to append + recompute canonical
 *   4. Writes back in the same transaction
 *
 * Direct put() is exposed for migrations and tests but the production
 * path always uses saveSighting() to avoid clobbering history.
 */

import { getDB } from '../idb-client';
import type {
  Contact,
  ContactSighting,
  ContactsFilter,
  ContactListView,
  EmailKind,
} from '@shared/types/contact.types';
import { contactIdFor, mergeSighting } from '@core/contacts/dedupe';

export const contactRepo = {
  async getAll(): Promise<Contact[]> {
    const db = await getDB();
    return db.getAll('contacts');
  },

  async getById(id: string): Promise<Contact | undefined> {
    const db = await getDB();
    return db.get('contacts', id);
  },

  /**
   * Multi-entry index query: returns all contacts that have this jobId
   * in their jobIds array. This is the hot path for the side panel
   * ContactsCard ("contacts seen for the current job").
   */
  async getByJobId(jobId: string): Promise<Contact[]> {
    if (!jobId) return [];
    const db = await getDB();
    return db.getAllFromIndex('contacts', 'by-job', jobId);
  },

  /**
   * Lookup by exact canonical email (used by the outreach handler when
   * the user manually types an email and we want to surface any prior
   * sightings of that contact).
   */
  async getByEmail(email: string): Promise<Contact | undefined> {
    if (!email) return undefined;
    const db = await getDB();
    const results = await db.getAllFromIndex('contacts', 'by-email-hash', email.toLowerCase());
    return results[0];
  },

  /**
   * The production write path. Computes the contact id from the
   * sighting's extracted fields, reads the existing row (if any),
   * appends the sighting via mergeSighting(), and writes back inside a
   * single readwrite transaction.
   *
   * Returns the merged contact.
   */
  async saveSighting(sighting: ContactSighting, jobId?: string): Promise<Contact> {
    const id = contactIdFor(sighting.extractedFields);
    const db = await getDB();
    const tx = db.transaction('contacts', 'readwrite');
    const existing = (await tx.store.get(id)) ?? null;
    const merged = mergeSighting(existing, sighting, jobId);
    await tx.store.put(merged);
    await tx.done;
    return merged;
  },

  /**
   * Bulk save: many sightings in one transaction. Used by the content
   * script after extractContactsFromDom returns N candidates.
   */
  async bulkSaveSightings(
    sightings: Array<{ sighting: ContactSighting; jobId?: string }>
  ): Promise<Contact[]> {
    if (sightings.length === 0) return [];
    const db = await getDB();
    const tx = db.transaction('contacts', 'readwrite');
    const out: Contact[] = [];
    for (const item of sightings) {
      const id = contactIdFor(item.sighting.extractedFields);
      const existing = (await tx.store.get(id)) ?? null;
      const merged = mergeSighting(existing, item.sighting, item.jobId);
      await tx.store.put(merged);
      out.push(merged);
    }
    await tx.done;
    return out;
  },

  /** Manual edit: write a Contact directly. Used by the Options page
   *  when the user overrides canonical fields. */
  async update(id: string, updates: Partial<Contact>): Promise<Contact | undefined> {
    const db = await getDB();
    const existing = await db.get('contacts', id);
    if (!existing) return undefined;
    const merged: Contact = {
      ...existing,
      ...updates,
      id,
      updatedAt: new Date().toISOString(),
    };
    await db.put('contacts', merged);
    return merged;
  },

  /** Soft delete: set archivedAt. Hard delete via removePermanently. */
  async archive(id: string): Promise<Contact | undefined> {
    return this.update(id, { archivedAt: new Date().toISOString() });
  },

  /** Restore from soft delete. */
  async unarchive(id: string): Promise<Contact | undefined> {
    return this.update(id, { archivedAt: undefined });
  },

  async removePermanently(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('contacts', id);
  },

  async bulkRemove(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const db = await getDB();
    const tx = db.transaction('contacts', 'readwrite');
    let count = 0;
    for (const id of ids) {
      try {
        await tx.store.delete(id);
        count++;
      } catch {
        // continue
      }
    }
    await tx.done;
    return count;
  },

  /**
   * Filter and project contacts into the table view used by the
   * Options Contacts page. Filters AND-combine.
   */
  async getListView(filter: ContactsFilter = {}): Promise<ContactListView[]> {
    const all = await this.getAll();
    const lower = filter.search?.toLowerCase();
    const out: ContactListView[] = [];
    for (const c of all) {
      if (!filter.includeArchived && c.archivedAt) continue;
      if (filter.starredOnly && !c.starred) continue;
      if (filter.emailKind && c.canonical.emailKind !== filter.emailKind) continue;
      if (filter.platform) {
        const seenOn = c.sightings.some((s) => s.platform === filter.platform);
        if (!seenOn) continue;
      }
      if (lower) {
        const hay = [c.canonical.name, c.canonical.title, c.canonical.company, c.canonical.email]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(lower)) continue;
      }
      const lastSighting = c.sightings[c.sightings.length - 1];
      out.push({
        id: c.id,
        name: c.canonical.name ?? '',
        title: c.canonical.title ?? '',
        company: c.canonical.company ?? '',
        email: c.canonical.email ?? '',
        emailKind: (c.canonical.emailKind as EmailKind) ?? null,
        phone: c.canonical.phone ?? '',
        platform: lastSighting?.platform ?? '',
        lastSeenAt: lastSighting?.capturedAt ?? c.updatedAt,
        sightingCount: c.sightings.length,
        jobIdsCount: c.jobIds.length,
        starred: !!c.starred,
        archived: !!c.archivedAt,
      });
    }
    // Sort by last seen, newest first
    out.sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
    return out;
  },

  async count(): Promise<number> {
    const db = await getDB();
    return db.count('contacts');
  },
};
