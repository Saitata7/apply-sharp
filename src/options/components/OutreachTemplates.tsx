/**
 * Outreach templates panel.
 *
 * Canned-text templates for high-frequency outreach replies (visa pre-qual,
 * decline, interview confirm, day-7/14 follow-up, referral asks). No AI
 * call, no latency. Pick → fill placeholders → copy.
 *
 * Lives inside Outreach Composer as the "Templates" mode. Distinct purpose
 * from the AI Compose mode in the same page (which generates fresh outreach
 * via the GENERATE_OUTREACH backend).
 */

import { useState, useMemo, useCallback } from 'react';

interface Template {
  id: string;
  title: string;
  tag: 'inbound' | 'outbound';
  channel: 'linkedin' | 'email' | 'both';
  body: string;
  notes?: string;
}

const TEMPLATES: Template[] = [
  {
    id: 'visa_prequal_linkedin',
    title: 'Visa pre-qualification ask (LinkedIn DM)',
    tag: 'inbound',
    channel: 'linkedin',
    body: `Hi {recipient},

Thanks for reaching out about the role at {company} — appreciate the note.

Quick logistics question before I invest time in the assessment / loop: is this role open to candidates on STEM OPT with a planned H1B sponsorship, or does hiring need to be domestic only? Want to make sure it's a fit for both of us.

Happy to send my resume and jump on a call either way.

Thanks,
{you}`,
    notes:
      'Send within 24h of any inbound LinkedIn recruiter DM. Saves 2-3 hours per dead-end lead.',
  },
  {
    id: 'visa_prequal_email',
    title: 'Visa pre-qualification ask (Email reply)',
    tag: 'inbound',
    channel: 'email',
    body: `Hi {recipient},

Thanks for reaching out about the {role} role at {company}.

Before I complete the assessment, I wanted to confirm one thing: is this position open to candidates on STEM OPT with a planned H1B sponsorship, or is domestic authorization required? I'm asking upfront so we don't waste each other's time if it's not a fit.

Happy to proceed either way — just want to be transparent about work authorization.

Thanks,
{you}`,
    notes: 'Same purpose as the LinkedIn version, adapted for email formatting.',
  },
  {
    id: 'thanks_declining',
    title: 'Thanks but declining (role mismatch)',
    tag: 'inbound',
    channel: 'both',
    body: `Hi {recipient},

Appreciate you reaching out. Looking at the role description, this isn't quite the right fit for where I'm headed ({reason}).

Happy to stay connected — if something closer to {target} opens up on your team, I'd be glad to chat.

Thanks,
{you}`,
    notes:
      'Polite decline without burning the relationship. Recruiter remembers you for the next req.',
  },
  {
    id: 'interview_confirm',
    title: 'Interview scheduling confirmation',
    tag: 'inbound',
    channel: 'email',
    body: `Hi {recipient},

Thanks for setting this up. Confirming {date} at {time} for the {round} round with {company}.

I'll join via the link you sent. Please let me know if anything changes, or if there's specific preparation material I should review beforehand.

Looking forward to the conversation.

Thanks,
{you}`,
    notes:
      'Send same day you get the interview invite. Shows professionalism and locks in logistics.',
  },
  {
    id: 'day7_followup',
    title: 'Day-7 follow-up on your outreach',
    tag: 'outbound',
    channel: 'both',
    body: `Hi {recipient},

Circling back on my note from last week about {company}. I know inboxes are brutal right now.

Still very interested in the {role} opportunity — if there's a better person to connect with, or a faster path into the hiring process, happy to redirect.

Otherwise, no worries if the timing isn't right. Thanks for considering.

{you}`,
    notes:
      'Send exactly 7 days after initial LinkedIn DM or cold email. One follow-up only — do not pester.',
  },
  {
    id: 'day14_final',
    title: 'Day-14 final nudge',
    tag: 'outbound',
    channel: 'both',
    body: `Hi {recipient},

Last note from me — wanted to close the loop in case you missed my earlier outreach about {company}. Totally understand if the timing or fit isn't right on your side.

If a role matching my background ({your_stack}) opens up in the future, I'd love to reconnect. Good luck with the hiring push.

{you}`,
    notes:
      'The final touch in your 3-touch sequence. After this, stop and move on — further messages hurt you.',
  },
  {
    id: 'referral_ask_short',
    title: 'Referral ask (short, warm contact)',
    tag: 'outbound',
    channel: 'linkedin',
    body: `Hey {recipient},

Hope you're doing well. I'm applying to {company} for the {role} position and saw you're on the {team} team.

Would you be open to a quick referral if my background looks like a fit? Happy to send my resume and the JD — no pressure either way.

Thanks,
{you}`,
    notes:
      'For people you actually know (ex-colleague, alumni with prior contact). Assume low friction.',
  },
  {
    id: 'referral_ask_cold',
    title: 'Referral ask (cold, no prior contact)',
    tag: 'outbound',
    channel: 'linkedin',
    body: `Hi {recipient},

Saw you're on the {team} team at {company} and noticed you {hook} — impressive work.

I'm applying for the {role} role and my background ({your_stack}) lines up closely with what the team ships. Would you be open to a quick referral, or a 15-min call to see if there's a fit before I drop a CV into the ATS?

Either works — appreciate your time either way.

{you}`,
    notes:
      'When you do not know the person but their work is visible. Fill {hook} with something specific from their LinkedIn or a recent post.',
  },
];

