/**
 * ContactsCard (Workstream 10).
 *
 * 4th sidepanel card. Surfaces the contacts associated with the current
 * tab's job. Hidden when there are no contacts (no empty state).
 *
 * Each row shows name + title + email + a "Draft email" button. Clicking
 * the button writes a chrome.storage.local handoff (via writeOutreachHandoff)
 * and navigates to the options-page Outreach tab, which reads the handoff
 * on mount and pre-fills the recipient. The user reviews the draft and
 * sends manually from Gmail (per Workstream 5 invariant: ApplySharp never
 * auto-sends).
 *
 * Iter-3 fix: the previous version called GENERATE_OUTREACH directly and
 * threw the response away. Iter-2 introduced the storage handoff but the
 * Outreach page did not read it; iter-3 closes the loop by extracting
 * write/read into src/shared/utils/outreach-handoff.ts.
 *
 * The card auto-refreshes when CONTACTS_UPDATED arrives (out of scope
 * for v1: no broadcast yet; first paint is enough).
 */

import { useEffect, useState, useCallback } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import { writeOutreachHandoff } from '@shared/utils/outreach-handoff';
import type { TabJobContext } from '@shared/types/sidepanel.types';
import type { Contact } from '@shared/types/contact.types';

interface Props {
  context: TabJobContext;
}

export default function ContactsCard({ context }: Props): JSX.Element | null {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    if (!context.jobId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await sendMessage<{ jobId: string }, Contact[]>({
        type: 'GET_CONTACTS_FOR_JOB',
        payload: { jobId: context.jobId },
      });
      if (res?.success && res.data) {
        setContacts(res.data);
      } else if (res?.error) {
        setError(res.error);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [context.jobId]);

  useEffect(() => {
    void fetchContacts();
  }, [fetchContacts]);

  // Hide entirely when there are no contacts and no error. The
  // discovery -> application -> outreach loop is the killer feature;
  // an empty contacts card on every job page would be noise.
  if (!loading && !error && contacts.length === 0) return null;

  function openOptionsContacts(): void {
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS', payload: { tab: 'contacts' } }).catch(() => {
      // Background may be cold; the popup link is the fallback.
    });
  }

  return (
    <section className="sp-card" role="region" aria-labelledby="sp-contacts-title">
      <header className="sp-card__header">
        <h2 className="sp-card__title" id="sp-contacts-title">
          Contacts
        </h2>
        {contacts.length > 0 && (
          <span aria-hidden="true" style={{ fontSize: 11, color: 'var(--sp-text-faint)' }}>
            {contacts.length} captured
          </span>
        )}
      </header>

      <div className="sp-card__body" aria-live="polite">
        {loading && (
          <span style={{ color: 'var(--sp-text-faint)', fontSize: 12 }}>Loading contacts...</span>
        )}
        {error && <span style={{ color: 'var(--sp-danger)', fontSize: 12 }}>{error}</span>}
        {contacts.map((c) => (
          <ContactRow key={c.id} contact={c} jobId={context.jobId} />
        ))}
        {contacts.length > 0 && (
          <button
            type="button"
            className="sp-btn sp-btn--ghost sp-btn--small"
            onClick={openOptionsContacts}
            style={{ marginTop: 4, alignSelf: 'flex-start' }}
          >
            View all in CRM
          </button>
        )}
      </div>
    </section>
  );
}

interface RowProps {
  contact: Contact;
  jobId: string;
}

function ContactRow({ contact, jobId }: RowProps): JSX.Element {
  const c = contact.canonical;
  const name = c.name || c.email || '(no name)';
  const subtitle = c.title || c.email || '';

  /**
   * Open the Outreach tab in the options page with this contact
   * pre-selected. Writes the handoff via the shared writeOutreachHandoff
   * util (src/shared/utils/outreach-handoff.ts), then sends OPEN_OPTIONS
   * with payload.tab='outreach'. The Outreach page reads and removes the
   * handoff on mount.
   */
  async function draftEmail(): Promise<void> {
    if (!c.email) return;
    await writeOutreachHandoff({
      contactId: contact.id,
      recipientName: c.name,
      recipientTitle: c.title,
      recipientEmail: c.email,
      companyName: c.company || '',
      jobId,
    });
    try {
      await chrome.runtime.sendMessage({
        type: 'OPEN_OPTIONS',
        payload: { tab: 'outreach' },
      });
    } catch (err) {
      console.warn('[ContactsCard] OPEN_OPTIONS failed:', err);
    }
  }

  return (
    <div
      style={{
        padding: '6px 0',
        borderTop: '1px solid var(--sp-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sp-text)' }}>{name}</div>
      {subtitle && subtitle !== name && (
        <div style={{ fontSize: 11, color: 'var(--sp-text-muted)' }}>{subtitle}</div>
      )}
      {c.email && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 2,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: 'var(--sp-text-faint)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {c.email}
          </span>
          <button
            type="button"
            className="sp-btn sp-btn--ghost sp-btn--small"
            onClick={draftEmail}
            style={{ marginLeft: 6, flexShrink: 0 }}
          >
            Draft email
          </button>
        </div>
      )}
    </div>
  );
}
