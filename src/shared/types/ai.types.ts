export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface ChatResponse {
  content: string;
  tokensUsed: TokenUsage;
  model: string;
  finishReason: 'stop' | 'length' | 'error';
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface AIProviderInterface {
  name: string;
  isLocal: boolean;

  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string>;
  countTokens(text: string): number;
  getMaxContextLength(): number;
  isAvailable(): Promise<boolean>;
}

export interface JobScoringResult {
  overallScore: number;
  skillMatch: number;
  experienceMatch: number;
  educationMatch: number;
  cultureFit: number;
  matchedSkills: string[];
  missingSkills: string[];
  strengths: string[];
  gaps: string[];
  suggestions: string[];
  reasoning: string;
  isFallback?: boolean;
}
