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
import { buildJobScoringMessages, buildCoverLetterMessages } from './prompts/templates';
import { buildLearningContext } from './learning-context';

export class AIService {
  private provider: AIProviderInterface;
  private settings: AISettings;

  constructor(settings: AISettings) {
    this.settings = settings;
    this.provider = this.createProvider();
  }

  private createProvider(): AIProviderInterface {
    switch (this.settings.provider) {
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

    try {
      const response = await this.provider.chat(messages, {
        temperature: 0.3,
        maxTokens: 1500,
      });

      const { extractJSONFromResponse } = await import('@shared/utils/json-utils');
      const result = extractJSONFromResponse<JobScoringResult>(response.content);
      if (!result) {
        throw new Error('No JSON found in response');
      }
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
    return this.provider.chat(messages, options);
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
    return this.provider.chatStructured<T>(messages, schema, schemaName, options);
  }
}

export { OllamaProvider } from './providers/ollama';
export { OpenAIProvider } from './providers/openai';
export { AnthropicProvider } from './providers/anthropic';
export { GroqProvider } from './providers/groq';
