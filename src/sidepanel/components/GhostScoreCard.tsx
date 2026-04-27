/**
 * Ghost Score card (Workstream 8 UI surface).
 *
 * Renders the GhostScore returned by the SCORE_GHOST_JOB handler. Two phases
 * per the WS8 plan:
 *   - cheap: runs automatically on context change (cheap signals only)
 *   - full: gated behind a "Check layoff news + AI vagueness" CTA, OR
 *     auto-escalated by the handler when the cheap score crosses the
 *     suspicion threshold
 *
 * The card always shows ALL signals (triggered or not) inside a <details>
 * element. The details element is open by default for amber and red so the
 * user sees the reasoning without an extra click.
 *
 * Color information is never the SOLE channel: the bucket label and the
 * recommendation text both convey the same severity, so colorblind users
 * still get the message.
 */

import { useEffect, useState, useCallback } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import type { TabJobContext } from '@shared/types/sidepanel.types';
import type { GhostScore } from '@core/ghost-job-detector/types';

interface Props {
  context: TabJobContext;
}

const BUCKET_META: Record<
  GhostScore['bucket'],
  { label: string; color: string; bg: string; border: string; icon: string }
> = {
  green: {
    label: 'Looks fine',
    color: 'var(--sp-success)',
    bg: 'var(--sp-success-bg)',
    border: 'var(--sp-success-border)',
    icon: '✓',
  },
  amber: {
    label: 'Caution',
    color: 'var(--sp-warning)',
    bg: 'var(--sp-warning-bg)',
    border: 'var(--sp-warning-border)',
    icon: '!',
  },
  red: {
    label: 'Likely ghost',
    color: 'var(--sp-danger)',
    bg: 'var(--sp-danger-bg)',
    border: 'var(--sp-danger-border)',
    icon: '✕',
  },
};

const RECOMMENDATION_TEXT: Record<GhostScore['recommendation'], string> = {
  apply_normally: 'Apply normally',
  apply_with_referral_only: 'Apply only with a referral',
  skip_likely_ghost: 'Skip, likely ghost',
};

