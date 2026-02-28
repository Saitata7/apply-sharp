import { useState } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import { Document, Packer, Paragraph, TextRun, convertInchesToTwip } from 'docx';

interface CoverLetterGeneratorProps {
  onClose: () => void;
  /** Pre-fill from sidebar or resume generator context */
  initialJobDescription?: string;
  initialCompanyName?: string;
  initialJobTitle?: string;
}

type Tone = 'professional' | 'conversational' | 'formal';

interface GenerationResult {
  coverLetter: string;
  wordCount: number;
  tone: Tone;
}

export default function CoverLetterGenerator({
  onClose,
  initialJobDescription = '',
  initialCompanyName = '',
  initialJobTitle = '',
}: CoverLetterGeneratorProps) {
  // Input state
  const [jobDescription, setJobDescription] = useState(initialJobDescription);
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [jobTitle, setJobTitle] = useState(initialJobTitle);
  const [tone, setTone] = useState<Tone>('professional');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);

  // Edit state
  const [editedText, setEditedText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentText = isEditing ? editedText : result?.coverLetter || '';
  const wordCount = currentText.trim().split(/\s+/).filter(Boolean).length;

  const wordCountColor =
    wordCount === 0
      ? '#94a3b8'
      : wordCount < 150
        ? '#f59e0b'
        : wordCount > 300
          ? '#ef4444'
          : '#22c55e';

  async function handleGenerate() {
    if (!jobDescription.trim()) {
      setError('Please paste the job description');
      return;
    }
    if (!companyName.trim()) {
      setError('Please enter the company name');
      return;
    }
    if (!jobTitle.trim()) {
      setError('Please enter the job title');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResult(null);
    setIsEditing(false);

    try {
      const response = await sendMessage<
        { jobDescription: string; companyName: string; jobTitle: string; tone: Tone },
        GenerationResult
      >({
        type: 'GENERATE_COVER_LETTER',
        payload: {
          jobDescription: jobDescription.trim(),
          companyName: companyName.trim(),
          jobTitle: jobTitle.trim(),
          tone,
        },
      });

      if (response.success && response.data) {
        setResult(response.data);
        setEditedText(response.data.coverLetter);
      } else {
        setError(response.error || 'Cover letter generation failed');
      }
    } catch (err) {
      setError(`Generation failed: ${(err as Error).message}`);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(currentText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = currentText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleDownloadDocx() {
    const paragraphs = currentText.split('\n').map((line) => {
      if (!line.trim()) {
        return new Paragraph({ spacing: { after: 120 } });
      }
      return new Paragraph({
        children: [
          new TextRun({
            text: line,
            font: 'Calibri',
            size: 22, // 11pt
          }),
        ],
        spacing: { after: 120 },
      });
    });

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1),
                bottom: convertInchesToTwip(1),
                left: convertInchesToTwip(1),
                right: convertInchesToTwip(1),
              },
            },
          },
          children: paragraphs,
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    const fileName = `Cover_Letter_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${jobTitle.replace(/[^a-zA-Z0-9]/g, '_')}.docx`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleRegenerate() {
    setResult(null);
    setIsEditing(false);
    setEditedText('');
    handleGenerate();
  }

  return (
    <div
      className="cl-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cl-modal">
        {/* Header */}
        <div className="cl-header">
          <div className="cl-header-left">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <h2>Cover Letter Generator</h2>
          </div>
          <button className="cl-close-btn" onClick={onClose}>
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

        <div className="cl-body">
          {/* Left Panel: Inputs */}
          <div className="cl-input-panel">
            <div className="cl-field">
              <label>Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g., Google, Stripe, Acme Corp"
                disabled={isGenerating}
              />
            </div>

            <div className="cl-field">
              <label>Job Title</label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g., Senior Software Engineer"
                disabled={isGenerating}
              />
            </div>

            <div className="cl-field">
              <label>Tone</label>
              <div className="cl-tone-group">
                {(['professional', 'conversational', 'formal'] as Tone[]).map((t) => (
                  <button
                    key={t}
                    className={`cl-tone-btn ${tone === t ? 'active' : ''}`}
                    onClick={() => setTone(t)}
                    disabled={isGenerating}
                  >
                    {t === 'professional'
                      ? 'Professional'
                      : t === 'conversational'
                        ? 'Conversational'
                        : 'Formal'}
                  </button>
                ))}
              </div>
            </div>

            <div className="cl-field cl-field-grow">
              <label>Job Description</label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the full job description here..."
                disabled={isGenerating}
                rows={10}
              />
            </div>

            <button
              className="cl-generate-btn"
              onClick={result ? handleRegenerate : handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <span className="cl-spinner" />
                  Generating...
                </>
              ) : result ? (
                <>
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
                  Regenerate
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
                  >
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Generate Cover Letter
                </>
              )}
            </button>

            {error && <div className="cl-error">{error}</div>}
          </div>

          {/* Right Panel: Output */}
          <div className="cl-output-panel">
            {!result && !isGenerating && (
              <div className="cl-empty-state">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="1.5"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <p>Your cover letter will appear here</p>
                <span>Fill in the job details and click Generate</span>
              </div>
            )}

            {isGenerating && (
              <div className="cl-loading">
                <div className="cl-loading-spinner" />
                <p>Analyzing job description...</p>
                <span>Creating a tailored cover letter using your profile</span>
              </div>
            )}

            {result && (
              <>
                {/* Toolbar */}
                <div className="cl-toolbar">
                  <div className="cl-word-count" style={{ color: wordCountColor }}>
                    {wordCount} words
                    {wordCount < 150 && ' (too short)'}
                    {wordCount > 300 && ' (too long)'}
                    {wordCount >= 150 && wordCount <= 300 && ' (good)'}
                  </div>
                  <div className="cl-toolbar-actions">
                    <button
                      className="cl-tool-btn"
                      onClick={() => {
                        if (isEditing) {
                          setIsEditing(false);
                        } else {
                          setEditedText(result.coverLetter);
                          setIsEditing(true);
                        }
                      }}
                      title={isEditing ? 'Done editing' : 'Edit'}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        {isEditing ? (
                          <polyline points="20 6 9 17 4 12" />
                        ) : (
                          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        )}
                      </svg>
                      {isEditing ? 'Done' : 'Edit'}
                    </button>
                    <button className="cl-tool-btn" onClick={handleCopy} title="Copy to clipboard">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        {copied ? (
                          <polyline points="20 6 9 17 4 12" />
                        ) : (
                          <>
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </>
                        )}
                      </svg>
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      className="cl-tool-btn cl-tool-btn-primary"
                      onClick={handleDownloadDocx}
                      title="Download as DOCX"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      DOCX
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="cl-content">
                  {isEditing ? (
                    <textarea
                      className="cl-edit-textarea"
                      value={editedText}
                      onChange={(e) => setEditedText(e.target.value)}
                      autoFocus
                    />
                  ) : (
                    <div className="cl-letter-text">
                      {currentText.split('\n').map((line, i) => (
                        <p key={i}>{line || '\u00A0'}</p>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{getCoverLetterStyles()}</style>
    </div>
  );
}

function getCoverLetterStyles(): string {
  return `
    .cl-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    }

    .cl-modal {
      background: white;
      border-radius: 12px;
      width: 100%;
      max-width: 900px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
    }

    .cl-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid #e2e8f0;
    }

    .cl-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #1e293b;
    }

    .cl-header-left h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .cl-close-btn {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
    }

    .cl-close-btn:hover {
      background: #f1f5f9;
      color: #475569;
    }

    .cl-body {
      display: flex;
      flex: 1;
      overflow: hidden;
      min-height: 0;
    }

    .cl-input-panel {
      width: 320px;
      min-width: 320px;
      padding: 16px;
      border-right: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow-y: auto;
    }

    .cl-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .cl-field-grow {
      flex: 1;
      min-height: 0;
    }

    .cl-field label {
      font-size: 12px;
      font-weight: 600;
      color: #475569;
    }

    .cl-field input,
    .cl-field textarea {
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 13px;
      font-family: inherit;
      color: #1e293b;
      background: #f8fafc;
      transition: border-color 0.15s;
    }

    .cl-field input:focus,
    .cl-field textarea:focus {
      outline: none;
      border-color: #3b82f6;
      background: white;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .cl-field textarea {
      flex: 1;
      resize: none;
      min-height: 120px;
    }

    .cl-tone-group {
      display: flex;
      gap: 6px;
    }

    .cl-tone-btn {
      flex: 1;
      padding: 6px 8px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #f8fafc;
      font-size: 11px;
      font-weight: 500;
      color: #64748b;
      cursor: pointer;
      transition: all 0.15s;
    }

    .cl-tone-btn:hover {
      border-color: #cbd5e1;
      background: white;
    }

    .cl-tone-btn.active {
      border-color: #3b82f6;
      background: #eff6ff;
      color: #2563eb;
    }

    .cl-generate-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 16px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }

    .cl-generate-btn:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .cl-generate-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .cl-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: cl-spin 0.6s linear infinite;
    }

    @keyframes cl-spin {
      to { transform: rotate(360deg); }
    }

    .cl-error {
      padding: 8px 12px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 6px;
      color: #dc2626;
      font-size: 12px;
    }

    /* Output Panel */
    .cl-output-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .cl-empty-state,
    .cl-loading {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #94a3b8;
      padding: 40px;
    }

    .cl-empty-state p,
    .cl-loading p {
      margin: 0;
      font-size: 14px;
      color: #64748b;
    }

    .cl-empty-state span,
    .cl-loading span {
      font-size: 12px;
    }

    .cl-loading-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #e2e8f0;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: cl-spin 0.8s linear infinite;
      margin-bottom: 8px;
    }

    .cl-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      border-bottom: 1px solid #f1f5f9;
      background: #f8fafc;
    }

    .cl-word-count {
      font-size: 12px;
      font-weight: 600;
    }

    .cl-toolbar-actions {
      display: flex;
      gap: 6px;
    }

    .cl-tool-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 5px 10px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: white;
      font-size: 12px;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s;
    }

    .cl-tool-btn:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }

    .cl-tool-btn-primary {
      background: #2563eb;
      border-color: #2563eb;
      color: white;
    }

    .cl-tool-btn-primary:hover {
      background: #1d4ed8;
    }

    .cl-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .cl-letter-text {
      font-family: 'Calibri', 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.7;
      color: #1e293b;
    }

    .cl-letter-text p {
      margin: 0 0 8px 0;
    }

    .cl-edit-textarea {
      width: 100%;
      height: 100%;
      min-height: 300px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 16px;
      font-family: 'Calibri', 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.7;
      color: #1e293b;
      resize: none;
    }

    .cl-edit-textarea:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
  `;
}
