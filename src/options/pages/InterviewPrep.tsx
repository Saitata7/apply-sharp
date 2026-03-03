import { useState, useMemo } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import { useProfile } from '../context/ProfileContext';
import type {
  InterviewPrepResult,
  InterviewQuestion,
  PreparedAnswer,
  QuestionCategory,
} from '@core/interview/question-generator';
import { getCategoryLabel, getDifficultyColor } from '@core/interview/question-generator';

// ── Category icon colors ────────────────────────────────────────────────

const CATEGORY_COLORS: Record<QuestionCategory, string> = {
  behavioral: '#8b5cf6',
  technical: '#38bdf8',
  role_specific: '#06b6d4',
  company_culture: '#10b981',
  weakness_gap: '#f59e0b',
  curveball: '#ef4444',
};

// ── Component ───────────────────────────────────────────────────────────

export default function InterviewPrep() {
  const { profile } = useProfile();

  // Input state
  const [jobDescription, setJobDescription] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InterviewPrepResult | null>(null);

  // UI state
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [showInsights, setShowInsights] = useState(true);
  const [showTips, setShowTips] = useState(false);

  const canGenerate = jobDescription.trim().length > 50 && !isGenerating && !!profile;

  // Group questions by category
  const groupedQuestions = useMemo(() => {
    if (!result) return new Map<QuestionCategory, InterviewQuestion[]>();
    const groups = new Map<QuestionCategory, InterviewQuestion[]>();
    for (const q of result.questions) {
      const list = groups.get(q.category) || [];
      list.push(q);
      groups.set(q.category, list);
    }
    return groups;
  }, [result]);

  // Map answers by questionId for lookup
  const answerMap = useMemo(() => {
    if (!result) return new Map<string, PreparedAnswer>();
    const map = new Map<string, PreparedAnswer>();
    for (const a of result.answers) {
      map.set(a.questionId, a);
    }
    return map;
  }, [result]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await sendMessage<
        { jobDescription: string; companyName: string; jobTitle: string },
        InterviewPrepResult
      >({
        type: 'GENERATE_INTERVIEW_PREP',
        payload: { jobDescription, companyName, jobTitle },
      });

      if (response.success && response.data) {
        setResult(response.data);
        setExpandedQuestions(new Set());
      } else {
        setError(response.error || 'Failed to generate interview prep');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to generate interview prep. Please try again.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleQuestion = (id: string) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (!result) return;
    setExpandedQuestions(new Set(result.questions.map((q) => q.id)));
  };

  const collapseAll = () => {
    setExpandedQuestions(new Set());
  };

  return (
    <div className="page-container" style={{ maxWidth: 900, padding: '32px 24px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: '#e8ecf4', margin: '0 0 4px' }}>
        Interview Preparation
      </h1>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 24px' }}>
        Generate tailored interview questions and STAR-method answers based on a job description and
        your profile.
      </p>

      {/* ── No Profile Warning ─────────────────────────────────────────── */}
      {!profile && (
        <div
          className="settings-section"
          style={{ textAlign: 'center', padding: 32, marginBottom: 20 }}
        >
          <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>
            Upload a resume first in <strong style={{ color: '#cbd5e1' }}>Create Profile</strong> to
            generate personalized interview prep.
          </p>
        </div>
      )}

      {/* ── Input Section ──────────────────────────────────────────────── */}
      {profile && (
        <div className="settings-section" style={{ padding: 20, marginBottom: 20 }}>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}
          >
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Company Name
              </label>
              <input
                className="form-input"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Google"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Job Title
              </label>
              <input
                className="form-input"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Senior Backend Engineer"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
              Job Description
            </label>
            <textarea
              className="form-input"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here..."
              rows={8}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              {jobDescription.length > 0 && `${jobDescription.length} characters`}
              {jobDescription.length > 0 && jobDescription.length < 50 && ' (minimum 50)'}
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={!canGenerate}
            style={{ width: '100%' }}
          >
            {isGenerating ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />
                Generating interview prep...
              </>
            ) : (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ marginRight: 8 }}
                  aria-hidden="true"
                >
                  <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Generate Interview Prep
              </>
            )}
          </button>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div
          className="settings-section"
          role="alert"
          style={{ padding: 16, marginBottom: 20, borderColor: '#ef4444' }}
        >
          <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────── */}
      {result && (
        <>
          {/* Summary bar */}
          <div
            className="settings-section"
            style={{
              padding: '12px 20px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              <strong style={{ color: '#e8ecf4' }}>{result.questions.length}</strong> questions
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              <strong style={{ color: '#e8ecf4' }}>~{result.estimatedPrepTime} min</strong> prep
              time
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              <strong style={{ color: '#e8ecf4' }}>{groupedQuestions.size}</strong> categories
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                onClick={expandAll}
                style={{
                  background: 'none',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Expand All
              </button>
              <button
                onClick={collapseAll}
                style={{
                  background: 'none',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Collapse All
              </button>
            </div>
          </div>

          {/* Company Insights */}
          {result.companyInsights.length > 0 && (
            <div className="settings-section" style={{ padding: '0', marginBottom: 16 }}>
              <button
                onClick={() => setShowInsights(!showInsights)}
                aria-expanded={showInsights}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  background: 'none',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  color: '#e8ecf4',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 500 }}>Company Research Tips</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="2"
                  aria-hidden="true"
                  style={{
                    transform: showInsights ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform 0.2s',
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {showInsights && (
                <ul
                  style={{
                    margin: 0,
                    padding: '0 20px 16px 36px',
                    fontSize: 13,
                    color: '#94a3b8',
                    lineHeight: 1.7,
                  }}
                >
                  {result.companyInsights.map((insight, i) => (
                    <li key={i}>{insight}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Questions grouped by category */}
          {Array.from(groupedQuestions.entries()).map(([category, questions]) => (
            <div key={category} style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                  padding: '0 4px',
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: CATEGORY_COLORS[category],
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>
                  {getCategoryLabel(category)}
                </span>
                <span style={{ fontSize: 11, color: '#64748b' }}>({questions.length})</span>
              </div>

              {questions.map((q) => {
                const answer = answerMap.get(q.id);
                const isExpanded = expandedQuestions.has(q.id);

                return (
                  <div
                    key={q.id}
                    className="settings-section"
                    style={{ marginBottom: 8, padding: 0, overflow: 'hidden' }}
                  >
                    {/* Question header */}
                    <button
                      onClick={() => toggleQuestion(q.id)}
                      aria-expanded={isExpanded}
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        background: 'none',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#64748b"
                        strokeWidth="2"
                        aria-hidden="true"
                        style={{
                          marginTop: 2,
                          flexShrink: 0,
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)',
                          transition: 'transform 0.15s',
                        }}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: '#e8ecf4', lineHeight: 1.5 }}>
                          {q.question}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: '#64748b',
                            marginTop: 4,
                            fontStyle: 'italic',
                          }}
                        >
                          {q.why}
                        </div>
                      </div>
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: 10,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: `${getDifficultyColor(q.difficulty)}15`,
                          color: getDifficultyColor(q.difficulty),
                          fontWeight: 600,
                          textTransform: 'uppercase',
                        }}
                      >
                        {q.difficulty}
                      </span>
                    </button>

                    {/* Expanded answer */}
                    {isExpanded && answer && (
                      <div
                        style={{
                          padding: '0 16px 16px 42px',
                          borderTop: '1px solid #1a1f2b',
                        }}
                      >
                        {/* Prepared answer */}
                        <div style={{ marginTop: 14 }}>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: '#64748b',
                              marginBottom: 6,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Prepared Answer
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              color: '#cbd5e1',
                              lineHeight: 1.6,
                              background: '#0a0d13',
                              padding: 14,
                              borderRadius: 8,
                              border: '1px solid #1a1f2b',
                            }}
                          >
                            {answer.answer}
                          </div>
                        </div>

                        {/* Key points */}
                        {answer.keyPoints.length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#64748b',
                                marginBottom: 6,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}
                            >
                              Key Points
                            </div>
                            <ul
                              style={{
                                margin: 0,
                                paddingLeft: 18,
                                fontSize: 12,
                                color: '#94a3b8',
                                lineHeight: 1.7,
                              }}
                            >
                              {answer.keyPoints.map((point, i) => (
                                <li key={i}>{point}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Delivery tips */}
                        {q.tips.length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#64748b',
                                marginBottom: 6,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}
                            >
                              Delivery Tips
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {q.tips.map((tip, i) => (
                                <span
                                  key={i}
                                  style={{
                                    fontSize: 11,
                                    padding: '3px 10px',
                                    borderRadius: 12,
                                    background: '#1a1f2b',
                                    color: '#94a3b8',
                                  }}
                                >
                                  {tip}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* General Tips */}
          {result.generalTips.length > 0 && (
            <div className="settings-section" style={{ padding: 0, marginBottom: 16 }}>
              <button
                onClick={() => setShowTips(!showTips)}
                aria-expanded={showTips}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  background: 'none',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  color: '#e8ecf4',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 500 }}>General Interview Tips</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="2"
                  aria-hidden="true"
                  style={{
                    transform: showTips ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform 0.2s',
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {showTips && (
                <ul
                  style={{
                    margin: 0,
                    padding: '0 20px 16px 36px',
                    fontSize: 13,
                    color: '#94a3b8',
                    lineHeight: 1.7,
                  }}
                >
                  {result.generalTips.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
