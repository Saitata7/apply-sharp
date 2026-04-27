import { useState, useCallback } from 'react';
import type { MasterProfile } from '@shared/types/master-profile.types';
import type { AnalysisProgress } from '@/core/profile/context-engine';
import { sendMessage } from '@shared/utils/messaging';
import { parseResumeFile, extractBasicInfo } from '@/core/resume/file-parser';
import { useProfile } from '../context/ProfileContext';
import ConversationalBuilder from '../components/profile/ConversationalBuilder';

interface UploadState {
  file: File | null;
  isDragging: boolean;
  isAnalyzing: boolean;
  progress: AnalysisProgress | null;
  error: string | null;
}

type PageMode = 'upload' | 'conversation' | 'conversation-with-resume';

export default function ResumeUpload() {
  const { profile, allProfiles, isLoading, setProfile, refreshAllProfiles } = useProfile();
  const [mode, setMode] = useState<PageMode>('upload');
  const [resumeTextForConversation, setResumeTextForConversation] = useState<string | undefined>();

  const [state, setState] = useState<UploadState>({
    file: null,
    isDragging: false,
    isAnalyzing: false,
    progress: null,
    error: null,
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setState((prev) => ({ ...prev, isDragging: true }));
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setState((prev) => ({ ...prev, isDragging: false }));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setState((prev) => ({ ...prev, isDragging: false }));

    const file = e.dataTransfer.files[0];
    if (file) {
      validateAndSetFile(file);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  }, []);

  const validateAndSetFile = (file: File) => {
    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    const validExtensions = ['.pdf', '.docx', '.txt'];

    const hasValidExtension = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (!validTypes.includes(file.type) && !hasValidExtension) {
      setState((prev) => ({
        ...prev,
        error: 'Please upload a PDF, DOCX, or TXT file',
      }));
      return;
    }

    if (file.size === 0) {
      setState((prev) => ({
        ...prev,
        error: 'File is empty. Please upload a valid resume file.',
      }));
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setState((prev) => ({
        ...prev,
        error: 'File size must be less than 10MB',
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      file,
      error: null,
    }));
  };

  const analyzeResume = async () => {
    if (!state.file) return;

    setState((prev) => ({ ...prev, isAnalyzing: true, error: null }));

    try {
      // Step 1: Parse file locally
      setState((prev) => ({
        ...prev,
        progress: { stage: 'extracting', message: 'Extracting text from file...', progress: 10 },
      }));

      const parseResult = await parseResumeFile(state.file);

      if (!parseResult.success) {
        throw new Error(parseResult.errors?.[0] || 'Failed to parse file');
      }

      // Step 2: Extract basic info locally (instant, no AI)
      const basicInfo = extractBasicInfo(parseResult.rawText);

      setState((prev) => ({
        ...prev,
        progress: { stage: 'analyzing', message: 'AI analyzing career context...', progress: 30 },
      }));

      // Step 3: Send extracted text to background for AI analysis
      // This will CREATE A NEW workspace, not overwrite existing ones
      const response = await sendMessage<
        {
          fileName: string;
          rawText: string;
          basicInfo: typeof basicInfo;
          confidence: number;
        },
        MasterProfile
      >({
        type: 'ANALYZE_RESUME',
        payload: {
          fileName: state.file.name,
          rawText: parseResult.rawText,
          basicInfo,
          confidence: parseResult.confidence,
        },
      });

      setState((prev) => ({
        ...prev,
        progress: { stage: 'generating', message: 'Creating workspace...', progress: 90 },
      }));

      if (response.success && response.data) {
        // Update the shared profile state with new workspace
        setProfile(response.data);
        // Refresh the list of all workspaces (non-blocking — don't fail the upload if this fails)
        try {
          await refreshAllProfiles();
        } catch {
          console.warn('[ResumeUpload] Failed to refresh workspace list after upload');
        }
        setState((prev) => ({
          ...prev,
          isAnalyzing: false,
          progress: null,
          file: null,
        }));
      } else {
        throw new Error(response.error || 'Analysis failed');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      setState((prev) => ({
        ...prev,
        isAnalyzing: false,
        error: error instanceof Error ? error.message : 'Analysis failed',
      }));
    }
  };

  const resetUpload = () => {
    setState({
      file: null,
      isDragging: false,
      isAnalyzing: false,
      progress: null,
      error: null,
    });
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="page-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Render analyzing state
  if (state.isAnalyzing) {
    return (
      <div className="page-container">
        <div className="analyzing-container">
          <div className="analyzing-animation">
            <div className="pulse-ring"></div>
            <div className="pulse-ring delay-1"></div>
            <div className="pulse-ring delay-2"></div>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2a10 10 0 1 0 10 10" />
            </svg>
          </div>
          <h2>Creating New Workspace</h2>
          <p className="analyzing-stage">{state.progress?.message || 'Starting analysis...'}</p>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${state.progress?.progress || 5}%` }} />
          </div>
          <p className="analyzing-hint">
            AI is extracting skills, building career context, and generating role profiles.
            <br />
            This may take 1-2 minutes due to rate limiting.
          </p>
        </div>
      </div>
    );
  }

  // Conversational builder mode
  if (mode === 'conversation' || mode === 'conversation-with-resume') {
    return (
      <ConversationalBuilder
        resumeText={resumeTextForConversation}
        masterProfileId={profile?.id}
        onComplete={async () => {
          try {
            await refreshAllProfiles();
          } catch {
            // Non-critical
          }
          setMode('upload');
          setResumeTextForConversation(undefined);
        }}
        onCancel={() => {
          setMode('upload');
          setResumeTextForConversation(undefined);
        }}
      />
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Create New Workspace</h1>
        <p className="page-description">
          Upload a resume or build your profile through an AI conversation
        </p>
      </div>

      {/* Existing Workspaces */}
      {allProfiles.length > 0 && (
        <div className="existing-workspaces">
          <div className="workspaces-header">
            <h3>Existing Workspaces ({allProfiles.length})</h3>
            <span className="workspaces-hint">Use the switcher in sidebar to change workspace</span>
          </div>
          <div className="workspaces-list">
            {allProfiles.map((p) => (
              <div key={p.id} className={`workspace-badge ${p.id === profile?.id ? 'active' : ''}`}>
                <span className="workspace-badge-name">{p.personal?.fullName || 'Unnamed'}</span>
                <span className="workspace-badge-meta">
                  {p.generatedProfiles?.length || 0} roles
                </span>
                {p.id === profile?.id && <span className="workspace-badge-current">Current</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Section */}
      <div className="upload-section">
        <div className="upload-section-header">
          <h3>Upload New Resume</h3>
          <p>This will create a NEW workspace - your existing workspaces will NOT be deleted</p>
        </div>

        <div
          className={`upload-zone ${state.isDragging ? 'dragging' : ''} ${state.file ? 'has-file' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {!state.file ? (
            <>
              <div className="upload-icon">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <p className="upload-text">
                Drag and drop your resume here, or{' '}
                <label className="upload-link">
                  browse
                  <input type="file" accept=".pdf,.docx,.txt" onChange={handleFileSelect} hidden />
                </label>
              </p>
              <p className="upload-hint">Supports PDF, DOCX, and TXT files (max 10MB)</p>
            </>
          ) : (
            <div className="file-preview">
              <div className="file-icon">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="file-info">
                <p className="file-name">{state.file.name}</p>
                <p className="file-size">{(state.file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={resetUpload}>
                Remove
              </button>
            </div>
          )}
        </div>

        {state.error && (
          <div className="error-message">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {state.error}
          </div>
        )}

        {state.file && (
          <div className="upload-actions">
            <button className="btn btn-primary" onClick={analyzeResume}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Quick Create (Auto-Parse)
            </button>
            <button
              className="btn btn-secondary"
              onClick={async () => {
                if (!state.file) return;
                try {
                  const parseResult = await parseResumeFile(state.file);
                  if (parseResult.success) {
                    setResumeTextForConversation(parseResult.rawText);
                    setMode('conversation-with-resume');
                  }
                } catch {
                  setResumeTextForConversation(undefined);
                  setMode('conversation');
                }
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Build with AI Interview
            </button>
          </div>
        )}
      </div>

      {/* Conversational Builder CTA */}
      <div className="conv-start-section">
        <h3>Or Build Your Profile Through Conversation</h3>
        <p>
          Our AI career advisor will interview you to extract your best stories, push back on vague
          claims, and build a stronger profile than any resume parser.
        </p>
        <div className="conv-start-features">
          <div className="conv-start-feature">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Extracts real stories
          </div>
          <div className="conv-start-feature">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Validates claims
          </div>
          <div className="conv-start-feature">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            No resume needed
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setMode('conversation')}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Start AI Interview
        </button>
      </div>

      <div className="info-cards">
        <div className="info-card">
          <div className="info-card-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h3>Multiple Workspaces</h3>
          <p>Each resume creates a separate workspace - nothing is ever deleted</p>
        </div>

        <div className="info-card">
          <div className="info-card-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="6" cy="6" r="3" />
              <path d="M6 9v12" />
              <path d="M6 15h7a3 3 0 0 0 3-3V9" />
              <circle cx="16" cy="6" r="3" />
            </svg>
          </div>
          <h3>Role Branches</h3>
          <p>Each workspace has role profiles: Backend, Frontend, Full-Stack, etc.</p>
        </div>

        <div className="info-card">
          <div className="info-card-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h3>Answer Bank</h3>
          <p>Pre-generated answers for common application questions</p>
        </div>
      </div>
    </div>
  );
}
