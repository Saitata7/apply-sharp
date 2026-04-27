/**
 * Discovery card (Workstream 9 UI surface).
 *
 * Three subcards stacked inside one card:
 *   1. Top portals - pure profile-based ranking
 *   2. HN Who is Hiring matches - gated by optional permission
 *   3. YC ATS direct links - bypass aggregators
 *
 * Plus a dismissable "Skip these - we checked" banner enumerating dead and
 * affiliate-spam sources.
 *
 * The discovery profile is inferred from the current job context (best-effort
 * - role from title heuristics, geo from URL/location). The user can later
 * tune this from the options page; for v1 the inferred profile is enough.
 */

import { useEffect, useState, useCallback } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import type { TabJobContext } from '@shared/types/sidepanel.types';
import type {
  DiscoveryProfile,
  DiscoveryRole,
  DiscoverySeniority,
  HNFetchResult,
  PortalRecommendation,
  YCATSLink,
} from '@core/discovery/types';

interface Props {
  context: TabJobContext;
}

/**
 * Best-effort role inference from a job title. v1 is intentionally simple:
 * a richer recommender would let the user pick from a settings dropdown.
 */
function inferRole(title: string): DiscoveryRole {
  const t = title.toLowerCase();
  if (/data\s+(engineer|engineering)/.test(t)) return 'data-engineering';
  if (/data\s+scientist/.test(t)) return 'data-science';
  if (/(ml|machine learning|ai)\s+engineer/.test(t)) return 'ml-engineering';
  if (/devops|sre|platform/.test(t)) return 'devops';
  if (/(security|appsec)/.test(t)) return 'security';
  if (/(ios|android|mobile)/.test(t)) return 'mobile';
  if (/full[- ]?stack/.test(t)) return 'fullstack';
  if (/front[- ]?end/.test(t)) return 'frontend';
  if (/(designer|design)/.test(t)) return 'design';
  if (/(product manager|pm\b)/.test(t)) return 'pm';
  if (/manager|engineering lead/.test(t)) return 'engineering-manager';
  if (/qa|test/.test(t)) return 'qa';
  return 'backend';
}

function inferSeniority(title: string): DiscoverySeniority {
  const t = title.toLowerCase();
  if (/staff|principal/.test(t)) return 'staff';
  if (/senior|sr\b|lead/.test(t)) return 'senior';
  if (/junior|jr\b|entry|intern/.test(t)) return 'entry';
  return 'mid';
}

interface DiscoveryData {
  recommendations: PortalRecommendation[];
  skipList: Array<{ name: string; reason: string; kind: 'dead' | 'spam' }>;
}

interface YCData {
  links: YCATSLink[];
  appliedSector: string | null;
}

