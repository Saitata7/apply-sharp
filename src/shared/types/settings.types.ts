import {
  DEFAULT_MODELS,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_CONTEXT_LENGTH,
} from '@shared/constants/models';

export type AIProvider = 'ollama' | 'openai' | 'anthropic' | 'groq';

export interface UserSettings {
  id: string;

  ai: AISettings;

  detection: DetectionSettings;
  autofill: AutofillSettings;
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  appearance: AppearanceSettings;

  onboardingCompleted?: boolean;
}

export interface AISettings {
  provider: AIProvider;

  ollama?: OllamaConfig;
  openai?: OpenAIConfig;
  anthropic?: AnthropicConfig;
  groq?: GroqConfig;

  generation: GenerationSettings;
}

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  contextLength: number;
}

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  organization?: string;
}

export interface AnthropicConfig {
  apiKey: string;
  model: string;
}

export interface GroqConfig {
  apiKey: string;
  model: string;
}

export interface GenerationSettings {
  temperature: number;
  maxTokens: number;
  streamResponses: boolean;
}

export interface DetectionSettings {
  autoDetect: boolean;
  showOverlay: boolean;
  overlayPosition: 'top-right' | 'bottom-right' | 'bottom-left';
  autoAnalyze: boolean;
}

export interface AutofillSettings {
  enabled: boolean;
  requireApproval: boolean;
  autoFillBasicInfo: boolean;
  autoFillExperience: boolean;
  autoFillEducation: boolean;
  autoFillCustomQuestions: boolean;
}

export interface NotificationSettings {
  showJobScore: boolean;
  scoreThreshold: number;
  soundEnabled: boolean;
}

export interface PrivacySettings {
  trackApplications: boolean;
  enableLearning: boolean;
  anonymizeData: boolean;
}

export interface AppearanceSettings {
  theme: 'light' | 'dark' | 'system';
  compactMode: boolean;
}

export function getDefaultSettings(): UserSettings {
  return {
    id: 'user_settings',
    ai: {
      provider: 'ollama',
      ollama: {
        baseUrl: DEFAULT_OLLAMA_BASE_URL,
        model: DEFAULT_MODELS.ollama,
        contextLength: DEFAULT_OLLAMA_CONTEXT_LENGTH,
      },
      generation: {
        temperature: 0.7,
        maxTokens: 2048,
        streamResponses: true,
      },
    },
    detection: {
      autoDetect: true,
      showOverlay: true,
      overlayPosition: 'bottom-right',
      autoAnalyze: false,
    },
    autofill: {
      enabled: true,
      requireApproval: true,
      autoFillBasicInfo: true,
      autoFillExperience: true,
      autoFillEducation: true,
      autoFillCustomQuestions: false,
    },
    notifications: {
      showJobScore: true,
      scoreThreshold: 70,
      soundEnabled: false,
    },
    privacy: {
      trackApplications: true,
      enableLearning: true,
      anonymizeData: false,
    },
    appearance: {
      theme: 'system',
      compactMode: false,
    },
  };
}
