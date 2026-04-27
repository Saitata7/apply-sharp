/**
 * Profile completeness ring (Workstream 2 UI integration).
 *
 * Shows the 0..100 completeness score from src/core/profile/completeness-scorer
 * as an SVG ring with the 80% target marker. Renders the highest-leverage
 * missing dimension below the ring as a "next step" hint.
 *
 * Color coding:
 *   - red:   under 60 (autofill blocked)
 *   - amber: 60..79 (autofill unlocked, recommended improvements)
 *   - green: 80+ (autofill ready, recommended state)
 */

import { useEffect, useMemo, useState } from 'react';
import type { MasterProfile } from '@shared/types/master-profile.types';
import { scoreProfileCompleteness } from '@core/profile/completeness-scorer';
import { sendMessage } from '@shared/utils/messaging';

interface Props {
  profile: MasterProfile;
  size?: number;
  showDetails?: boolean;
}

interface NextQuestionData {
  dimensionKey: string;
  text: string;
  rationale: string;
  estimatedImpact: number;
}

export default function CompletenessRing({ profile, size = 96, showDetails = true }: Props) {
  const report = useMemo(() => scoreProfileCompleteness(profile), [profile]);
  const [nextQuestion, setNextQuestion] = useState<NextQuestionData | null>(null);
  const [showQuestion, setShowQuestion] = useState(false);
  const [loadingQuestion, setLoadingQuestion] = useState(false);

  // Workstream 2: ask the background for the highest-leverage next question
  // when the user clicks the "What should I add next?" affordance. The
  // GET_PROFILE_NEXT_QUESTION handler runs scoreProfileCompleteness and
  // maps nextStep to a story-extraction question via getNextQuestion.
  // Wraps the message call in a try/catch so a transient background error
  // does not surface as an unhandled rejection in the options page.
  async function loadNextQuestion(): Promise<void> {
    if (loadingQuestion) return;
    setLoadingQuestion(true);
    try {
      const res = await sendMessage<{ masterProfileId?: string }, NextQuestionData | null>({
        type: 'GET_PROFILE_NEXT_QUESTION',
        payload: { masterProfileId: profile.id },
      });
      if (res?.success) {
        setNextQuestion(res.data ?? null);
        setShowQuestion(true);
      }
    } catch (err) {
      // Background may be cold-starting or the handler may not be registered
      // in older builds. The ring is still useful without a question hint.
      console.warn('[CompletenessRing] next-question fetch failed:', err);
    } finally {
      setLoadingQuestion(false);
    }
  }

  // Auto-load when the report says there's a next step AND we are actually
  // showing the details panel that renders the question. Without the
  // showDetails guard the call still ran on compact rings (e.g. dashboard
  // header) where the result was discarded.
  useEffect(() => {
    if (showDetails && report.nextStep) {
      void loadNextQuestion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, showDetails]);

  const radius = size / 2 - 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (report.total / 100) * circumference;

  const color = report.total >= 80 ? '#22c55e' : report.total >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 12 }}
      role="group"
      aria-label="Profile completeness"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 400ms ease, stroke 200ms ease' }}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size / 4}
          fontWeight="700"
          fill={color}
        >
          {report.total}
        </text>
      </svg>

      {showDetails && (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1419' }}>
            {report.total}% complete
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                fontWeight: 500,
                color: report.total >= 80 ? '#16a34a' : report.total >= 60 ? '#d97706' : '#dc2626',
              }}
            >
              {report.total >= 80
                ? 'Autofill ready'
                : report.total >= 60
                  ? 'Autofill unlocked'
                  : 'Autofill locked'}
            </span>
          </div>
          {report.nextStep && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Next: <strong>{report.nextStep.label}</strong>
              {report.nextStep.gap && <> - {report.nextStep.gap}</>}
            </div>
          )}
          {report.total >= 80 && (
            <div style={{ fontSize: 12, color: '#16a34a', marginTop: 2 }}>
              All key dimensions filled. You can autofill any application.
            </div>
          )}
          {nextQuestion && showQuestion && (
            <div
              style={{
                marginTop: 8,
                padding: '10px 12px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 6,
                fontSize: 12,
                color: '#1e40af',
                position: 'relative',
              }}
            >
              <button
                type="button"
                onClick={() => setShowQuestion(false)}
                aria-label="Dismiss next-step question"
                title="Dismiss"
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 6,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#1e40af',
                  fontSize: 16,
                  lineHeight: 1,
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                <span aria-hidden="true">{'\u00D7'}</span>
              </button>
              <div style={{ fontWeight: 600, marginBottom: 4, paddingRight: 20 }}>
                Try answering this next ({nextQuestion.estimatedImpact} points)
              </div>
              <div style={{ color: '#1e3a8a' }}>{nextQuestion.text}</div>
              <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
                {nextQuestion.rationale}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
