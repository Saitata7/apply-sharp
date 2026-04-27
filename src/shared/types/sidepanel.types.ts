/**
 * Shared types for the side panel <-> background per-tab job context store.
 *
 * The store lives in the background service worker as a Map<tabId, TabJobContext>
 * and is hydrated from the existing JOB_DETECTED message that content scripts
 * already send. Side panel queries via GET_TAB_JOB_CONTEXT and subscribes via
 * a long-lived port for live updates when the user switches tabs.
 *
 * Kept in shared/types so both the background and the side panel reference one
 * source of truth and so unit tests do not need to import from either side.
 */

/**
 * Per-tab job context, derived from what the content script extracts and
 * sends via JOB_DETECTED. Intentionally a SUBSET of ExtractedJob: only the
 * fields the side panel actually renders, to keep the per-tab map small
 * (cap is 50 entries × ~2KB = 100KB worst case).
 */
export interface TabJobContext {
  /** Stable id for the job, prefer source-prefixed (e.g. "linkedin-12345"). */
  jobId: string;
  jobTitle: string;
  companyName: string;
  /** Source platform name, lowercased ("linkedin", "wellfound", etc.). */
  platform: string;
  /** Page URL where the job was detected. */
  url: string;
  /** Optional: short JD text snippet (cap 2KB) for downstream features. */
  jobDescription?: string;
  /** Optional: ISO date string for when the listing was posted. */
  postedDate?: string;
  /** Optional: salary string as extracted, not parsed. */
  salary?: string;
  /** Wall-clock time the context was written. */
  capturedAt: number;
}

/**
 * Port message envelope. The side panel opens a long-lived port named
 * 'sidepanel-tab-context' on mount and receives push updates whenever the
 * user switches tabs or the active tab's job context changes.
 */
export type SidePanelPortMessage =
  | { type: 'CONTEXT_UPDATE'; tabId: number; context: TabJobContext | null }
  | { type: 'TAB_CHANGED'; tabId: number };

/**
 * Response shape for GET_TAB_JOB_CONTEXT.
 */
export interface GetTabJobContextResponse {
  tabId: number | null;
  context: TabJobContext | null;
}
