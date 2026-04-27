/**
 * Outreach Composer page (Feature #17 first iteration).
 *
 * Generate a tailored cold/warm DM for a specific person at a target
 * company. Distinct from Quick Replies (which is canned response
 * templates for inbound) — Composer is for initiating outreach.
 *
 * Inputs:
 *   - Recipient: name, role, company, optional shared connection
 *     ("alumni from [school]", "ex-colleague at [company]", etc.)
 *   - Hook: a specific detail from their profile or a recent post
 *     (e.g., "your post on RAG eval", "your background in Spark")
 *   - Connection type: alumni / shared-employer / cold
 *   - Channel: LinkedIn DM (short, ~80 words) or Email (longer)
 *
 * Output: tailored DM with the hook woven into the opener, your
 * credentials in the body, and a specific 15-min ask in the close.
 *
 * Foundation for the future on-LinkedIn-page sidebar button (next
 * iteration) that auto-fills these inputs from the open profile.
 */

import { useState, useMemo, useCallback } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import type { CreateGmailDraftPayload } from '../../background/handlers/outreach-handlers';
import OutreachTemplates from '../components/OutreachTemplates';

type OutreachMode = 'compose' | 'templates';

type ConnectionType = 'alumni' | 'shared_employer' | 'cold';
type Channel = 'linkedin' | 'email';

interface ComposerInput {
  recipientName: string;
  recipientRole: string;
  company: string;
  hook: string;
  connectionType: ConnectionType;
  channel: Channel;
  yourName: string;
  sharedDetail: string;
  yourCredentials: string;
}

const DEFAULT_INPUT: ComposerInput = {
  recipientName: '',
  recipientRole: '',
  company: '',
  hook: '',
  connectionType: 'cold',
  channel: 'linkedin',
  yourName: '',
  sharedDetail: '',
  yourCredentials: '',
};

function buildOpener(input: ComposerInput): string {
  const { recipientName, connectionType, sharedDetail, hook, company } = input;
  const greeting = connectionType === 'alumni' ? 'Hey' : 'Hi';
  const name = recipientName.trim() || '[name]';

  if (connectionType === 'alumni' && sharedDetail.trim()) {
    return `${greeting} ${name} — fellow ${sharedDetail.trim()} here.`;
  }
  if (connectionType === 'shared_employer' && sharedDetail.trim()) {
    return `${greeting} ${name} — saw we both spent time at ${sharedDetail.trim()}.`;
  }
  if (hook.trim()) {
    return `${greeting} ${name} — ${hook.trim()}.`;
  }
  return `${greeting} ${name} — saw your work at ${company.trim() || '[company]'}.`;
}

function buildCredentialLine(channel: Channel, credentials: string): string {
  const trimmed = credentials.trim();
  if (trimmed) return trimmed;
  if (channel === 'linkedin') {
    return `[Add your one-line credentials in the form above: current role, key recent project, prior experience worth mentioning.]`;
  }
  return `[Add your credentials in the form above: current role with company context, previous roles, and what you built.]`;
}

function buildBody(input: ComposerInput): string {
  const { company, recipientRole } = input;
  const co = company.trim() || '[company]';
  const role = recipientRole.trim();
  const credentials = buildCredentialLine(input.channel, input.yourCredentials);

  if (role) {
    return `${credentials} The ${role} angle at ${co} caught my attention.`;
  }
  return `${credentials} ${co}'s work is exactly the lane I want for the next chapter.`;
}

function buildAsk(input: ComposerInput): string {
  const { channel, recipientName } = input;
  const name = recipientName.trim() ? `, ${recipientName.trim()}` : '';
  if (channel === 'linkedin') {
    return `Would you be open to 15 min on what the team's actually solving${name}? Happy to send my resume beforehand.`;
  }
  return `Open to a 20-min call this week or next? I'd rather hear from you than guess at fit before I drop a CV in. Resume attached.`;
}

function buildSignoff(input: ComposerInput): string {
  return `Thanks,\n${input.yourName.trim() || '[Your name]'}`;
}

function composeSubject(input: ComposerInput): string {
  return input.company.trim()
    ? `GenAI engineering background, interested in ${input.company.trim()}`
    : `GenAI engineering background, interested in your team`;
}

function compose(input: ComposerInput): string {
  const opener = buildOpener(input);
  const body = buildBody(input);
  const ask = buildAsk(input);
  const signoff = buildSignoff(input);

  if (input.channel === 'linkedin') {
    return `${opener} ${body} ${ask}\n\n${signoff}`;
  }
  return `Subject: ${composeSubject(input)}\n\n${opener}\n\n${body}\n\n${ask}\n\n${signoff}`;
}