export default function DiscoveryCard({ context }: Props): JSX.Element {
  const [discovery, setDiscovery] = useState<DiscoveryData | null>(null);
  const [yc, setYc] = useState<YCData | null>(null);
  const [hn, setHn] = useState<HNFetchResult | null>(null);
  const [hnPermission, setHnPermission] = useState<'granted' | 'denied' | 'unknown'>('unknown');
  const [hnLoading, setHnLoading] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Infer profile from current context
  const profile: DiscoveryProfile = {
    role: inferRole(context.jobTitle),
    seniority: inferSeniority(context.jobTitle),
    geo: 'us', // v1 default; richer geo inference is a follow-up task
    workType: 'remote',
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await sendMessage<{ profile: DiscoveryProfile }, DiscoveryData>({
          type: 'GET_PORTAL_RECOMMENDATIONS',
          payload: { profile },
        });
        if (!cancelled && res?.success && res.data) setDiscovery(res.data);
      } catch (err) {
        console.warn('[DiscoveryCard] portal recs failed:', err);
      }
      try {
        const res = await sendMessage<{ role: string }, YCData>({
          type: 'GET_YC_ATS_LINKS',
          payload: { role: profile.role },
        });
        if (!cancelled && res?.success && res.data) setYc(res.data);
      } catch (err) {
        console.warn('[DiscoveryCard] YC links failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only re-run when the job context truly changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.jobId]);

  /**
   * Fetch HN matches. CRITICAL: chrome.permissions.request must run from
   * the user-gesture context (this onClick handler), NOT from the background
   * service worker. The background loses the gesture by the time the
   * sendMessage roundtrip lands, so the prompt would never appear if we
   * delegated permission acquisition to the handler. Iter-2 fix per
   * security review.
   *
   * Flow:
   *   1. Check chrome.permissions.contains synchronously (no gesture needed)
   *   2. If missing, call chrome.permissions.request RIGHT HERE in the click
   *      handler, before any await on the background.
   *   3. Once granted (or already present), send FETCH_HN_WHOS_HIRING.
   */
  const fetchHN = useCallback(
    async (requestPermission: boolean) => {
      setHnLoading(true);
      try {
        // Step 1: ensure permission. Must happen in the user gesture.
        const HN_ORIGIN = 'https://hn.algolia.com/*';
        let granted = true;
        try {
          if (typeof chrome !== 'undefined' && chrome.permissions) {
            const has = await chrome.permissions.contains({ origins: [HN_ORIGIN] });
            if (!has) {
              if (!requestPermission) {
                setHnPermission('denied');
                return;
              }
              granted = await chrome.permissions.request({ origins: [HN_ORIGIN] });
              if (!granted) {
                setHnPermission('denied');
                return;
              }
            }
          }
        } catch (err) {
          console.warn('[DiscoveryCard] permission check failed:', err);
          // Fall through and let the handler decide; in test environments
          // chrome.permissions is missing entirely.
        }
        setHnPermission('granted');

        // Step 2: send the fetch request. The background handler also
        // double-checks permission as defense in depth, but it never has
        // to call chrome.permissions.request itself.
        const keywords = [
          profile.role,
          profile.seniority,
          'remote',
          ...(context.jobTitle ? context.jobTitle.toLowerCase().split(/\s+/).slice(0, 3) : []),
        ];
        const res = await sendMessage<
          { keywords: string[]; requestPermission?: boolean },
          { result: HNFetchResult | null; permission: 'granted' | 'denied' | 'unknown' }
        >({
          type: 'FETCH_HN_WHOS_HIRING',
          payload: { keywords, requestPermission: false },
        });
        if (res?.success && res.data) {
          setHn(res.data.result);
          if (res.data.permission !== 'unknown') {
            setHnPermission(res.data.permission);
          }
        }
      } catch (err) {
        console.warn('[DiscoveryCard] HN fetch failed:', err);
      } finally {
        setHnLoading(false);
      }
    },
    [profile.role, profile.seniority, context.jobTitle]
  );

  return (
    <section className="sp-card" role="region" aria-labelledby="sp-discovery-title">
      <header className="sp-card__header">
        <h2 className="sp-card__title" id="sp-discovery-title">
          Find better jobs
        </h2>
      </header>

      <div className="sp-card__body">
        <div style={{ fontSize: 11, color: 'var(--sp-text-muted)', marginBottom: 4 }}>
          For your profile: {profile.seniority} {profile.role}, remote, US
        </div>

        {/* Subcard 1: Portal recommendations */}
        <details open style={{ marginTop: 4 }}>
          <summary
            style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--sp-text)' }}
          >
            Top portals ({discovery?.recommendations.length ?? 0})
          </summary>
          <ol style={{ paddingLeft: 20, marginTop: 6, fontSize: 12 }}>
            {(discovery?.recommendations ?? []).map((p) => (
              <li key={p.sourceName} style={{ marginBottom: 6 }}>
                <a
                  href={p.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--sp-accent)', textDecoration: 'underline' }}
                >
                  {p.sourceName}
                </a>
                {p.notes && (
                  <div style={{ fontSize: 11, color: 'var(--sp-text-muted)' }}>{p.notes}</div>
                )}
              </li>
            ))}
            {discovery && discovery.recommendations.length === 0 && (
              <li style={{ color: 'var(--sp-text-faint)' }}>No matches for your profile.</li>
            )}
          </ol>
        </details>

        {/* Subcard 2: HN Who is Hiring */}
        <details style={{ marginTop: 8 }}>
          <summary
            style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--sp-text)' }}
          >
            HN Who is Hiring matches{hn ? ` (${hn.matches.length} of ${hn.totalComments})` : ''}
          </summary>
          <div style={{ marginTop: 6 }}>
            {!hn && hnPermission !== 'denied' && (
              <button
                type="button"
                className="sp-btn sp-btn--ghost sp-btn--small"
                onClick={() => fetchHN(true)}
                disabled={hnLoading}
              >
                {hnLoading ? 'Fetching...' : 'Fetch this month from HN'}
              </button>
            )}
            {hnPermission === 'denied' && !hn && (
              <div style={{ fontSize: 11, color: 'var(--sp-text-muted)' }}>
                HN access is optional and was denied. Click to grant it now.
                <button
                  type="button"
                  className="sp-btn sp-btn--ghost sp-btn--small"
                  onClick={() => fetchHN(true)}
                  style={{ marginLeft: 8 }}
                >
                  Grant access
                </button>
              </div>
            )}
            {hn && (
              <>
                <ul style={{ listStyle: 'disc', paddingLeft: 20, marginTop: 6, fontSize: 12 }}>
                  {hn.matches.map((m) => (
                    <li key={m.commentId} style={{ marginBottom: 8 }}>
                      <a
                        href={`https://news.ycombinator.com/item?id=${m.commentId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--sp-accent)', fontWeight: 500 }}
                      >
                        {m.author}
                      </a>{' '}
                      <span style={{ color: 'var(--sp-text-faint)', fontSize: 10 }}>
                        ({m.matchedKeywords?.join(', ')})
                      </span>
                      {/*
                        m.htmlSafe is sanitized by sanitizeHNComment with a
                        strict allowlist (p, br, i, b, em, strong, code, pre,
                        a with https-only href). Safe to render.
                        The sp-hn-comment class enforces overflow-wrap on
                        long URLs and code spans so the 380px side panel
                        never gets pushed off-screen.
                      */}
                      <div
                        className="sp-hn-comment"
                        dangerouslySetInnerHTML={{ __html: m.htmlSafe }}
                      />
                    </li>
                  ))}
                  {hn.matches.length === 0 && (
                    <li style={{ color: 'var(--sp-text-faint)' }}>
                      No matches in this month&apos;s thread.
                    </li>
                  )}
                </ul>
                <button
                  type="button"
                  className="sp-btn sp-btn--ghost sp-btn--small"
                  onClick={() => fetchHN(false)}
                  disabled={hnLoading}
                  title="Bypass cache and refresh"
                  style={{ marginTop: 6 }}
                >
                  {hnLoading ? 'Refreshing...' : 'Refresh HN'}
                </button>
              </>
            )}
          </div>
        </details>

        {/* Subcard 3: YC direct ATS links */}
        <details style={{ marginTop: 8 }}>
          <summary
            style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--sp-text)' }}
          >
            Direct ATS links ({yc?.links.length ?? 0}){' '}
            {yc?.appliedSector && (
              <span style={{ fontSize: 10, color: 'var(--sp-text-faint)' }}>
                {' '}
                · sector: {yc.appliedSector}
              </span>
            )}
          </summary>
          <ul style={{ listStyle: 'disc', paddingLeft: 20, marginTop: 6, fontSize: 12 }}>
            {(yc?.links ?? []).map((l) => (
              <li key={l.company} style={{ marginBottom: 4 }}>
                <a
                  href={l.careerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--sp-accent)' }}
                >
                  {l.company}
                </a>{' '}
                <span style={{ fontSize: 10, color: 'var(--sp-text-faint)' }}>
                  {l.batch} · {l.sector}
                </span>
              </li>
            ))}
          </ul>
          <div style={{ fontSize: 10, color: 'var(--sp-text-muted)', marginTop: 4 }}>
            Bypass aggregators. These companies are well-funded and actively hiring.
          </div>
        </details>

        {/* Skip-these banner */}
        {!bannerDismissed && discovery && discovery.skipList.length > 0 && (
          <div
            role="note"
            style={{
              marginTop: 12,
              padding: '8px 10px',
              background: 'var(--sp-warning-bg)',
              border: '1px solid var(--sp-warning-border)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--sp-warning)',
              position: 'relative',
            }}
          >
            <strong>Skip these. We checked.</strong>{' '}
            {discovery.skipList
              .slice(0, 4)
              .map((s) => s.name)
              .join(', ')}
            , and {Math.max(0, discovery.skipList.length - 4)} others are dead or affiliate spam.
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss skip list banner"
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--sp-warning)',
                fontSize: 16,
                lineHeight: 1,
                // WCAG 2.2 minimum target size 24x24 CSS px.
                minWidth: 24,
                minHeight: 24,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 4,
              }}
            >
              <span aria-hidden="true">{'\u00D7'}</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
