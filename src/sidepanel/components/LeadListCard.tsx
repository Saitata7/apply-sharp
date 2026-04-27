/**
 * Side-panel "Today's leads" card.
 *
 * Pulls 5-10 ranked leads from the GET_LEAD_LIST background handler and
 * renders one row per lead. Each row shows:
 *   - Company name + trigger (e.g. "raised $40M" / "launched new product")
 *   - DOL sponsor badge with filing count and most recent FY when matched
 *   - "Open in LinkedIn" jobs deep-link with the user's role keywords
 *   - "Source" link to the news story (for verification before applying)
 *   - Dismiss (X) so the same company doesn't keep resurfacing
 *
 * Permission lifecycle mirrors DiscoveryCard's HN section: hn.algolia.com
 * is an optional host permission. If denied we render a "Grant access"
 * button that calls chrome.permissions.request from the user-gesture
 * context, then re-fetches.
 *
 * The card is gated on the discovery.leadList feature flag (see App.tsx).
 * It does not depend on the per-tab job context, so it shows up even on
 * empty-state side panel opens.
 */

import { useEffect, useState, useCallback } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import type { Lead } from '@core/discovery/lead-list';

const HN_ORIGIN = 'https://hn.algolia.com/*';
const DEFAULT_KEYWORDS = ['ai engineer', 'ml engineer', 'genai', 'llm engineer'];

interface LeadListResponse {
  leads: Lead[];
  generatedAt: string;
  fromCache: boolean;
  sponsorIndexLoaded: boolean;
  dismissedFiltered: number;
  permission: 'granted' | 'denied' | 'unknown';
}

export default function LeadListCard(): JSX.Element {
  const [data, setData] = useState<LeadListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await sendMessage<
          { roleKeywords: string[]; topN: number; refresh: boolean },
          LeadListResponse
        >({
          type: 'GET_LEAD_LIST',
          payload: { roleKeywords: keywords, topN: 10, refresh },
        });
        if (res?.success && res.data) {
          setData(res.data);
        } else {
          setError(res?.error ?? 'Could not load leads');
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [keywords]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  async function requestPermission(): Promise<void> {
    try {
      if (!chrome.permissions?.request) return;
      const granted = await chrome.permissions.request({ origins: [HN_ORIGIN] });
      if (granted) await load(true);
    } catch (err) {
      console.warn('[LeadListCard] permission request failed:', err);
    }
  }

  async function dismissLead(companyKey: string): Promise<void> {
    try {
      await sendMessage<{ companyKey: string }, { dismissedCount: number }>({
        type: 'DISMISS_LEAD',
        payload: { companyKey },
      });
      // Optimistic local removal so the row vanishes without a refetch.
      setData((prev) =>
        prev ? { ...prev, leads: prev.leads.filter((l) => l.companyKey !== companyKey) } : prev
      );
    } catch (err) {
      console.warn('[LeadListCard] dismiss failed:', err);
    }
  }

  function updateKeywords(raw: string): void {
    const next = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setKeywords(next.length ? next : DEFAULT_KEYWORDS);
  }

  return (
    <section className="sp-card" role="region" aria-labelledby="sp-leadlist-title">
      <header className="sp-card__header">
        <h2 className="sp-card__title" id="sp-leadlist-title">
          Today&apos;s leads
        </h2>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          className="sp-btn sp-btn--ghost sp-btn--small"
          aria-label="Refresh leads"
        >
          {loading ? '…' : 'Refresh'}
        </button>
      </header>

      <div className="sp-card__body">
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            fontSize: 11,
            color: 'var(--sp-text-muted)',
            marginBottom: 10,
          }}
        >
          <span>Role keywords (comma-separated)</span>
          <input
            type="text"
            defaultValue={keywords.join(', ')}
            onBlur={(e) => updateKeywords(e.target.value)}
            placeholder="ai engineer, ml engineer, genai"
            style={{
              padding: '4px 6px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid var(--sp-border)',
              background: 'var(--sp-bg)',
              color: 'var(--sp-text)',
            }}
          />
        </label>

        {data?.permission === 'denied' && (
          <div
            style={{
              padding: 10,
              background: 'var(--sp-warning-bg)',
              border: '1px solid var(--sp-warning)',
              borderRadius: 6,
              fontSize: 12,
              marginBottom: 10,
            }}
          >
            <p style={{ margin: '0 0 8px 0', color: 'var(--sp-warning)' }}>
              ApplySharp needs access to news.ycombinator.com&apos;s search API (hn.algolia.com) to
              pull hiring-trigger news.
            </p>
            <button
              type="button"
              onClick={() => void requestPermission()}
              className="sp-btn sp-btn--small"
              style={{ background: 'var(--sp-accent)', color: '#fff', border: 'none' }}
            >
              Grant access
            </button>
          </div>
        )}

        {data && !data.sponsorIndexLoaded && (
          <p
            style={{
              fontSize: 11,
              color: 'var(--sp-text-muted)',
              fontStyle: 'italic',
              margin: '0 0 10px 0',
            }}
          >
            DOL sponsor index not loaded. Leads show without the visa-friendly badge. Run{' '}
            <code>tools/job-search/dol-process.py</code> to enable filtering.
          </p>
        )}

        {error && <p style={{ fontSize: 12, color: 'var(--sp-danger)' }}>{error}</p>}

        {!loading && data && data.leads.length === 0 && data.permission !== 'denied' && (
          <p style={{ fontSize: 12, color: 'var(--sp-text-muted)' }}>
            No matching leads right now. Try a refresh in an hour.
          </p>
        )}

        {data?.leads.map((lead) => (
          <article
            key={lead.companyKey}
            style={{
              padding: 10,
              border: '1px solid var(--sp-border)',
              borderRadius: 6,
              marginBottom: 8,
              background: 'var(--sp-bg-elevated)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 4,
                  }}
                >
                  <strong style={{ fontSize: 13, color: 'var(--sp-text)' }}>
                    {lead.companyDisplay}
                  </strong>
                  {lead.sponsorMatch && (
                    <span
                      title={`${lead.sponsorFilings ?? 0} H-1B filings in ${lead.sponsorLatestFy ?? 'recent FY'}`}
                      style={{
                        fontSize: 9,
                        padding: '1px 5px',
                        borderRadius: 8,
                        background: 'var(--sp-success-bg)',
                        color: 'var(--sp-success)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.04,
                      }}
                    >
                      Sponsors H-1B
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--sp-text-muted)',
                      marginLeft: 'auto',
                    }}
                  >
                    {lead.score}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 11,
                    color: 'var(--sp-text-muted)',
                    lineHeight: 1.4,
                  }}
                >
                  {lead.reason}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <a
                    href={lead.linkedinJobsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 11, color: 'var(--sp-accent)', fontWeight: 600 }}
                  >
                    Open LinkedIn jobs →
                  </a>
                  {lead.sourceUrl && (
                    <a
                      href={lead.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 11,
                        color: 'var(--sp-text-muted)',
                      }}
                    >
                      Source ({lead.sourceName})
                    </a>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void dismissLead(lead.companyKey)}
                aria-label={`Dismiss ${lead.companyDisplay}`}
                title="Hide this lead permanently"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--sp-text-muted)',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
