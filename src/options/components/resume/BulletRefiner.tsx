import { useState, useCallback } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import type { ClaimAnalysis, DefensibilityLevel } from '@/core/profile/claims-validator';

interface BulletRefinerProps {
  bullets: Array<{
    expId: string;
    company: string;
    title: string;
    text: string;
    index: number;
  }>;
  onApprove: (expId: string, index: number, newText: string) => void;
  onClose: () => void;
}

interface BulletState {
  original: string;
  current: string;
  analysis: ClaimAnalysis | null;
  isAnalyzing: boolean;
  isRefining: boolean;
  approved: boolean;
  edited: boolean;
}

const LEVEL_COLORS: Record<DefensibilityLevel, string> = {
  strong: 'var(--cl-emerald)',
  moderate: 'var(--ac-amber)',
  weak: 'var(--cl-rose)',
};

const LEVEL_BG: Record<DefensibilityLevel, string> = {
  strong: 'var(--cl-emerald-glow)',
  moderate: 'var(--ac-amber-ghost)',
  weak: 'var(--cl-rose-glow)',
};

export default function BulletRefiner({ bullets, onApprove, onClose }: BulletRefinerProps) {
  const [bulletStates, setBulletStates] = useState<Map<string, BulletState>>(() => {
    const map = new Map<string, BulletState>();
    for (const b of bullets) {
      const key = `${b.expId}-${b.index}`;
      map.set(key, {
        original: b.text,
        current: b.text,
        analysis: null,
        isAnalyzing: false,
        isRefining: false,
        approved: false,
        edited: false,
      });
    }
    return map;
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);

  const updateBullet = useCallback((key: string, update: Partial<BulletState>) => {
    setBulletStates((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      if (existing) {
        next.set(key, { ...existing, ...update });
      }
      return next;
    });
  }, []);

  const analyzeBullet = useCallback(
    async (key: string, text: string) => {
      updateBullet(key, { isAnalyzing: true });

      try {
        const response = await sendMessage<{ bulletText: string }, ClaimAnalysis>({
          type: 'VALIDATE_SINGLE_CLAIM',
          payload: { bulletText: text },
        });

        if (response.success && response.data) {
          updateBullet(key, { analysis: response.data, isAnalyzing: false });
        } else {
          updateBullet(key, { isAnalyzing: false });
        }
      } catch {
        updateBullet(key, { isAnalyzing: false });
      }
    },
    [updateBullet]
  );

  const analyzeAll = async () => {
    setIsAnalyzingAll(true);

    for (const b of bullets) {
      const key = `${b.expId}-${b.index}`;
      const state = bulletStates.get(key);
      if (state && !state.analysis && !state.approved) {
        await analyzeBullet(key, state.current);
      }
    }

    setIsAnalyzingAll(false);
  };

  const approveAll = () => {
    for (const b of bullets) {
      const key = `${b.expId}-${b.index}`;
      const state = bulletStates.get(key);
      if (state) {
        updateBullet(key, { approved: true });
        onApprove(b.expId, b.index, state.current);
      }
    }
  };

  const currentBullet = bullets[currentIndex];
  const currentKey = currentBullet ? `${currentBullet.expId}-${currentBullet.index}` : '';
  const currentState = currentKey ? bulletStates.get(currentKey) : undefined;

  const approvedCount = Array.from(bulletStates.values()).filter((s) => s.approved).length;
  const analyzedCount = Array.from(bulletStates.values()).filter((s) => s.analysis).length;
  const weakCount = Array.from(bulletStates.values()).filter(
    (s) => s.analysis && s.analysis.level === 'weak'
  ).length;

  return (
    <div className="bullet-refiner">
      {/* Header */}
      <div className="bullet-refiner-header">
        <div>
          <h2>Bullet Refiner</h2>
          <p className="bullet-refiner-subtitle">
            {approvedCount}/{bullets.length} approved ·{' '}
            {weakCount > 0 ? `${weakCount} need work` : 'Looking good'}
          </p>
        </div>
        <div className="bullet-refiner-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={analyzeAll}
            disabled={isAnalyzingAll || analyzedCount === bullets.length}
          >
            {isAnalyzingAll ? 'Analyzing...' : 'Analyze All'}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={approveAll}
            disabled={approvedCount === bullets.length}
          >
            Approve All
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="bullet-refiner-body">
        {/* Bullet list sidebar */}
        <div className="bullet-list">
          {bullets.map((b, i) => {
            const key = `${b.expId}-${b.index}`;
            const state = bulletStates.get(key);
            const level = state?.analysis?.level;

            return (
              <div
                key={key}
                className={`bullet-list-item ${i === currentIndex ? 'active' : ''} ${state?.approved ? 'approved' : ''}`}
                onClick={() => setCurrentIndex(i)}
              >
                <div className="bullet-list-indicator">
                  {state?.approved ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--cl-emerald)"
                      strokeWidth="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : level ? (
                    <div
                      className="bullet-score-dot"
                      style={{ background: LEVEL_COLORS[level] }}
                      title={`${state?.analysis?.score}/100`}
                    />
                  ) : (
                    <div className="bullet-score-dot" style={{ background: 'var(--tx-faint)' }} />
                  )}
                </div>
                <div className="bullet-list-content">
                  <div className="bullet-list-role">{b.company}</div>
                  <div className="bullet-list-text">
                    {(state?.current || b.text).slice(0, 60)}...
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {currentBullet && currentState && (
          <div className="bullet-detail">
            <div className="bullet-detail-role">
              <span className="bullet-detail-company">{currentBullet.company}</span>
              <span className="bullet-detail-title">{currentBullet.title}</span>
            </div>

            {/* Current text */}
            <div className="bullet-detail-section">
              <label className="bullet-detail-label">Current Bullet</label>
              <textarea
                className="bullet-detail-textarea"
                value={currentState.current}
                onChange={(e) => {
                  updateBullet(currentKey, {
                    current: e.target.value,
                    edited: true,
                    analysis: null,
                  });
                }}
                rows={3}
                disabled={currentState.approved}
              />
            </div>

            {/* Original comparison */}
            {currentState.edited && currentState.current !== currentState.original && (
              <div className="bullet-detail-section">
                <label className="bullet-detail-label" style={{ color: 'var(--tx-faint)' }}>
                  Original
                </label>
                <div className="bullet-original-text">{currentState.original}</div>
              </div>
            )}

            {/* Analysis */}
            {currentState.analysis && (
              <div className="bullet-analysis">
                <div
                  className="bullet-analysis-score"
                  style={{
                    background: LEVEL_BG[currentState.analysis.level],
                    borderColor: LEVEL_COLORS[currentState.analysis.level],
                  }}
                >
                  <span
                    className="bullet-score-value"
                    style={{ color: LEVEL_COLORS[currentState.analysis.level] }}
                  >
                    {currentState.analysis.score}
                  </span>
                  <span className="bullet-score-label">
                    {currentState.analysis.level.toUpperCase()}
                  </span>
                </div>
                <div className="bullet-analysis-feedback">
                  <p>{currentState.analysis.feedback}</p>
                  {currentState.analysis.suggestedImprovement && (
                    <div className="bullet-suggestion">
                      <div className="bullet-suggestion-label">Suggested improvement:</div>
                      <div className="bullet-suggestion-text">
                        {currentState.analysis.suggestedImprovement}
                      </div>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          updateBullet(currentKey, {
                            current: currentState.analysis!.suggestedImprovement!,
                            edited: true,
                            analysis: null,
                          });
                        }}
                        disabled={currentState.approved}
                      >
                        Apply Suggestion
                      </button>
                    </div>
                  )}
                  {currentState.analysis.issues.length > 0 && (
                    <div className="bullet-issues">
                      {currentState.analysis.issues.map((issue, i) => (
                        <div key={i} className="bullet-issue">
                          <span className="bullet-issue-type">{issue.type.replace(/_/g, ' ')}</span>
                          <span className="bullet-issue-msg">{issue.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="bullet-detail-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => analyzeBullet(currentKey, currentState.current)}
                disabled={currentState.isAnalyzing || currentState.approved}
              >
                {currentState.isAnalyzing ? 'Analyzing...' : 'Analyze'}
              </button>
              <button
                className={`btn btn-sm ${currentState.approved ? 'btn-ghost' : 'btn-primary'}`}
                onClick={() => {
                  const newApproved = !currentState.approved;
                  updateBullet(currentKey, { approved: newApproved });
                  if (newApproved) {
                    onApprove(currentBullet.expId, currentBullet.index, currentState.current);
                    // Auto-advance to next un-approved bullet
                    const nextUnapproved = bullets.findIndex((b, idx) => {
                      if (idx <= currentIndex) return false;
                      const k = `${b.expId}-${b.index}`;
                      const s = bulletStates.get(k);
                      return s && !s.approved;
                    });
                    if (nextUnapproved >= 0) setCurrentIndex(nextUnapproved);
                  }
                }}
              >
                {currentState.approved ? 'Undo Approve' : 'Approve'}
              </button>

              {/* Navigation */}
              <div className="bullet-nav">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                >
                  Prev
                </button>
                <span className="bullet-nav-count">
                  {currentIndex + 1} / {bullets.length}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCurrentIndex(Math.min(bullets.length - 1, currentIndex + 1))}
                  disabled={currentIndex === bullets.length - 1}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
