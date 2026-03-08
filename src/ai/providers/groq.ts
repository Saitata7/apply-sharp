import type {
  AIProviderInterface,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  JSONSchema,
} from '@shared/types/ai.types';
import type { GroqConfig } from '@shared/types/settings.types';
import {
  DEFAULT_MODELS,
  GROQ_CONTEXT_LENGTHS,
  GROQ_DEFAULT_CONTEXT_LENGTH,
} from '@shared/constants/models';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export class GroqProvider implements AIProviderInterface {
  name = 'Groq';
  isLocal = false;

  private apiKey: string;
  private model: string;
  private baseUrl = 'https://api.groq.com/openai/v1';

  constructor(config: GroqConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || DEFAULT_MODELS.groq;
  }

  /**
   * Sleep helper for rate limit delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get retry delay from response headers (preferred) or error message (fallback).
   * Groq sends x-ratelimit-reset-requests and x-ratelimit-reset-tokens headers
   * with ISO timestamps or relative seconds for when limits reset.
   */
  private getRetryDelay(response: Response | null, errorMessage: string, attempt: number): number {
    // Priority 1: Use retry-after header
    if (response) {
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        const seconds = parseFloat(retryAfter);
        if (!isNaN(seconds)) return Math.ceil(seconds * 1000) + 100;
      }

      // Priority 2: Use x-ratelimit-reset-* headers
      const resetRequests = response.headers.get('x-ratelimit-reset-requests');
      const resetTokens = response.headers.get('x-ratelimit-reset-tokens');
      const resetStr = resetRequests || resetTokens;
      if (resetStr) {
        // Format can be "1s", "229ms", "1.5s", or ISO timestamp
        const msMatch = resetStr.match(/([\d.]+)ms/);
        if (msMatch) return Math.ceil(parseFloat(msMatch[1])) + 100;
        const secMatch = resetStr.match(/([\d.]+)s/);
        if (secMatch) return Math.ceil(parseFloat(secMatch[1]) * 1000) + 100;
      }
    }

    // Priority 3: Parse delay from error message text
    const msMatch = errorMessage.match(/try again in ([\d.]+)ms/i);
    if (msMatch) return Math.ceil(parseFloat(msMatch[1])) + 100;
    const secMatch = errorMessage.match(/try again in ([\d.]+)s/i);
    if (secMatch) return Math.ceil(parseFloat(secMatch[1]) * 1000) + 100;

    // Priority 4: Exponential backoff
    return BASE_DELAY_MS * Math.pow(2, attempt);
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            temperature: options?.temperature ?? 0.7,
            max_tokens: options?.maxTokens ?? 2048,
            stream: false,
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          const errorMessage = error.error?.message || response.statusText;

          // Check if rate limited (429) or contains rate limit message
          const isRateLimited =
            response.status === 429 || errorMessage.toLowerCase().includes('rate limit');

          if (isRateLimited && attempt < MAX_RETRIES - 1) {
            const retryDelay = this.getRetryDelay(response, errorMessage, attempt);
            console.log(
              `[Groq] Rate limited, retrying in ${retryDelay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
            );
            await this.sleep(retryDelay);
            continue;
          }

          throw new Error(`Groq request failed: ${errorMessage}`);
        }

        const data = await response.json();
        const choice = data.choices?.[0];

        return {
          content: choice?.message?.content || '',
          tokensUsed: {
            prompt: data.usage?.prompt_tokens || 0,
            completion: data.usage?.completion_tokens || 0,
            total: data.usage?.total_tokens || 0,
          },
          model: this.model,
          finishReason: choice?.finish_reason === 'stop' ? 'stop' : 'length',
        };
      } catch (error) {
        lastError = error as Error;

        // Check if error message contains rate limit info
        const errorMessage = lastError.message || '';
        const isRateLimited = errorMessage.toLowerCase().includes('rate limit');

        if (isRateLimited && attempt < MAX_RETRIES - 1) {
          const retryDelay = this.getRetryDelay(null, errorMessage, attempt);
          console.log(
            `[Groq] Rate limited (catch), retrying in ${retryDelay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
          );
          await this.sleep(retryDelay);
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Groq request failed after retries');
  }

  async chatStructured<T>(
    messages: ChatMessage[],
    schema: JSONSchema,
    schemaName: string,
    options?: ChatOptions
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Groq uses OpenAI-compatible tool use for structured outputs
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            temperature: options?.temperature ?? 0.3,
            max_tokens: options?.maxTokens ?? 2048,
            tools: [
              {
                type: 'function',
                function: {
                  name: schemaName,
                  description: `Return the structured ${schemaName} result`,
                  parameters: schema,
                },
              },
            ],
            tool_choice: { type: 'function', function: { name: schemaName } },
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          const errorMessage = error.error?.message || response.statusText;

          const isRateLimited =
            response.status === 429 || errorMessage.toLowerCase().includes('rate limit');

          if (isRateLimited && attempt < MAX_RETRIES - 1) {
            const retryDelay = this.getRetryDelay(response, errorMessage, attempt);
            console.log(
              `[Groq] Structured: rate limited, retrying in ${retryDelay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
            );
            await this.sleep(retryDelay);
            continue;
          }

          throw new Error(`Groq structured request failed: ${errorMessage}`);
        }

        const data = await response.json();
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

        if (toolCall?.function?.arguments) {
          return JSON.parse(toolCall.function.arguments) as T;
        }

        // Fallback: try parsing message content as JSON
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          return JSON.parse(content) as T;
        }

        throw new Error('Groq structured: no tool call or parseable content in response');
      } catch (error) {
        lastError = error as Error;
        const errorMessage = lastError.message || '';
        const isRateLimited = errorMessage.toLowerCase().includes('rate limit');

        if (isRateLimited && attempt < MAX_RETRIES - 1) {
          const retryDelay = this.getRetryDelay(null, errorMessage, attempt);
          await this.sleep(retryDelay);
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Groq structured request failed after retries');
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
    let response: Response | null = null;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            temperature: options?.temperature ?? 0.7,
            max_tokens: options?.maxTokens ?? 2048,
            stream: true,
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          const errorMessage = error.error?.message || response.statusText;

          const isRateLimited =
            response.status === 429 || errorMessage.toLowerCase().includes('rate limit');

          if (isRateLimited && attempt < MAX_RETRIES - 1) {
            const retryDelay = this.getRetryDelay(response, errorMessage, attempt);
            console.log(
              `[Groq Stream] Rate limited, retrying in ${retryDelay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
            );
            await this.sleep(retryDelay);
            continue;
          }

          throw new Error(`Groq request failed: ${errorMessage}`);
        }

        break; // Success, exit retry loop
      } catch (error) {
        lastError = error as Error;
        const errorMessage = lastError.message || '';
        const isRateLimited = errorMessage.toLowerCase().includes('rate limit');

        if (isRateLimited && attempt < MAX_RETRIES - 1) {
          const retryDelay = this.getRetryDelay(null, errorMessage, attempt);
          console.log(
            `[Groq Stream] Rate limited (catch), retrying in ${retryDelay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
          );
          await this.sleep(retryDelay);
          continue;
        }

        throw lastError;
      }
    }

    if (!response || !response.ok) {
      throw lastError || new Error('Groq stream request failed after retries');
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
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // Expected: SSE stream chunks may contain partial JSON
          }
        }
      }
    }
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  getMaxContextLength(): number {
    for (const [key, length] of Object.entries(GROQ_CONTEXT_LENGTHS)) {
      if (this.model.includes(key)) return length;
    }
    return GROQ_DEFAULT_CONTEXT_LENGTH;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch (error) {
      console.debug('[Groq] Availability check failed:', (error as Error).message);
      return false;
    }
  }
}
