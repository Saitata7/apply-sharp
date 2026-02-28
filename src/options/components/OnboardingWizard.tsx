import { useState, useCallback } from 'react';
import type { MasterProfile } from '@shared/types/master-profile.types';
import type { AIProvider, UserSettings } from '@shared/types/settings.types';
import { getDefaultSettings } from '@shared/types/settings.types';
import { DEFAULT_MODELS, DEFAULT_OLLAMA_BASE_URL } from '@shared/constants/models';
import { sendMessage } from '@shared/utils/messaging';
import { parseResumeFile, extractBasicInfo } from '@/core/resume/file-parser';
import { useProfile } from '../context/ProfileContext';

// ── Types ────────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

type WizardStep = 0 | 1 | 2 | 3;

// ── Provider Metadata ────────────────────────────────────────────────────

const PROVIDERS: Array<{
  id: AIProvider;
  name: string;
  description: string;
  needsKey: boolean;
}> = [
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local AI — free, private, no API key',
    needsKey: false,
  },
  { id: 'openai', name: 'OpenAI', description: 'GPT-4o — fast, high quality', needsKey: true },
  { id: 'groq', name: 'Groq', description: 'Free tier available — fast inference', needsKey: true },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models — coming soon',
    needsKey: true,
  },
];

// ── Component ────────────────────────────────────────────────────────────

