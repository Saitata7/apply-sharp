/**
 * Gemini Nano provider (Chrome built-in Prompt API).
 *
 * Free, on-device, zero setup if the user is on Chrome 127+ with the
 * built-in Gemini Nano model downloaded. This is the cheapest provider
 * possible and the strongest fit for ApplySharp's local-first pitch.
 *
 * Compatibility:
 *   - Stable: Chrome 138+ ships window.LanguageModel unflagged
 *   - Older: Chrome 127-137 expose window.ai.languageModel behind a flag
 *   - Older still: not available; isAvailable() returns false and the
 *     provider falls through to the user's BYOK cloud or Ollama
 *
 * The Prompt API does not natively support JSON Schema structured output yet.
 * For chatStructured() we use prompt-level enforcement: the schema is
 * serialized into the system prompt as a strict instruction, the response is
 * stripped of code fences, and JSON.parse is wrapped in a defensive try.
 * Most use cases (autofill, classification, profile interview turns) do
 * not need structured output and use chat() directly.
 */

import type {
  AIProviderInterface,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  JSONSchema,
  TokenUsage,
} from '@shared/types/ai.types';

// Chrome's Prompt API surface, typed loosely because the spec is still moving.
interface PromptApiSession {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  promptStreaming?(input: string, options?: { signal?: AbortSignal }): AsyncIterable<string>;
  destroy?(): void;
}

interface PromptApiNamespace {
  availability?: () => Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
  capabilities?: () => Promise<{
    available: 'no' | 'after-download' | 'readily';
  }>;
  create(opts?: {
    initialPrompts?: { role: 'system' | 'user' | 'assistant'; content: string }[];
    systemPrompt?: string;
    temperature?: number;
    topK?: number;
    signal?: AbortSignal;
  }): Promise<PromptApiSession>;
}

declare global {
  interface Window {
    LanguageModel?: PromptApiNamespace;
    ai?: { languageModel?: PromptApiNamespace };
  }
}

function getPromptApi(): PromptApiNamespace | null {
  // Chrome 138+: window.LanguageModel
  if (typeof window !== 'undefined' && typeof window.LanguageModel?.create === 'function') {
    return window.LanguageModel;
  }
  // Chrome 127-137: window.ai.languageModel
  if (typeof window !== 'undefined' && typeof window.ai?.languageModel?.create === 'function') {
    return window.ai.languageModel;
  }
  // Service worker context: globalThis.LanguageModel may exist
  // (Chrome exposes it in extension service workers as of Chrome 140+)
  const g = globalThis as unknown as { LanguageModel?: PromptApiNamespace };
  if (typeof g.LanguageModel?.create === 'function') {
    return g.LanguageModel;
  }
  return null;
}

export class GeminiNanoProvider implements AIProviderInterface {
  name = 'Gemini Nano (on-device)';
  isLocal = true;
  lastTokenUsage?: TokenUsage;

  /**
   * The Prompt API does not return token counts. We estimate roughly using
   * the rough rule of thumb of 4 chars per token, since usage tracking still
   * wants a number to compare against cloud providers.
   */
  countTokens(text: string): number {
    return Math.max(1, Math.ceil((text ?? '').length / 4));
  }

  getMaxContextLength(): number {
    // Gemini Nano has a 4096-token context window in Chrome's bundled model.
    return 4096;
  }

  async isAvailable(): Promise<boolean> {
    const api = getPromptApi();
    if (!api) return false;
    try {
      if (typeof api.availability === 'function') {
        const status = await api.availability();
        return status === 'available' || status === 'downloadable';
      }
      if (typeof api.capabilities === 'function') {
        const caps = await api.capabilities();
        return caps.available !== 'no';
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build a Prompt API session from a chat message array. Gemini Nano takes
   * a system prompt at session creation time and then a single user prompt
   * per .prompt() call. We collapse multi-turn history into the system
   * prompt because the Prompt API session does not preserve multi-turn
   * history across .prompt() calls in a way that the spec guarantees.
   */
  private async createSession(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<{ session: PromptApiSession; userMessage: string } | null> {
    const api = getPromptApi();
    if (!api) return null;

    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversational = messages.filter((m) => m.role !== 'system');

    // Build a single user message containing the conversation, with the last
    // user turn as the actual prompt.
    let userMessage = '';
    if (conversational.length === 1) {
      userMessage = conversational[0].content;
    } else if (conversational.length > 1) {
      const history = conversational.slice(0, -1);
      const last = conversational[conversational.length - 1];
      userMessage =
        history.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n') +
        `\n\nUSER: ${last.content}`;
    }

    const systemPrompt = systemMessages.map((m) => m.content).join('\n\n');

    const session = await api.create({
      systemPrompt: systemPrompt || undefined,
      temperature: options?.temperature,
    });

    return { session, userMessage };
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const built = await this.createSession(messages, options);
    if (!built) {
      throw new Error('Gemini Nano is not available in this Chrome build');
    }

    const { session, userMessage } = built;
    try {
      const text = await session.prompt(userMessage);
      const tokensUsed: TokenUsage = {
        prompt: this.countTokens(messages.map((m) => m.content).join('\n')),
        completion: this.countTokens(text),
        total: 0,
      };
      tokensUsed.total = tokensUsed.prompt + tokensUsed.completion;
      this.lastTokenUsage = tokensUsed;

      return {
        content: text,
        tokensUsed,
        model: 'gemini-nano',
        finishReason: 'stop',
      };
    } finally {
      session.destroy?.();
    }
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
    const built = await this.createSession(messages, options);
    if (!built) {
      throw new Error('Gemini Nano is not available in this Chrome build');
    }
    const { session, userMessage } = built;
    try {
      if (typeof session.promptStreaming === 'function') {
        const stream = session.promptStreaming(userMessage);
        for await (const chunk of stream) {
          yield chunk;
        }
      } else {
        const text = await session.prompt(userMessage);
        yield text;
      }
    } finally {
      session.destroy?.();
    }
  }

  async chatStructured<T>(
    messages: ChatMessage[],
    schema: JSONSchema,
    schemaName: string,
    options?: ChatOptions
  ): Promise<T> {
    // Gemini Nano does not yet support response_format. Encode the schema in
    // the system prompt and parse defensively. This is best-effort; for hard
    // structured-output requirements (autofill v2), prefer a cloud provider
    // and let the cost router fall through.
    const schemaInstruction = [
      `You MUST return ONLY a valid JSON object matching this schema (named "${schemaName}"):`,
      JSON.stringify(schema, null, 2),
      'Do not include any prose, explanations, or markdown code fences. Return raw JSON only.',
    ].join('\n\n');

    const augmented: ChatMessage[] = [
      ...messages.filter((m) => m.role === 'system'),
      { role: 'system', content: schemaInstruction },
      ...messages.filter((m) => m.role !== 'system'),
    ];

    const response = await this.chat(augmented, options);
    const cleaned = response.content
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch (err) {
      throw new Error(
        `Gemini Nano returned non-JSON output for schema "${schemaName}": ${(err as Error).message}`
      );
    }
  }
}
