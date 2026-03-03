import { useState, useEffect } from 'react';
import type { MasterProfile } from '@shared/types/master-profile.types';
import {
  parseLinkedInText,
  checkLinkedInConsistency,
  type LinkedInConsistencyReport,
  type DiscrepancySeverity,
} from '@core/profile/linkedin-checker';

interface LinkedInCheckerProps {
  profile: MasterProfile;
  onClose: () => void;
}

export default function LinkedInChecker({ profile, onClose }: LinkedInCheckerProps) {
  const [linkedInText, setLinkedInText] = useState('');
  const [report, setReport] = useState<LinkedInConsistencyReport | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Close modal on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleCheck() {
    if (!linkedInText.trim()) {
      setParseError('Please paste your LinkedIn profile text');
      return;
    }

    setParseError(null);

    try {
      const parsed = parseLinkedInText(linkedInText);

      if (
        parsed.experience.length === 0 &&
        parsed.education.length === 0 &&
        parsed.skills.length === 0
      ) {
        setParseError(
          'Could not parse any experience, education, or skills from the text. ' +
            'Make sure you copied from your LinkedIn profile page.'
        );
        return;
      }

      const result = checkLinkedInConsistency(profile, parsed);
      setReport(result);
    } catch (err) {
      setParseError(
        'Failed to parse LinkedIn text: ' + ((err as Error).message || 'Unknown error')
      );
    }
  }

  function handleReset() {
    setReport(null);
    setParseError(null);
    setLinkedInText('');
  }

  const scoreColor = (score: number) =>
    score >= 90 ? '#22c55e' : score >= 70 ? '#f59e0b' : '#ef4444';

  const severityColor: Record<DiscrepancySeverity, string> = {
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#38bdf8',
  };

  const severityLabel: Record<DiscrepancySeverity, string> = {
    error: 'Critical',
    warning: 'Warning',
    info: 'Info',
  };

  const recommendationText: Record<string, string> = {
    consistent: 'Your resume and LinkedIn are well-aligned.',
    'update-linkedin': 'Your LinkedIn profile needs updating to match your resume.',
    'update-resume': 'Consider adding LinkedIn content to your resume.',
    both: 'Both your resume and LinkedIn need alignment updates.',
  };

  return (
    <div
      className="li-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="li-modal">
        {/* Header */}
        <div className="li-header">
          <div className="li-header-left">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
              <rect x="2" y="9" width="4" height="12" />
              <circle cx="4" cy="4" r="2" />
            </svg>
            <h2>LinkedIn Consistency Check</h2>
          </div>
          <button className="li-close-btn" onClick={onClose}>
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

        <div className="li-body">
          {/* Left Panel: Input */}
          <div className="li-input-panel">
            <div className="li-instructions">
              <h4>How to use</h4>
              <ol>
                <li>Go to your LinkedIn profile page</li>
                <li>Select all text (Ctrl/Cmd+A) and copy (Ctrl/Cmd+C)</li>
                <li>Paste it below</li>
              </ol>
            </div>

            <div className="li-field li-field-grow">
              <label>LinkedIn Profile Text</label>
              <textarea
                value={linkedInText}
                onChange={(e) => setLinkedInText(e.target.value)}
                placeholder={
                  'Paste your LinkedIn profile text here...\n\nExample:\nExperience\nSenior Software Engineer\nGoogle · Full-time\nJan 2022 - Present\n\nEducation\nStanford University\nBS, Computer Science\n2018 - 2022\n\nSkills\nPython · React · AWS'
                }
                rows={10}
              />
            </div>

            {report ? (
              <button className="li-check-btn" onClick={handleReset}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Check Again
              </button>
            ) : (
              <button className="li-check-btn" onClick={handleCheck}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                Check Consistency
              </button>
            )}

            {parseError && <div className="li-error">{parseError}</div>}
          </div>

          {/* Right Panel: Results */}
          <div className="li-output-panel">
            {!report && (
              <div className="li-empty-state">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="1.5"
                >
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                  <rect x="2" y="9" width="4" height="12" />
                  <circle cx="4" cy="4" r="2" />
                </svg>
                <p>Results will appear here</p>
                <span>Paste your LinkedIn profile and click Check Consistency</span>
              </div>
            )}

            {report && (
              <div className="li-results">
                {/* Score */}
                <div className="li-score-section">
                  <div
                    className="li-score-circle"
                    style={{ borderColor: scoreColor(report.score) }}
                  >
                    <span className="li-score-value" style={{ color: scoreColor(report.score) }}>
                      {report.score}
                    </span>
                    <span className="li-score-label">/ 100</span>
                  </div>
                  <div className="li-score-info">
                    <h3 style={{ color: scoreColor(report.score) }}>
                      {report.score >= 90
                        ? 'Excellent'
                        : report.score >= 70
                          ? 'Needs Attention'
                          : 'Inconsistent'}
                    </h3>
                    <p>{recommendationText[report.recommendation]}</p>
                    <div className="li-summary-badges">
                      {report.summary.errors > 0 && (
                        <span className="li-badge li-badge-error">
                          {report.summary.errors} critical
                        </span>
                      )}
                      {report.summary.warnings > 0 && (
                        <span className="li-badge li-badge-warning">
                          {report.summary.warnings} warning
                          {report.summary.warnings !== 1 ? 's' : ''}
                        </span>
                      )}
                      {report.summary.info > 0 && (
                        <span className="li-badge li-badge-info">{report.summary.info} info</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Discrepancies */}
                {report.discrepancies.length === 0 ? (
                  <div className="li-no-issues">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="2"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <p>No discrepancies found! Your resume and LinkedIn are consistent.</p>
                  </div>
                ) : (
                  <div className="li-discrepancy-list">
                    {report.discrepancies.map((d, i) => (
                      <div key={i} className={`li-discrepancy li-discrepancy-${d.severity}`}>
                        <div className="li-disc-header">
                          <span
                            className="li-severity-dot"
                            style={{ background: severityColor[d.severity] }}
                          />
                          <span
                            className="li-severity-label"
                            style={{ color: severityColor[d.severity] }}
                          >
                            {severityLabel[d.severity]}
                          </span>
                          <span className="li-disc-field">{d.field}</span>
                        </div>
                        <p className="li-disc-message">{d.message}</p>
                        <div className="li-disc-compare">
                          <div className="li-disc-value">
                            <span className="li-disc-label">Resume:</span>
                            <span>{d.resumeValue}</span>
                          </div>
                          <div className="li-disc-value">
                            <span className="li-disc-label">LinkedIn:</span>
                            <span>{d.linkedInValue}</span>
                          </div>
                        </div>
                        <p className="li-disc-suggestion">{d.suggestion}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{getLinkedInCheckerStyles()}</style>
    </div>
  );
}

function getLinkedInCheckerStyles(): string {
  return `
    .li-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    }

    .li-modal {
      background: #141820;
      border-radius: 12px;
      width: 100%;
      max-width: 900px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
    }

    .li-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .li-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #e8ecf4;
    }

    .li-header-left h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .li-close-btn {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
    }

    .li-close-btn:hover {
      background: #1a1f2b;
      color: #64748b;
    }

    .li-body {
      display: flex;
      flex: 1;
      overflow: hidden;
      min-height: 0;
    }

    .li-input-panel {
      width: 320px;
      min-width: 320px;
      padding: 16px;
      border-right: 1px solid rgba(255,255,255,0.06);
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow-y: auto;
    }

    .li-instructions {
      padding: 10px 12px;
      background: rgba(56,189,248,0.06);
      border: 1px solid rgba(56,189,248,0.15);
      border-radius: 8px;
      font-size: 12px;
      color: #38bdf8;
    }

    .li-instructions h4 {
      margin: 0 0 6px 0;
      font-size: 12px;
      font-weight: 600;
    }

    .li-instructions ol {
      margin: 0;
      padding-left: 18px;
    }

    .li-instructions li {
      margin-bottom: 2px;
    }

    .li-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .li-field-grow {
      flex: 1;
      min-height: 0;
    }

    .li-field label {
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
    }

    .li-field textarea {
      flex: 1;
      min-height: 200px;
      padding: 8px 10px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      font-size: 13px;
      font-family: inherit;
      color: #e8ecf4;
      background: #0e1219;
      resize: none;
      transition: border-color 0.15s;
    }

    .li-field textarea:focus {
      outline: none;
      border-color: #e8a832;
      background: #141820;
      box-shadow: 0 0 0 3px rgba(232, 168, 50, 0.1);
    }

    .li-check-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 16px;
      background: #e8a832;
      color: #0a0d13;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }

    .li-check-btn:hover {
      background: #c48a1a;
    }

    .li-error {
      padding: 8px 12px;
      background: rgba(239,68,68,0.08);
      border: 1px solid rgba(239,68,68,0.2);
      border-radius: 6px;
      color: #f87171;
      font-size: 12px;
    }

    /* Output Panel */
    .li-output-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }

    .li-empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #94a3b8;
      padding: 40px;
    }

    .li-empty-state p {
      margin: 0;
      font-size: 14px;
      color: #64748b;
    }

    .li-empty-state span {
      font-size: 12px;
    }

    .li-results {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* Score Section */
    .li-score-section {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      background: #0e1219;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.1);
    }

    .li-score-circle {
      width: 72px;
      height: 72px;
      min-width: 72px;
      border-radius: 50%;
      border: 3px solid;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .li-score-value {
      font-size: 24px;
      font-weight: 700;
      line-height: 1;
    }

    .li-score-label {
      font-size: 11px;
      color: #94a3b8;
    }

    .li-score-info h3 {
      margin: 0 0 4px 0;
      font-size: 16px;
      font-weight: 600;
    }

    .li-score-info p {
      margin: 0 0 8px 0;
      font-size: 13px;
      color: #64748b;
    }

    .li-summary-badges {
      display: flex;
      gap: 6px;
    }

    .li-badge {
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }

    .li-badge-error { background: rgba(239,68,68,0.1); color: #f87171; }
    .li-badge-warning { background: rgba(245,158,11,0.1); color: #f59e0b; }
    .li-badge-info { background: rgba(56,189,248,0.1); color: #38bdf8; }

    /* No issues */
    .li-no-issues {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 16px;
      background: rgba(52,211,153,0.08);
      border: 1px solid rgba(52,211,153,0.2);
      border-radius: 8px;
      font-size: 14px;
      color: #34d399;
    }

    .li-no-issues p { margin: 0; }

    /* Discrepancy List */
    .li-discrepancy-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .li-discrepancy {
      padding: 12px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.1);
      background: #141820;
    }

    .li-discrepancy-error { border-left: 3px solid #ef4444; }
    .li-discrepancy-warning { border-left: 3px solid #f59e0b; }
    .li-discrepancy-info { border-left: 3px solid #e8a832; }

    .li-disc-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }

    .li-severity-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .li-severity-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .li-disc-field {
      font-size: 12px;
      color: #64748b;
      margin-left: auto;
    }

    .li-disc-message {
      margin: 0 0 8px 0;
      font-size: 13px;
      color: #e8ecf4;
      font-weight: 500;
    }

    .li-disc-compare {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 8px;
      padding: 8px;
      background: #0e1219;
      border-radius: 6px;
      font-size: 12px;
    }

    .li-disc-value {
      display: flex;
      gap: 8px;
    }

    .li-disc-label {
      font-weight: 600;
      color: #64748b;
      min-width: 60px;
    }

    .li-disc-suggestion {
      margin: 0;
      font-size: 12px;
      color: #059669;
      font-style: italic;
    }
  `;
}
