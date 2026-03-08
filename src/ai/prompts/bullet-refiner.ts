/**
 * Conversational Bullet Refiner Prompts
 *
 * When generating a resume, instead of AI silently rewriting bullets,
 * this provides an interactive refinement flow:
 * - Show each bullet with its defensibility score
 * - For weak bullets: AI asks "What was the actual impact?"
 * - Side-by-side: original vs AI-enhanced version
 * - User approves/edits each enhancement
 */

import { PROMPT_SAFETY_PREAMBLE } from '@shared/utils/prompt-safety';
import { CORE_RULES, BULLET_RULES, PERSONAS } from './system-rules';

// ─── System Prompt for Bullet Refinement ───────────────────────────────────

export const BULLET_REFINER_SYSTEM = `${PROMPT_SAFETY_PREAMBLE}

${PERSONAS.RESUME_OPTIMIZER}

${CORE_RULES}

${BULLET_RULES}

## Your Task

You are refining individual resume bullets through conversation.
For each bullet, you will:
1. Score it (0-100) and classify as STRONG / MODERATE / WEAK
2. Explain WHY it scores that way (1 sentence)
3. If MODERATE or WEAK, suggest a specific improvement
4. Ask a targeted question to get information needed for improvement

## Rules
- NEVER invent metrics or facts
- If the bullet lacks numbers, ask the user for specifics
- If user can't provide numbers, describe scope/complexity instead
- Keep improved bullets to 100-200 characters
- Start every bullet with a strong action verb
`;

// ─── Single Bullet Refinement ──────────────────────────────────────────────

export const REFINE_BULLET_PROMPT = `Analyze this resume bullet and suggest improvements.

**Original bullet:**
{bulletText}

**Context:**
- Company: {company}
- Role: {title}
- Target JD: {jobDescription}

Respond with:
1. Score (0-100) and level (STRONG/MODERATE/WEAK)
2. One-line assessment
3. If not STRONG: an improved version (using only facts present in the original)
4. If not STRONG: a specific question to gather missing information

Respond in this JSON format:
\`\`\`json
{
  "score": number,
  "level": "strong" | "moderate" | "weak",
  "assessment": "string",
  "improvedVersion": "string or null",
  "followUpQuestion": "string or null"
}
\`\`\``;

// ─── Batch Bullet Analysis ────────────────────────────────────────────────

export const ANALYZE_BULLETS_BATCH_PROMPT = `Analyze these resume bullets for a {title} at {company}.
Target role: {targetRole}

Bullets:
{bullets}

For each bullet, provide:
- score (0-100)
- level (strong/moderate/weak)
- brief assessment (1 sentence)
- improved version if not strong (using only existing facts)

Respond as JSON array:
\`\`\`json
[
  {
    "original": "string",
    "score": number,
    "level": "strong" | "moderate" | "weak",
    "assessment": "string",
    "improvedVersion": "string or null"
  }
]
\`\`\``;

// ─── Bullet Enhancement with User Context ──────────────────────────────────

export const ENHANCE_WITH_CONTEXT_PROMPT = `The user provided additional context for this bullet.

**Original bullet:**
{originalBullet}

**User's additional context:**
{userContext}

**Target JD keywords:**
{keywords}

Rewrite the bullet incorporating the new context. Follow the XYZ formula:
"Accomplished [X] as measured by [Y], by doing [Z]"

Requirements:
- 100-200 characters
- Start with a strong action verb
- Weave in relevant keywords NATURALLY
- Include the new metrics/context the user provided
- NEVER fabricate — use only what the user said

Respond as JSON:
\`\`\`json
{
  "enhancedBullet": "string",
  "keywordsIncluded": ["string"],
  "score": number
}
\`\`\``;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface BulletRefinement {
  original: string;
  score: number;
  level: 'strong' | 'moderate' | 'weak';
  assessment: string;
  improvedVersion: string | null;
  followUpQuestion: string | null;
  userApproved: boolean;
  finalVersion: string; // What goes in the resume
}

export interface BulletRefinerState {
  experienceIndex: number;
  company: string;
  title: string;
  bullets: BulletRefinement[];
  currentBulletIndex: number;
  targetRole?: string;
  jdKeywords?: string[];
}
