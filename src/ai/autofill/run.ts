/**
 * One-pass autofill: take a serialized form, return field-by-field answers.
 *
 * This is the heart of Workstream 1. The old per-field path in
 * src/background/handlers/learning-handlers.ts:212-314 made N AI calls
 * (one per custom question), each blind to the others, with literal "the
 * company" as fallback. This replaces it with ONE structured-output call
 * that sees the whole form, the profile, the JD, and real company research
 * at the same time.
 *
 * Refusal-text and answer-validation guards live here so they apply uniformly
 * regardless of which provider answered.
 */

import type { AIService } from '@ai/index';
import type { JSONSchema } from '@shared/types/ai.types';
import {
  AutofillResponse,
  AUTOFILL_JSON_SCHEMA,
  type TFormSnapshot,
  type TAutofillResponse,
  type TAutofillAnswer,
} from './schema';
import { buildAutofillPrompt, type AutofillProfileSlice, type AutofillJobContext } from './prompt';
import type { CompanyResearch } from '../../background/research/company-research';

/** Shapes the model occasionally returns instead of an actual answer. We
 * convert these to source: 'skip' so the UI does not paste a refusal into a
 * job application. */
const REFUSAL_PATTERNS = [
  /^i (?:cannot|can't|am unable to|won't)/i,
  /^as an ai/i,
  /^i('?| a)m sorry/i,
  /^i don'?t have (?:enough )?(?:information|context)/i,
  /^based on the (?:provided )?information/i,
  /^unfortunately,? i/i,
];

function looksLikeRefusal(value: string): boolean {
  if (!value) return false;
  return REFUSAL_PATTERNS.some((rx) => rx.test(value.trim()));
}

/** Strip refusal text and convert to skip without throwing. */
function sanitizeAnswers(answers: TAutofillAnswer[]): TAutofillAnswer[] {
  return answers.map((a) => {
    if (a.source === 'skip') return a;
    if (looksLikeRefusal(a.value)) {
      return { ...a, value: '', source: 'skip', confidence: 0 };
    }
    return a;
  });
}

export interface RunAutofillOptions {
  /** Defaults to 0.4. Higher = more creative free-text, less stable selects. */
  temperature?: number;
  /** Defaults to 3000. Cap to control cost on huge forms. */
  maxTokens?: number;
}

export interface RunAutofillResult {
  response: TAutofillResponse;
  /** Number of fields the model actually answered (source != 'skip', value != ''). */
  answered: number;
  /** Number of fields explicitly skipped. */
  skipped: number;
  /** Whether any answer was caught by the refusal sanitizer. */
  hadRefusals: boolean;
}

/**
 * Run a single autofill pass against the provided AI service.
 *
 * Throws only on hard provider failures (no key, network down, malformed JSON
 * the schema rejects). Soft failures (the model said "I cannot") are converted
 * to skips so the UI gracefully shows them as fields the user has to handle.
 */
export async function runAutofill(
  ai: AIService,
  snapshot: TFormSnapshot,
  profile: AutofillProfileSlice,
  jobContext: AutofillJobContext,
  research: CompanyResearch,
  options: RunAutofillOptions = {}
): Promise<RunAutofillResult> {
  const { temperature = 0.4, maxTokens = 3000 } = options;

  const { system, user } = buildAutofillPrompt(snapshot, profile, jobContext, research);

  // The provider's JSONSchema interface is intentionally narrow ({type:'object', properties, required}).
  // Zod 4 toJSONSchema returns a draft-2020-12 object with a couple of extra fields ($schema). Cast at the
  // boundary; runtime validation is still done by AutofillResponse.parse() below.
  const raw = await ai.chatStructured<unknown>(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    AUTOFILL_JSON_SCHEMA as unknown as JSONSchema,
    'autofill_v2',
    { temperature, maxTokens, feature: 'autofill' }
  );

  // Defensive parse. Even with structured outputs, providers occasionally return
  // strings or wrap the result. AutofillResponse.parse() throws on schema mismatch
  // which is the right behavior: a malformed response is not safe to apply to a form.
  const parsed = AutofillResponse.parse(raw);

  const sanitized = sanitizeAnswers(parsed.answers);
  const hadRefusals = sanitized.some(
    (a, i) => a.source === 'skip' && parsed.answers[i].source !== 'skip'
  );

  const answered = sanitized.filter((a) => a.source !== 'skip' && a.value !== '').length;
  const skipped = sanitized.length - answered;

  return {
    response: { answers: sanitized, notes: parsed.notes },
    answered,
    skipped,
    hadRefusals,
  };
}
