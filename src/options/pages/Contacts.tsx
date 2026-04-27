/**
 * Contacts CRM page (Workstream 10).
 *
 * Full options-page CRM table for contacts captured by the WS10 extractor.
 *
 * Features:
 *   - First-run consent dialog (gates the feature)
 *   - Search + platform + email-kind filters
 *   - Bulk select + delete + CSV export + vCard export
 *   - Per-row: star, archive, draft email
 *   - Detail drawer with sighting history
 *   - Per-domain blocklist toggle
 *
 * The Contacts page is the canonical source of truth for the CRM. The
 * sidepanel ContactsCard is a contextual subset (current job only).
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import { writeOutreachHandoff } from '@shared/utils/outreach-handoff';
import { isFeatureEnabled, setFeatureEnabled, type FeatureFlagKey } from '@shared/feature-flags';
import {
  getUserBlocklist,
  addUserBlocklistDomain,
  removeUserBlocklistDomain,
  normalizeBlocklistDomain,
} from '@core/contacts/blocklist';
import type {
  Contact,
  ContactListView,
  ContactsFilter,
  EmailKind,
} from '@shared/types/contact.types';

const PASSIVE_FLAG: FeatureFlagKey = 'contacts.passiveExtraction';

export default function Contacts(): JSX.Element {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [contacts, setContacts] = useState<ContactListView[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<ContactsFilter>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Contact | null>(null);

  // Read the feature flag on mount.
  useEffect(() => {
    let cancelled = false;
    void isFeatureEnabled(PASSIVE_FLAG).then((on) => {
      if (!cancelled) setEnabled(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await sendMessage<{ filter: ContactsFilter }, ContactListView[]>({
        type: 'GET_CONTACTS',
        payload: { filter },
      });
      if (res?.success && res.data) {
        setContacts(res.data);
      } else if (res?.error) {
        // Iter-2 fix: surface real errors instead of falling through to the
        // empty state. The empty state should mean "no contacts captured",
        // not "the IDB layer is broken".
        setError(res.error);
        setContacts([]);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (enabled) void fetchList();
  }, [enabled, fetchList]);

  async function acceptConsent(): Promise<void> {
    await setFeatureEnabled(PASSIVE_FLAG, true);
    // Iter-2 fix: store the consent timestamp per the plan's privacy posture.
    // Used by the Options page to surface "you enabled this on {date}" later
    // if needed for compliance / audit.
    try {
      await chrome.storage.local.set({
        'contacts.consentAcceptedAt': new Date().toISOString(),
      });
    } catch {
      // best-effort, non-blocking
    }
    setEnabled(true);
  }

  async function disablePassive(): Promise<void> {
    await setFeatureEnabled(PASSIVE_FLAG, false);
    setEnabled(false);
  }

  const toggleSelect = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = (): void => {
    setSelectedIds(new Set(contacts.map((c) => c.id)));
  };

  const clearSelection = (): void => setSelectedIds(new Set());

  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);

  async function bulkDelete(): Promise<void> {
    if (selectedIds.size === 0) return;
    // Two-step confirm via inline banner instead of native confirm()
    if (!pendingBulkDelete) {
      setPendingBulkDelete(true);
      return;
    }
    setPendingBulkDelete(false);
    await sendMessage<{ ids: string[] }, { deletedCount: number }>({
      type: 'BULK_DELETE_CONTACTS',
      payload: { ids: Array.from(selectedIds) },
    });
    clearSelection();
    void fetchList();
  }

  async function archiveContact(id: string): Promise<void> {
    await sendMessage({ type: 'ARCHIVE_CONTACT', payload: { id } });
    void fetchList();
  }

  /**
   * Workstream 10 iter-2: download the entire contacts CRM as CSV via the
   * background EXPORT_CONTACTS_CSV handler. We construct the Blob in the
   * Options page (the only context with a DOM) so the background does
   * not need to deal with download URLs.
   */
  async function exportCsv(): Promise<void> {
    const res = await sendMessage<undefined, { csv: string }>({ type: 'EXPORT_CONTACTS_CSV' });
    if (!res?.success || !res.data) return;
    downloadBlob(res.data.csv, 'applysharp-contacts.csv', 'text/csv;charset=utf-8');
  }

  async function exportVcard(): Promise<void> {
    const res = await sendMessage<undefined, { vcard: string }>({ type: 'EXPORT_CONTACTS_VCARD' });
    if (!res?.success || !res.data) return;
    downloadBlob(res.data.vcard, 'applysharp-contacts.vcf', 'text/vcard;charset=utf-8');
  }

  function downloadBlob(content: string, filename: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Wired into ContactsTable below.
  const toggleStar = async (c: ContactListView): Promise<void> => {
    await sendMessage({
      type: 'UPDATE_CONTACT',
      payload: { id: c.id, updates: { starred: !c.starred } },
    });
    void fetchList();
  };

  /**
   * Per-row Draft email handler. Delegates the storage write to the shared
   * writeOutreachHandoff util so the sidepanel ContactsCard and this CRM
   * page cannot drift in shape. The Outreach page reads and removes the
   * handoff on mount via readOutreachHandoff().
   */
  const draftEmailForRow = async (c: ContactListView): Promise<void> => {
    if (!c.email) return;
    await writeOutreachHandoff({
      contactId: c.id,
      recipientName: c.name,
      recipientTitle: c.title,
      recipientEmail: c.email,
      companyName: c.company,
    });
    try {
      await chrome.runtime.sendMessage({
        type: 'OPEN_OPTIONS',
        payload: { tab: 'outreach' },
      });
    } catch (err) {
      console.warn('[Contacts] OPEN_OPTIONS failed:', err);
    }
  };

  async function viewDetail(id: string): Promise<void> {
    const res = await sendMessage<{ id: string }, Contact | null>({
      type: 'GET_CONTACT_BY_ID',
      payload: { id },
    });
    if (res?.success && res.data) {
      setDetail(res.data);
    }
  }

  // Aggregate platforms for the filter dropdown
  const platformOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) if (c.platform) set.add(c.platform);
    return Array.from(set).sort();
  }, [contacts]);

  if (enabled === null) {
    return (
      <div style={{ padding: 24 }}>
        <p>Loading contacts settings...</p>
      </div>
    );
  }

  // Pre-consent: show the consent dialog AND the LinkedIn floating button
  // panel so the user can find the LinkedIn opt-in toggle even if they
  // have not enabled passive contact capture yet. The two opt-ins are
  // independent: the LinkedIn floating button is its own privacy decision.
  if (!enabled) {
    return (
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <ConsentDialog onAccept={acceptConsent} />
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <LinkedInFloatingButtonPanel />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Contacts</h1>
        <p style={{ margin: '4px 0 0 0', color: 'var(--tx-secondary)', fontSize: 13 }}>
          Hiring contacts captured from job and company pages you browse. Local-first; nothing
          leaves your machine.
        </p>
      </header>

      <ContactsFilterBar
        filter={filter}
        onFilterChange={setFilter}
        platforms={platformOptions}
        contactCount={contacts.length}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <button type="button" onClick={exportCsv} style={btnGhostStyle}>
          Export all to CSV
        </button>
        <button type="button" onClick={exportVcard} style={btnGhostStyle}>
          Export all to vCard
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          style={{
            padding: '8px 12px',
            background: 'var(--sf-overlay)',
            border: '1px solid var(--bd-default)',
            borderRadius: 6,
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <strong>{selectedIds.size} selected</strong>
          {pendingBulkDelete ? (
            <>
              <span style={{ color: 'var(--cl-rose)', fontSize: 13 }}>
                Delete {selectedIds.size} contacts permanently?
              </span>
              <button type="button" onClick={bulkDelete} style={btnDangerStyle}>
                Yes, delete
              </button>
              <button
                type="button"
                onClick={() => setPendingBulkDelete(false)}
                style={btnGhostStyle}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={bulkDelete} style={btnDangerStyle}>
                Delete
              </button>
              <button type="button" onClick={clearSelection} style={btnGhostStyle}>
                Clear selection
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            background: 'var(--cl-rose-glow)',
            border: '1px solid var(--cl-rose-glow)',
            borderRadius: 6,
            color: 'var(--cl-rose)',
            marginBottom: 12,
          }}
        >
          <strong>Could not load contacts:</strong> {error}
          <button type="button" onClick={fetchList} style={{ ...btnGhostStyle, marginLeft: 12 }}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--tx-secondary)' }}>Loading contacts...</p>
      ) : contacts.length === 0 ? (
        <EmptyContactsState />
      ) : (
        <ContactsTable
          contacts={contacts}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          onArchive={archiveContact}
          onViewDetail={viewDetail}
          onToggleStar={toggleStar}
          onDraftEmail={draftEmailForRow}
        />
      )}

      <BlockedDomainsPanel />

      <LinkedInFloatingButtonPanel />

      <footer style={{ marginTop: 16, fontSize: 11, color: 'var(--tx-muted)' }}>
        <button type="button" onClick={disablePassive} style={btnGhostStyle}>
          Pause contact extraction
        </button>
      </footer>

      {detail && <ContactDetailDrawer contact={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

// ============================================================================
// Blocked domains panel (WS10.5)
// ============================================================================

/**
 * User-curated per-domain blocklist. Domains added here are honored by
 * the content-script extractor entry point: pages on the listed hostnames
 * never get scraped. Use to exclude personal blogs, internal tools, etc.
 */
function BlockedDomainsPanel(): JSX.Element {
  const [domains, setDomains] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    void getUserBlocklist().then(setDomains);
  }, []);

  async function handleAdd(): Promise<void> {
    setError(null);
    const normalized = normalizeBlocklistDomain(input);
    if (!normalized) {
      setError('Enter a domain like "acme.com"');
      return;
    }
    if (domains.includes(normalized)) {
      setError(`${normalized} is already blocked`);
      return;
    }
    const next = await addUserBlocklistDomain(normalized);
    setDomains(next);
    setInput('');
  }

  async function handleRemove(domain: string): Promise<void> {
    const next = await removeUserBlocklistDomain(domain);
    setDomains(next);
  }

  return (
    <section
      style={{
        marginTop: 24,
        padding: 16,
        background: 'var(--sf-overlay)',
        border: '1px solid var(--bd-default)',
        borderRadius: 8,
      }}
      aria-labelledby="blocked-domains-heading"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="blocked-domains-body"
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h2 id="blocked-domains-heading" style={{ margin: 0, fontSize: 14 }}>
          Blocked domains
          {domains.length > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--tx-secondary)', fontWeight: 400 }}>
              ({domains.length})
            </span>
          )}
        </h2>
        <span aria-hidden="true" style={{ color: 'var(--tx-secondary)', fontSize: 12 }}>
          {expanded ? 'Hide' : 'Show'}
        </span>
      </button>
      {expanded && (
        <div id="blocked-domains-body" style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 8px 0', fontSize: 12, color: 'var(--tx-secondary)' }}>
            Pages on these hostnames are never scraped. Add a domain like{' '}
            <code style={{ background: 'var(--sf-overlay)', padding: '1px 4px', borderRadius: 3 }}>
              acme.com
            </code>{' '}
            to skip it and all subdomains. Personal webmail and bank/health TLDs are already blocked
            by default.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleAdd();
                }
              }}
              placeholder="acme.com"
              aria-label="Domain to block"
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 4,
                border: '1px solid var(--bd-default)',
                fontSize: 13,
              }}
            />
            <button
              type="button"
              onClick={handleAdd}
              style={{
                padding: '6px 14px',
                background: 'var(--brand)',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Add
            </button>
          </div>
          {error && (
            <div role="alert" style={{ color: 'var(--cl-rose)', fontSize: 12, marginBottom: 8 }}>
              {error}
            </div>
          )}
          {domains.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--tx-muted)' }}>
              No custom domains blocked. The default blocklist still applies.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {domains.map((d) => (
                <li
                  key={d}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 0',
                    borderTop: '1px solid #e2e8f0',
                    fontSize: 13,
                  }}
                >
                  <span>{d}</span>
                  <button
                    type="button"
                    onClick={() => void handleRemove(d)}
                    aria-label={`Remove ${d} from blocklist`}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--bd-default)',
                      borderRadius: 4,
                      padding: '2px 8px',
                      fontSize: 11,
                      color: 'var(--tx-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// LinkedIn integration panel (WS10.5+, opt-in)
// ============================================================================

const LINKEDIN_INJECT_FLAG: FeatureFlagKey = 'linkedin.injectFloatingButton';
const LINKEDIN_AUTO_EXTRACT_FLAG: FeatureFlagKey = 'linkedin.autoExtractJobs';
const LINKEDIN_JOBS_FEED_FLAG: FeatureFlagKey = 'linkedin.jobsFeedSignals';
const DISCOVERY_LEAD_LIST_FLAG: FeatureFlagKey = 'discovery.leadList';

/**
 * Opt-in toggles for LinkedIn integration. Two independent flags:
 *
 *   1. linkedin.autoExtractJobs (lower risk, recommended)
 *      Auto-reads the current LinkedIn job and populates the side panel
 *      with Job Insights / Ghost Score / Discovery cards. No DOM
 *      mutation - read-only document.querySelector pass.
 *
 *   2. linkedin.injectFloatingButton (higher risk, opt-in only)
 *      Injects a visible "AS" floating button at the bottom right of
 *      LinkedIn pages so you can capture contacts in one click. DOM
 *      mutation visible to LinkedIn's BrowserGate fingerprinter.
 *
 * Both default OFF. Default-install users have ZERO LinkedIn surface.
 */
function LinkedInFloatingButtonPanel(): JSX.Element {
  const [autoExtract, setAutoExtract] = useState<boolean | null>(null);
  const [injectButton, setInjectButton] = useState<boolean | null>(null);
  const [jobsFeed, setJobsFeed] = useState<boolean | null>(null);
  const [leadList, setLeadList] = useState<boolean | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  // Default expanded so the toggles are immediately visible. The user has
  // been looking for this and a collapsed-by-default section is too easy
  // to miss.
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    void isFeatureEnabled(LINKEDIN_AUTO_EXTRACT_FLAG).then(setAutoExtract);
    void isFeatureEnabled(LINKEDIN_INJECT_FLAG).then(setInjectButton);
    void isFeatureEnabled(LINKEDIN_JOBS_FEED_FLAG).then(setJobsFeed);
    void isFeatureEnabled(DISCOVERY_LEAD_LIST_FLAG).then(setLeadList);
  }, []);

  async function handleToggleAutoExtract(): Promise<void> {
    const next = !autoExtract;
    await setFeatureEnabled(LINKEDIN_AUTO_EXTRACT_FLAG, next);
    setAutoExtract(next);
  }

  function handleToggleInjectButton(): void {
    if (injectButton) {
      void setFeatureEnabled(LINKEDIN_INJECT_FLAG, false).then(() => setInjectButton(false));
      return;
    }
    setShowWarning(true);
  }

  function handleAcceptWarning(): void {
    void setFeatureEnabled(LINKEDIN_INJECT_FLAG, true).then(() => {
      setInjectButton(true);
      setShowWarning(false);
    });
  }

  async function handleToggleJobsFeed(): Promise<void> {
    const next = !jobsFeed;
    await setFeatureEnabled(LINKEDIN_JOBS_FEED_FLAG, next);
    setJobsFeed(next);
  }

  async function handleToggleLeadList(): Promise<void> {
    const next = !leadList;
    await setFeatureEnabled(DISCOVERY_LEAD_LIST_FLAG, next);
    setLeadList(next);
  }

  return (
    <section
      style={{
        marginTop: 16,
        padding: 16,
        background: 'var(--cl-orange-glow)',
        border: '1px solid var(--cl-orange-glow)',
        borderRadius: 8,
      }}
      aria-labelledby="li-integration-heading"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="li-integration-body"
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h2
          id="li-integration-heading"
          style={{ margin: 0, fontSize: 14, color: 'var(--cl-orange)' }}
        >
          LinkedIn integration (advanced)
          {(autoExtract || injectButton) && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                background: 'var(--cl-emerald)',
                color: '#fff',
                padding: '1px 6px',
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              ON
            </span>
          )}
        </h2>
        <span aria-hidden="true" style={{ color: 'var(--cl-orange)', fontSize: 12 }}>
          {expanded ? 'Hide' : 'Show'}
        </span>
      </button>
      {expanded && (
        <div id="li-integration-body" style={{ marginTop: 12 }}>
          {/* ── Toggle 1: auto-extract jobs (lower risk, recommended) ── */}
          <div
            style={{
              padding: 12,
              background: 'var(--sf-raised)',
              border: '1px solid var(--cl-orange-glow)',
              borderRadius: 6,
              marginBottom: 12,
            }}
          >
            <h3
              style={{
                margin: '0 0 6px 0',
                fontSize: 13,
                color: 'var(--tx-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              Auto-show ATS score on LinkedIn jobs
              {autoExtract && (
                <span
                  style={{
                    fontSize: 10,
                    background: 'var(--cl-emerald)',
                    color: '#fff',
                    padding: '1px 6px',
                    borderRadius: 10,
                    fontWeight: 600,
                  }}
                >
                  ON
                </span>
              )}
            </h3>
            <p
              style={{
                margin: '0 0 8px 0',
                fontSize: 12,
                color: 'var(--tx-secondary)',
                lineHeight: 1.5,
              }}
            >
              When you open a LinkedIn job, ApplySharp automatically reads the title, company, and
              description, then populates the side panel with the ATS match score, ghost-job score,
              and discovery insights for that role. Open the side panel from the Chrome toolbar and
              pin it open to see scores update as you browse.
            </p>
            <p
              style={{
                margin: '0 0 10px 0',
                fontSize: 11,
                color: 'var(--tx-secondary)',
                fontStyle: 'italic',
              }}
            >
              Read-only: no DOM is added to the LinkedIn page. Lower fingerprint risk than the
              floating button below.
            </p>
            {autoExtract === null ? (
              <p style={{ fontSize: 12, color: 'var(--cl-orange)' }}>Loading...</p>
            ) : (
              <button
                type="button"
                onClick={() => void handleToggleAutoExtract()}
                style={{
                  padding: '8px 16px',
                  background: autoExtract ? 'var(--cl-rose)' : 'var(--brand)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {autoExtract
                  ? 'Disable auto ATS score on LinkedIn'
                  : 'Enable auto ATS score on LinkedIn'}
              </button>
            )}
          </div>

          {/* ── Toggle 1b: jobs-feed signal badges (medium risk) ── */}
          <div
            style={{
              padding: 12,
              background: 'var(--sf-raised)',
              border: '1px solid var(--cl-orange-glow)',
              borderRadius: 6,
              marginBottom: 12,
            }}
          >
            <h3
              style={{
                margin: '0 0 6px 0',
                fontSize: 13,
                color: 'var(--tx-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              Job-card signal badges (high / medium / low)
              {jobsFeed && (
                <span
                  style={{
                    fontSize: 10,
                    background: 'var(--cl-emerald)',
                    color: '#fff',
                    padding: '1px 6px',
                    borderRadius: 10,
                    fontWeight: 600,
                  }}
                >
                  ON
                </span>
              )}
            </h3>
            <p
              style={{
                margin: '0 0 8px 0',
                fontSize: 12,
                color: 'var(--tx-secondary)',
                lineHeight: 1.5,
              }}
            >
              On every card in the LinkedIn jobs left rail, shows a small badge with a high / medium
              / low score and a ghost-job warning. Hover for the reasons. Scoring uses your target
              roles, target companies, location, posting age, applicant volume, and a tracker
              cross-check for reposts. No AI calls, no network round-trips.
            </p>
            <p
              style={{
                margin: '0 0 10px 0',
                fontSize: 11,
                color: 'var(--tx-secondary)',
                fontStyle: 'italic',
              }}
            >
              Activates on /jobs/search and /jobs/collections/* only. Single-job pages keep the
              existing ATS sidebar. Lower fingerprint risk than the floating button (Shadow DOM
              isolated, randomized class names per session) but still mutates the page.
            </p>
            {jobsFeed === null ? (
              <p style={{ fontSize: 12, color: 'var(--cl-orange)' }}>Loading...</p>
            ) : (
              <button
                type="button"
                onClick={() => void handleToggleJobsFeed()}
                style={{
                  padding: '8px 16px',
                  background: jobsFeed ? 'var(--cl-rose)' : 'var(--brand)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {jobsFeed ? 'Disable job-card signal badges' : 'Enable job-card signal badges'}
              </button>
            )}
          </div>

          {/* ── Toggle 1c: sponsor-filtered lead list (low risk) ── */}
          <div
            style={{
              padding: 12,
              background: 'var(--sf-raised)',
              border: '1px solid var(--cl-orange-glow)',
              borderRadius: 6,
              marginBottom: 12,
            }}
          >
            <h3
              style={{
                margin: '0 0 6px 0',
                fontSize: 13,
                color: 'var(--tx-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              Today&apos;s leads (sponsor-filtered)
              {leadList && (
                <span
                  style={{
                    fontSize: 10,
                    background: 'var(--cl-emerald)',
                    color: '#fff',
                    padding: '1px 6px',
                    borderRadius: 10,
                    fontWeight: 600,
                  }}
                >
                  ON
                </span>
              )}
            </h3>
            <p
              style={{
                margin: '0 0 8px 0',
                fontSize: 12,
                color: 'var(--tx-secondary)',
                lineHeight: 1.5,
              }}
            >
              Daily-refreshed list of 5-10 companies that just hit a hiring trigger (funding round,
              product launch, expansion) AND have filed H-1B in the most recent fiscal year. Pulls
              free signals from HN; cross-checks against the local DOL LCA index. Each lead links
              straight to LinkedIn jobs filtered by your role keywords. Renders in the side panel.
            </p>
            <p
              style={{
                margin: '0 0 10px 0',
                fontSize: 11,
                color: 'var(--tx-secondary)',
                fontStyle: 'italic',
              }}
            >
              Requires the optional hn.algolia.com host permission (you&apos;ll be prompted on first
              refresh). For the visa-friendly badge, run{' '}
              <code>tools/job-search/dol-process.py</code> against the latest LCA XLSX, then
              rebuild. Without it, leads still surface but the badge is hidden.
            </p>
            {leadList === null ? (
              <p style={{ fontSize: 12, color: 'var(--cl-orange)' }}>Loading...</p>
            ) : (
              <button
                type="button"
                onClick={() => void handleToggleLeadList()}
                style={{
                  padding: '8px 16px',
                  background: leadList ? 'var(--cl-rose)' : 'var(--brand)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {leadList ? 'Disable today’s leads' : 'Enable today’s leads'}
              </button>
            )}
          </div>

          {/* ── Toggle 2: floating button (higher risk) ── */}
          <div
            style={{
              padding: 12,
              background: 'var(--sf-raised)',
              border: '1px solid var(--cl-orange-glow)',
              borderRadius: 6,
            }}
          >
            <h3
              style={{
                margin: '0 0 6px 0',
                fontSize: 13,
                color: 'var(--tx-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              Floating capture button on LinkedIn
              {injectButton && (
                <span
                  style={{
                    fontSize: 10,
                    background: 'var(--cl-emerald)',
                    color: '#fff',
                    padding: '1px 6px',
                    borderRadius: 10,
                    fontWeight: 600,
                  }}
                >
                  ON
                </span>
              )}
            </h3>
            <p
              style={{
                margin: '0 0 8px 0',
                fontSize: 12,
                color: 'var(--tx-secondary)',
                lineHeight: 1.5,
              }}
            >
              Injects a visible blue button at the bottom right of LinkedIn profile and job pages so
              you can capture the contact in one click without opening the popup or side panel.
              Works the same way Simplify and other LinkedIn extensions do.
            </p>
            <p
              style={{
                margin: '0 0 10px 0',
                padding: '8px 10px',
                background: 'var(--cl-rose-glow)',
                border: '1px solid var(--cl-rose-glow)',
                borderRadius: 4,
                fontSize: 11,
                color: 'var(--cl-rose)',
                lineHeight: 1.5,
              }}
            >
              <strong>Higher risk:</strong> LinkedIn ships an extension fingerprinter (BrowserGate +
              Spectroscopy as of Feb 2026). Extensions that inject DOM on linkedin.com pages
              contribute to a documented ~23% account-restriction rate within 90 days. Enable only
              on accounts you can afford to lose.
            </p>
            {injectButton === null ? (
              <p style={{ fontSize: 12, color: 'var(--cl-orange)' }}>Loading...</p>
            ) : (
              <button
                type="button"
                onClick={handleToggleInjectButton}
                style={{
                  padding: '8px 16px',
                  background: injectButton ? 'var(--cl-rose)' : 'var(--brand)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {injectButton
                  ? 'Disable LinkedIn floating button'
                  : 'Enable LinkedIn floating button'}
              </button>
            )}
          </div>
        </div>
      )}

      {showWarning && (
        <LinkedInWarningDialog
          onAccept={handleAcceptWarning}
          onCancel={() => setShowWarning(false)}
        />
      )}
    </section>
  );
}

function LinkedInWarningDialog({
  onAccept,
  onCancel,
}: {
  onAccept: () => void;
  onCancel: () => void;
}): JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="li-warning-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--sf-raised)',
          padding: 24,
          borderRadius: 12,
          maxWidth: 540,
          width: '90%',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        }}
      >
        <h2 id="li-warning-title" style={{ margin: 0, fontSize: 20, color: 'var(--cl-rose)' }}>
          Enable LinkedIn floating button?
        </h2>
        <p style={{ marginTop: 12, color: 'var(--tx-secondary)', lineHeight: 1.6 }}>
          This will inject a floating button on every LinkedIn profile and job page. LinkedIn
          actively detects extensions that inject DOM and may restrict your account.
        </p>
        <p
          style={{
            marginTop: 12,
            padding: '12px 14px',
            background: 'var(--cl-rose-glow)',
            border: '1px solid var(--cl-rose-glow)',
            borderRadius: 6,
            color: 'var(--cl-rose)',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong>Documented risk:</strong> Per ApplySharp&apos;s own April 2026 fingerprint commit,
          users running automation extensions on LinkedIn see roughly a 23% account-restriction rate
          within 90 days. ApplySharp removed all LinkedIn injection in commit 25d9ba2 for this
          reason.
        </p>
        <p style={{ marginTop: 12, color: 'var(--tx-secondary)', fontSize: 13 }}>
          Only enable on a LinkedIn account you can afford to lose, or on a burner account used
          purely for testing. You can disable this at any time and ApplySharp will stop injecting
          immediately.
        </p>
        <div
          style={{
            marginTop: 20,
            display: 'flex',
            gap: 12,
            justifyContent: 'flex-end',
          }}
        >
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              background: 'var(--sf-raised)',
              color: 'var(--tx-primary)',
              border: '1px solid var(--bd-default)',
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAccept}
            style={{
              padding: '10px 20px',
              background: 'var(--cl-rose)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            I understand the risk, enable
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Consent dialog (first-run gate)
// ============================================================================

function ConsentDialog({ onAccept }: { onAccept: () => void }): JSX.Element {
  const acceptButtonRef = useRef<HTMLButtonElement>(null);

  // Move initial focus to the Enable button on mount, so keyboard users
  // can press Enter immediately to opt in (or Tab away to read first).
  useEffect(() => {
    acceptButtonRef.current?.focus();
  }, []);

  return (
    <div
      role="region"
      aria-labelledby="consent-heading"
      style={{ padding: 32, maxWidth: 640, margin: '40px auto' }}
    >
      <h1 id="consent-heading" style={{ fontSize: 24, marginTop: 0 }}>
        Capture contacts as you browse
      </h1>
      <p style={{ color: 'var(--tx-secondary)', lineHeight: 1.6 }}>
        ApplySharp can extract hiring contacts (email, phone, name, role) from job and company pages
        you browse on the supported platforms. The contacts are saved locally so you can send cold
        outreach later via the existing Outreach feature.
      </p>
      <h3 style={{ marginTop: 24 }}>What gets stored</h3>
      <ul style={{ color: 'var(--tx-secondary)', lineHeight: 1.6 }}>
        <li>Contact details visible on public pages (name, email, phone, title)</li>
        <li>The URL where you found them</li>
        <li>The job you were looking at when the contact was captured</li>
      </ul>
      <h3 style={{ marginTop: 24 }}>What does NOT happen</h3>
      <ul style={{ color: 'var(--tx-secondary)', lineHeight: 1.6 }}>
        <li>Nothing leaves your browser (local-first)</li>
        <li>LinkedIn pages are NEVER passively scraped (use the popup to capture instead)</li>
        <li>Personal email (Gmail, Outlook, Proton) and banking pages are blocked</li>
        <li>You can delete any or all contacts at any time</li>
      </ul>
      <div style={{ marginTop: 32, display: 'flex', gap: 12 }}>
        <button ref={acceptButtonRef} type="button" onClick={onAccept} style={btnPrimaryStyle}>
          Enable contact capture
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Filter bar
// ============================================================================

interface FilterBarProps {
  filter: ContactsFilter;
  onFilterChange: (f: ContactsFilter) => void;
  platforms: string[];
  contactCount: number;
}

function ContactsFilterBar({ filter, onFilterChange, platforms, contactCount }: FilterBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        marginBottom: 12,
        flexWrap: 'wrap',
      }}
    >
      <input
        type="search"
        value={filter.search ?? ''}
        onChange={(e) => onFilterChange({ ...filter, search: e.target.value })}
        placeholder="Search name, email, company..."
        style={{
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid var(--bd-default)',
          minWidth: 240,
        }}
        aria-label="Search contacts"
      />
      <select
        value={filter.platform ?? ''}
        onChange={(e) => onFilterChange({ ...filter, platform: e.target.value || undefined })}
        style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
        aria-label="Filter by platform"
      >
        <option value="">All platforms</option>
        {platforms.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select
        value={filter.emailKind ?? ''}
        onChange={(e) =>
          onFilterChange({
            ...filter,
            emailKind: (e.target.value || undefined) as EmailKind | undefined,
          })
        }
        style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
        aria-label="Filter by email kind"
      >
        <option value="">All emails</option>
        <option value="personal">Personal only</option>
        <option value="role">Role-based only (hiring@, careers@)</option>
        <option value="noreply">Show noreply</option>
      </select>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
        <input
          type="checkbox"
          checked={filter.starredOnly ?? false}
          onChange={(e) => onFilterChange({ ...filter, starredOnly: e.target.checked })}
        />
        Starred only
      </label>
      <span style={{ color: 'var(--tx-muted)', fontSize: 12, marginLeft: 'auto' }}>
        {contactCount} contacts
      </span>
    </div>
  );
}

// ============================================================================
// Contacts table
// ============================================================================

interface TableProps {
  contacts: ContactListView[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onArchive: (id: string) => void;
  onViewDetail: (id: string) => void;
  onToggleStar: (c: ContactListView) => void;
  onDraftEmail: (c: ContactListView) => void;
}

function ContactsTable({
  contacts,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onArchive,
  onViewDetail,
  onToggleStar,
  onDraftEmail,
}: TableProps): JSX.Element {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--bd-default)', borderRadius: 8 }}>
      <table
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
        aria-label="Contacts list"
      >
        <thead style={{ background: 'var(--sf-overlay)' }}>
          <tr>
            <th style={thStyle}>
              <input
                type="checkbox"
                checked={selectedIds.size > 0 && selectedIds.size === contacts.length}
                onChange={onSelectAll}
                aria-label="Select all"
              />
            </th>
            <th style={thStyle} aria-label="Starred"></th>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Title</th>
            <th style={thStyle}>Company</th>
            <th style={thStyle}>Email</th>
            <th style={thStyle}>Phone</th>
            <th style={thStyle}>Last seen</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id} style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={tdStyle}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(c.id)}
                  onChange={() => onToggleSelect(c.id)}
                  aria-label={`Select ${c.name || c.email}`}
                />
              </td>
              <td style={tdStyle}>
                <button
                  type="button"
                  onClick={() => onToggleStar(c)}
                  aria-label={
                    c.starred ? `Unstar ${c.name || c.email}` : `Star ${c.name || c.email}`
                  }
                  aria-pressed={c.starred}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 16,
                    color: c.starred ? 'var(--cl-orange)' : 'var(--bd-default)',
                    minWidth: 24,
                    minHeight: 24,
                  }}
                >
                  {c.starred ? '\u2605' : '\u2606'}
                </button>
              </td>
              <td style={tdStyle}>{c.name || '(no name)'}</td>
              <td style={tdStyle}>{c.title || '-'}</td>
              <td style={tdStyle}>{c.company || '-'}</td>
              <td style={tdStyle}>
                {c.email}{' '}
                {c.emailKind && c.emailKind !== 'personal' && (
                  <span style={{ fontSize: 10, color: 'var(--tx-muted)' }}>({c.emailKind})</span>
                )}
              </td>
              <td style={tdStyle}>{c.phone || '-'}</td>
              <td style={{ ...tdStyle, fontSize: 11, color: 'var(--tx-secondary)' }}>
                {new Date(c.lastSeenAt).toLocaleDateString()}
              </td>
              <td style={tdStyle}>
                <button
                  type="button"
                  onClick={() => onViewDetail(c.id)}
                  style={btnGhostStyle}
                  aria-label={`View details for ${c.name || c.email}`}
                >
                  View
                </button>{' '}
                {c.email && (
                  <>
                    <button
                      type="button"
                      onClick={() => onDraftEmail(c)}
                      style={btnGhostStyle}
                      aria-label={`Draft email to ${c.name || c.email}`}
                    >
                      Draft
                    </button>{' '}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => onArchive(c.id)}
                  style={btnGhostStyle}
                  aria-label={`Archive ${c.name || c.email}`}
                >
                  Archive
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Detail drawer
// ============================================================================

function ContactDetailDrawer({
  contact,
  onClose,
}: {
  contact: Contact;
  onClose: () => void;
}): JSX.Element {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Iter-2 a11y fix: Esc-to-close + initial focus + restore-focus on close.
  // Body scroll lock prevents the underlying table from scrolling while
  // the drawer is open.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      // Tab focus trap inside the drawer
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        const list = Array.from(focusables).filter((el) => {
          if (el.hasAttribute('aria-hidden')) return false;
          if (el.getClientRects().length === 0) return false;
          const style = window.getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') return false;
          return true;
        });
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Contact details"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={dialogRef}
        style={{
          background: 'var(--sf-raised)',
          padding: 24,
          borderRadius: 12,
          maxWidth: 600,
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        <header
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <div>
            <h2 style={{ margin: 0 }}>{contact.canonical.name || '(no name)'}</h2>
            <p style={{ margin: '4px 0 0 0', color: 'var(--tx-secondary)' }}>
              {contact.canonical.title}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={btnGhostStyle}
          >
            Close
          </button>
        </header>

        <dl style={{ marginTop: 16 }}>
          {contact.canonical.email && (
            <>
              <dt style={dtStyle}>Email</dt>
              <dd style={ddStyle}>{contact.canonical.email}</dd>
            </>
          )}
          {contact.canonical.phone && (
            <>
              <dt style={dtStyle}>Phone</dt>
              <dd style={ddStyle}>{contact.canonical.phone}</dd>
            </>
          )}
          {contact.canonical.company && (
            <>
              <dt style={dtStyle}>Company</dt>
              <dd style={ddStyle}>{contact.canonical.company}</dd>
            </>
          )}
        </dl>

        <h3 style={{ marginTop: 24, fontSize: 14 }}>
          Sighting history ({contact.sightings.length})
        </h3>
        <ul style={{ paddingLeft: 16, fontSize: 12, color: 'var(--tx-secondary)' }}>
          {contact.sightings.map((s, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              <strong>{s.platform}</strong> {new Date(s.capturedAt).toLocaleString()}
              <br />
              <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">
                {s.sourceUrl}
              </a>
              {s.aiAssisted && (
                <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--tx-muted)' }}>
                  (AI-assisted)
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ============================================================================
// Empty state
// ============================================================================

function EmptyContactsState(): JSX.Element {
  return (
    <div
      style={{
        padding: 48,
        textAlign: 'center',
        background: 'var(--sf-overlay)',
        border: '1px dashed #cbd5e1',
        borderRadius: 8,
        color: 'var(--tx-secondary)',
      }}
    >
      <p style={{ fontSize: 14, margin: 0 }}>No contacts captured yet.</p>
      <p style={{ fontSize: 12, marginTop: 4 }}>
        Browse a job page on Wellfound, YC Work at a Startup, Greenhouse, Lever, or Ashby. Any
        hiring contacts visible on the page will appear here.
      </p>
    </div>
  );
}

// ============================================================================
// Inline styles (kept simple to avoid pulling in a CSS module)
// ============================================================================

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 600,
  color: 'var(--tx-secondary)',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  color: 'var(--tx-primary)',
  verticalAlign: 'middle',
};

const dtStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 12,
  color: 'var(--tx-secondary)',
  marginTop: 8,
};

const ddStyle: React.CSSProperties = {
  margin: '2px 0 0 0',
  color: 'var(--tx-primary)',
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: '10px 20px',
  background: 'var(--brand)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnGhostStyle: React.CSSProperties = {
  padding: '4px 10px',
  background: 'transparent',
  color: 'var(--brand)',
  border: '1px solid var(--bd-default)',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
};

const btnDangerStyle: React.CSSProperties = {
  padding: '6px 14px',
  background: 'var(--cl-rose)',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontWeight: 600,
  cursor: 'pointer',
};