export default function GhostScoreCard({ context }: Props): JSX.Element | null {
  const [score, setScore] = useState<GhostScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchScore = useCallback(
    async (phase: 'cheap' | 'full', refreshLayoffs = false) => {
      setLoading(phase === 'cheap');
      setRefreshing(refreshLayoffs);
      setError(null);
      try {
        const res = await sendMessage<
          {
            job: {
              title: string;
              company: string;
              description: string;
              postedDate?: string;
            };
            phase: 'cheap' | 'full';
            refreshLayoffs?: boolean;
          },
          GhostScore
        >({
          type: 'SCORE_GHOST_JOB',
          payload: {
            job: {
              title: context.jobTitle,
              company: context.companyName,
              description: context.jobDescription || '',
              postedDate: context.postedDate,
            },
            phase,
            refreshLayoffs,
          },
        });
        if (res?.success && res.data) {
          setScore(res.data);
        } else {
          setError(res?.error || 'Could not score this job');
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [context.jobTitle, context.companyName, context.jobDescription, context.postedDate]
  );

  useEffect(() => {
    void fetchScore('cheap');
  }, [fetchScore]);

  if (loading && !score) {
    return (
      <section className="sp-card" role="region" aria-labelledby="sp-ghost-title" aria-busy="true">
        <header className="sp-card__header">
          <h2 className="sp-card__title" id="sp-ghost-title">
            Ghost Score
          </h2>
        </header>
        <div className="sp-card__body">
          <span style={{ color: 'var(--sp-text-faint)', fontSize: 12 }}>Scanning signals...</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="sp-card" role="region" aria-labelledby="sp-ghost-title">
        <header className="sp-card__header">
          <h2 className="sp-card__title" id="sp-ghost-title">
            Ghost Score
          </h2>
        </header>
        <div className="sp-card__body">
          <span style={{ color: 'var(--sp-danger)', fontSize: 12 }}>{error}</span>
          <button
            type="button"
            className="sp-btn sp-btn--ghost sp-btn--small"
            onClick={() => fetchScore('cheap')}
            style={{ alignSelf: 'flex-start', marginTop: 6 }}
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (!score) return null;

  const meta = BUCKET_META[score.bucket];
  const triggered = score.signals.filter((s) => s.triggered);
  const detailsOpenByDefault = score.bucket !== 'green';

  return (
    <section
      className="sp-card"
      role="region"
      aria-labelledby="sp-ghost-title"
      style={{ borderLeft: `3px solid ${meta.color}` }}
    >
      <header className="sp-card__header">
        <h2 className="sp-card__title" id="sp-ghost-title">
          Ghost Score
        </h2>
        {/* The score chip carries no aria-label and is aria-hidden so the
            body aria-live below is the single announcement source for the
            assistive tech tree. The previous version double-announced. */}
        <div
          aria-hidden="true"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 18,
            fontWeight: 700,
            color: meta.color,
          }}
        >
          <span>{meta.icon}</span>
          <span>{score.total}</span>
        </div>
      </header>

      <div className="sp-card__body" aria-live="polite">
        {/* Bucket label and recommendation: text equivalents of the color
            bar so colorblind users still get the message. */}
        <div
          style={{
            display: 'inline-block',
            padding: '3px 8px',
            background: meta.bg,
            border: `1px solid ${meta.border}`,
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            color: meta.color,
            alignSelf: 'flex-start',
          }}
        >
          {meta.label}
        </div>
        <div style={{ fontSize: 13, color: 'var(--sp-text)' }}>
          Recommendation: <strong>{RECOMMENDATION_TEXT[score.recommendation]}</strong>
        </div>

        {triggered.length > 0 && (
          <details open={detailsOpenByDefault} style={{ marginTop: 6 }}>
            <summary
              style={{
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--sp-text-muted)',
                fontWeight: 500,
              }}
            >
              Why ({triggered.length} signals triggered)
            </summary>
            <ul style={{ listStyle: 'disc', marginTop: 6, paddingLeft: 20, fontSize: 12 }}>
              {triggered.map((s) => (
                <li key={s.kind} style={{ marginBottom: 4, color: 'var(--sp-text)' }}>
                  {s.reason}
                  <sup
                    style={{
                      marginLeft: 4,
                      fontSize: 10,
                      color: 'var(--sp-text-faint)',
                      textTransform: 'uppercase',
                    }}
                    aria-label={`Confidence: ${s.confidence}`}
                  >
                    {s.confidence}
                  </sup>
                  {s.evidence && (
                    <div style={{ fontSize: 11, color: 'var(--sp-text-faint)', marginTop: 2 }}>
                      {s.evidence}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}

        {triggered.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--sp-text-muted)' }}>No suspicious signals.</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {score.phase === 'cheap' && (
            <button
              type="button"
              className="sp-btn sp-btn--ghost sp-btn--small"
              onClick={() => fetchScore('full')}
              disabled={loading}
            >
              Check layoff news + JD vagueness
            </button>
          )}
          {score.phase === 'full' && (
            <button
              type="button"
              className="sp-btn sp-btn--ghost sp-btn--small"
              onClick={() => fetchScore('full', true)}
              disabled={refreshing}
              title="Bypass the 7-day cache and fetch fresh layoff news"
            >
              {refreshing ? 'Refreshing...' : 'Refresh layoff news'}
            </button>
          )}
        </div>

        <div style={{ fontSize: 10, color: 'var(--sp-text-faint)', marginTop: 4 }}>
          {score.phase === 'cheap'
            ? 'Cheap signals only. Click for full analysis.'
            : 'Full analysis (signals + layoff news + JD vagueness).'}
        </div>
      </div>
    </section>
  );
}
