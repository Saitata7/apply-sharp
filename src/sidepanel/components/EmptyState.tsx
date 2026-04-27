/**
 * Empty state for the side panel when no job context exists for the current tab.
 *
 * Rendered when the user opens the side panel from a non-job page, or before
 * any content script has detected a job. The whole side panel is intentionally
 * silent in this state - no spinners, no loading bars - because the panel is
 * an ambient surface and a flickering loading state would feel broken.
 *
 * WS10.5: when the current tab is on linkedin.com, the empty state turns into
 * a one-click LinkedIn capture surface:
 *   - Detects the LinkedIn tab via chrome.tabs.query on mount
 *   - Renders a "Capture contact from this page" button (gated on the
 *     contacts.passiveExtraction feature flag)
 *   - Clicking the button calls chrome.scripting.executeScript with the
 *     shared LinkedIn extractor (src/shared/linkedin-contact-extractor.ts)
 *     and forwards results to SAVE_CONTACTS for dedupe + storage
 *   - The user can pin the side panel open across tabs so subsequent
 *     LinkedIn captures are a single click instead of opening the popup
 *
 * Why the side panel and not a content script: ApplySharp deliberately does
 * not register a content script on linkedin.com (per the WS5/WS9 fingerprint
 * avoidance hard ban). chrome.scripting.executeScript runs the extractor
 * inside the page's isolated world ONE TIME on user gesture only and never
 * persists - same minimum-surface pattern that 1Password and Bitwarden use.
 */

import { useEffect, useState } from 'react';
import { extractLinkedInContactInPage } from '@shared/linkedin-contact-extractor';
import { isFeatureEnabled } from '@shared/feature-flags';
import type { SaveContactPayload } from '@shared/types/contact.types';

/**
 * The empty state is a static informational region, not a status update,
 * so it does NOT use role="status" or aria-live. The previous version did
 * and re-announced "No job detected" every time the user switched tabs to
 * a non-job page, which was noisy to screen reader users. The h1 inside
 * is the heading; assistive tech reads it once on mount.
 */
