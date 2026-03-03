/**
 * Humanized Content Generator
 * Makes AI-generated content sound natural and human
 * Avoids typical AI phrases and patterns
 */

import type { AIService } from '@/ai';
import type { CareerContext } from '@shared/types/master-profile.types';
import { PROMPT_SAFETY_PREAMBLE, sanitizePromptInput } from '@shared/utils/prompt-safety';

/**
 * Deterministic pseudo-random number from a string input.
 * Replaces Math.random() so the same input always produces the same output.
 */
function deterministicRandom(input: string, seed = 0): number {
  let hash = seed;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return ((hash >>> 0) % 10000) / 10000;
}

// Common AI phrases to avoid
const AI_PHRASES = [
  'I am excited to',
  'I am thrilled to',
  'I am writing to express my interest',
  'I would like to express',
  'leverage my skills',
  'leverage my experience',
  'utilize my expertise',
  'passionate about',
  'results-driven',
  'highly motivated',
  'proven track record',
  'synergy',
  'cutting-edge',
  'game-changer',
  'think outside the box',
  'at the end of the day',
  'moving forward',
  'circle back',
  'deep dive',
  'low-hanging fruit',
  'best-in-class',
  'state-of-the-art',
  'robust',
  'seamless',
  'paradigm shift',
  'value-add',
  'actionable insights',
];

// Natural alternatives mapping
const PHRASE_ALTERNATIVES: Record<string, string[]> = {
  'I am excited to': ['I want to', "I'm looking forward to", 'I hope to'],
  'I am thrilled to': ['I want to', "I'd like to", 'I hope to'],
  'passionate about': ['interested in', 'focused on', 'experienced in'],
  'results-driven': ['focused on outcomes', 'goal-oriented'],
  'highly motivated': ['eager', 'ready', 'committed'],
  'proven track record': ['experience with', 'history of'],
  leverage: ['use', 'apply', 'bring'],
  utilize: ['use', 'apply'],
  'cutting-edge': ['modern', 'current', 'new'],
  seamless: ['smooth', 'easy', 'straightforward'],
  robust: ['solid', 'strong', 'reliable'],
};

export interface HumanizerOptions {
  tone: 'professional' | 'conversational' | 'technical';
  maxLength?: number;
  preserveStructure?: boolean;
}

/**
 * Humanize content using AI
 */
export async function humanizeWithAI(
  content: string,
  writingStyle: CareerContext['writingStyle'],
  aiService: AIService
): Promise<string> {
  const prompt = `${PROMPT_SAFETY_PREAMBLE}

Rewrite this content to sound natural and human, not AI-generated.

## Original Content
${sanitizePromptInput(content, 'original_content')}

## Writing Style Guidelines
- Tone: ${writingStyle.tone}
- Complexity: ${writingStyle.complexity}
- Voice: ${writingStyle.preferredVoice}

## Rules
1. Remove these AI-typical phrases and replace with natural alternatives:
   - "I am excited/thrilled to" → "I want to" or just start directly
   - "leverage my skills" → "use my experience"
   - "passionate about" → "interested in" or "focused on"
   - Generic superlatives like "highly motivated", "results-driven"

2. Make it sound like a real person wrote it:
   - Vary sentence length naturally
   - Use contractions where appropriate (I'm, don't, it's)
   - Include occasional conversational elements
   - Avoid perfect parallel structure in every paragraph

3. Keep the substance:
   - Preserve all specific achievements and numbers
   - Keep technical terms accurate
   - Maintain the core message

4. Sound confident but not boastful:
   - State accomplishments factually
   - Let results speak for themselves
   - Avoid excessive self-promotion phrases

Return ONLY the rewritten content, nothing else.`;

  try {
    const response = await aiService.chat([{ role: 'user', content: prompt }], {
      temperature: 0.7,
      maxTokens: 1500,
    });

    return response.content.trim();
  } catch (error) {
    console.error('AI humanization failed:', error);
    // Fall back to rule-based humanization
    return humanizeWithRules(content);
  }
}

/**
 * Humanize content using rules (no AI, instant)
 */
