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

/**
 * JSON Schema definition for structured outputs.
 * Used by chatStructured<T>() to guarantee valid typed responses.
 */
export interface JSONSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface AIProviderInterface {
  name: string;
  isLocal: boolean;

  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string>;

  /**
   * Structured output: returns guaranteed valid JSON matching the schema.
   * - OpenAI: response_format with json_schema
   * - Anthropic: tool use with input_schema + tool_choice
   * - Groq: response_format (OpenAI-compatible)
   * - Ollama: format: 'json'
   *
   * Eliminates all extractJSONFromResponse() hacks.
   */
  chatStructured<T>(
    messages: ChatMessage[],
    schema: JSONSchema,
    schemaName: string,
    options?: ChatOptions
  ): Promise<T>;

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
