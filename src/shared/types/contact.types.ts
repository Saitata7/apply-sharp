/**
 * Contact CRM types (Workstream 10).
 *
 * The Contact entity is the load-bearing edge that closes the
 * discovery -> application -> outreach loop. Every other piece of
 * ApplySharp ships data to this entity (the JOB_DETECTED extractor,
 * the LinkedIn popup capture, the Greenhouse/Lever/Ashby pages the
 * user browses), and Workstream 5's outreach feature reads from it
 * to draft Gmail messages.
 *
 * Design notes:
 *
 * - The canonical fields are COMPUTED from the sightings array, never
 *   stored separately. This makes the merge logic stateless and
 *   re-runnable when the canonical algorithm changes (e.g. when we
 *   add a manual override field in v2). Computed via
 *   src/core/contacts/dedupe.ts:computeCanonical.
 *
 * - jobIds is a set (modeled as string[] for IDB compatibility), NOT
 *   a single jobId. A founder seen on three different YC job pages
 *   shows up once with three jobIds. The IDB index 'by-job' is
 *   multiEntry so we can query "all contacts for this job" cheaply.
 *
 * - Soft delete via archivedAt + 30-day undo window. Hard delete is a
 *   separate operation only triggered by the user clicking "Delete
 *   permanently" in the Options page.
 *
 * - Contact identity is keyed primarily on email hash, secondarily on
 *   E.164 phone, tertiarily on (name, company) hash. See
 *   dedupe.ts:contactIdFor for the priority ladder.
 */

export type ContactConfidence = 'high' | 'medium' | 'low';

/**
 * Email kind classification:
 *
 * - personal: sarah.chen@acme.co - a real person, highest signal for outreach
 * - role:     careers@acme.co, hiring@acme.co, info@acme.co - useful but generic
 * - noreply:  noreply@..., do-not-reply@..., postmaster@... - never bother
 *
 * The Contacts CRM hides 'noreply' by default and lets the user toggle.
 */
export type EmailKind = 'personal' | 'role' | 'noreply';

/**
 * Per-sighting confidence and aiAssisted flag let the user audit how
 * each piece of canonical data was derived.
 */
export interface ContactSighting {
  /** ISO date when this sighting was captured. */
  capturedAt: string;
  /** Source URL where the sighting came from. */
  sourceUrl: string;
  /** Source platform key (wellfound, greenhouse, lever, ashby, ...). */
  platform: string;
  /** Optional: the jobId we were looking at when this sighting fired. */
  jobId?: string;
  /** Fields extracted in this specific sighting. The Contact's `canonical`
   *  block is computed across ALL sightings, not just the latest. */
  extractedFields: ContactExtractedFields;
  /** Per-sighting confidence (independent of canonical confidence). */
  confidence: ContactConfidence;
  /** True if a Gemini Nano tiebreaker call was used during extraction. */
  aiAssisted?: boolean;
}

/**
 * The fields we try to extract from a contact card / footer / structured
 * data block. All optional because real-world data is messy: a footer
 * might give us only "Contact: hr@acme.co" with no name, and the YC
 * /jobs page might give us a founder name + LinkedIn URL with no email.
 */
export interface ContactExtractedFields {
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  emailKind?: EmailKind;
  /** E.164 normalized: +14155550100. */
  phone?: string;
  linkedinUrl?: string;
  twitterHandle?: string;
}

export interface Contact {
  /**
   * Stable id with prefix indicating which dedup key matched:
   *   email:<sha256-hex>
   *   phone:<e164>
   *   nc:<sha256-hex of name+company>
   *   unknown:<sha256-hex of fields json>
   */
  id: string;

  /**
   * Lossless history. Newest sighting is sightings[sightings.length - 1].
   * NEVER mutate in place; always append + recompute canonical.
   */
  sightings: ContactSighting[];

  /**
   * Job ids this contact was associated with across all sightings.
   * Modeled as an array for IDB multiEntry index compatibility, but
   * deduplicated on every write so semantically a Set.
   */
  jobIds: string[];

  /**
   * Computed canonical fields. NOT stored independently; recomputed
   * from `sightings` on every save via computeCanonical(). The IDB
   * row carries the cached computation so the by-email-hash index
   * works without a recompute scan.
   */
  canonical: ContactExtractedFields;

  /** Optional user notes (manual edit). */
  notes?: string;

  /** Optional user star/favorite. */
  starred?: boolean;

  /** Soft delete: ISO date when the user archived. Cleared on undo. */
  archivedAt?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * Sortable / filterable view used by the Options Contacts table.
 * Computed at the repository layer so the UI does not have to
 * iterate sightings.
 */
export interface ContactListView {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  emailKind: EmailKind | null;
  phone: string;
  platform: string;
  lastSeenAt: string;
  sightingCount: number;
  jobIdsCount: number;
  starred: boolean;
  archived: boolean;
}

/**
 * Filter shape for the Options Contacts table. All filters are
 * AND-combined.
 */
export interface ContactsFilter {
  search?: string;
  platform?: string;
  emailKind?: EmailKind;
  starredOnly?: boolean;
  includeArchived?: boolean;
}

/**
 * Payload for SAVE_CONTACT, sent from content scripts to background.
 * The background receives one of these per extracted contact, dedupes
 * via contactIdFor(), merges via mergeSighting(), and writes to IDB.
 */
export interface SaveContactPayload {
  sighting: Omit<ContactSighting, 'capturedAt'>;
  /** Optional: the job id for the current tab, used to populate jobIds. */
  jobId?: string;
}
