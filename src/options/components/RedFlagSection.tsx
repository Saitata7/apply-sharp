import type { RedFlagReport, RedFlagSeverity } from '@core/resume/red-flag-scanner';

// ── Helpers ──────────────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

const SEVERITY_COLORS: Record<RedFlagSeverity, string> = {
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

const SEVERITY_ICONS: Record<RedFlagSeverity, string> = {
  error: '\u{1F534}',
  warning: '\u{1F7E1}',
  info: '\u{2139}\u{FE0F}',
};

// ── Component ────────────────────────────────────────────────────────────

interface RedFlagSectionProps {
  report: RedFlagReport;
}

export default function RedFlagSection({ report }: RedFlagSectionProps) {
  if (report.flags.length === 0) {
    return (
      <div className="settings-section" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>
          Red Flags: <span style={{ color: '#10b981' }}>None Found</span>
        </h3>
        <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
          No career-level red flags detected — your profile looks clean.
        </p>
      </div>
    );
  }

  const { summary, score } = report;

  return (
    <div className="settings-section" style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>
        Red Flags: <span style={{ color: getScoreColor(score) }}>{score}/100</span>
      </h3>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>
        {summary.errors > 0 && (
          <span style={{ color: SEVERITY_COLORS.error }}>{summary.errors} errors</span>
        )}
        {summary.errors > 0 && (summary.warnings > 0 || summary.info > 0) && ' | '}
        {summary.warnings > 0 && (
          <span style={{ color: SEVERITY_COLORS.warning }}>{summary.warnings} warnings</span>
        )}
        {summary.warnings > 0 && summary.info > 0 && ' | '}
        {summary.info > 0 && (
          <span style={{ color: SEVERITY_COLORS.info }}>{summary.info} info</span>
        )}
      </p>

      {report.flags.map((flag, i) => (
        <div
          key={i}
          style={{
            padding: '8px 0',
            borderTop: i > 0 ? '1px solid #1e293b' : 'none',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0 }}>{SEVERITY_ICONS[flag.severity]}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e2e8f0', marginBottom: 2 }}>{flag.message}</div>
              {flag.details && (
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>
                  {flag.details}
                </div>
              )}
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{flag.suggestion}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
