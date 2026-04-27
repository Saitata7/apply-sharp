/**
 * Assistant page — chat with Claude over your ApplySharp data.
 *
 * v1 is read-only: Claude can read your master profile, role profiles,
 * applications, recent jobs, and settings. Write tools (update bullets,
 * generate role profiles, etc.) land next iteration once the loop is
 * battle-tested.
 *
 * The same tool registry (src/core/agent/tools.ts) will eventually be
 * exposed to external surfaces (MCP server / CLI) so Claude Code can
 * drive ApplySharp from outside the browser.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import { executeTool, toAnthropicTools } from '@core/agent/tools';
import type { UserSettings } from '@shared/types/settings.types';
import { DEFAULT_MODELS } from '@shared/constants/models';

type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolUses?: Array<{ name: string; input: unknown }> }
  | { role: 'system-status'; content: string };

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;

const SYSTEM_PROMPT = `You are the ApplySharp in-app assistant. You help the user — a job seeker — reason about and edit their profile, applications, and outreach.

Style: terse, direct, useful. The user is technical and time-poor. No fluff, no headers, no bulleted lists unless asked. One short paragraph per answer is ideal.

READ tools (use freely — always pull data before answering questions about the user):
- get_master_profile, list_role_profiles, list_recent_applications, list_recent_jobs, get_settings

WRITE tools (mutate persisted data — be careful):
- create_master_profile_from_text(resumeText, ...): bootstrap a brand-new master profile. Use ONLY when get_master_profile returns null/empty. Draft a clean resume-shaped text yourself first, show it to the user for review, then call.
- update_master_profile(context): natural-language update to an EXISTING profile. Backend AI parses the change.
- generate_role_profile(targetRole): create a tailored branch.
- update_application_status(applicationId, status): change app status.

GENERATION tools (call AI, return content for the user — don't mutate storage):
- score_jd(jobDescription, targetRoleId?): score a JD against the user's profile. Returns ATS fit, matched/missing skills, suggestions.
- generate_cover_letter(jobDescription, companyName, jobTitle, tone?): tailored cover letter body.
- generate_outreach(kind, intent, companyName, ...): cold email or LinkedIn DM with research.
- interview_prep(jobDescription, companyName, jobTitle): likely interview questions + prep notes.

INTEL tools (query bundled scraped data — Sai's pre-vetted target list):
- search_hn_jobs(query?, visaFriendlyOnly=true, minStackScore=5, limit=15): search the HackerNews "Who is Hiring" scrape. Returns visa-flagged, stack-scored postings sorted by fit. Use when user asks "what should I apply to", "show me visa-friendly companies", "who's hiring with my stack".
- lookup_h1b_sponsor(companyName): query the DOL H-1B LCA index for a company's sponsorship history. Returns null (with a friendly setup note) if the index isn't bundled yet.

Rules:
1. Only call write tools when the user has clearly asked for the change. Ambiguous phrasing → confirm first.
2. For create_master_profile_from_text: ALWAYS show the resumeText draft and ask "ready to create?" before calling.
3. After a write, briefly state what changed. Don't dump the whole returned object.
4. After a generation tool returns content (cover letter, outreach, interview prep), present it cleanly — the content IS the answer. Don't summarize it; just deliver it.
5. If any tool fails, explain the error plainly and what to try next.`;

const MAX_TOOL_ITERATIONS = 6;

const HISTORY_KEY = 'assistantChatHistory';
const HISTORY_MAX = 200;

export default function Assistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await sendMessage<void, UserSettings>({ type: 'GET_SETTINGS' });
        if (res?.success) setSettings(res.data ?? null);
      } catch {
        // Non-fatal — UI handles missing settings below.
      }
    })();
  }, []);

  // Hydrate persisted history once on mount.
  useEffect(() => {
    void (async () => {
      try {
        const got = await chrome.storage.local.get(HISTORY_KEY);
        const saved = got?.[HISTORY_KEY] as ChatMessage[] | undefined;
        if (Array.isArray(saved)) setMessages(saved);
      } catch {
        // chrome.storage may be unavailable
      } finally {
        setHistoryLoaded(true);
      }
    })();
  }, []);

  // Persist history on every change (after hydration to avoid wiping it).
  useEffect(() => {
    if (!historyLoaded) return;
    const trimmed = messages.slice(-HISTORY_MAX);
    void chrome.storage.local.set({ [HISTORY_KEY]: trimmed }).catch(() => {});
  }, [messages, historyLoaded]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const apiKey = settings?.ai?.anthropic?.apiKey ?? '';
  const model = settings?.ai?.anthropic?.model ?? DEFAULT_MODELS.anthropic;
  const provider = settings?.ai?.provider;
  const ready = provider === 'anthropic' && apiKey.length > 0;

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy || !ready) return;

    setError(null);
    setInput('');
    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);

    try {
      // Build the rolling Anthropic message history. Strip system-status
      // entries — they are UI only.
      const history = [...messages, userMsg].filter((m) => m.role !== 'system-status');
      const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: unknown }> =
        history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const tools = toAnthropicTools();

      // Tool-use loop — keep calling Anthropic until end_turn or max iterations.
      for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model,
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            tools,
            messages: anthropicMessages,
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err?.error?.message || `Anthropic API ${response.status}`);
        }

        const data = (await response.json()) as {
          content: AnthropicContentBlock[];
          stop_reason: string;
        };

        const textBlocks = data.content.filter((b): b is AnthropicTextBlock => b.type === 'text');
        const toolUseBlocks = data.content.filter(
          (b): b is AnthropicToolUseBlock => b.type === 'tool_use'
        );

        const assistantText = textBlocks
          .map((b) => b.text)
          .join('')
          .trim();

        // Show partial assistant text + which tools it's invoking so the
        // user sees activity while tools run.
        if (assistantText || toolUseBlocks.length > 0) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: assistantText,
              toolUses: toolUseBlocks.map((b) => ({ name: b.name, input: b.input })),
            },
          ]);
        }

        if (data.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
          // Loop finished — final assistant turn.
          break;
        }

        // Append the assistant turn to the conversation history.
        anthropicMessages.push({
          role: 'assistant',
          content: data.content,
        });

        // Execute each tool and gather results.
        const toolResults: Array<{
          type: 'tool_result';
          tool_use_id: string;
          content: string;
          is_error?: boolean;
        }> = [];

        for (const tool of toolUseBlocks) {
          try {
            const result = await executeTool(tool.name, tool.input);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tool.id,
              content: JSON.stringify(result ?? null),
            });
          } catch (e) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tool.id,
              content: (e as Error).message,
              is_error: true,
            });
          }
        }

        anthropicMessages.push({ role: 'user', content: toolResults });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [input, busy, ready, apiKey, model, messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 860,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 48px)',
      }}
    >
      <header
        style={{
          marginBottom: 16,
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Assistant</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
            Chat with Claude over your ApplySharp data. Reads <em>and</em> writes — Claude can
            update your profile, generate role profiles, and change application status when you ask.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => {
              if (!confirm('Clear the entire conversation? This cannot be undone.')) return;
              setMessages([]);
              void chrome.storage.local.remove(HISTORY_KEY).catch(() => {});
            }}
            style={{
              padding: '6px 12px',
              border: '1px solid #cbd5e1',
              borderRadius: 4,
              background: '#fff',
              cursor: 'pointer',
              fontSize: 12,
              color: '#64748b',
              flexShrink: 0,
            }}
          >
            Clear history
          </button>
        )}
      </header>

      {!ready && (
        <div
          role="status"
          style={{
            padding: 12,
            background: '#fef3c7',
            border: '1px solid #fde68a',
            color: '#92400e',
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          The Assistant uses Anthropic. Set the provider to <strong>anthropic</strong> in AI
          Settings and add your API key, then come back here.
        </div>
      )}

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          background: '#fafafa',
          border: '1px solid #e2e8f0',
          borderRadius: 6,
          marginBottom: 12,
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', padding: 40 }}>
            Try: <em>&ldquo;What does my master profile look like?&rdquo;</em>,{' '}
            <em>&ldquo;Add Rust and WebAssembly to my skills&rdquo;</em>, or{' '}
            <em>&ldquo;Generate a GenAI Engineer role profile.&rdquo;</em>
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} message={m} />
        ))}
        {busy && (
          <div style={{ color: '#64748b', fontSize: 13, padding: '8px 12px' }}>
            <em>Thinking…</em>
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: 10,
            background: '#fef2f2',
            color: '#b91c1c',
            border: '1px solid #fecaca',
            borderRadius: 4,
            fontSize: 13,
            marginBottom: 8,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            ready
              ? 'Ask anything about your profile, apps, or pipeline...'
              : 'Configure Anthropic in AI Settings first.'
          }
          disabled={!ready || busy}
          rows={3}
          style={{
            flex: 1,
            padding: 10,
            fontSize: 14,
            fontFamily: 'inherit',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            resize: 'vertical',
          }}
        />
        <button
          onClick={() => void send()}
          disabled={!ready || busy || !input.trim()}
          style={{
            padding: '12px 20px',
            border: 0,
            borderRadius: 6,
            background: !ready || busy || !input.trim() ? '#cbd5e1' : '#0f1419',
            color: '#fff',
            cursor: !ready || busy || !input.trim() ? 'not-allowed' : 'pointer',
            fontSize: 14,
            fontWeight: 600,
            minWidth: 80,
          }}
        >
          {busy ? '...' : 'Send'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Cmd/Ctrl+Enter to send.</div>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <div
          style={{
            maxWidth: '80%',
            padding: '10px 14px',
            background: '#0f1419',
            color: '#fff',
            borderRadius: 12,
            fontSize: 14,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
      <div
        style={{
          maxWidth: '80%',
          padding: '10px 14px',
          background: '#fff',
          color: '#0f1419',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
        }}
      >
        {message.content}
        {message.role === 'assistant' && message.toolUses && message.toolUses.length > 0 && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: '#f1f5f9',
              borderRadius: 6,
              fontSize: 12,
              color: '#475569',
            }}
          >
            {message.toolUses.map((t, i) => (
              <div key={i}>
                <code>{t.name}</code>
                {Object.keys(t.input as Record<string, unknown>).length > 0 && (
                  <span> · {JSON.stringify(t.input)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
