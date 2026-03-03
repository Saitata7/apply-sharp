import type { RedFlagReport, RedFlagSeverity } from '@core/resume/red-flag-scanner';
import { semantic, text, border, getScoreColor } from '@shared/constants/theme';

// ── Helpers ──────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<RedFlagSeverity, string> = {
  error: semantic.error,
  warning: semantic.warning,
  info: semantic.info,
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
          Red Flags: <span style={{ color: semantic.success }}>None Found</span>
        </h3>
        <p style={{ margin: 0, fontSize: 12, color: text.secondary }}>
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
      <p style={{ margin: '0 0 12px', fontSize: 12, color: text.secondary }}>
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
            borderTop: i > 0 ? `1px solid ${border.default}` : 'none',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0 }}>{SEVERITY_ICONS[flag.severity]}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: text.primary, marginBottom: 2 }}>{flag.message}</div>
              {flag.details && (
                <div style={{ fontSize: 11, color: text.faint, marginBottom: 2 }}>
                  {flag.details}
                </div>
              )}
              <div style={{ fontSize: 12, color: text.secondary }}>{flag.suggestion}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
