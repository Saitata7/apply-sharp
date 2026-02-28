import { useState, useEffect, useCallback } from 'react';
import { useProfile } from '../context/ProfileContext';
import { sendMessage } from '@shared/utils/messaging';
import { parseResumeFile } from '@/core/resume/file-parser';
import type { ATSFormatScore, FormatIssue } from '@core/ats/format-validator';
import type { BulletValidationReport, BulletIssue } from '@core/resume/bullet-validator';
import type { GapAnalysisResult } from '@core/ats/gap-analyzer';
import SkillsGapAnalysis from '../components/SkillsGapAnalysis';

// ── Types ────────────────────────────────────────────────────────────────

interface QuickATSScore {
  score: number;
  tier: string;
  matchedKeywords: Array<{ keyword: string; count: number }>;
  missingKeywords: string[];
}

interface ScoreResult {
  formatScore: ATSFormatScore;
  bulletReport: BulletValidationReport;
  keywordScore?: QuickATSScore;
  gapAnalysis?: GapAnalysisResult;
  overallScore: number;
}

type ScoreMode = 'profile' | 'file';

// ── Helpers ──────────────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

function getScoreTier(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  return 'Needs Work';
}

function getSeverityIcon(severity: string): string {
  if (severity === 'error') return '\u{1F534}';
  if (severity === 'warning') return '\u{1F7E1}';
  return '\u{2139}\u{FE0F}';
}

const CATEGORY_LABELS: Record<string, string> = {
  sectionHeaders: 'Section Headers',
  dateFormat: 'Date Formatting',
  keywordDensity: 'Keyword Density',
  bulletQuality: 'Bullet Quality',
  pageCount: 'Page Count',
  acronymCoverage: 'Acronym Coverage',
};

// ── Component ────────────────────────────────────────────────────────────

