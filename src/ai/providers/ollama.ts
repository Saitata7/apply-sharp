import type {
  AIProviderInterface,
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from '@shared/types/ai.types';
import type { OllamaConfig } from '@shared/types/settings.types';
import {
  DEFAULT_MODELS,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_CONTEXT_LENGTH,
} from '@shared/constants/models';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export class OllamaProvider implements AIProviderInterface {
  name = 'Ollama';
  isLocal = true;

  private baseUrl: string;
  private model: string;
  private contextLength: number;

  constructor(config: OllamaConfig) {
    this.baseUrl = config.baseUrl || DEFAULT_OLLAMA_BASE_URL;
    this.model = config.model || DEFAULT_MODELS.ollama;
    this.contextLength = config.contextLength || DEFAULT_OLLAMA_CONTEXT_LENGTH;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            stream: false,
            options: {
              temperature: options?.temperature ?? 0.7,
              num_predict: options?.maxTokens ?? 2048,
            },
          }),
        });

        if (!response.ok) {
          if (response.status === 429 && attempt < MAX_RETRIES - 1) {
            const delay = BASE_DELAY_MS * Math.pow(2, attempt);
            console.log(
              `[Ollama] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
            );
            await this.sleep(delay);
            continue;
          }
          throw new Error(`Ollama request failed: ${response.statusText}`);
        }

        const data = await response.json();

        return {
          content: data.message?.content || '',
          tokensUsed: {
            prompt: data.prompt_eval_count || 0,
            completion: data.eval_count || 0,
            total: (data.prompt_eval_count || 0) + (data.eval_count || 0),
          },
          model: this.model,
          finishReason: 'stop',
        };
      } catch (error) {
        lastError = error as Error;
        // Retry on connection errors (Ollama might be starting up)
        if (
          attempt < MAX_RETRIES - 1 &&
          (lastError.message.includes('fetch') || lastError.message.includes('network'))
        ) {
          await this.sleep(BASE_DELAY_MS * Math.pow(2, attempt));
          continue;
        }
        throw lastError;
      }
    }

    throw lastError || new Error('Ollama request failed after retries');
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 2048,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              yield data.message.content;
            }
          } catch {
            // Partial JSON lines are expected during streaming; log unexpected ones
            if (line.trim().startsWith('{')) {
              console.warn('[Ollama] Failed to parse stream chunk:', line.slice(0, 100));
            }
          }
        }
      }
    }
  }

  countTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  getMaxContextLength(): number {
    return this.contextLength;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });
      return response.ok;
    } catch (error) {
      console.debug('[Ollama] Availability check failed:', (error as Error).message);
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];

      const data = await response.json();
      return (data.models || []).map((m: { name: string }) => m.name);
    } catch (error) {
      console.debug('[Ollama] Failed to list models:', (error as Error).message);
      return [];
    }
  }
}
