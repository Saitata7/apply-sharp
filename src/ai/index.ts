import type {
  AIProviderInterface,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  JSONSchema,
  JobScoringResult,
} from '@shared/types/ai.types';
import type { Job } from '@shared/types/job.types';
import type { ResumeProfile } from '@shared/types/profile.types';
import type { AISettings } from '@shared/types/settings.types';
import { OllamaProvider } from './providers/ollama';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GroqProvider } from './providers/groq';
import { GeminiNanoProvider } from './providers/gemini-nano';
import { buildJobScoringMessages, buildCoverLetterMessages } from './prompts/templates';
import { buildLearningContext } from './learning-context';
import { usageTracker } from './usage-tracker';
import { cachedAICall, generateChecksum } from './cache';

const JOB_SCORING_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    overallScore: { type: 'number', description: 'Overall fit score 0-100' },
    skillMatch: { type: 'number', description: 'Skill alignment score 0-100' },
    experienceMatch: { type: 'number', description: 'Experience relevance score 0-100' },
    educationMatch: { type: 'number', description: 'Education relevance score 0-100' },
    cultureFit: { type: 'number', description: 'Culture fit score 0-100' },
    matchedSkills: {
      type: 'array',
      items: { type: 'string' },
      description: 'Skills candidate has that job requires',
    },
    missingSkills: {
      type: 'array',
      items: { type: 'string' },
      description: 'Required skills candidate lacks',
    },
    strengths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Why candidate is good for this role',
    },
    gaps: {
      type: 'array',
      items: { type: 'string' },
      description: 'Areas where candidate may fall short',
    },
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      description: 'How to improve the application',
    },
    reasoning: { type: 'string', description: 'Brief explanation of the overall score' },
  },
  required: [
    'overallScore',
    'skillMatch',
    'experienceMatch',
    'educationMatch',
    'cultureFit',
    'matchedSkills',
    'missingSkills',
    'strengths',
    'gaps',
    'suggestions',
    'reasoning',
  ],
};

export class AIService {
  private provider: AIProviderInterface;
  private settings: AISettings;

  constructor(settings: AISettings) {
    this.settings = settings;
    this.provider = this.createProvider();
  }