export default function ATSScore() {
  const { profile } = useProfile();
  const [mode, setMode] = useState<ScoreMode>(profile ? 'profile' : 'file');
  const [targetPages, setTargetPages] = useState(1);
  const [jobDescription, setJobDescription] = useState('');
  const [isScoring, setIsScoring] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<Set<number>>(new Set());

  // File upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // ── Profile scoring ──────────────────────────────────────────────────

  const runProfileScore = useCallback(async () => {
    if (!profile?.id) return;
    setIsScoring(true);
    setError(null);
    try {
      const response = await sendMessage<unknown, ScoreResult>({
        type: 'SCORE_RESUME_ATS',
        payload: {
          masterProfileId: profile.id,
          targetPages,
          jobDescription: jobDescription.trim() || undefined,
        },
      });
      if (response.success && response.data) {
        setResult(response.data);
        setSuccessMsg(
          `Score: ${response.data.overallScore}/100 — ${getScoreTier(response.data.overallScore)}`
        );
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(response.error || 'Scoring failed');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsScoring(false);
    }
  }, [profile?.id, targetPages, jobDescription]);

  // ── File scoring ─────────────────────────────────────────────────────

  const runFileScore = useCallback(async () => {
    if (!uploadedFile) return;
    setIsScoring(true);
    setIsParsing(true);
    setError(null);
    try {
      // Parse the file to extract text
      const parseResult = await parseResumeFile(uploadedFile);
      setIsParsing(false);

      if (!parseResult.success || !parseResult.rawText.trim()) {
        setError(parseResult.errors?.[0] || 'Could not extract text from file');
        setIsScoring(false);
        return;
      }

      // Send raw text to background for scoring
      const response = await sendMessage<unknown, ScoreResult>({
        type: 'SCORE_RESUME_FILE_ATS',
        payload: {
          rawText: parseResult.rawText,
          targetPages,
          jobDescription: jobDescription.trim() || undefined,
        },
      });

      if (response.success && response.data) {
        setResult(response.data);
        setSuccessMsg(
          `Score: ${response.data.overallScore}/100 — ${getScoreTier(response.data.overallScore)}`
        );
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(response.error || 'Scoring failed');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsScoring(false);
      setIsParsing(false);
    }
  }, [uploadedFile, targetPages, jobDescription]);

  // Auto-score profile on mount
  useEffect(() => {
    if (mode === 'profile' && profile?.id && !result && !isScoring) {
      runProfileScore();
    }
  }, [profile?.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set target pages based on experience
  useEffect(() => {
    if (profile?.careerContext?.yearsOfExperience) {
      const years = profile.careerContext.yearsOfExperience;
      if (years <= 5) setTargetPages(1);
      else if (years <= 10) setTargetPages(2);
      else setTargetPages(2);
    }
  }, [profile?.careerContext?.yearsOfExperience]);

  // Clear results when switching mode
  const switchMode = (newMode: ScoreMode) => {
    setMode(newMode);
    setResult(null);
    setError(null);
  };

  const handleScore = () => {
    setError(null);
    setSuccessMsg(null);

    if (mode === 'profile') {
      if (!profile?.experience?.length) {
        setError('Your profile has no experience data to score. Add work experience first.');
        return;
      }
      if (jobDescription.trim() && jobDescription.trim().length < 50) {
        setError(
          'Job description seems too short for keyword matching — consider pasting the full listing.'
        );
        return;
      }
      runProfileScore();
    } else {
      if (!uploadedFile) {
        setError('Please upload a resume file first.');
        return;
      }
      if (jobDescription.trim() && jobDescription.trim().length < 50) {
        setError(
          'Job description seems too short for keyword matching — consider pasting the full listing.'
        );
        return;
      }
      runFileScore();
    }
  };

  // ── File upload handlers ─────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSetFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const validateAndSetFile = (file: File) => {
    const validExtensions = ['.pdf', '.docx', '.txt'];
    const hasValidExtension = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!hasValidExtension) {
      setError('Please upload a PDF, DOCX, or TXT file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }
    setUploadedFile(file);
    setResult(null);
    setError(null);
  };

  const toggleRole = (index: number) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>ATS Resume Score</h1>
        <p className="page-description">
          Check how well your resume is optimized for Applicant Tracking Systems.
        </p>
      </div>

      {/* Mode Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16 }}>
        <button
          data-testid="mode-profile"
          onClick={() => switchMode('profile')}
          style={{
            flex: 1,
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 600,
            background: mode === 'profile' ? '#3b82f6' : '#1e293b',
            color: mode === 'profile' ? '#fff' : '#94a3b8',
            border: '1px solid #334155',
            borderRight: 'none',
            borderRadius: '6px 0 0 6px',
            cursor: 'pointer',
          }}
        >
          Score My Profile
        </button>
        <button
          data-testid="mode-file"
          onClick={() => switchMode('file')}
          style={{
            flex: 1,
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 600,
            background: mode === 'file' ? '#3b82f6' : '#1e293b',
            color: mode === 'file' ? '#fff' : '#94a3b8',
            border: '1px solid #334155',
            borderRadius: '0 6px 6px 0',
            cursor: 'pointer',
          }}
        >
          Upload & Score Resume
        </button>
      </div>

      {/* Controls */}
      <div className="settings-section" style={{ marginBottom: 20 }}>
        {/* File upload zone (file mode only) */}
        {mode === 'file' && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
              Upload a resume file (PDF, DOCX, or TXT)
            </label>
            <div
              data-testid="file-dropzone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${isDragging ? '#3b82f6' : uploadedFile ? '#10b981' : '#334155'}`,
                borderRadius: 8,
                padding: uploadedFile ? '12px 16px' : '24px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                background: isDragging ? 'rgba(59,130,246,0.05)' : 'transparent',
                transition: 'all 0.2s ease',
              }}
              onClick={() => {
                if (!uploadedFile) document.getElementById('ats-file-input')?.click();
              }}
            >
              {uploadedFile ? (
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 13, color: '#e2e8f0' }}>{uploadedFile.name}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {(uploadedFile.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setUploadedFile(null);
                      setResult(null);
                    }}
                    style={{ background: '#1e293b', borderColor: '#334155', fontSize: 11 }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#64748b"
                    strokeWidth="1.5"
                    style={{ margin: '0 auto 8px', display: 'block' }}
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                    Drag and drop your resume here, or{' '}
                    <span style={{ color: '#3b82f6', textDecoration: 'underline' }}>browse</span>
                  </p>
                  <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0' }}>
                    Score any resume — generated from ApplySharp or downloaded elsewhere
                  </p>
                </>
              )}
              <input
                id="ats-file-input"
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={handleFileSelect}
                hidden
              />
            </div>
          </div>
        )}

        {/* Profile empty state */}
        {mode === 'profile' && !profile && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: 13 }}>
            No profile loaded. Create a profile first, or switch to &ldquo;Upload &amp; Score
            Resume&rdquo; to score any resume file.
          </div>
        )}

        {/* Pages toggle + Score button */}
        {(mode === 'file' || profile) && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Target Pages
              </label>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3].map((p) => (
                  <button
                    key={p}
                    className={`btn btn-sm ${targetPages === p ? 'btn-primary' : ''}`}
                    onClick={() => setTargetPages(p)}
                    style={{
                      minWidth: 36,
                      background: targetPages === p ? undefined : '#1e293b',
                      borderColor: targetPages === p ? undefined : '#334155',
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="btn btn-primary"
              data-testid="score-button"
              onClick={handleScore}
              disabled={
                isScoring ||
                (mode === 'profile' && !profile?.id) ||
                (mode === 'file' && !uploadedFile)
              }
              style={{ height: 34 }}
            >
              {isScoring ? (isParsing ? 'Parsing file...' : 'Scoring...') : 'Score Resume'}
            </button>
          </div>
        )}

        {/* JD textarea */}
        {(mode === 'file' || profile) && (
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
              Job Description (optional{mode === 'profile' ? ' — enables keyword matching' : ''})
            </label>
            <textarea
              className="textarea"
              data-testid="jd-textarea"
              placeholder="Paste a job description here for keyword match scoring..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={3}
              style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="error-message" data-testid="ats-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {successMsg && (
        <div
          className="current-profile-notice"
          data-testid="ats-success"
          style={{ marginBottom: 16 }}
        >
          {successMsg}
        </div>
      )}

      {result && (
        <>
          <div data-testid="overall-score">
            <OverallScoreCard score={result.overallScore} hasJD={!!result.keywordScore} />
          </div>
          <FormatBreakdown formatScore={result.formatScore} />
          <BulletQuality
            report={result.bulletReport}
            expandedRoles={expandedRoles}
            toggleRole={toggleRole}
          />
          {result.keywordScore && <KeywordMatch score={result.keywordScore} />}
          {result.gapAnalysis && <SkillsGapAnalysis analysis={result.gapAnalysis} />}
          <IssuesList
            formatIssues={result.formatScore.issues}
            bulletIssues={result.bulletReport.topIssues}
          />
        </>
      )}
    </div>
  );
}

