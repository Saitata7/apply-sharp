import type {
  AIProviderInterface,
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from '@shared/types/ai.types';
import type { OpenAIConfig } from '@shared/types/settings.types';
import {
  DEFAULT_MODELS,
  OPENAI_CONTEXT_LENGTHS,
  OPENAI_DEFAULT_CONTEXT_LENGTH,
} from '@shared/constants/models';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export class OpenAIProvider implements AIProviderInterface {
  name = 'OpenAI';
  isLocal = false;

  private apiKey: string;
  private model: string;
  private baseUrl = 'https://api.openai.com/v1';

  constructor(config: OpenAIConfig & { baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.model = config.model || DEFAULT_MODELS.openai;
    if (config.baseUrl) this.baseUrl = config.baseUrl;
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

          if (response.status === 429 && attempt < MAX_RETRIES - 1) {
            const delay = this.getRetryDelay(response, attempt);
            console.log(
              `[OpenAI] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
            );
            await this.sleep(delay);
            continue;
          }

          throw new Error(`OpenAI request failed: ${errorMessage}`);
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
        if (lastError.message.includes('429') && attempt < MAX_RETRIES - 1) {
          await this.sleep(BASE_DELAY_MS * Math.pow(2, attempt));
          continue;
        }
        throw lastError;
      }
    }

    throw lastError || new Error('OpenAI request failed after retries');
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
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
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.statusText}`);
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
    // Rough estimation: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }

  getMaxContextLength(): number {
    for (const [key, length] of Object.entries(OPENAI_CONTEXT_LENGTHS)) {
      if (this.model.includes(key)) return length;
    }
    return OPENAI_DEFAULT_CONTEXT_LENGTH;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch (error) {
      console.debug('[OpenAI] Availability check failed:', (error as Error).message);
      return false;
    }
  }
}
