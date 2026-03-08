import { useState, useEffect, useRef, useCallback } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import type { ConversationExtractedData } from '@/ai/prompts/profile-interview';

interface ConversationalBuilderProps {
  resumeText?: string;
  masterProfileId?: string;
  onComplete: () => void;
  onCancel: () => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type Phase =
  | 'introduction'
  | 'experience_deep_dive'
  | 'skills_projects'
  | 'career_goals'
  | 'review'
  | 'complete';

const PHASE_LABELS: Record<Phase, string> = {
  introduction: 'Getting Started',
  experience_deep_dive: 'Experience Deep-Dive',
  skills_projects: 'Skills & Projects',
  career_goals: 'Career Goals',
  review: 'Profile Review',
  complete: 'Complete',
};

const PHASE_ORDER: Phase[] = [
  'introduction',
  'experience_deep_dive',
  'skills_projects',
  'career_goals',
  'review',
  'complete',
];

export default function ConversationalBuilder({
  resumeText,
  masterProfileId,
  onComplete,
  onCancel,
}: ConversationalBuilderProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('introduction');
  const [extractedData, setExtractedData] = useState<ConversationExtractedData>({
    experiences: [],
  });
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Start conversation on mount
  useEffect(() => {
    startConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startConversation = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await sendMessage<
        { masterProfileId?: string; resumeText?: string },
        { conversationId: string; assistantMessage: string; phase: Phase }
      >({
        type: 'START_PROFILE_CONVERSATION',
        payload: { masterProfileId, resumeText },
      });

      if (response.success && response.data) {
        setConversationId(response.data.conversationId);
        setPhase(response.data.phase);
        setMessages([
          {
            role: 'assistant',
            content: response.data.assistantMessage,
            timestamp: new Date(),
          },
        ]);
      } else {
        setError(response.error || 'Failed to start conversation');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start conversation');
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const sendUserMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !conversationId || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await sendMessage<
        { conversationId: string; userMessage: string },
        {
          assistantMessage: string;
          phase: Phase;
          extractedData: ConversationExtractedData;
        }
      >({
        type: 'SEND_CONVERSATION_MESSAGE',
        payload: { conversationId, userMessage: trimmed },
      });

      if (response.success && response.data) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: response.data!.assistantMessage,
            timestamp: new Date(),
          },
        ]);
        setPhase(response.data.phase);
        setExtractedData(response.data.extractedData);

        if (response.data.phase === 'complete') {
          // Short delay before completing
          setTimeout(onComplete, 2000);
        }
      } else {
        setError(response.error || 'Failed to send message');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendUserMessage();
    }
  };

  const phaseIndex = PHASE_ORDER.indexOf(phase);
  const progress = Math.max(0, Math.min(100, (phaseIndex / (PHASE_ORDER.length - 1)) * 100));

  // Count extracted items for the sidebar
  const expCount = extractedData.experiences?.length || 0;
  const skillCount =
    (extractedData.skills?.strongest?.length || 0) +
    (extractedData.skills?.learning?.length || 0) +
    (extractedData.skills?.tools?.length || 0);
  const projectCount = extractedData.projects?.length || 0;

  return (
    <div className="conv-builder">
      {/* Header */}
      <div className="conv-builder-header">
        <div className="conv-header-left">
          <h2>Profile Builder</h2>
          <span className="conv-phase-label">{PHASE_LABELS[phase]}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onCancel} title="Exit conversation">
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

      {/* Progress bar */}
      <div className="conv-progress">
        <div className="conv-progress-bar">
          <div className="conv-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="conv-progress-phases">
          {PHASE_ORDER.slice(0, -1).map((p, i) => (
            <div
              key={p}
              className={`conv-progress-dot ${i <= phaseIndex ? 'active' : ''} ${p === phase ? 'current' : ''}`}
              title={PHASE_LABELS[p]}
            />
          ))}
        </div>
      </div>

      <div className="conv-builder-body">
        {/* Chat Area */}
        <div className="conv-chat">
          <div className="conv-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`conv-message conv-message-${msg.role}`}>
                <div className="conv-message-avatar">
                  {msg.role === 'assistant' ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                </div>
                <div className="conv-message-content">
                  <div className="conv-message-role">
                    {msg.role === 'assistant' ? 'Career Advisor' : 'You'}
                  </div>
                  <div className="conv-message-text">{msg.content}</div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="conv-message conv-message-assistant">
                <div className="conv-message-avatar">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
                <div className="conv-message-content">
                  <div className="conv-message-role">Career Advisor</div>
                  <div className="conv-typing">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Error */}
          {error && (
            <div className="conv-error">
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
              <span>{error}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>
                Dismiss
              </button>
            </div>
          )}

          {/* Input */}
          <div className="conv-input-area">
            <textarea
              ref={inputRef}
              className="conv-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                phase === 'complete'
                  ? 'Profile building complete!'
                  : 'Type your response... (Enter to send, Shift+Enter for new line)'
              }
              disabled={isLoading || phase === 'complete'}
              rows={2}
            />
            <button
              className="conv-send-btn"
              onClick={sendUserMessage}
              disabled={!input.trim() || isLoading || phase === 'complete'}
              title="Send message"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>

        {/* Sidebar: Profile Being Built */}
        <div className="conv-sidebar">
          <h3 className="conv-sidebar-title">Profile Preview</h3>

          {/* Personal */}
          {extractedData.personal?.fullName && (
            <div className="conv-sidebar-section">
              <div className="conv-sidebar-label">Name</div>
              <div className="conv-sidebar-value">{extractedData.personal.fullName}</div>
            </div>
          )}

          {extractedData.personal?.targetRoles && extractedData.personal.targetRoles.length > 0 && (
            <div className="conv-sidebar-section">
              <div className="conv-sidebar-label">Target Roles</div>
              <div className="conv-sidebar-chips">
                {extractedData.personal.targetRoles.map((role) => (
                  <span key={role} className="conv-chip">
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Experience */}
          <div className="conv-sidebar-section">
            <div className="conv-sidebar-label">Experience ({expCount})</div>
            {extractedData.experiences?.map((exp, i) => (
              <div key={i} className="conv-sidebar-exp">
                <div className="conv-exp-title">
                  {exp.title || 'Role'} {exp.company ? `@ ${exp.company}` : ''}
                </div>
                {exp.achievements.length > 0 && (
                  <div className="conv-exp-bullets">
                    {exp.achievements.length} achievement{exp.achievements.length !== 1 ? 's' : ''}
                  </div>
                )}
                {exp.technologies.length > 0 && (
                  <div className="conv-exp-tech">
                    {exp.technologies.slice(0, 5).join(', ')}
                    {exp.technologies.length > 5 && ` +${exp.technologies.length - 5}`}
                  </div>
                )}
              </div>
            ))}
            {expCount === 0 && (
              <div className="conv-sidebar-empty">Waiting for experience data...</div>
            )}
          </div>

          {/* Skills */}
          {skillCount > 0 && (
            <div className="conv-sidebar-section">
              <div className="conv-sidebar-label">Skills ({skillCount})</div>
              <div className="conv-sidebar-chips">
                {extractedData.skills?.strongest?.map((s) => (
                  <span key={s} className="conv-chip conv-chip-strong">
                    {s}
                  </span>
                ))}
                {extractedData.skills?.learning?.map((s) => (
                  <span key={s} className="conv-chip conv-chip-learning">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {projectCount > 0 && (
            <div className="conv-sidebar-section">
              <div className="conv-sidebar-label">Projects ({projectCount})</div>
              {extractedData.projects?.map((proj, i) => (
                <div key={i} className="conv-sidebar-exp">
                  <div className="conv-exp-title">{proj.name || `Project ${i + 1}`}</div>
                  {proj.description && (
                    <div className="conv-exp-bullets">{proj.description.slice(0, 80)}...</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Career Goals */}
          {extractedData.careerGoals?.targetRoles && (
            <div className="conv-sidebar-section">
              <div className="conv-sidebar-label">Career Goals</div>
              <div className="conv-sidebar-chips">
                {extractedData.careerGoals.targetRoles.map((r) => (
                  <span key={r} className="conv-chip">
                    {r}
                  </span>
                ))}
              </div>
              {extractedData.careerGoals.preferredCompanyType && (
                <div className="conv-sidebar-value">
                  Prefers: {extractedData.careerGoals.preferredCompanyType}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