export default function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const { setProfile, refreshAllProfiles } = useProfile();

  const [step, setStep] = useState<WizardStep>(0);
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);

  // Resume upload state
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // AI setup state
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('ollama');
  const [apiKey, setApiKey] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  // ── Resume Upload Logic ────────────────────────────────────────────────

  const validateAndSetFile = (f: File) => {
    const validExtensions = ['.pdf', '.docx', '.txt'];
    const hasValidExtension = validExtensions.some((ext) => f.name.toLowerCase().endsWith(ext));
    if (!hasValidExtension) {
      setUploadError('Please upload a PDF, DOCX, or TXT file');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setUploadError('File size must be less than 10MB');
      return;
    }
    setFile(f);
    setUploadError(null);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) validateAndSetFile(f);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) validateAndSetFile(f);
  }, []);

  const analyzeResume = async () => {
    if (!file) return;
    setIsAnalyzing(true);
    setUploadError(null);
    setUploadProgress('Extracting text...');

    try {
      const parseResult = await parseResumeFile(file);
      if (!parseResult.success) {
        throw new Error(parseResult.errors?.[0] || 'Failed to parse file');
      }

      const basicInfo = extractBasicInfo(parseResult.rawText);
      setUploadProgress('AI analyzing career context...');

      const response = await sendMessage<
        {
          fileName: string;
          rawText: string;
          basicInfo: ReturnType<typeof extractBasicInfo>;
          confidence: number;
        },
        MasterProfile
      >({
        type: 'ANALYZE_RESUME',
        payload: {
          fileName: file.name,
          rawText: parseResult.rawText,
          basicInfo,
          confidence: parseResult.confidence,
        },
      });

      if (response.success && response.data) {
        setProfile(response.data);
        await refreshAllProfiles();
        setResumeUploaded(true);
        setUploadProgress(null);
        setIsAnalyzing(false);
        setTimeout(() => setStep(2), 800);
      } else {
        throw new Error(response.error || 'Analysis failed');
      }
    } catch (error) {
      setIsAnalyzing(false);
      setUploadProgress(null);
      setUploadError(error instanceof Error ? error.message : 'Analysis failed');
    }
  };

  // ── AI Setup Logic ─────────────────────────────────────────────────────

  const saveAISettings = async () => {
    const defaults = getDefaultSettings();
    const newSettings: UserSettings = {
      ...defaults,
      ai: {
        ...defaults.ai,
        provider: selectedProvider,
        ...(selectedProvider === 'ollama' && {
          ollama: {
            baseUrl: DEFAULT_OLLAMA_BASE_URL,
            model: DEFAULT_MODELS.ollama,
            contextLength: 8192,
          },
        }),
        ...(selectedProvider === 'openai' && {
          openai: { apiKey, model: DEFAULT_MODELS.openai },
        }),
        ...(selectedProvider === 'groq' && {
          groq: { apiKey, model: DEFAULT_MODELS.groq },
        }),
        ...(selectedProvider === 'anthropic' && {
          anthropic: { apiKey, model: DEFAULT_MODELS.anthropic },
        }),
      },
    };

    try {
      await chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', payload: newSettings });
    } catch {
      // Settings save failed — non-critical for onboarding
    }
  };

  const testConnection = async () => {
    setTestStatus('testing');
    setTestMessage('Testing connection...');

    try {
      if (selectedProvider === 'ollama') {
        const response = await fetch(`${DEFAULT_OLLAMA_BASE_URL}/api/tags`);
        if (response.ok) {
          const data = await response.json();
          setTestStatus('success');
          setTestMessage(`Connected! Found ${data.models?.length || 0} models.`);
          await saveAISettings();
          setAiConfigured(true);
        } else {
          throw new Error('Could not connect to Ollama');
        }
      } else if (selectedProvider === 'openai') {
        if (!apiKey) throw new Error('API key is required');
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (response.ok) {
          setTestStatus('success');
          setTestMessage('Connected to OpenAI!');
          await saveAISettings();
          setAiConfigured(true);
        } else {
          throw new Error('Invalid API key');
        }
      } else if (selectedProvider === 'groq') {
        if (!apiKey) throw new Error('API key is required');
        const response = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (response.ok) {
          setTestStatus('success');
          setTestMessage('Connected to Groq!');
          await saveAISettings();
          setAiConfigured(true);
        } else {
          throw new Error('Invalid API key');
        }
      } else {
        if (!apiKey) throw new Error('API key is required');
        setTestStatus('success');
        setTestMessage('API key saved. Will test on first use.');
        await saveAISettings();
        setAiConfigured(true);
      }
    } catch (error) {
      setTestStatus('error');
      setTestMessage(error instanceof Error ? error.message : 'Connection failed');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {/* Progress Dots */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: i <= step ? '#3b82f6' : '#334155',
              transition: 'background 0.3s ease',
            }}
          />
        ))}
      </div>

      {/* Card Container */}
      <div
        className="settings-section"
        style={{
          maxWidth: 560,
          width: '100%',
          padding: '32px 28px',
        }}
      >
        {/* Step 0: Welcome */}
        {step === 0 && (
          <div style={{ textAlign: 'center' }}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              style={{ margin: '0 auto 16px', display: 'block' }}
            >
              <path d="M20 7h-4V4a2 2 0 0 0-2-2H10a2 2 0 0 0-2 2v3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM10 4h4v3h-4V4z" />
            </svg>
            <h1 style={{ fontSize: 24, margin: '0 0 8px', color: '#e2e8f0' }}>
              Welcome to ApplySharp
            </h1>
            <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 24px', lineHeight: 1.6 }}>
              Your local-first AI job application assistant.
              <br />
              All data stays on your machine — always private.
            </p>
            <div
              style={{
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                marginBottom: 28,
                padding: '0 16px',
              }}
            >
              {[
                ['Upload your resume', 'we analyze and organize your career data'],
                ['Score resumes', 'against job descriptions with ATS checks'],
                ['Generate tailored resumes', 'and cover letters for each application'],
                ['Auto-detect jobs', 'on LinkedIn, Indeed, Greenhouse, and 20+ platforms'],
              ].map(([title, desc], i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: '#3b82f6', fontWeight: 600, fontSize: 14, flexShrink: 0 }}>
                    {i + 1}.
                  </span>
                  <span style={{ fontSize: 13, color: '#cbd5e1' }}>
                    <strong>{title}</strong>
                    <span style={{ color: '#94a3b8' }}> — {desc}</span>
                  </span>
                </div>
              ))}
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setStep(1)}
              style={{ width: '100%', padding: '12px 24px', fontSize: 15, fontWeight: 600 }}
            >
              Get Started
            </button>
            <button
              onClick={onSkip}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: 12,
                cursor: 'pointer',
                marginTop: 12,
                padding: 4,
              }}
            >
              Skip setup
            </button>
          </div>
        )}

        {/* Step 1: Upload Resume */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 20, margin: '0 0 4px', color: '#e2e8f0' }}>
              Upload Your Resume
            </h2>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 20px' }}>
              We&apos;ll analyze your experience, skills, and career context.
            </p>

            {isAnalyzing ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
                <p style={{ fontSize: 14, color: '#e2e8f0', margin: '0 0 4px' }}>
                  {uploadProgress}
                </p>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                  This may take 1-2 minutes...
                </p>
              </div>
            ) : resumeUploaded ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  style={{ margin: '0 auto 12px', display: 'block' }}
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <p style={{ fontSize: 15, color: '#10b981', fontWeight: 600, margin: 0 }}>
                  Resume analyzed successfully!
                </p>
              </div>
            ) : (
              <>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('onboarding-file-input')?.click()}
                  style={{
                    border: `2px dashed ${isDragging ? '#3b82f6' : file ? '#10b981' : '#334155'}`,
                    borderRadius: 8,
                    padding: file ? '16px' : '40px 16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: isDragging ? 'rgba(59,130,246,0.05)' : 'transparent',
                    transition: 'all 0.2s ease',
                    marginBottom: 16,
                  }}
                >
                  {file ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        justifyContent: 'center',
                      }}
                    >
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
                      <span style={{ fontSize: 14, color: '#e2e8f0' }}>{file.name}</span>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  ) : (
                    <>
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#64748b"
                        strokeWidth="1.5"
                        style={{ margin: '0 auto 10px', display: 'block' }}
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 4px' }}>
                        Drag and drop your resume, or{' '}
                        <span style={{ color: '#3b82f6', textDecoration: 'underline' }}>
                          browse
                        </span>
                      </p>
                      <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>PDF, DOCX, or TXT</p>
                    </>
                  )}
                  <input
                    id="onboarding-file-input"
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={handleFileSelect}
                    hidden
                  />
                </div>

                {uploadError && (
                  <div className="error-message" style={{ marginBottom: 12 }}>
                    {uploadError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    className="btn btn-primary"
                    onClick={analyzeResume}
                    disabled={!file}
                    style={{ flex: 1, padding: '10px 20px' }}
                  >
                    Analyze Resume
                  </button>
                  <button
                    className="btn"
                    onClick={() => setStep(2)}
                    style={{ padding: '10px 20px', background: '#1e293b', borderColor: '#334155' }}
                  >
                    Skip for now
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 2: AI Setup */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 20, margin: '0 0 4px', color: '#e2e8f0' }}>
              Configure AI Provider
            </h2>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 20px' }}>
              Choose how AI features like resume optimization and cover letters are powered.
            </p>

            <div
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}
            >
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedProvider(p.id);
                    setApiKey('');
                    setTestStatus('idle');
                    setTestMessage('');
                  }}
                  style={{
                    padding: '12px',
                    borderRadius: 8,
                    border: `2px solid ${selectedProvider === p.id ? '#3b82f6' : '#334155'}`,
                    background: selectedProvider === p.id ? 'rgba(59,130,246,0.1)' : '#1e293b',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.description}</div>
                </button>
              ))}
            </div>

            {/* API Key input for cloud providers */}
            {PROVIDERS.find((p) => p.id === selectedProvider)?.needsKey && (
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}
                >
                  API Key
                </label>
                <input
                  type="password"
                  className="form-input"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Enter your ${selectedProvider === 'openai' ? 'OpenAI' : selectedProvider === 'groq' ? 'Groq' : 'Anthropic'} API key`}
                  style={{ width: '100%', fontSize: 13 }}
                />
              </div>
            )}

            {/* Test status */}
            {testMessage && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  marginBottom: 16,
                  fontSize: 13,
                  background:
                    testStatus === 'success'
                      ? 'rgba(16,185,129,0.1)'
                      : testStatus === 'error'
                        ? 'rgba(239,68,68,0.1)'
                        : 'rgba(59,130,246,0.1)',
                  color:
                    testStatus === 'success'
                      ? '#10b981'
                      : testStatus === 'error'
                        ? '#ef4444'
                        : '#94a3b8',
                }}
              >
                {testMessage}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="btn btn-primary"
                onClick={testConnection}
                disabled={testStatus === 'testing'}
                style={{ flex: 1, padding: '10px 20px' }}
              >
                {testStatus === 'testing' ? 'Testing...' : 'Test & Save'}
              </button>
              <button
                className="btn"
                onClick={() => setStep(3)}
                style={{ padding: '10px 20px', background: '#1e293b', borderColor: '#334155' }}
              >
                {aiConfigured ? 'Next' : 'Skip for now'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <div style={{ textAlign: 'center' }}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              style={{ margin: '0 auto 16px', display: 'block' }}
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <h2 style={{ fontSize: 22, margin: '0 0 8px', color: '#e2e8f0' }}>
              You&apos;re all set!
            </h2>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 24px' }}>
              Here&apos;s what&apos;s ready:
            </p>

            <div
              style={{
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                marginBottom: 28,
                padding: '0 16px',
              }}
            >
              <CheckItem
                done={resumeUploaded}
                label="Resume uploaded"
                fallback="Upload later in Create Profile"
              />
              <CheckItem
                done={aiConfigured}
                label="AI provider configured"
                fallback="Configure later in AI Settings"
              />
            </div>

            <div
              style={{
                textAlign: 'left',
                padding: '16px',
                background: '#1e293b',
                borderRadius: 8,
                marginBottom: 24,
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', margin: '0 0 8px' }}>
                What to do next:
              </p>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  fontSize: 12,
                  color: '#94a3b8',
                  lineHeight: 1.8,
                }}
              >
                <li>
                  Visit <strong style={{ color: '#cbd5e1' }}>ATS Score</strong> to check your resume
                </li>
                <li>Browse jobs — we&apos;ll detect them automatically</li>
                <li>Generate tailored resumes for each application</li>
              </ul>
            </div>

            <button
              className="btn btn-primary"
              onClick={onComplete}
              style={{ width: '100%', padding: '12px 24px', fontSize: 15, fontWeight: 600 }}
            >
              Start Using ApplySharp
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function CheckItem({ done, label, fallback }: { done: boolean; label: string; fallback: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {done ? (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#64748b"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
        </svg>
      )}
      <span style={{ fontSize: 13, color: done ? '#10b981' : '#94a3b8' }}>
        {done ? label : fallback}
      </span>
    </div>
  );
}
