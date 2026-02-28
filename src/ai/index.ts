import type {
  AIProviderInterface,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  JobScoringResult,
} from '@shared/types/ai.types';
import type { Job } from '@shared/types/job.types';
import type { ResumeProfile } from '@shared/types/profile.types';
import type { AISettings } from '@shared/types/settings.types';
import { OllamaProvider } from './providers/ollama';
import { OpenAIProvider } from './providers/openai';
import { GroqProvider } from './providers/groq';
import { JOB_SCORING_PROMPT, COVER_LETTER_PROMPT } from './prompts/templates';
import { extractJSONFromResponse } from '@shared/utils/json-utils';
import { sanitizePromptInput } from '@shared/utils/prompt-safety';

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
        // Anthropic requires a different API format (Messages API with x-api-key header).
        // For now, guide users to use OpenAI or Groq providers.
        throw new Error(
          'Anthropic is not yet supported. Please use OpenAI (supports Claude via API proxy) or Groq instead. ' +
            'Go to AI Settings to switch your provider.'
        );
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
    const prompt = JOB_SCORING_PROMPT.replace(
      '{jobDescription}',
      sanitizePromptInput(job.description, 'job_description')
    )
      .replace('{candidateName}', sanitizePromptInput(profile.personal.fullName, 'candidate_name'))
      .replace('{candidateSummary}', sanitizePromptInput(profile.summary, 'candidate_summary'))
      .replace(
        '{skills}',
        sanitizePromptInput(
          [...profile.skills.technical, ...profile.skills.tools].join(', '),
          'skills'
        )
      )
      .replace(
        '{experience}',
        sanitizePromptInput(
          profile.experience
            .map((exp) => `${exp.title} at ${exp.company}: ${exp.description}`)
            .join('\n'),
          'experience'
        )
      );

    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

    const response = await this.provider.chat(messages, {
      temperature: 0.3,
      maxTokens: 1500,
    });

    try {
      const result = extractJSONFromResponse<JobScoringResult>(response.content);
      if (!result) {
        throw new Error('No JSON found in response');
      }
      return result;
    } catch (error) {
      console.error('Failed to parse scoring result:', error);
      // Return default scores on parse failure (flagged as fallback)
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

    const prompt = COVER_LETTER_PROMPT.replace(
      '{company}',
      sanitizePromptInput(job.company, 'company')
    )
      .replace('{title}', sanitizePromptInput(job.title, 'job_title'))
      .replace(
        '{jobDescription}',
        sanitizePromptInput(job.description.slice(0, 3000), 'job_description')
      )
      .replace('{candidateProfile}', sanitizePromptInput(profileSummary, 'candidate_profile'));

    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

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

    const prompt = COVER_LETTER_PROMPT.replace(
      '{company}',
      sanitizePromptInput(job.company, 'company')
    )
      .replace('{title}', sanitizePromptInput(job.title, 'job_title'))
      .replace(
        '{jobDescription}',
        sanitizePromptInput(job.description.slice(0, 3000), 'job_description')
      )
      .replace('{candidateProfile}', sanitizePromptInput(profileSummary, 'candidate_profile'));

    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

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
}

export { OllamaProvider } from './providers/ollama';
export { OpenAIProvider } from './providers/openai';
export { GroqProvider } from './providers/groq';