// ── Sub-Components ─────────────────────────────────────────────────────

function OverallScoreCard({ score, hasJD }: { score: number; hasJD: boolean }) {
  const color = getScoreColor(score);
  const tier = getScoreTier(score);

  return (
    <div className="settings-section" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            border: `4px solid ${color}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 28, fontWeight: 700, color }}>{score}</span>
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Overall ATS Score</h2>
          <p style={{ margin: '4px 0 0', color, fontWeight: 600, fontSize: 15 }}>{tier}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
            {hasJD
              ? 'Format (25%) + Bullets (35%) + Keywords (40%)'
              : 'Format (40%) + Bullets (60%)'}
          </p>
        </div>
      </div>
    </div>
  );
}

function FormatBreakdown({ formatScore }: { formatScore: ATSFormatScore }) {
  const categories = Object.entries(formatScore.categoryScores) as Array<[string, number]>;

  return (
    <div className="settings-section" style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>
        Format Score: {formatScore.overallScore}/100
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {categories.map(([key, value]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: '#cbd5e1', width: 130, flexShrink: 0 }}>
              {CATEGORY_LABELS[key] || key}
            </span>
            <div
              style={{
                flex: 1,
                background: '#1e293b',
                borderRadius: 4,
                height: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${value}%`,
                  height: '100%',
                  borderRadius: 4,
                  background: getScoreColor(value),
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: getScoreColor(value),
                width: 30,
                textAlign: 'right',
              }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BulletQuality({
  report,
  expandedRoles,
  toggleRole,
}: {
  report: BulletValidationReport;
  expandedRoles: Set<number>;
  toggleRole: (i: number) => void;
}) {
  return (
    <div className="settings-section" style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Bullet Quality: {report.overallScore}/100</h3>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>
        {report.totalBullets} bullets analyzed, {report.bulletsWithIssues} with issues
      </p>

      {report.roles.length === 0 && (
        <p style={{ fontSize: 12, color: '#64748b' }}>No bullet points detected in the resume.</p>
      )}

      {report.roles.map((role, i) => (
        <div
          key={i}
          style={{
            border: '1px solid #334155',
            borderRadius: 6,
            marginBottom: 8,
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => toggleRole(i)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: '#1e293b',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#e2e8f0',
              fontSize: 13,
            }}
          >
            <span>
              <strong>{role.title}</strong>
              <span style={{ color: '#94a3b8' }}> @ {role.company}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
              <span style={{ color: getScoreColor(role.roleScore) }}>{role.roleScore}/100</span>
              <span style={{ color: '#64748b' }}>{role.bulletCount} bullets</span>
              <span style={{ color: '#64748b' }}>{expandedRoles.has(i) ? '\u25B2' : '\u25BC'}</span>
            </span>
          </button>

          {expandedRoles.has(i) && (
            <div style={{ padding: '8px 12px', fontSize: 12 }}>
              {role.issues.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  {role.issues.map((issue, j) => (
                    <div
                      key={j}
                      style={{
                        color: issue.severity === 'error' ? '#ef4444' : '#f59e0b',
                        marginBottom: 2,
                      }}
                    >
                      {getSeverityIcon(issue.severity)} {issue.message}
                    </div>
                  ))}
                </div>
              )}
              {role.bullets.map((bullet, j) => (
                <div
                  key={j}
                  style={{
                    padding: '6px 0',
                    borderTop: j > 0 ? '1px solid #1e293b' : 'none',
                  }}
                >
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}
                  >
                    <span style={{ color: '#cbd5e1' }}>Bullet #{j + 1}</span>
                    <span style={{ color: getScoreColor(bullet.score), fontWeight: 600 }}>
                      {bullet.score}/100
                    </span>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4, lineHeight: 1.4 }}>
                    {bullet.text.length > 120 ? bullet.text.slice(0, 120) + '...' : bullet.text}
                  </div>
                  {bullet.issues.map((issue, k) => (
                    <div key={k} style={{ color: '#f59e0b', fontSize: 11, marginBottom: 1 }}>
                      {getSeverityIcon(issue.severity)} {issue.message}
                      {issue.suggestion && (
                        <span style={{ color: '#64748b' }}> — {issue.suggestion}</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function KeywordMatch({ score }: { score: QuickATSScore }) {
  return (
    <div className="settings-section" style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Keyword Match: {score.score}/100</h3>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>
        Tier: {score.tier} | Matched: {score.matchedKeywords.length} keywords
      </p>

      {score.matchedKeywords.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>Matched: </span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            {score.matchedKeywords.map((k) => k.keyword).join(', ')}
          </span>
        </div>
      )}

      {score.missingKeywords.length > 0 && (
        <div>
          <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>Missing: </span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{score.missingKeywords.join(', ')}</span>
        </div>
      )}
    </div>
  );
}

function IssuesList({
  formatIssues,
  bulletIssues,
}: {
  formatIssues: FormatIssue[];
  bulletIssues: BulletIssue[];
}) {
  const allIssues = [
    ...formatIssues.map((i) => ({ ...i, source: 'format' as const })),
    ...bulletIssues.map((i) => ({
      category: 'bullets' as const,
      severity: i.severity,
      message: i.message,
      suggestion: i.suggestion,
      source: 'bullet' as const,
    })),
  ];

  const severityOrder = { error: 0, warning: 1, info: 2 };
  allIssues.sort((a, b) => (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2));

  if (allIssues.length === 0) return null;

  const errorCount = allIssues.filter((i) => i.severity === 'error').length;
  const warnCount = allIssues.filter((i) => i.severity === 'warning').length;
  const infoCount = allIssues.filter((i) => i.severity === 'info').length;

  return (
    <div className="settings-section" style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Issues & Suggestions</h3>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>
        {errorCount > 0 && <span style={{ color: '#ef4444' }}>{errorCount} errors</span>}
        {errorCount > 0 && (warnCount > 0 || infoCount > 0) && ' | '}
        {warnCount > 0 && <span style={{ color: '#f59e0b' }}>{warnCount} warnings</span>}
        {warnCount > 0 && infoCount > 0 && ' | '}
        {infoCount > 0 && <span style={{ color: '#3b82f6' }}>{infoCount} info</span>}
      </p>

      {allIssues.map((issue, i) => (
        <div
          key={i}
          style={{
            padding: '8px 0',
            borderTop: i > 0 ? '1px solid #1e293b' : 'none',
            fontSize: 13,
          }}
        >
          <div
            style={{
              color:
                issue.severity === 'error'
                  ? '#ef4444'
                  : issue.severity === 'warning'
                    ? '#f59e0b'
                    : '#3b82f6',
            }}
          >
            {getSeverityIcon(issue.severity)} {issue.message}
          </div>
          {issue.suggestion && (
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2, paddingLeft: 20 }}>
              {issue.suggestion}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