interface PlaceholderValues {
  [key: string]: string;
}

function extractPlaceholders(body: string): string[] {
  const matches = body.matchAll(/\{([a-z_]+)\}/gi);
  const set = new Set<string>();
  for (const m of matches) set.add(m[1]);
  return [...set];
}

function fillTemplate(body: string, values: PlaceholderValues): string {
  return body.replace(/\{([a-z_]+)\}/gi, (_m, key) => values[key] || `{${key}}`);
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'inbound', label: 'Inbound (reply to them)' },
  { value: 'outbound', label: 'Outbound (your outreach)' },
] as const;

export default function OutreachTemplates() {
  const [selectedId, setSelectedId] = useState<string>(TEMPLATES[0].id);
  const [filter, setFilter] = useState<(typeof FILTER_OPTIONS)[number]['value']>('all');
  const [values, setValues] = useState<PlaceholderValues>({});
  const [copied, setCopied] = useState(false);

  const visibleTemplates = useMemo(
    () => (filter === 'all' ? TEMPLATES : TEMPLATES.filter((t) => t.tag === filter)),
    [filter]
  );

  const selected = useMemo(
    () => TEMPLATES.find((t) => t.id === selectedId) ?? TEMPLATES[0],
    [selectedId]
  );

  const placeholders = useMemo(() => extractPlaceholders(selected.body), [selected.body]);
  const filled = useMemo(() => fillTemplate(selected.body, values), [selected.body, values]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(filled);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.getElementById('oc-templates-preview') as HTMLTextAreaElement | null;
      ta?.select();
    }
  }, [filled]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
      {/* Left: template list + filter */}
      <div>
        <div
          role="tablist"
          style={{
            display: 'flex',
            gap: 4,
            marginBottom: 12,
            background: 'var(--sf-overlay)',
            padding: 4,
            borderRadius: 6,
          }}
        >
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              role="tab"
              aria-selected={filter === opt.value}
              onClick={() => setFilter(opt.value)}
              style={{
                flex: 1,
                padding: '6px 10px',
                border: 0,
                borderRadius: 4,
                background: filter === opt.value ? 'var(--sf-raised)' : 'transparent',
                color: filter === opt.value ? 'var(--tx-primary)' : 'var(--tx-secondary)',
                fontSize: 13,
                fontWeight: filter === opt.value ? 600 : 400,
                cursor: 'pointer',
                boxShadow: filter === opt.value ? 'var(--sh-sm)' : 'none',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 600,
            overflowY: 'auto',
          }}
        >
          {visibleTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              aria-pressed={selectedId === t.id}
              style={{
                padding: 12,
                textAlign: 'left',
                border: `1px solid ${selectedId === t.id ? 'var(--brand)' : 'var(--bd-default)'}`,
                borderRadius: 6,
                background: selectedId === t.id ? 'var(--ac-amber-ghost)' : 'var(--sf-raised)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                color: 'var(--tx-primary)',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx-primary)' }}>
                {t.title}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--tx-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {t.channel} · {t.tag}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: placeholders + preview */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            padding: 16,
            border: '1px solid var(--bd-default)',
            borderRadius: 6,
            background: 'var(--sf-raised)',
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--tx-secondary)', marginBottom: 12 }}>
            <strong style={{ color: 'var(--tx-primary)' }}>{selected.title}</strong>
            {selected.notes && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: 'var(--tx-secondary)',
                  lineHeight: 1.5,
                }}
              >
                {selected.notes}
              </div>
            )}
          </div>
          {placeholders.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--tx-secondary)',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Fill placeholders
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 8,
                }}
              >
                {placeholders.map((p) => (
                  <label
                    key={p}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      fontSize: 13,
                    }}
                  >
                    <span
                      style={{
                        color: 'var(--tx-secondary)',
                        fontFamily: 'var(--ff-mono)',
                      }}
                    >
                      {'{' + p + '}'}
                    </span>
                    <input
                      value={values[p] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [p]: e.target.value }))}
                      placeholder={placeholderHint(p)}
                      style={{
                        padding: '6px 10px',
                        fontSize: 14,
                        border: '1px solid var(--bd-default)',
                        borderRadius: 4,
                        background: 'var(--sf-raised)',
                        color: 'var(--tx-primary)',
                      }}
                    />
                  </label>
                ))}
              </div>
              {Object.keys(values).length > 0 && (
                <button
                  onClick={() => setValues({})}
                  style={{
                    marginTop: 8,
                    padding: '4px 10px',
                    border: '1px solid var(--bd-default)',
                    borderRadius: 4,
                    background: 'var(--sf-raised)',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--tx-secondary)',
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: 'var(--tx-secondary)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Preview
            </div>
            <button
              onClick={handleCopy}
              style={{
                padding: '8px 20px',
                border: 0,
                borderRadius: 999,
                background: copied ? 'var(--cl-emerald)' : 'var(--brand)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                minWidth: 120,
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <textarea
            id="oc-templates-preview"
            readOnly
            value={filled}
            style={{
              padding: 16,
              fontSize: 14,
              lineHeight: 1.6,
              fontFamily: 'inherit',
              border: '1px solid var(--bd-default)',
              borderRadius: 6,
              background: 'var(--sf-raised)',
              minHeight: 320,
              resize: 'vertical',
              color: 'var(--tx-primary)',
            }}
          />
          <div style={{ fontSize: 12, color: 'var(--tx-muted)' }}>
            Unfilled placeholders still show as <code>{'{name}'}</code>. Copy anyway and finish
            inline in LinkedIn/Gmail if you prefer.
          </div>
        </div>
      </div>
    </div>
  );
}

function placeholderHint(key: string): string {
  const hints: Record<string, string> = {
    recipient: 'Name of the person',
    company: 'Company name',
    role: 'Job title',
    team: 'Team or product area',
    date: 'Interview date',
    time: 'Interview time',
    round: 'e.g., phone screen, technical, final',
    reason: 'Why the role is not a fit',
    target: 'What you ARE targeting',
    hook: 'Specific thing about their work',
    your_stack: 'e.g., Java + LangChain + GenAI, 5 YOE',
    you: 'Your name',
  };
  return hints[key] || '';
}
