/**
 * Autofill v2 schemas (Zod 4).
 *
 * One source of truth for both runtime validation and the JSON Schema sent to the
 * provider's structured-output API. This replaces the per-field regex classification
 * + per-field AI generation pipeline at src/content/autofill/form-detector.ts and
 * src/background/handlers/learning-handlers.ts:212-314 with a single batch call.
 *
 * Anti-AI-tell rules (no em-dash, banned vocab, burstiness) are enforced in the
 * prompt builder at src/ai/autofill/prompt.ts, not at the schema level.
 */

import { z } from 'zod';

export const FieldKind = z.enum([
  'text',
  'textarea',
  'email',
  'tel',
  'url',
  'number',
  'date',
  'select',
  'multiselect',
  'radio',
  'checkbox',
  'file',
]);
export type TFieldKind = z.infer<typeof FieldKind>;

export const FormFieldOption = z.object({
  value: z.string(),
  label: z.string(),
});
export type TFormFieldOption = z.infer<typeof FormFieldOption>;

export const FormField = z.object({
  /** Synthetic id assigned at serialize time, NOT the DOM id. Stable across the
   * single fill operation, used to map AI answers back to DOM elements. */
  id: z.string(),
  /** Human label resolved via the layered fallback in the serializer (label[for],
   * ancestor label, aria-labelledby, aria-label, sibling text, placeholder, name). */
  label: z.string(),
  type: FieldKind,
  required: z.boolean(),
  maxLength: z.number().nullable(),
  placeholder: z.string().nullable(),
  ariaLabel: z.string().nullable(),
  currentValue: z.string(),
  /** For select / multiselect / radio. Null otherwise. */
  options: z.array(FormFieldOption).nullable(),
  /** Helper text resolved from .help, [id$="-description"], or aria-describedby.
   * This is how Workday's per-field guidance gets through to the model. */
  hint: z.string().nullable(),
});
export type TFormField = z.infer<typeof FormField>;

export const FormSnapshot = z.object({
  url: z.string(),
  host: z.string(),
  /** Platform key from src/shared/constants/platforms.ts (wellfound, greenhouse, ...). */
  platform: z.string(),
  formId: z.string(),
  fields: z.array(FormField),
});
export type TFormSnapshot = z.infer<typeof FormSnapshot>;

export const AutofillAnswer = z.object({
  fieldId: z.string(),
  value: z.string(),
  /** Where the answer came from. 'skip' means the field cannot be answered from
   * profile + research and the model deliberately refused to invent. */
  source: z.enum(['profile', 'ai', 'company-research', 'skip']),
  /** Model's self-reported confidence 0..1. Used to gate the review affordance. */
  confidence: z.number().min(0).max(1),
});
export type TAutofillAnswer = z.infer<typeof AutofillAnswer>;

export const AutofillResponse = z.object({
  answers: z.array(AutofillAnswer),
  /** Free-form notes the UI can surface. Null if nothing to say. */
  notes: z.string().nullable(),
});
export type TAutofillResponse = z.infer<typeof AutofillResponse>;

/**
 * JSON Schema for the provider's structured-output / response_format API.
 * Generated once from the same Zod schema used for runtime validation.
 * Use this with chatStructured() in src/ai/providers/*.
 */
export const AUTOFILL_JSON_SCHEMA = z.toJSONSchema(AutofillResponse, {
  target: 'draft-2020-12',
});