  private createProvider(): AIProviderInterface {
    switch (this.settings.provider) {
      case 'gemini-nano':
        return new GeminiNanoProvider();
      case 'ollama':
        return new OllamaProvider(this.settings.ollama!);
      case 'openai':
        return new OpenAIProvider(this.settings.openai!);
      case 'anthropic':
        return new AnthropicProvider(this.settings.anthropic!);
      case 'groq':
        return new GroqProvider(this.settings.groq!);
      default:
        throw new Error(`Unknown provider: ${this.settings.provider}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }

  async scoreJobFit(job: Job, profile: ResumeProfile): Promise<JobScoringResult> {
    const learningCtx = await buildLearningContext().catch(() => '');

    const { messages } = buildJobScoringMessages(
      job.description,
      profile.personal.fullName,
      profile.summary,
      [...profile.skills.technical, ...profile.skills.tools].join(', '),
      profile.experience
        .map((exp) => `${exp.title} at ${exp.company}: ${exp.description}`)
        .join('\n'),
      learningCtx || undefined
    );

    const TTL_12H = 12 * 60 * 60 * 1000;
    const cacheKey = `job-score:${generateChecksum(job.description + profile.personal.fullName + profile.summary)}`;

    try {
      const result = await cachedAICall(
        cacheKey,
        () =>
          this.chatStructured<JobScoringResult>(messages, JOB_SCORING_SCHEMA, 'job_scoring', {
            temperature: 0.3,
            maxTokens: 1500,
          }),
        TTL_12H
      );
      return result;
    } catch (error) {
      console.error('Failed to parse scoring result:', error);
      return {
        overallScore: 50,
        skillMatch: 50,
        experienceMatch: 50,
        educationMatch: 50,
        cultureFit: 50,
        matchedSkills: [],
        missingSkills: [],
        strengths: ['Unable to analyze'],
        gaps: ['Unable to analyze'],
        suggestions: ['Try again or check AI configuration'],
        reasoning: 'Failed to parse AI response — using fallback scores',
        isFallback: true,
      };
    }
  }

  async generateCoverLetter(job: Job, profile: ResumeProfile): Promise<string> {
    const profileSummary = `
Name: ${profile.personal.fullName}
Current/Recent Role: ${profile.experience[0]?.title || 'N/A'} at ${profile.experience[0]?.company || 'N/A'}
Summary: ${profile.summary}
Key Skills: ${profile.skills?.technical?.slice(0, 10).join(', ') || 'N/A'}
Notable Achievements:
${
  profile.experience[0]?.achievements
    ?.slice(0, 3)
    .map((a) => `- ${a}`)
    .join('\n') || 'N/A'
}
    `.trim();

    const learningCtx = await buildLearningContext().catch(() => '');

    const { messages } = buildCoverLetterMessages(
      job.company,
      job.title,
      job.description.slice(0, 3000),
      profileSummary,
      learningCtx || undefined
    );

    const response = await this.provider.chat(messages, {
      temperature: this.settings.generation.temperature,
      maxTokens: this.settings.generation.maxTokens,
    });

    return response.content.trim();
  }

  async *generateCoverLetterStream(job: Job, profile: ResumeProfile): AsyncIterable<string> {
    const profileSummary = `
Name: ${profile.personal.fullName}
Current/Recent Role: ${profile.experience[0]?.title || 'N/A'} at ${profile.experience[0]?.company || 'N/A'}
Summary: ${profile.summary}
Key Skills: ${profile.skills?.technical?.slice(0, 10).join(', ') || 'N/A'}
    `.trim();

    const learningCtx = await buildLearningContext().catch(() => '');

    const { messages } = buildCoverLetterMessages(
      job.company,
      job.title,
      job.description.slice(0, 3000),
      profileSummary,
      learningCtx || undefined
    );

    for await (const chunk of this.provider.chatStream(messages, {
      temperature: this.settings.generation.temperature,
      maxTokens: this.settings.generation.maxTokens,
    })) {
      yield chunk;
    }
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await this.provider.chat(messages, options);

    // Fire-and-forget usage tracking
    if (response.tokensUsed) {
      this.trackUsage(response.tokensUsed.prompt, response.tokensUsed.completion, options?.feature);
    }

    return response;
  }

  /**
   * Structured output: returns guaranteed valid JSON matching the schema.
   * Eliminates all extractJSONFromResponse() hacks.
   */
  async chatStructured<T>(
    messages: ChatMessage[],
    schema: JSONSchema,
    schemaName: string,
    options?: ChatOptions
  ): Promise<T> {
    const result = await this.provider.chatStructured<T>(messages, schema, schemaName, options);

    // Track usage from provider's lastTokenUsage (chatStructured returns T, not ChatResponse)
    if (this.provider.lastTokenUsage) {
      this.trackUsage(
        this.provider.lastTokenUsage.prompt,
        this.provider.lastTokenUsage.completion,
        options?.feature
      );
    }

    return result;
  }

  private trackUsage(inputTokens: number, outputTokens: number, feature?: string): void {
    // Fire-and-forget, never block AI calls.
    // Gemini Nano has no per-provider config block (it is on-device, no key,
    // no model string needed); skip the lookup for it.
    const providerConfig =
      this.settings.provider === 'gemini-nano'
        ? undefined
        : (this.settings as unknown as Record<string, { model?: string } | undefined>)[
            this.settings.provider
          ];
    usageTracker
      .trackUsage({
        provider: this.settings.provider,
        model:
          providerConfig?.model ||
          (this.settings.provider === 'gemini-nano' ? 'gemini-nano' : 'unknown'),
        inputTokens,
        outputTokens,
        feature: feature || 'unknown',
      })
      .catch(() => {
        // Usage tracking should never crash the app
      });
  }
}

export { OllamaProvider } from './providers/ollama';
export { OpenAIProvider } from './providers/openai';
export { AnthropicProvider } from './providers/anthropic';
export { GroqProvider } from './providers/groq';
export { GeminiNanoProvider } from './providers/gemini-nano';

// ── Cost router (Workstream 6) ────────────────────────────────────────────

import type { AIProvider } from '@shared/types/settings.types';

/**
 * Provider priority order for the cheapest possible cost model.
 *
 * Gemini Nano runs on-device, costs zero, requires zero setup if Chrome
 * has the model downloaded. Ollama runs locally on the user's machine if
 * they installed it, also free. Cloud BYOK is the fallback for everyone
 * else and costs whatever the user's chosen cloud provider charges.
 *
 * The router never overrides an explicit user choice. It only activates
 * when (a) no provider is configured at all, or (b) the configured
 * provider is unavailable at runtime.
 */
export const PROVIDER_PRIORITY: AIProvider[] = [
  'gemini-nano',
  'ollama',
  'anthropic',
  'openai',
  'groq',
];

/**
 * Probe each provider in priority order and return the first one that
 * reports available. The settings parameter is consulted for cloud
 * providers (we cannot probe OpenAI without an API key, and we will not
 * skip past it just because it is not configured if the user has explicitly
 * picked it elsewhere).
 *
 * Returns null if NOTHING is available, which is the case for a fresh
 * install on Chrome 137 or older with no API keys and no Ollama.
 */
export async function detectBestProvider(
  settings?: Partial<import('@shared/types/settings.types').AISettings>
): Promise<AIProvider | null> {
  // Gemini Nano: free, on-device. Always probe first.
  try {
    const nano = new GeminiNanoProvider();
    if (await nano.isAvailable()) return 'gemini-nano';
  } catch {
    // ignore
  }

  // Ollama: local, requires the user to have it running.
  if (settings?.ollama) {
    try {
      const ollama = new OllamaProvider(settings.ollama);
      if (await ollama.isAvailable()) return 'ollama';
    } catch {
      // ignore
    }
  }

  // Cloud BYOK: only probe if a key is configured.
  if (settings?.anthropic?.apiKey) {
    try {
      const anth = new AnthropicProvider(settings.anthropic);
      if (await anth.isAvailable()) return 'anthropic';
    } catch {
      // ignore
    }
  }
  if (settings?.openai?.apiKey) {
    try {
      const oai = new OpenAIProvider(settings.openai);
      if (await oai.isAvailable()) return 'openai';
    } catch {
      // ignore
    }
  }
  if (settings?.groq?.apiKey) {
    try {
      const groq = new GroqProvider(settings.groq);
      if (await groq.isAvailable()) return 'groq';
    } catch {
      // ignore
    }
  }

  return null;
}
