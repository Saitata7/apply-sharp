/**
 * Job Insights card. Read-only relocation of the ATS scoring data the
 * options page already shows. Reuses the existing ANALYZE_JOB handler at
 * src/background/handlers/ats-handlers.ts:226 - does NOT re-implement the
 * scoring.
 *
 * The card auto-fetches when the context job changes. While the analysis is
 * in flight the card collapses to its header so the user does not see a
 * partial loading state. Errors render a small inline message with a retry.
 *
 * Workstream 8 (GhostScoreCard) and Workstream 9 (DiscoveryCard) sit
 * underneath this card and consume the same per-tab context.
 */

import { useEffect, useState } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import type { TabJobContext } from '@shared/types/sidepanel.types';

interface AnalyzeResult {
  overallScore: number;
  matchedKeywords?: Array<{ keyword: string }>;
  missingKeywords?: Array<{ keyword: string }>;
  criticalMissing?: Array<{ keyword: string }>;
  tier?: string;
  seniorityMatch?: { matches: boolean; required?: string };
}

interface Props {
  context: TabJobContext;
}

export default function JobInsightsCard({ context }: Props): JSX.Element | null {
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);

    sendMessage<
      { job: { title: string; company: string; description: string }; platform: string },
      AnalyzeResult
    >({
      type: 'ANALYZE_JOB',
      payload: {
        job: {
          title: context.jobTitle,
          company: context.companyName,
          description: context.jobDescription || '',
        },
        platform: context.platform,
      },
    })
      .then((res) => {
        if (cancelled) return;
        if (res?.success && res.data) {
          setResult(res.data);
        } else {
          setError(res?.error || 'Could not analyze this job');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Re-fetch only when the underlying job identity changes; the other
    // context fields are derived from the same job and re-fetching on every
    // tick would thrash the analyzer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.jobId]);

  // Collapse to header-only while loading so we never show a half-rendered card.
  if (loading) {
    return (
      <section
        className="sp-card"
        role="region"
        aria-labelledby="sp-job-insights-title"
        aria-busy="true"
      >
        <header className="sp-card__header">
          <h2 className="sp-card__title" id="sp-job-insights-title">
            Job Insights
          </h2>
        </header>
        <div className="sp-card__body" aria-live="polite">
          <span style={{ color: 'var(--sp-text-faint)', fontSize: 12 }}>Analyzing...</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="sp-card" role="region" aria-labelledby="sp-job-insights-title">
        <header className="sp-card__header">
          <h2 className="sp-card__title" id="sp-job-insights-title">
            Job Insights
          </h2>
        </header>
        <div className="sp-card__body">
          <span style={{ color: 'var(--sp-danger)', fontSize: 12 }}>{error}</span>
        </div>
      </section>
    );
  }

  if (!result) return null;

  const matched = result.matchedKeywords?.length ?? 0;
  const missing = result.missingKeywords?.length ?? 0;
  const critical = result.criticalMissing?.length ?? 0;
  const score = Math.round(result.overallScore || 0);
  const scoreColor =
    score >= 80 ? 'var(--sp-success)' : score >= 60 ? 'var(--sp-warning)' : 'var(--sp-danger)';

  return (
    <section className="sp-card" role="region" aria-labelledby="sp-job-insights-title">
      <header className="sp-card__header">
        <h2 className="sp-card__title" id="sp-job-insights-title">
          Job Insights
        </h2>
        {/* aria-hidden so the body aria-live region is the single
            announcement source. The previous version double-announced. */}
        <span aria-hidden="true" style={{ fontSize: 18, fontWeight: 700, color: scoreColor }}>
          {score}
        </span>
      </header>
      <div className="sp-card__body" aria-live="polite">
        <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
          <span>
            <strong style={{ color: 'var(--sp-success)' }}>{matched}</strong> matched
          </span>
          <span>
            <strong style={{ color: 'var(--sp-warning)' }}>{missing}</strong> missing
          </span>
          {critical > 0 && (
            <span>
              <strong style={{ color: 'var(--sp-danger)' }}>{critical}</strong> critical
            </span>
          )}
        </div>
        {result.seniorityMatch && (
          <div style={{ fontSize: 11, color: 'var(--sp-text-muted)' }}>
            Seniority: {result.seniorityMatch.matches ? 'matches' : 'mismatch'}
            {result.seniorityMatch.required && ` (looking for ${result.seniorityMatch.required})`}
          </div>
        )}
      </div>
    </section>
  );
}