export function humanizeWithRules(content: string): string {
  let result = content;

  // Replace AI phrases with alternatives
  for (const [phrase, alternatives] of Object.entries(PHRASE_ALTERNATIVES)) {
    const regex = new RegExp(phrase, 'gi');
    if (regex.test(result)) {
      const replacement =
        alternatives[Math.floor(deterministicRandom(phrase) * alternatives.length)];
      result = result.replace(regex, replacement);
    }
  }

  // Remove common AI patterns
  const patternsToSimplify = [
    // "I am writing to" → just start with the content
    {
      pattern: /^I am writing to (express my interest in|apply for|inquire about)/i,
      replacement: "I'm applying for",
    },
    // "I would like to express" → direct statement
    { pattern: /I would like to express (my|that)/gi, replacement: 'I' },
    // "Proven track record of" → "experience with"
    { pattern: /proven track record of/gi, replacement: 'experience with' },
    // "Extensive experience in" → "experience in"
    { pattern: /extensive experience (in|with)/gi, replacement: 'experience $1' },
    // "Successfully managed" → "Managed"
    { pattern: /successfully (managed|led|delivered|completed)/gi, replacement: '$1' },
    // "I believe I would be" → "I would be"
    { pattern: /I (strongly )?believe (that )?I would be/gi, replacement: "I'd be" },
    // "Please do not hesitate to" → simpler
    { pattern: /please do not hesitate to/gi, replacement: 'feel free to' },
    // "I look forward to the opportunity to" → shorter
    { pattern: /I look forward to the opportunity to/gi, replacement: "I'd welcome the chance to" },
  ];

  for (const { pattern, replacement } of patternsToSimplify) {
    result = result.replace(pattern, replacement);
  }

  // Add contractions for more natural tone
  result = addContractions(result);

  // Ensure varied sentence structure
  result = varyStructure(result);

  return result;
}

/**
 * Add natural contractions
 */
function addContractions(text: string): string {
  const contractions: [RegExp, string][] = [
    [/\bI am\b/g, "I'm"],
    [/\bI have\b/g, "I've"],
    [/\bI will\b/g, "I'll"],
    [/\bI would\b/g, "I'd"],
    [/\bdo not\b/g, "don't"],
    [/\bdoes not\b/g, "doesn't"],
    [/\bcan not\b/g, "can't"],
    [/\bwill not\b/g, "won't"],
    [/\bwould not\b/g, "wouldn't"],
    [/\bit is\b/g, "it's"],
    [/\bthat is\b/g, "that's"],
    [/\bthey are\b/g, "they're"],
    [/\bwe are\b/g, "we're"],
  ];

  let result = text;
  for (const [pattern, replacement] of contractions) {
    // Only apply contractions in about 70% of cases for natural variation
    result = result.replace(pattern, (match, offset) =>
      deterministicRandom(match, offset) > 0.3 ? replacement : match
    );
  }

  return result;
}

/**
 * Vary sentence structure for natural flow
 */
function varyStructure(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);

  // Check for too many sentences starting with "I"
  let iCount = 0;
  const result: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    let sentence = sentences[i];

    if (sentence.match(/^I\s/i)) {
      iCount++;

      // If too many consecutive "I" starts, try to restructure
      if (iCount > 2 && i > 0) {
        // Try to combine with previous sentence or rephrase
        sentence = rephraseIStart(sentence);
        iCount = 0;
      }
    } else {
      iCount = 0;
    }

    result.push(sentence);
  }

  return result.join(' ');
}

/**
 * Rephrase sentences that start with "I"
 */
function rephraseIStart(sentence: string): string {
  // Common patterns to rephrase
  const patterns: [RegExp, string][] = [
    [/^I (developed|created|built)/i, 'My work on'],
    [/^I (managed|led)/i, 'As the lead,'],
    [/^I (improved|enhanced|optimized)/i, 'Through my efforts,'],
    [/^I have (experience|expertise)/i, 'My background includes'],
  ];

  for (const [pattern, replacement] of patterns) {
    if (pattern.test(sentence)) {
      return sentence.replace(pattern, replacement);
    }
  }

  return sentence;
}

/**
 * Check if content sounds AI-generated
 */
export function detectAIPatterns(content: string): {
  score: number; // 0-100, higher = more AI-like
  patterns: string[];
} {
  const detectedPatterns: string[] = [];
  let score = 0;

  // Check for AI phrases
  for (const phrase of AI_PHRASES) {
    if (content.toLowerCase().includes(phrase.toLowerCase())) {
      detectedPatterns.push(phrase);
      score += 10;
    }
  }

  // Check for lack of contractions
  const words = content.split(/\s+/).length;
  const contractionCount = (content.match(/'[a-z]/gi) || []).length;
  const contractionRatio = contractionCount / words;

  if (contractionRatio < 0.01 && words > 50) {
    detectedPatterns.push('Lack of contractions');
    score += 15;
  }

  // Check for too many sentences starting with "I"
  const sentences = content.split(/[.!?]+/);
  const iStartCount = sentences.filter((s) => s.trim().match(/^I\s/i)).length;
  const iRatio = iStartCount / sentences.length;

  if (iRatio > 0.5 && sentences.length > 3) {
    detectedPatterns.push('Too many sentences starting with "I"');
    score += 10;
  }

  // Check for perfect parallel structure
  const paragraphs = content.split(/\n\n+/);
  if (paragraphs.length >= 3) {
    const firstWords = paragraphs.map((p) => p.split(/\s+/)[0]);
    const uniqueFirstWords = new Set(firstWords);
    if (uniqueFirstWords.size === 1) {
      detectedPatterns.push('Repetitive paragraph structure');
      score += 10;
    }
  }

  return {
    score: Math.min(100, score),
    patterns: detectedPatterns,
  };
}
