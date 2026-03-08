import { useState, useEffect } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import type { ProfileHealthReport, ActionItem, HealthLevel } from '@/core/profile/profile-reviewer';

interface ProfileHealthProps {
  masterProfileId: string;
  onClose: () => void;
}

const LEVEL_CONFIG: Record<HealthLevel, { color: string; bg: string; label: string }> = {
  excellent: { color: 'var(--cl-emerald)', bg: 'var(--cl-emerald-glow)', label: 'Excellent' },
  good: { color: 'var(--cl-sky)', bg: 'var(--cl-sky-glow)', label: 'Good' },
  'needs-work': { color: 'var(--ac-amber)', bg: 'var(--ac-amber-ghost)', label: 'Needs Work' },
  critical: { color: 'var(--cl-rose)', bg: 'var(--cl-rose-glow)', label: 'Critical' },
};

const PRIORITY_COLORS = {
  high: 'var(--cl-rose)',
  medium: 'var(--ac-amber)',
  low: 'var(--cl-sky)',
};

export default function ProfileHealth({ masterProfileId, onClose }: ProfileHealthProps) {
  const [report, setReport] = useState<ProfileHealthReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    loadHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterProfileId]);

  const loadHealth = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await sendMessage<{ masterProfileId: string }, ProfileHealthReport>({
        type: 'GET_PROFILE_HEALTH',
        payload: { masterProfileId },
      });

      if (response.success && response.data) {
        setReport(response.data);
      } else {
        setError(response.error || 'Failed to load profile health');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health report');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="profile-health">
        <div className="profile-health-header">
          <h2>Profile Health</h2>
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
        <div className="profile-health-loading">
          <div className="spinner"></div>
          <p>Analyzing your profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="profile-health">
        <div className="profile-health-header">
          <h2>Profile Health</h2>
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
        <div className="ai-error">{error}</div>
      </div>
    );
  }

  if (!report) return null;

  const config = LEVEL_CONFIG[report.level];

  // Group action items by category
  const groupedActions = report.actionItems.reduce(
    (acc, item) => {
      const key = item.category;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {} as Record<string, ActionItem[]>
  );

  const categoryLabels: Record<string, string> = {
    weak_bullet: 'Weak Bullets',
    missing_info: 'Missing Information',
    red_flag: 'Red Flags',
    skill_gap: 'Skill Gaps',
    incomplete_section: 'Incomplete Sections',
    defensibility: 'Defensibility Issues',
  };

  const highCount = report.actionItems.filter((i) => i.priority === 'high').length;
  const medCount = report.actionItems.filter((i) => i.priority === 'medium').length;

  return (
    <div className="profile-health">
      <div className="profile-health-header">
        <h2>Profile Health</h2>
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

      {/* Score overview */}
      <div className="health-overview" style={{ borderColor: config.color }}>
        <div className="health-score-ring" style={{ background: config.bg }}>
          <span className="health-score-number" style={{ color: config.color }}>
            {report.overallScore}
          </span>
          <span className="health-score-max">/100</span>
        </div>
        <div className="health-overview-info">
          <span
            className="health-level-badge"
            style={{ background: config.bg, color: config.color }}
          >
            {config.label}
          </span>
          <p className="health-summary">{report.summary}</p>
          <div className="health-stats">
            {highCount > 0 && (
              <span className="health-stat" style={{ color: PRIORITY_COLORS.high }}>
                {highCount} high priority
              </span>
            )}
            {medCount > 0 && (
              <span className="health-stat" style={{ color: PRIORITY_COLORS.medium }}>
                {medCount} medium
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sub-scores */}
      <div className="health-subscores">
        <div className="health-subscore">
          <div className="health-subscore-label">Claims Quality</div>
          <div className="health-subscore-bar">
            <div
              className="health-subscore-fill"
              style={{ width: `${report.claimsReport.overallScore}%` }}
            />
          </div>
          <span className="health-subscore-value">{report.claimsReport.overallScore}%</span>
        </div>
        <div className="health-subscore">
          <div className="health-subscore-label">Red Flag Score</div>
          <div className="health-subscore-bar">
            <div
              className="health-subscore-fill"
              style={{ width: `${report.redFlagReport.score}%` }}
            />
          </div>
          <span className="health-subscore-value">{report.redFlagReport.score}%</span>
        </div>
        <div className="health-subscore">
          <div className="health-subscore-label">Completeness</div>
          <div className="health-subscore-bar">
            <div
              className="health-subscore-fill"
              style={{ width: `${report.completenessReport.score}%` }}
            />
          </div>
          <span className="health-subscore-value">{report.completenessReport.score}%</span>
        </div>
      </div>

      {/* Action items */}
      <div className="health-actions">
        <h3 className="health-actions-title">Action Items ({report.actionItems.length})</h3>

        {Object.entries(groupedActions).map(([category, items]) => (
          <div key={category} className="health-action-group">
            <button
              className="health-action-group-header"
              onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
            >
              <span className="health-action-group-label">
                {categoryLabels[category] || category} ({items.length})
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`chevron ${expandedCategory === category ? 'expanded' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {expandedCategory === category && (
              <div className="health-action-items">
                {items.map((item, i) => (
                  <div key={i} className="health-action-item">
                    <div
                      className="health-action-priority"
                      style={{ background: PRIORITY_COLORS[item.priority] }}
                    />
                    <div className="health-action-content">
                      <div className="health-action-title">{item.title}</div>
                      <div className="health-action-desc">{item.description}</div>
                      <div className="health-action-suggestion">{item.suggestion}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {report.actionItems.length === 0 && (
          <p className="health-no-actions">No issues found. Your profile looks great!</p>
        )}
      </div>

      {/* Strengths */}
      {report.strengthsReport.topStrengths.length > 0 && (
        <div className="health-strengths">
          <h3 className="health-actions-title">Strengths</h3>
          <div className="health-strength-list">
            {report.strengthsReport.topStrengths.map((h, i) => (
              <div key={i} className="health-strength-item">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--cl-emerald)"
                  strokeWidth="2"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{h}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
