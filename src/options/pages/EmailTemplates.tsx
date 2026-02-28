import { useState } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import { useProfile } from '../context/ProfileContext';
import type {
  EmailTemplate,
  EmailType,
  EmailGenerationPayload,
} from '@core/communication/email-templates';
import { getEmailTypes } from '@core/communication/email-templates';

const EMAIL_TYPES = getEmailTypes();

export default function EmailTemplates() {
  const { profile } = useProfile();

  // Input state
  const [emailType, setEmailType] = useState<EmailType>('follow_up');
  const [jobDescription, setJobDescription] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [recipientName, setRecipientName] = useState('');

  // Type-specific inputs
  const [discussionPoints, setDiscussionPoints] = useState('');
  const [daysSinceApplication, setDaysSinceApplication] = useState('7');
  const [referrerName, setReferrerName] = useState('');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EmailTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedBody, setEditedBody] = useState('');
  const [editedSubject, setEditedSubject] = useState('');
  const [copied, setCopied] = useState(false);

  const canGenerate = companyName.trim().length > 0 && jobTitle.trim().length > 0 && !isGenerating;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setError(null);
    setResult(null);
    setIsEditing(false);

    const payload: EmailGenerationPayload = {
      emailType,
      jobDescription: jobDescription.trim(),
      companyName: companyName.trim(),
      jobTitle: jobTitle.trim(),
      recipientName: recipientName.trim() || undefined,
    };

    if (emailType === 'thank_you' && discussionPoints.trim()) {
      payload.discussionPoints = discussionPoints
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean);
    }
    if (emailType === 'follow_up') {
      payload.daysSinceApplication = Math.max(0, parseInt(daysSinceApplication, 10) || 7);
    }
    if (emailType === 'networking' && referrerName.trim()) {
      payload.referrerName = referrerName.trim();
    }

    try {
      const response = await sendMessage<EmailGenerationPayload, EmailTemplate>({
        type: 'GENERATE_EMAIL_TEMPLATE',
        payload,
      });

      if (response.success && response.data) {
        setResult(response.data);
        setEditedSubject(response.data.subject);
        setEditedBody(response.data.body);
      } else {
        setError(response.error || 'Failed to generate email template');
      }
    } catch (err) {
      setError((err as Error).message || 'An unexpected error occurred');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    const subject = isEditing ? editedSubject : result?.subject || '';
    const body = isEditing ? editedBody : result?.body || '';
    const text = `Subject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleMailto = () => {
    const subject = encodeURIComponent(isEditing ? editedSubject : result?.subject || '');
    const body = encodeURIComponent(isEditing ? editedBody : result?.body || '');
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Email Templates</h1>
        <p className="page-description">
          Generate personalized emails for follow-ups, networking, and more
        </p>
      </div>

      {!profile && (
        <div
          className="info-banner"
          style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            background: '#fef3c7',
            borderRadius: '8px',
            color: '#92400e',
          }}
        >
          Upload a resume first to personalize your email templates.
        </div>
      )}

      {/* Email Type Selector */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label
          style={{
            display: 'block',
            fontWeight: 600,
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
          }}
        >
          Email Type
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {EMAIL_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setEmailType(t.value)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: emailType === t.value ? '2px solid #2563eb' : '1px solid #d1d5db',
                background: emailType === t.value ? '#eff6ff' : '#fff',
                color: emailType === t.value ? '#1d4ed8' : '#374151',
                fontWeight: emailType === t.value ? 600 : 400,
                cursor: 'pointer',
                fontSize: '0.8125rem',
                transition: 'all 150ms',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input Fields */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <label
            style={{
              display: 'block',
              fontWeight: 600,
              marginBottom: '0.25rem',
              fontSize: '0.875rem',
            }}
          >
            Company Name *
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Google"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label
            style={{
              display: 'block',
              fontWeight: 600,
              marginBottom: '0.25rem',
              fontSize: '0.875rem',
            }}
          >
            Job Title *
          </label>
          <input
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Senior Backend Engineer"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <label
            style={{
              display: 'block',
              fontWeight: 600,
              marginBottom: '0.25rem',
              fontSize: '0.875rem',
            }}
          >
            Recipient Name (optional)
          </label>
          <input
            type="text"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="e.g. Sarah Chen"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Type-specific inputs */}
        {emailType === 'follow_up' && (
          <div>
            <label
              style={{
                display: 'block',
                fontWeight: 600,
                marginBottom: '0.25rem',
                fontSize: '0.875rem',
              }}
            >
              Days Since Application
            </label>
            <input
              type="number"
              value={daysSinceApplication}
              onChange={(e) => setDaysSinceApplication(e.target.value)}
              min="1"
              max="90"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {emailType === 'networking' && (
          <div>
            <label
              style={{
                display: 'block',
                fontWeight: 600,
                marginBottom: '0.25rem',
                fontSize: '0.875rem',
              }}
            >
              Referrer Name (optional)
            </label>
            <input
              type="text"
              value={referrerName}
              onChange={(e) => setReferrerName(e.target.value)}
              placeholder="e.g. John Smith"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}
      </div>

      {emailType === 'thank_you' && (
        <div style={{ marginBottom: '1rem' }}>
          <label
            style={{
              display: 'block',
              fontWeight: 600,
              marginBottom: '0.25rem',
              fontSize: '0.875rem',
            }}
          >
            Discussion Points from Interview (one per line)
          </label>
          <textarea
            value={discussionPoints}
            onChange={(e) => setDiscussionPoints(e.target.value)}
            placeholder="e.g. We discussed the migration to microservices&#10;Talked about team culture and mentorship programs"
            rows={3}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <label
          style={{
            display: 'block',
            fontWeight: 600,
            marginBottom: '0.25rem',
            fontSize: '0.875rem',
          }}
        >
          Job Description (optional — improves personalization)
        </label>
        <textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste the job description for better context..."
          rows={4}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '0.875rem',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={!canGenerate}
        style={{
          padding: '0.75rem 2rem',
          background: canGenerate ? '#2563eb' : '#9ca3af',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '0.9375rem',
          fontWeight: 600,
          cursor: canGenerate ? 'pointer' : 'not-allowed',
          marginBottom: '1.5rem',
        }}
      >
        {isGenerating ? 'Generating...' : 'Generate Email'}
      </button>

      {/* Error */}
      {error && (
        <div
          role="alert"
          style={{
            padding: '1rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#991b1b',
            marginBottom: '1.5rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
          {/* Header */}
          <div
            style={{
              padding: '1rem 1.5rem',
              background: '#f9fafb',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
                {result.wordCount} words
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setIsEditing(!isEditing)}
                aria-label={isEditing ? 'Switch to preview mode' : 'Switch to edit mode'}
                style={{
                  padding: '0.375rem 0.75rem',
                  background: isEditing ? '#dbeafe' : '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                {isEditing ? 'Preview' : 'Edit'}
              </button>
              <button
                onClick={handleCopy}
                aria-label="Copy email to clipboard"
                style={{
                  padding: '0.375rem 0.75rem',
                  background: copied ? '#dcfce7' : '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  color: copied ? '#166534' : '#374151',
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={handleMailto}
                aria-label="Open email in email client"
                style={{
                  padding: '0.375rem 0.75rem',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                Open in Email
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: '1.5rem' }}>
            {isEditing ? (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label
                    style={{
                      display: 'block',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                      fontSize: '0.8125rem',
                      color: '#6b7280',
                    }}
                  >
                    Subject
                  </label>
                  <input
                    type="text"
                    value={editedSubject}
                    onChange={(e) => setEditedSubject(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                      fontSize: '0.8125rem',
                      color: '#6b7280',
                    }}
                  >
                    Body
                  </label>
                  <textarea
                    value={editedBody}
                    onChange={(e) => setEditedBody(e.target.value)}
                    rows={12}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      lineHeight: 1.6,
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    marginBottom: '1rem',
                    paddingBottom: '0.75rem',
                    borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Subject
                  </span>
                  <div style={{ fontSize: '1rem', fontWeight: 600, marginTop: '0.25rem' }}>
                    {result.subject}
                  </div>
                </div>
                <div
                  style={{
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.7,
                    fontSize: '0.9375rem',
                    color: '#1f2937',
                  }}
                >
                  {result.body}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
