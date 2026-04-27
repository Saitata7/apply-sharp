import { useState, useEffect } from 'react';
import type { ResumeProfile } from '@shared/types/profile.types';
import type { Job } from '@shared/types/job.types';
import type { SaveContactPayload } from '@shared/types/contact.types';
import { sendMessage } from '@shared/utils/messaging';
import { isFeatureEnabled } from '@shared/feature-flags';
import { extractLinkedInContactInPage } from '@shared/linkedin-contact-extractor';
import { extractLinkedInJobInPage } from '@shared/linkedin-job-extractor';

interface CurrentJob {
  title: string;
  company: string;
  location?: string;
  platform: string;
  description?: string;
}

/**
 * The LinkedIn job extractor lives in src/shared/linkedin-job-extractor.ts
 * so the background tab.onUpdated listener can also import it for the
 * auto-extract feature. The popup imports it above and passes it as the
 * `func` argument to chrome.scripting.executeScript - the import path
 * does not affect the serialization.
 *
 * Tests previously imported _extractLinkedInJobInPageForTests from this
 * file; they now import extractLinkedInJobInPage directly from the
 * shared util.
 */

export default function App() {
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<ResumeProfile | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [currentJob, setCurrentJob] = useState<CurrentJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLinkedInTab, setIsLinkedInTab] = useState(false);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  // WS10.5: contact capture state for LinkedIn (popup-driven, never passive).
  const [contactsEnabled, setContactsEnabled] = useState(false);
  const [capturingContacts, setCapturingContacts] = useState(false);
  const [contactCaptureMessage, setContactCaptureMessage] = useState<string | null>(null);
  const [contactCaptureError, setContactCaptureError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    checkCurrentTab();
    // Read the contacts.passiveExtraction flag once. If it's off, we hide
    // the contact capture button entirely - the user has not opted in to
    // contact capture so showing it would be misleading.
    void isFeatureEnabled('contacts.passiveExtraction').then(setContactsEnabled);
  }, []);

  async function loadData() {
    try {
      const [profilesRes, currentRes, jobsRes] = await Promise.all([
        sendMessage<void, ResumeProfile[]>({ type: 'GET_PROFILES' }),
        sendMessage<void, ResumeProfile>({ type: 'GET_CURRENT_PROFILE' }),
        sendMessage<number, Job[]>({ type: 'GET_RECENT_JOBS', payload: 5 }),
      ]);

      if (profilesRes.success && profilesRes.data) {
        setProfiles(profilesRes.data);
      }
      if (currentRes.success && currentRes.data) {
        setCurrentProfile(currentRes.data);
      }
      if (jobsRes.success && jobsRes.data) {
        setRecentJobs(jobsRes.data);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function checkCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url) return;

      setActiveTabId(tab.id);

      const tabUrl = new URL(tab.url);
      // Strict host match. `endsWith` would have flagged
      // `evilfakelinkedin.com` as LinkedIn; restrict to the canonical
      // domain or its subdomains.
      const host = tabUrl.hostname;
      const isLinkedIn = host === 'linkedin.com' || host.endsWith('.linkedin.com');
      setIsLinkedInTab(isLinkedIn);

      if (isLinkedIn) {
        // No content script runs on linkedin.com (for account safety, see manifest.json
        // and src/popup/App.tsx extractLinkedInJobInPage docstring). Show a capture
        // button instead, and read any previously captured job from session storage.
        try {
          const stored = await chrome.storage.session.get('lastJobContext');
          const ctx = stored?.lastJobContext;
          if (ctx?.jobTitle) {
            setCurrentJob({
              title: ctx.jobTitle,
              company: ctx.companyName ?? '',
              platform: 'linkedin',
              description: ctx.jobDescription,
            });
          }
        } catch {
          // session storage may be empty
        }
        return;
      }

      // Non-LinkedIn tabs: ask the content script normally
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_JOB' });
        if (response?.success && response.data) {
          setCurrentJob(response.data);
        }
      } catch {
        // Content script not loaded on this page
      }
    } catch (err) {
      console.warn('[Popup] checkCurrentTab failed:', err);
    }
  }

  async function captureLinkedInJob() {
    if (!activeTabId) return;
    setCapturing(true);
    setCaptureError(null);
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: extractLinkedInJobInPage,
      });
      const extracted = results?.[0]?.result;
      if (!extracted) {
        setCaptureError('Could not find a LinkedIn job on this page. Make sure a job is open.');
        return;
      }
      // Persist to session storage so the autofill flow on later ATS pages can use it.
      await chrome.storage.session.set({
        lastJobContext: {
          jobTitle: extracted.title,
          companyName: extracted.company,
          jobDescription: extracted.description,
          url: extracted.url,
          timestamp: Date.now(),
        },
      });
      setCurrentJob({
        title: extracted.title,
        company: extracted.company,
        location: extracted.location || undefined,
        platform: 'linkedin',
        description: extracted.description,
      });
    } catch (err) {
      console.error('[Popup] LinkedIn capture failed:', err);
      // Sanitize the error so we never leak Chrome scripting API internals
      // (file paths, extension ids, internal stack frames) into the popup.
      // The full error is logged above for debugging.
      const raw = (err as Error).message ?? '';
      const safe = raw.includes('Cannot access')
        ? 'Capture failed: this page does not allow extension scripts. Try refreshing.'
        : raw.includes('extension context invalidated')
          ? 'ApplySharp was reloaded. Refresh the LinkedIn tab and try again.'
          : 'Capture failed. Make sure a LinkedIn job page is open.';
      setCaptureError(safe);
    } finally {
      setCapturing(false);
    }
  }

  /**
   * WS10.5: capture contacts from the current LinkedIn page via
   * chrome.scripting.executeScript. The extractor function runs in the
   * page's isolated world ONE TIME on user click only. Results are
   * forwarded to SAVE_CONTACTS so the background dedupes + persists.
   */
  async function captureLinkedInContacts(): Promise<void> {
    if (!activeTabId) return;
    setCapturingContacts(true);
    setContactCaptureMessage(null);
    setContactCaptureError(null);
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
        setContactCaptureError(
          'No contacts found on this page. Try a profile (linkedin.com/in/...) or a job posting.'
        );
        return;
      }
      // Map raw extractions to the SaveContactPayload shape the background expects
      const items: SaveContactPayload[] = extracted.map((c) => ({
        sighting: {
          // capturedAt is stamped server-side (background) so we omit it here
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
        } as never, // SaveContactPayload omits capturedAt; cast keeps the type narrow
      }));
      const res = await sendMessage<{ items: SaveContactPayload[] }, { savedCount: number }>({
        type: 'SAVE_CONTACTS',
        payload: { items },
      });
      if (!res?.success) {
        setContactCaptureError(res?.error || 'Background rejected the capture');
        return;
      }
      const count = res.data?.savedCount ?? 0;
      if (count === 0) {
        // Most likely cause: contacts.passiveExtraction is off (background no-ops)
        setContactCaptureError(
          'Capture is disabled. Open Options -> Contacts and enable contact capture.'
        );
      } else {
        setContactCaptureMessage(`Saved ${count} contact${count === 1 ? '' : 's'}.`);
      }
    } catch (err) {
      console.error('[Popup] LinkedIn contact capture failed:', err);
      const raw = (err as Error).message ?? '';
      const safe = raw.includes('Cannot access')
        ? 'Capture failed: this page does not allow extension scripts. Try refreshing.'
        : raw.includes('extension context invalidated')
          ? 'ApplySharp was reloaded. Refresh the LinkedIn tab and try again.'
          : 'Capture failed. Make sure a LinkedIn profile or job page is open.';
      setContactCaptureError(safe);
    } finally {
      setCapturingContacts(false);
    }
  }

  async function handleProfileChange(profileId: string) {
    try {
      const response = await sendMessage<string, ResumeProfile>({
        type: 'SET_CURRENT_PROFILE',
        payload: profileId,
      });
      if (response.success && response.data) {
        setCurrentProfile(response.data);
      }
    } catch (error) {
      console.error('[Popup] Failed to change profile:', error);
    }
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  // Workstream 7: open the side panel for ambient per-tab insights.
  // chrome.sidePanel.open requires the active tab id and a user gesture, both
  // of which we have inside the popup click handler.
  async function openSidePanel(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      // chrome.sidePanel API is only present on Chrome 114+. Older builds get
      // a noop fallback that opens the options page instead so the button
      // never appears broken.
      const sp = (
        chrome as typeof chrome & {
          sidePanel?: { open?: (opts: { tabId: number }) => Promise<void> };
        }
      ).sidePanel;
      if (sp?.open) {
        await sp.open({ tabId: tab.id });
      } else {
        chrome.runtime.openOptionsPage();
      }
    } catch (err) {
      console.warn('[Popup] openSidePanel failed:', err);
    }
  }

  if (loading) {
    return (
      <div className="popup-container">
        <div className="loading" role="status">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <header className="popup-header">
        <div className="header-title">
          <svg width="22" height="22" viewBox="0 0 128 128" fill="none" aria-hidden="true">
            <circle cx="58" cy="70" r="34" stroke="currentColor" strokeWidth="6" opacity="0.32" />
            <circle cx="58" cy="70" r="22" stroke="currentColor" strokeWidth="6" opacity="0.75" />
            <circle cx="58" cy="70" r="7" fill="currentColor" />
            <path d="M58 70 L100 28" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
            <path
              d="M82 28 L100 28 L100 46"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>ApplySharp</span>
        </div>
        <button
          className="icon-btn"
          onClick={openOptions}
          title="Settings"
          aria-label="Open settings"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v6m0 6v10M4.22 4.22l4.24 4.24m7.07 7.07l4.24 4.24M1 12h6m6 0h10M4.22 19.78l4.24-4.24m7.07-7.07l4.24-4.24" />
          </svg>
        </button>
      </header>

      {isLinkedInTab && (
        <section className="current-job" aria-busy={capturing}>
          <div className="section-label">LinkedIn Job</div>
          {currentJob ? (
            <div className="job-card highlighted">
              <div className="job-title">{currentJob.title}</div>
              <div className="job-company">{currentJob.company}</div>
              {currentJob.location && <div className="job-location">{currentJob.location}</div>}
              <button
                className="btn btn-secondary full-width"
                onClick={captureLinkedInJob}
                disabled={capturing}
                aria-busy={capturing}
                style={{ marginTop: 8 }}
              >
                {capturing ? (
                  <>
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        marginRight: 6,
                        border: '2px solid currentColor',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        verticalAlign: '-1px',
                        animation: 'spin 700ms linear infinite',
                      }}
                    />
                    Re-capturing
                  </>
                ) : (
                  'Re-capture'
                )}
              </button>
              {/* Post-capture next-step guidance: tells the user what to do
                  with the data they just captured. The popup is otherwise
                  silent about the autofill flow that this enables. */}
              <div
                role="status"
                style={{
                  marginTop: 10,
                  padding: '8px 10px',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: 6,
                  fontSize: 11,
                  color: '#065f46',
                }}
              >
                Captured. Now open the company&apos;s apply page on Wellfound, Greenhouse, Lever, or
                similar, and click the orange Autofill pill that appears.
              </div>
            </div>
          ) : (
            <button
              className="btn btn-primary full-width"
              onClick={captureLinkedInJob}
              disabled={capturing}
              aria-busy={capturing}
            >
              {capturing ? (
                <>
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      marginRight: 6,
                      border: '2px solid currentColor',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      verticalAlign: '-1px',
                      animation: 'spin 700ms linear infinite',
                    }}
                  />
                  Capturing
                </>
              ) : (
                'Capture this LinkedIn job'
              )}
            </button>
          )}
          {captureError && (
            <div className="error-message" role="alert" style={{ marginTop: 8, fontSize: 12 }}>
              {captureError}
            </div>
          )}

          {/* WS10.5 contact capture button. Only shown when the user has
              opted into contact capture (otherwise the button would be
              misleading - background would no-op the SAVE_CONTACTS). */}
          {contactsEnabled && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
              <div className="section-label" style={{ marginBottom: 6 }}>
                Contacts
              </div>
              <button
                className="btn btn-secondary full-width"
                onClick={captureLinkedInContacts}
                disabled={capturingContacts}
                aria-busy={capturingContacts}
                title="Extract name, title, and any visible emails from this LinkedIn page"
              >
                {capturingContacts ? (
                  <>
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        marginRight: 6,
                        border: '2px solid currentColor',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        verticalAlign: '-1px',
                        animation: 'spin 700ms linear infinite',
                      }}
                    />
                    Capturing contacts
                  </>
                ) : (
                  'Capture contact from this page'
                )}
              </button>
              {contactCaptureMessage && (
                <div
                  role="status"
                  style={{
                    marginTop: 8,
                    padding: '6px 10px',
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: 6,
                    fontSize: 11,
                    color: '#065f46',
                  }}
                >
                  {contactCaptureMessage}
                </div>
              )}
              {contactCaptureError && (
                <div role="alert" style={{ marginTop: 8, fontSize: 11, color: '#b91c1c' }}>
                  {contactCaptureError}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {!isLinkedInTab && currentJob && (
        <section className="current-job">
          <div className="section-label">Current Job</div>
          <div className="job-card highlighted">
            <div className="job-title">{currentJob.title}</div>
            <div className="job-company">{currentJob.company}</div>
            {currentJob.location && <div className="job-location">{currentJob.location}</div>}
          </div>
        </section>
      )}

      <section className="profile-section">
        <div className="section-label">Active Profile</div>
        {profiles.length > 0 ? (
          <select
            className="profile-select"
            value={currentProfile?.id || ''}
            onChange={(e) => handleProfileChange(e.target.value)}
            aria-label="Active profile"
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        ) : (
          <button className="btn btn-primary full-width" onClick={openOptions}>
            Create Your First Profile
          </button>
        )}
      </section>

      {recentJobs.length > 0 && (
        <section className="recent-jobs">
          <div className="section-label">Recent Jobs</div>
          <div className="job-list">
            {recentJobs.map((job) => {
              // Only allow http(s) URLs from saved job records. A malformed
              // record (or a future ingestion bug that lets a javascript:
              // URL slip in) must not become a popup-side XSS vector.
              const safeHref =
                typeof job.url === 'string' && /^https?:\/\//i.test(job.url) ? job.url : '#';
              return (
                <a
                  key={job.id}
                  href={safeHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="job-card"
                >
                  <div className="job-title">{job.title}</div>
                  <div className="job-company">{job.company}</div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      <footer className="popup-footer">
        <button
          className="btn btn-primary"
          onClick={openSidePanel}
          title="Open ambient insights for the current tab"
        >
          Open insights
        </button>
        <button className="btn btn-secondary" onClick={openOptions}>
          Manage profiles
        </button>
      </footer>
    </div>
  );
}