function splitSubjectAndBody(text: string): { subject: string; body: string } {
  const match = text.match(/^Subject:\s*(.+?)\n+([\s\S]+)$/);
  if (match) return { subject: match[1].trim(), body: match[2].trim() };
  return { subject: '', body: text };
}

const CONNECTION_OPTIONS: { value: ConnectionType; label: string; hint: string }[] = [
  {
    value: 'cold',
    label: 'Cold (no prior connection)',
    hint: 'Use a specific hook from their profile or recent post.',
  },
  {
    value: 'alumni',
    label: 'Alumni connection',
    hint: 'e.g., "[School] grad (\'24)" or "[University] alum"',
  },
  {
    value: 'shared_employer',
    label: 'Shared past employer',
    hint: 'e.g., a previous employer or contracting agency you both worked at',
  },
];

export default function OutreachComposer() {
  const [mode, setMode] = useState<OutreachMode>('compose');
  const [input, setInput] = useState<ComposerInput>(DEFAULT_INPUT);
  const [editedOutput, setEditedOutput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const [recipientEmail, setRecipientEmail] = useState('');
  const [oauthClientId, setOauthClientId] = useState('');
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftSuccess, setDraftSuccess] = useState<string | null>(null);
  const [composeUrl, setComposeUrl] = useState<string | null>(null);

  const generated = useMemo(() => compose(input), [input]);
  const display = isEditing ? editedOutput : generated;

  const startEdit = useCallback(() => {
    setEditedOutput(generated);
    setIsEditing(true);
  }, [generated]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditedOutput('');
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.getElementById('oc-output') as HTMLTextAreaElement | null;
      ta?.select();
    }
  }, [display]);

  const handleCreateGmailDraft = useCallback(async () => {
    setDraftError(null);
    setDraftSuccess(null);
    setComposeUrl(null);
    if (!recipientEmail.trim()) {
      setDraftError('Recipient email is required.');
      return;
    }
    if (!oauthClientId.trim()) {
      setDraftError(
        'Google OAuth Client ID is required (BYOK). Create a project at console.cloud.google.com and paste the client id here.'
      );
      return;
    }
    const { subject, body } = splitSubjectAndBody(display);
    if (!subject || !body) {
      setDraftError(
        'Could not parse subject and body from the draft. Make sure email mode is selected.'
      );
      return;
    }
    setCreatingDraft(true);
    try {
      const payload: CreateGmailDraftPayload = {
        clientId: oauthClientId.trim(),
        to: recipientEmail.trim(),
        subject,
        body,
      };
      const res = await sendMessage<
        CreateGmailDraftPayload,
        { draftId: string; composeUrl: string }
      >({ type: 'CREATE_GMAIL_DRAFT', payload });
      if (!res?.success || !res.data) {
        setDraftError(res?.error ?? 'Failed to create Gmail draft');
        return;
      }
      setComposeUrl(res.data.composeUrl);
      setDraftSuccess('Draft created. Open it in Gmail to review and send manually.');
    } catch (err) {
      setDraftError((err as Error).message);
    } finally {
      setCreatingDraft(false);
    }
  }, [recipientEmail, oauthClientId, display]);

  const updateField = useCallback(
    <K extends keyof ComposerInput>(key: K, val: ComposerInput[K]) => {
      setInput((s) => ({ ...s, [key]: val }));
      if (isEditing) {
        // Edits get blown away when inputs change. Drop edit mode silently
        setIsEditing(false);
        setEditedOutput('');
      }
    },
    [isEditing]
  );

  const selectedConnection =
    CONNECTION_OPTIONS.find((o) => o.value === input.connectionType) ?? CONNECTION_OPTIONS[0];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: 'var(--tx-primary)' }}>Outreach</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--tx-secondary)', fontSize: 14 }}>
          {mode === 'compose'
            ? 'Generate a tailored DM or cold email for a specific person at a target company. Fill the inputs, the draft updates live.'
            : 'Pre-written replies for high-frequency moments (visa pre-qual, interview confirm, day-7 follow-up, decline). Pick a template, fill the placeholders, copy.'}
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Outreach mode"
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 20,
          background: 'var(--sf-overlay)',
          padding: 4,
          borderRadius: 6,
          maxWidth: 460,
        }}
      >
        {(
          [
            { value: 'compose', label: 'Compose with AI' },
            { value: 'templates', label: 'Pick a template' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            role="tab"
            aria-selected={mode === opt.value}
            onClick={() => setMode(opt.value)}
            style={{
              flex: 1,
              padding: '8px 14px',
              border: 0,
              borderRadius: 4,
              background: mode === opt.value ? 'var(--sf-raised)' : 'transparent',
              color: mode === opt.value ? 'var(--tx-primary)' : 'var(--tx-secondary)',
              fontSize: 13,
              fontWeight: mode === opt.value ? 600 : 400,
              cursor: 'pointer',
              boxShadow: mode === opt.value ? 'var(--sh-sm)' : 'none',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === 'templates' && <OutreachTemplates />}

      {mode === 'compose' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Left: inputs */}
          <div
            style={{
              padding: 16,
              background: 'var(--sf-raised)',
              border: '1px solid var(--bd-default)',
              borderRadius: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, color: 'var(--tx-primary)' }}>Inputs</h2>

            <Field label="Channel">
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  background: 'var(--sf-overlay)',
                  padding: 4,
                  borderRadius: 6,
                }}
              >
                {(['linkedin', 'email'] as Channel[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => updateField('channel', c)}
                    aria-pressed={input.channel === c}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      border: 0,
                      borderRadius: 4,
                      background: input.channel === c ? 'var(--sf-raised)' : 'transparent',
                      color: input.channel === c ? 'var(--tx-primary)' : 'var(--tx-secondary)',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: input.channel === c ? 600 : 400,
                    }}
                  >
                    {c === 'linkedin' ? 'LinkedIn DM' : 'Email'}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Connection type">
              <select
                value={input.connectionType}
                onChange={(e) => updateField('connectionType', e.target.value as ConnectionType)}
                style={inputStyle}
              >
                {CONNECTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <small style={{ color: 'var(--tx-secondary)', fontSize: 12 }}>
                {selectedConnection.hint}
              </small>
            </Field>

            {(input.connectionType === 'alumni' || input.connectionType === 'shared_employer') && (
              <Field
                label={
                  input.connectionType === 'alumni'
                    ? 'Shared school / program'
                    : 'Shared past employer'
                }
              >
                <input
                  value={input.sharedDetail}
                  onChange={(e) => updateField('sharedDetail', e.target.value)}
                  placeholder={
                    input.connectionType === 'alumni'
                      ? 'e.g., your school + grad year'
                      : 'e.g., a shared past employer'
                  }
                  style={inputStyle}
                />
              </Field>
            )}

            <Field label="Recipient name">
              <input
                value={input.recipientName}
                onChange={(e) => updateField('recipientName', e.target.value)}
                placeholder="e.g., Jane Doe"
                style={inputStyle}
              />
            </Field>

            <Field label="Recipient role / team (optional)">
              <input
                value={input.recipientRole}
                onChange={(e) => updateField('recipientRole', e.target.value)}
                placeholder="e.g., Senior Engineer on the Grok team, Forward Deployed Engineer, Founder"
                style={inputStyle}
              />
            </Field>

            <Field label="Company">
              <input
                value={input.company}
                onChange={(e) => updateField('company', e.target.value)}
                placeholder="e.g., Baseten, CVector, xAI"
                style={inputStyle}
              />
            </Field>

            <Field label="Specific hook (recommended for cold)">
              <input
                value={input.hook}
                onChange={(e) => updateField('hook', e.target.value)}
                placeholder="e.g., saw your post on RAG eval and the agentic data lakehouse framing"
                style={inputStyle}
              />
              <small style={{ color: 'var(--tx-secondary)', fontSize: 12 }}>
                30 seconds reading their profile finds something specific. Massively raises response
                rate vs. generic openers.
              </small>
            </Field>

            <Field label="Your first name (signoff)">
              <input
                value={input.yourName}
                onChange={(e) => updateField('yourName', e.target.value)}
                placeholder="e.g., Sai"
                style={inputStyle}
              />
            </Field>

            <button
              onClick={() => setInput(DEFAULT_INPUT)}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--bd-default)',
                borderRadius: 4,
                background: 'var(--sf-raised)',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--tx-secondary)',
                alignSelf: 'flex-start',
                marginTop: 4,
              }}
            >
              Reset all
            </button>
          </div>

          {/* Right: output */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h2 style={{ margin: 0, fontSize: 16, color: 'var(--tx-primary)' }}>
                Draft{' '}
                <span style={{ fontSize: 12, color: 'var(--tx-muted)', fontWeight: 400 }}>
                  ({input.channel === 'linkedin' ? 'LinkedIn DM' : 'Email'})
                </span>
              </h2>
              <div style={{ display: 'flex', gap: 8 }}>
                {!isEditing && (
                  <button
                    onClick={startEdit}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid var(--bd-default)',
                      borderRadius: 4,
                      background: 'var(--sf-raised)',
                      cursor: 'pointer',
                      fontSize: 13,
                      color: 'var(--tx-primary)',
                    }}
                  >
                    Edit
                  </button>
                )}
                {isEditing && (
                  <button
                    onClick={cancelEdit}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid var(--bd-default)',
                      borderRadius: 4,
                      background: 'var(--sf-raised)',
                      cursor: 'pointer',
                      fontSize: 13,
                      color: 'var(--tx-primary)',
                    }}
                  >
                    Discard edits
                  </button>
                )}
                <button
                  onClick={handleCopy}
                  style={{
                    padding: '8px 18px',
                    border: 0,
                    borderRadius: 999,
                    background: copied ? 'var(--cl-emerald)' : 'var(--brand)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    minWidth: 100,
                  }}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <textarea
              id="oc-output"
              value={display}
              readOnly={!isEditing}
              onChange={(e) => isEditing && setEditedOutput(e.target.value)}
              style={{
                padding: 16,
                fontSize: 14,
                lineHeight: 1.6,
                fontFamily: 'inherit',
                border: `1px solid ${isEditing ? 'var(--brand)' : 'var(--bd-default)'}`,
                borderRadius: 6,
                background: isEditing ? 'var(--sf-raised)' : 'var(--sf-overlay)',
                minHeight: 360,
                resize: 'vertical',
                color: 'var(--tx-primary)',
              }}
            />
            <div style={{ fontSize: 12, color: 'var(--tx-muted)' }}>
              Approximate length:{' '}
              <strong>{display.split(/\s+/).filter(Boolean).length} words</strong> ·{' '}
              {input.channel === 'linkedin'
                ? 'aim for 60-100 words for high read-through rate'
                : 'aim for 100-150 words for replies, max 200'}
            </div>

            {input.channel === 'email' && (
              <div
                style={{
                  marginTop: 8,
                  padding: 12,
                  background: 'var(--sf-raised)',
                  border: '1px solid var(--bd-default)',
                  borderRadius: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-primary)' }}>
                  Send as Gmail draft (BYOK)
                </div>
                <Field label="Recipient email">
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="jane@acme.com"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Your Google OAuth Client ID (never sent to ApplySharp)">
                  <input
                    type="password"
                    value={oauthClientId}
                    onChange={(e) => setOauthClientId(e.target.value)}
                    placeholder="123-abc.apps.googleusercontent.com"
                    style={inputStyle}
                  />
                </Field>
                <button
                  onClick={handleCreateGmailDraft}
                  disabled={creatingDraft}
                  style={{
                    padding: '10px 16px',
                    background: creatingDraft ? 'var(--tx-muted)' : 'var(--brand)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 999,
                    cursor: creatingDraft ? 'wait' : 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    alignSelf: 'flex-start',
                    opacity: creatingDraft ? 0.7 : 1,
                  }}
                >
                  {creatingDraft
                    ? 'Creating draft...'
                    : 'Create Gmail draft (you click Send manually)'}
                </button>

                {draftError && (
                  <div
                    role="alert"
                    style={{
                      padding: 10,
                      background: 'var(--cl-rose-glow)',
                      color: 'var(--cl-rose)',
                      border: '1px solid var(--cl-rose-glow)',
                      borderRadius: 4,
                      fontSize: 13,
                    }}
                  >
                    {draftError}
                  </div>
                )}
                {draftSuccess && (
                  <div
                    role="status"
                    style={{
                      padding: 10,
                      background: 'var(--cl-emerald-glow)',
                      color: 'var(--cl-emerald)',
                      border: '1px solid var(--cl-emerald-glow)',
                      borderRadius: 4,
                      fontSize: 13,
                    }}
                  >
                    {draftSuccess}
                    {composeUrl && /^https:\/\//i.test(composeUrl) && (
                      <>
                        {' '}
                        <a href={composeUrl} target="_blank" rel="noopener noreferrer">
                          Open in Gmail
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 24,
          padding: 16,
          background: 'var(--sf-overlay)',
          border: '1px solid var(--bd-default)',
          borderRadius: 6,
          fontSize: 13,
          color: 'var(--tx-secondary)',
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: 'var(--tx-primary)' }}>Send rules:</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>
            One message per person. If they don&apos;t reply, follow up via the Templates tab&apos;s
            day-7 template, then stop.
          </li>
          <li>
            On LinkedIn: do NOT send a connection request <em>with</em> a note. Either connect
            without note OR send a DM. Doing both throttles you.
          </li>
          <li>
            Personalize the hook before sending. Generic openers (&quot;saw your work at
            [company]&quot;) get ignored. Specific openers (&quot;saw your post on RAG eval&quot;)
            get replies.
          </li>
          <li>
            Track in your spreadsheet: who you contacted, when, response status. Day-7 followup
            depends on it.
          </li>
        </ul>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
      <span style={{ color: 'var(--tx-secondary)', fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 14,
  border: '1px solid var(--bd-default)',
  borderRadius: 4,
  fontFamily: 'inherit',
  background: 'var(--sf-raised)',
  color: 'var(--tx-primary)',
};
