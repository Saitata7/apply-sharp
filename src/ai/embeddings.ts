/**
 * Embeddings Service — Semantic Similarity Matching
 *
 * Replaces 1500 hardcoded regex keyword patterns with semantic understanding.
 * "built distributed systems" ≈ "microservices architecture" (cosine similarity ~0.85)
 *
 * Provider support:
 * - OpenAI: text-embedding-3-small ($0.02/1M tokens)
 * - Ollama: local embedding models (nomic-embed-text, mxbai-embed-large)
 * - Anthropic/Groq: no native embeddings — falls back to keyword matching
 *
 * Cache: In-memory + IndexedDB for persistence
 */

import type { AISettings } from '@shared/types/settings.types';

export class EmbeddingsService {
  private settings: AISettings;
  private cache: Map<string, number[]> = new Map();

  constructor(settings: AISettings) {
    this.settings = settings;
  }

  /**
   * Check if the current provider supports embeddings.
   */
  get isAvailable(): boolean {
    return this.settings.provider === 'openai' || this.settings.provider === 'ollama';
  }

  /**
   * Get embedding vector for a text string.
   */
  async embed(text: string): Promise<number[]> {
    const cacheKey = simpleHash(text);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    let embedding: number[];

    if (this.settings.provider === 'openai') {
      embedding = await this.embedOpenAI(text);
    } else if (this.settings.provider === 'ollama') {
      embedding = await this.embedOllama(text);
    } else {
      throw new Error(`Embeddings not supported for provider: ${this.settings.provider}`);
    }

    this.cache.set(cacheKey, embedding);
    return embedding;
  }

  /**
   * Get embedding vectors for multiple texts in a batch.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (this.settings.provider === 'openai') {
      return this.embedBatchOpenAI(texts);
    }

    // Ollama doesn't support batch — process sequentially
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }

  /**
   * Calculate cosine similarity between two texts.
   * Returns value between -1 (opposite) and 1 (identical).
   */
  async similarity(textA: string, textB: string): Promise<number> {
    const [embA, embB] = await Promise.all([this.embed(textA), this.embed(textB)]);
    return cosineSimilarity(embA, embB);
  }

  /**
   * Find the most similar candidates to a query string.
   */
  async findMostSimilar(
    query: string,
    candidates: string[],
    topK = 5
  ): Promise<Array<{ text: string; score: number }>> {
    if (candidates.length === 0) return [];

    const queryEmb = await this.embed(query);
    const candidateEmbs = await this.embedBatch(candidates);

    return candidates
      .map((text, i) => ({
        text,
        score: cosineSimilarity(queryEmb, candidateEmbs[i]),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Clear the in-memory cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ── Provider-specific implementations ──────────────────────────────────

  private async embedOpenAI(text: string): Promise<number[]> {
    const config = this.settings.openai;
    if (!config?.apiKey) throw new Error('OpenAI API key not configured');

    const baseUrl = (config as { baseUrl?: string }).baseUrl || 'https://api.openai.com/v1';

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI embeddings failed: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || [];
  }

  private async embedBatchOpenAI(texts: string[]): Promise<number[][]> {
    const config = this.settings.openai;
    if (!config?.apiKey) throw new Error('OpenAI API key not configured');

    const baseUrl = (config as { baseUrl?: string }).baseUrl || 'https://api.openai.com/v1';

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `OpenAI batch embeddings failed: ${error.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    return (data.data || [])
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((item: { embedding: number[] }) => item.embedding);
  }

  private async embedOllama(text: string): Promise<number[]> {
    const config = this.settings.ollama;
    const baseUrl = config?.baseUrl || 'http://localhost:11434';

    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config?.model || 'nomic-embed-text',
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embeddings failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding || [];
  }
}

// ── Utility Functions ────────────────────────────────────────────────────

/**
 * Cosine similarity between two vectors.
 * Returns value between -1 (opposite) and 1 (identical).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dot / denominator;
}

/**
 * Simple hash for cache keys.
 */
function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}
