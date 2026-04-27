/**
 * Tests for the Workstream 6 cost router.
 *
 * The detectBestProvider helper is the brain of "free for users on Chrome
 * 138+, BYOK fallback for everyone else". These tests verify the priority
 * order, the per-provider availability gating, and the null result when
 * nothing works.
 *
 * GeminiNanoProvider.isAvailable() is mocked to control which branch fires
 * since we cannot really probe window.LanguageModel from jsdom.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock all four cloud / local provider classes BEFORE importing detectBestProvider.
vi.mock('./providers/gemini-nano', () => ({
  GeminiNanoProvider: vi.fn().mockImplementation(() => ({
    isAvailable: vi.fn().mockResolvedValue(false),
  })),
}));

vi.mock('./providers/ollama', () => ({
  OllamaProvider: vi.fn().mockImplementation(() => ({
    isAvailable: vi.fn().mockResolvedValue(false),
  })),
}));

vi.mock('./providers/anthropic', () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => ({
    isAvailable: vi.fn().mockResolvedValue(false),
  })),
}));

vi.mock('./providers/openai', () => ({
  OpenAIProvider: vi.fn().mockImplementation(() => ({
    isAvailable: vi.fn().mockResolvedValue(false),
  })),
}));

vi.mock('./providers/groq', () => ({
  GroqProvider: vi.fn().mockImplementation(() => ({
    isAvailable: vi.fn().mockResolvedValue(false),
  })),
}));

import { detectBestProvider } from './index';
import { GeminiNanoProvider } from './providers/gemini-nano';
import { OllamaProvider } from './providers/ollama';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { GroqProvider } from './providers/groq';

beforeEach(() => {
  vi.clearAllMocks();
});

function mockNanoAvailable(available: boolean): void {
  (
    GeminiNanoProvider as unknown as { mockImplementation: (fn: () => unknown) => void }
  ).mockImplementation(() => ({ isAvailable: vi.fn().mockResolvedValue(available) }));
}

function mockOllamaAvailable(available: boolean): void {
  (
    OllamaProvider as unknown as { mockImplementation: (fn: () => unknown) => void }
  ).mockImplementation(() => ({ isAvailable: vi.fn().mockResolvedValue(available) }));
}

function mockAnthropicAvailable(available: boolean): void {
  (
    AnthropicProvider as unknown as { mockImplementation: (fn: () => unknown) => void }
  ).mockImplementation(() => ({ isAvailable: vi.fn().mockResolvedValue(available) }));
}

function mockOpenAIAvailable(available: boolean): void {
  (
    OpenAIProvider as unknown as { mockImplementation: (fn: () => unknown) => void }
  ).mockImplementation(() => ({ isAvailable: vi.fn().mockResolvedValue(available) }));
}

function mockGroqAvailable(available: boolean): void {
  (
    GroqProvider as unknown as { mockImplementation: (fn: () => unknown) => void }
  ).mockImplementation(() => ({ isAvailable: vi.fn().mockResolvedValue(available) }));
}

describe('detectBestProvider', () => {
  it('returns gemini-nano when available, even if other providers are also available', async () => {
    mockNanoAvailable(true);
    mockOllamaAvailable(true);
    mockAnthropicAvailable(true);
    const result = await detectBestProvider({
      ollama: { baseUrl: 'http://localhost:11434', model: 'llama3', contextLength: 4096 },
      anthropic: { apiKey: 'sk-ant-x', model: 'claude' },
    });
    expect(result).toBe('gemini-nano');
  });

  it('falls back to ollama when nano is unavailable but ollama is configured + available', async () => {
    mockNanoAvailable(false);
    mockOllamaAvailable(true);
    const result = await detectBestProvider({
      ollama: { baseUrl: 'http://localhost:11434', model: 'llama3', contextLength: 4096 },
    });
    expect(result).toBe('ollama');
  });

  it('skips ollama when there is no ollama config', async () => {
    mockNanoAvailable(false);
    mockOllamaAvailable(true); // would be available but no config
    mockAnthropicAvailable(true);
    const result = await detectBestProvider({
      anthropic: { apiKey: 'sk-ant-x', model: 'claude' },
    });
    expect(result).toBe('anthropic');
  });

  it('falls back to anthropic before openai before groq', async () => {
    mockNanoAvailable(false);
    mockAnthropicAvailable(true);
    mockOpenAIAvailable(true);
    mockGroqAvailable(true);
    const result = await detectBestProvider({
      anthropic: { apiKey: 'sk-ant-x', model: 'claude' },
      openai: { apiKey: 'sk-x', model: 'gpt-4' },
      groq: { apiKey: 'gsk-x', model: 'llama3-70b' },
    });
    expect(result).toBe('anthropic');
  });

  it('skips a cloud provider when its API key is missing', async () => {
    mockNanoAvailable(false);
    mockAnthropicAvailable(true); // would pass isAvailable
    mockOpenAIAvailable(true);
    const result = await detectBestProvider({
      anthropic: { apiKey: '', model: 'claude' }, // empty key
      openai: { apiKey: 'sk-x', model: 'gpt-4' },
    });
    expect(result).toBe('openai');
  });

  it('returns null when nothing is available and nothing configured', async () => {
    mockNanoAvailable(false);
    const result = await detectBestProvider();
    expect(result).toBe(null);
  });

  it('returns null when configured providers all fail isAvailable', async () => {
    mockNanoAvailable(false);
    mockOllamaAvailable(false);
    mockAnthropicAvailable(false);
    const result = await detectBestProvider({
      ollama: { baseUrl: 'x', model: 'y', contextLength: 4096 },
      anthropic: { apiKey: 'sk-x', model: 'claude' },
    });
    expect(result).toBe(null);
  });
});
