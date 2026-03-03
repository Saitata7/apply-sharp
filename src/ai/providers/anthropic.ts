import type {
  AIProviderInterface,
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from '@shared/types/ai.types';
import type { AnthropicConfig } from '@shared/types/settings.types';
import {
  DEFAULT_MODELS,
  ANTHROPIC_CONTEXT_LENGTHS,
  ANTHROPIC_DEFAULT_CONTEXT_LENGTH,
} from '@shared/constants/models';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const ANTHROPIC_API_VERSION = '2023-06-01';

export class AnthropicProvider implements AIProviderInterface {
  name = 'Anthropic';
  isLocal = false;

  private apiKey: string;
  private model: string;
  private baseUrl = 'https://api.anthropic.com/v1';

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || DEFAULT_MODELS.anthropic;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getRetryDelay(response: Response, attempt: number): number {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) return seconds * 1000 + 100;
    }
    return BASE_DELAY_MS * Math.pow(2, attempt);
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Anthropic Messages API: system message is a top-level param, not in messages array
        const systemMessage = messages.find((m) => m.role === 'system');
        const nonSystemMessages = messages.filter((m) => m.role !== 'system');

        // Anthropic requires at least one user message
        const apiMessages = nonSystemMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        const body: Record<string, unknown> = {
          model: this.model,
          messages: apiMessages,
          max_tokens: options?.maxTokens ?? 2048,
          temperature: options?.temperature ?? 0.7,
        };

        if (systemMessage) {
          body.system = systemMessage.content;
        }

        const response = await fetch(`${this.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': ANTHROPIC_API_VERSION,
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          const errorMessage = error.error?.message || error.message || response.statusText;

          if (response.status === 429 && attempt < MAX_RETRIES - 1) {
            const delay = this.getRetryDelay(response, attempt);
            console.log(
              `[Anthropic] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
            );
            await this.sleep(delay);
            continue;
          }

          throw new Error(`Anthropic request failed: ${errorMessage}`);
        }

        const data = await response.json();

        // Anthropic response: content is an array of content blocks
        const textContent =
          data.content
            ?.filter((block: { type: string }) => block.type === 'text')
            .map((block: { text: string }) => block.text)
            .join('') || '';

        return {
          content: textContent,
          tokensUsed: {
            prompt: data.usage?.input_tokens || 0,
            completion: data.usage?.output_tokens || 0,
            total: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
          },
          model: this.model,
          finishReason: data.stop_reason === 'max_tokens' ? 'length' : 'stop',
        };
      } catch (error) {
        lastError = error as Error;
        if (lastError.message.includes('429') && attempt < MAX_RETRIES - 1) {
          await this.sleep(BASE_DELAY_MS * Math.pow(2, attempt));
          continue;
        }
        throw lastError;
      }
    }

    throw lastError || new Error('Anthropic request failed after retries');
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
    // Anthropic Messages API: system message is a top-level param
    const systemMessage = messages.find((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const apiMessages = nonSystemMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const body: Record<string, unknown> = {
      model: this.model,
      messages: apiMessages,
      max_tokens: options?.maxTokens ?? 2048,
      temperature: options?.temperature ?? 0.7,
      stream: true,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    // Retry logic for transient errors (429/503)
    let response: Response | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) break;

      if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES - 1) {
        const delay = this.getRetryDelay(response, attempt);
        console.log(
          `[Anthropic] Stream rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await this.sleep(delay);
        continue;
      }

      throw new Error(`Anthropic request failed: ${response.statusText}`);
    }

    if (!response?.ok) {
      throw new Error('Anthropic stream request failed after retries');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              yield parsed.delta.text;
            } else if (parsed.type === 'error') {
              console.warn('[Anthropic] SSE error event:', parsed.error?.message || parsed);
            }
          } catch {
            // Expected: SSE stream chunks may contain partial JSON
          }
        }
      }
    }
  }

  countTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }

  getMaxContextLength(): number {
    for (const [key, length] of Object.entries(ANTHROPIC_CONTEXT_LENGTHS)) {
      if (this.model.includes(key)) return length;
    }
    return ANTHROPIC_DEFAULT_CONTEXT_LENGTH;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      // Send an intentionally invalid request (empty messages) to check auth
      // without incurring API charges. 400 = valid key, 401/403 = invalid key.
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [],
          max_tokens: 1,
        }),
      });
      return response.status !== 401 && response.status !== 403;
    } catch (error) {
      console.debug('[Anthropic] Availability check failed:', (error as Error).message);
      return false;
    }
  }
}
