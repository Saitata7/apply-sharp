/**
 * Centralized AI model constants
 * Update model names here when providers release new versions
 */

// ── Default models per provider ──────────────────────────────────────────

export const DEFAULT_MODELS = {
  ollama: 'llama3.1',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-20241022',
  groq: 'llama-3.3-70b-versatile',
} as const;

// ── Default Ollama base URL ──────────────────────────────────────────────

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
export const DEFAULT_OLLAMA_CONTEXT_LENGTH = 8192;

// ── Model options for UI dropdowns ───────────────────────────────────────

export interface ModelOption {
  value: string;
  label: string;
}

export const OPENAI_MODELS: ModelOption[] = [
  { value: 'gpt-4o-mini', label: 'GPT-4o-mini (Fast, Cheap)' },
  { value: 'gpt-4o', label: 'GPT-4o (Best Quality)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
];

export const ANTHROPIC_MODELS: ModelOption[] = [
  { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Fast, Cheap)' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Best)' },
  { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
  { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
  { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
];

export const GROQ_MODELS: ModelOption[] = [
  { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Best)' },
  { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (Fast)' },
  { value: 'llama-3.2-90b-vision-preview', label: 'Llama 3.2 90B Vision' },
  { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
];

// ── Context length mappings ──────────────────────────────────────────────

export const OPENAI_CONTEXT_LENGTHS: Record<string, number> = {
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
};
export const OPENAI_DEFAULT_CONTEXT_LENGTH = 16385; // gpt-3.5-turbo default

export const ANTHROPIC_CONTEXT_LENGTHS: Record<string, number> = {
  'claude-3-5': 200000,
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
};
export const ANTHROPIC_DEFAULT_CONTEXT_LENGTH = 200000;

export const GROQ_CONTEXT_LENGTHS: Record<string, number> = {
  '70b': 131072,
  '8b': 131072,
};
export const GROQ_DEFAULT_CONTEXT_LENGTH = 32768;

// ── Deprecated model migration map ───────────────────────────────────────

export const DEPRECATED_GROQ_MODELS: Record<string, string> = {
  'llama-3.1-70b-versatile': 'llama-3.3-70b-versatile',
  'llama-3.1-70b-specdec': 'llama-3.3-70b-specdec',
};
