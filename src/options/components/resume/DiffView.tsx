import { useState, useMemo } from 'react';
import type { EnrichedExperience, AchievementItem } from '@shared/types/master-profile.types';

/** Extract text from an achievement (string or AchievementItem) */
function bulletText(item: string | AchievementItem): string {
  return typeof item === 'string' ? item : item.statement;
}

interface TailoredContent {
  optimizedSummary: string;
  enhancedBullets: Array<{
    expId: string;
    bullets: string[];
  }>;
  addedKeywords: string[];
  newScore: number;
}

interface DiffViewProps {
  originalSummary: string;
  tailoredContent: TailoredContent;
  experiences: EnrichedExperience[];
  originalScore: number;
  onApply: (approved: ApprovedChanges) => void;
  onClose: () => void;
}

export interface ApprovedChanges {
  summary: boolean;
  bullets: Record<string, boolean[]>; // expId -> per-bullet approval
}

type ViewMode = 'side-by-side' | 'inline';

interface WordDiff {
  text: string;
  type: 'same' | 'added' | 'removed';
}

/**
 * Simple word-level diff for comparing two strings.
 * Uses longest common subsequence for reasonable output.
 */
function computeWordDiff(original: string, modified: string): WordDiff[] {
  const origWords = original.split(/(\s+)/);
  const modWords = modified.split(/(\s+)/);

  // LCS table
  const m = origWords.length;
  const n = modWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origWords[i - 1] === modWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const result: WordDiff[] = [];
  let i = m,
    j = n;

  const stack: WordDiff[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origWords[i - 1] === modWords[j - 1]) {
      stack.push({ text: origWords[i - 1], type: 'same' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ text: modWords[j - 1], type: 'added' });
      j--;
    } else {
      stack.push({ text: origWords[i - 1], type: 'removed' });
      i--;
    }
  }

  // Reverse since we built it backwards
  for (let k = stack.length - 1; k >= 0; k--) {
    result.push(stack[k]);
  }

  return result;
}

/** Merge adjacent same-type diff entries for cleaner rendering */
function mergeDiffs(diffs: WordDiff[]): WordDiff[] {
  const merged: WordDiff[] = [];
  for (const d of diffs) {
    const last = merged[merged.length - 1];
    if (last && last.type === d.type) {
      last.text += d.text;
    } else {
      merged.push({ ...d });
    }
  }
  return merged;
}