export default function EmptyState(): JSX.Element {
  const [isLinkedInTab, setIsLinkedInTab] = useState(false);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [contactsEnabled, setContactsEnabled] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Check the active tab once on mount. The result feeds the conditional
  // copy below; if chrome.tabs is unavailable (test env, restricted tab)
  // we silently fall through to the generic message.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (cancelled || !tab?.url) return;
        const host = new URL(tab.url).hostname;
        // Strict host match - "evilfakelinkedin.com" must NOT match.
        const isLinkedIn = host === 'linkedin.com' || host.endsWith('.linkedin.com');
        setIsLinkedInTab(isLinkedIn);
        if (tab.id) setActiveTabId(tab.id);
      } catch {
        // tabs API may be unavailable; keep the generic message
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Read the contacts.passiveExtraction flag once. The capture button only
  // appears when the user has opted into contact capture - otherwise the
  // background no-ops the SAVE_CONTACTS message and the button would lie.
  useEffect(() => {
    void isFeatureEnabled('contacts.passiveExtraction').then(setContactsEnabled);
  }, []);

  /**
   * One-click LinkedIn capture inside the side panel. Mirrors the popup
   * captureLinkedInContacts handler. The side panel runs in extension
   * context and has chrome.scripting access, so it can inject the
   * extractor function the same way the popup does.
   */
  async function captureLinkedInContacts(): Promise<void> {
    if (!activeTabId) return;
    setCapturing(true);
    setCaptureMessage(null);
    setCaptureError(null);
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: extractLinkedInContactInPage,
      });
      const extracted = (results?.[0]?.result || []) as Array<{
        name?: string;
        title?: string;
        company?: string;
        email?: string;
        emailKind?: 'personal' | 'role' | 'noreply';
        sourceUrl: string;
      }>;
      if (!extracted || extracted.length === 0) {
        setCaptureError(
          'No contacts found. Open a LinkedIn profile (linkedin.com/in/...) or job posting and try again.'
        );
        return;
      }
      const items: SaveContactPayload[] = extracted.map((c) => ({
        sighting: {
          sourceUrl: c.sourceUrl,
          platform: 'linkedin',
          confidence: c.email ? 'high' : 'medium',
          extractedFields: {
            name: c.name,
            title: c.title,
            company: c.company,
            email: c.email,
            emailKind: c.emailKind,
          },
        } as never,
      }));
      const res = await chrome.runtime.sendMessage({
        type: 'SAVE_CONTACTS',
        payload: { items },
      });
      if (!res?.success) {
        setCaptureError(res?.error || 'Background rejected the capture');
        return;
      }
      const count = res.data?.savedCount ?? 0;
      if (count === 0) {
        setCaptureError('Capture is disabled. Open Options > Contacts and enable contact capture.');
      } else {
        setCaptureMessage(`Saved ${count} contact${count === 1 ? '' : 's'}.`);
      }
    } catch (err) {
      console.error('[EmptyState] LinkedIn capture failed:', err);
      const raw = (err as Error).message ?? '';
      const safe = raw.includes('Cannot access')
        ? 'Capture failed: this page does not allow extension scripts. Try refreshing.'
        : raw.includes('extension context invalidated')
          ? 'ApplySharp was reloaded. Refresh the LinkedIn tab and try again.'
          : 'Capture failed. Make sure a LinkedIn profile or job page is open.';
      setCaptureError(safe);
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="sp-empty">
      <svg
        className="sp-empty__icon"
        viewBox="0 0 48 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="8" y="12" width="32" height="28" rx="3" />
        <path d="M16 12V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v4" />
        <line x1="14" y1="22" x2="34" y2="22" />
        <line x1="14" y1="28" x2="34" y2="28" />
        <line x1="14" y1="34" x2="26" y2="34" />
      </svg>
      {/* The empty state has no SidePanelHeader above it, so this is the
          only heading in the document. Use h1 so screen-reader
          "jump to headings" lists are not empty. */}
      {isLinkedInTab ? (
        <>
          <h1 className="sp-empty__title">LinkedIn capture</h1>
          <p className="sp-empty__body">
            ApplySharp does not inject scripts on LinkedIn for account safety. Use the button below
            to capture the contact on this page in one click.
          </p>
          {contactsEnabled ? (
            <>
              <button
                type="button"
                onClick={captureLinkedInContacts}
                disabled={capturing}
                aria-busy={capturing}
                style={{
                  marginTop: 16,
                  padding: '10px 20px',
                  background: capturing ? '#94a3b8' : '#0a66c2',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: capturing ? 'wait' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  width: '100%',
                  maxWidth: 280,
                }}
              >
                {capturing ? 'Capturing...' : 'Capture contact from this page'}
              </button>
              {captureMessage && (
                <div
                  role="status"
                  style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: 6,
                    fontSize: 12,
                    color: '#065f46',
                    maxWidth: 280,
                  }}
                >
                  {captureMessage}
                </div>
              )}
              {captureError && (
                <div
                  role="alert"
                  style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 6,
                    fontSize: 12,
                    color: '#b91c1c',
                    maxWidth: 280,
                  }}
                >
                  {captureError}
                </div>
              )}
            </>
          ) : (
            <p
              className="sp-empty__body"
              style={{ marginTop: 12, fontSize: 11, fontStyle: 'italic' }}
            >
              Enable contact capture in Options &gt; Contacts to use this button.
            </p>
          )}
        </>
      ) : (
        <>
          <h1 className="sp-empty__title">No job detected</h1>
          <p className="sp-empty__body">
            Open a job page on Wellfound, Greenhouse, Lever, Ashby, Workday, or another supported
            platform to see ApplySharp insights here.
          </p>
        </>
      )}
    </div>
  );
}