export default function DiffView({
  originalSummary,
  tailoredContent,
  experiences,
  originalScore,
  onApply,
  onClose,
}: DiffViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('inline');
  const [summaryApproved, setSummaryApproved] = useState(true);
  const [bulletApprovals, setBulletApprovals] = useState<Record<string, boolean[]>>(() => {
    const map: Record<string, boolean[]> = {};
    for (const eb of tailoredContent.enhancedBullets) {
      map[eb.expId] = eb.bullets.map(() => true); // all approved by default
    }
    return map;
  });
  const [expandedExp, setExpandedExp] = useState<string | null>(
    tailoredContent.enhancedBullets[0]?.expId || null
  );

  // Build experience lookup
  const expMap = useMemo(() => {
    const m = new Map<string, EnrichedExperience>();
    for (const exp of experiences) {
      m.set(exp.id, exp);
    }
    return m;
  }, [experiences]);

  // Summary diff
  const summaryDiff = useMemo(
    () => mergeDiffs(computeWordDiff(originalSummary, tailoredContent.optimizedSummary)),
    [originalSummary, tailoredContent.optimizedSummary]
  );

  // Count approvals
  const totalBullets = tailoredContent.enhancedBullets.reduce((s, eb) => s + eb.bullets.length, 0);
  const approvedBullets = Object.values(bulletApprovals).reduce(
    (s, arr) => s + arr.filter(Boolean).length,
    0
  );

  const toggleBullet = (expId: string, idx: number) => {
    setBulletApprovals((prev) => {
      const arr = [...(prev[expId] || [])];
      arr[idx] = !arr[idx];
      return { ...prev, [expId]: arr };
    });
  };

  const toggleAllBullets = (expId: string, value: boolean) => {
    setBulletApprovals((prev) => {
      const arr = prev[expId] || [];
      return { ...prev, [expId]: arr.map(() => value) };
    });
  };

  const handleApply = () => {
    onApply({
      summary: summaryApproved,
      bullets: bulletApprovals,
    });
  };

  const scoreImprovement = tailoredContent.newScore - originalScore;

  return (
    <div className="diff-view">
      {/* Header */}
      <div className="diff-header">
        <div className="diff-header-left">
          <h2>Review Changes</h2>
          <div className="diff-score-comparison">
            <span className="diff-score-old">{originalScore}%</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
            <span className="diff-score-new">{tailoredContent.newScore}%</span>
            {scoreImprovement > 0 && <span className="diff-score-delta">+{scoreImprovement}</span>}
          </div>
        </div>
        <div className="diff-header-right">
          <div className="diff-view-toggle">
            <button
              className={`diff-toggle-btn ${viewMode === 'inline' ? 'active' : ''}`}
              onClick={() => setViewMode('inline')}
            >
              Inline
            </button>
            <button
              className={`diff-toggle-btn ${viewMode === 'side-by-side' ? 'active' : ''}`}
              onClick={() => setViewMode('side-by-side')}
            >
              Side by Side
            </button>
          </div>
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

      {/* Added keywords */}
      {tailoredContent.addedKeywords.length > 0 && (
        <div className="diff-keywords">
          <span className="diff-keywords-label">Keywords added:</span>
          <div className="diff-keywords-list">
            {tailoredContent.addedKeywords.map((kw) => (
              <span key={kw} className="diff-keyword-chip">
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="diff-body">
        {/* Summary section */}
        <div className="diff-section">
          <div className="diff-section-header">
            <label className="diff-checkbox-label">
              <input
                type="checkbox"
                checked={summaryApproved}
                onChange={() => setSummaryApproved(!summaryApproved)}
              />
              <span className="diff-section-title">Professional Summary</span>
            </label>
          </div>

          {viewMode === 'inline' ? (
            <div className="diff-content-inline">
              {summaryDiff.map((d, i) => (
                <span key={i} className={`diff-word diff-word-${d.type}`}>
                  {d.text}
                </span>
              ))}
            </div>
          ) : (
            <div className="diff-content-side">
              <div className="diff-side diff-side-original">
                <div className="diff-side-label">Original</div>
                <div className="diff-side-text">{originalSummary}</div>
              </div>
              <div className="diff-side diff-side-modified">
                <div className="diff-side-label">Tailored</div>
                <div className="diff-side-text">{tailoredContent.optimizedSummary}</div>
              </div>
            </div>
          )}
        </div>

        {/* Experience bullets */}
        {tailoredContent.enhancedBullets.map((eb) => {
          const exp = expMap.get(eb.expId);
          if (!exp) return null;

          const originalBullets = [
            ...(exp.achievements || []).map(bulletText),
            ...(exp.responsibilities || []),
          ];
          const isExpanded = expandedExp === eb.expId;
          const approvals = bulletApprovals[eb.expId] || [];
          const expApprovedCount = approvals.filter(Boolean).length;

          return (
            <div key={eb.expId} className="diff-section">
              <div className="diff-section-header">
                <button
                  className="diff-expand-btn"
                  onClick={() => setExpandedExp(isExpanded ? null : eb.expId)}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`chevron ${isExpanded ? 'expanded' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span className="diff-section-title">
                    {exp.company} — {exp.title}
                  </span>
                  <span className="diff-bullet-count">
                    {expApprovedCount}/{eb.bullets.length} accepted
                  </span>
                </button>
                <div className="diff-bulk-actions">
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => toggleAllBullets(eb.expId, true)}
                  >
                    All
                  </button>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => toggleAllBullets(eb.expId, false)}
                  >
                    None
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="diff-bullets">
                  {eb.bullets.map((newBullet, idx) => {
                    const origBullet = originalBullets[idx] || '';
                    const isApproved = approvals[idx] ?? true;
                    const bulletDiff = mergeDiffs(computeWordDiff(origBullet, newBullet));
                    const hasChanges = origBullet !== newBullet;

                    return (
                      <div
                        key={idx}
                        className={`diff-bullet-item ${isApproved ? 'approved' : 'rejected'} ${!hasChanges ? 'unchanged' : ''}`}
                      >
                        <label className="diff-bullet-checkbox">
                          <input
                            type="checkbox"
                            checked={isApproved}
                            onChange={() => toggleBullet(eb.expId, idx)}
                            disabled={!hasChanges}
                          />
                        </label>
                        <div className="diff-bullet-content">
                          {!hasChanges ? (
                            <div className="diff-bullet-unchanged">{newBullet}</div>
                          ) : viewMode === 'inline' ? (
                            <div className="diff-content-inline">
                              {bulletDiff.map((d, i) => (
                                <span key={i} className={`diff-word diff-word-${d.type}`}>
                                  {d.text}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="diff-content-side diff-content-side-compact">
                              <div className="diff-side diff-side-original">
                                <div className="diff-side-text">{origBullet}</div>
                              </div>
                              <div className="diff-side diff-side-modified">
                                <div className="diff-side-text">{newBullet}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="diff-footer">
        <div className="diff-footer-stats">
          <span>Summary: {summaryApproved ? 'accepted' : 'rejected'}</span>
          <span>
            Bullets: {approvedBullets}/{totalBullets} accepted
          </span>
        </div>
        <div className="diff-footer-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleApply}>
            Apply {approvedBullets + (summaryApproved ? 1 : 0)} Changes
          </button>
        </div>
      </div>
    </div>
  );
}
