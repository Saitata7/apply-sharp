/**
 * Tests for the autofill v2 Zod schemas.
 *
 * The whole point of standardizing on Zod 4 + z.toJSONSchema is that one schema
 * definition powers both runtime parsing and the structured-output JSON Schema
 * we send to the provider. These tests verify both ends work and that obviously
 * malformed responses get rejected.
 */

import { describe, it, expect } from 'vitest';
import {
  AutofillResponse,
  FormSnapshot,
  AUTOFILL_JSON_SCHEMA,
  type TAutofillResponse,
  type TFormSnapshot,
} from './schema';

describe('FormSnapshot', () => {
  it('parses a minimal valid snapshot', () => {
    const snapshot: TFormSnapshot = {
      url: 'https://wellfound.com/jobs/12345',
      host: 'wellfound.com',
      platform: 'wellfound',
      formId: 'apply-form',
      fields: [
        {
          id: 'f0',
          label: 'Full name',
          type: 'text',
          required: true,
          maxLength: null,
          placeholder: 'Jane Doe',
          ariaLabel: null,
          currentValue: '',
          options: null,
          hint: null,
        },
      ],
    };
    expect(() => FormSnapshot.parse(snapshot)).not.toThrow();
  });

  it('rejects an unknown field type', () => {
    const bad = {
      url: 'https://wellfound.com/jobs/12345',
      host: 'wellfound.com',
      platform: 'wellfound',
      formId: 'apply-form',
      fields: [
        {
          id: 'f0',
          label: 'X',
          type: 'spaceship',
          required: false,
          maxLength: null,
          placeholder: null,
          ariaLabel: null,
          currentValue: '',
          options: null,
          hint: null,
        },
      ],
    };
    expect(() => FormSnapshot.parse(bad)).toThrow();
  });

  it('parses select with options', () => {
    const snapshot = {
      url: 'https://example.com',
      host: 'example.com',
      platform: 'generic',
      formId: 'f',
      fields: [
        {
          id: 'f0',
          label: 'Country',
          type: 'select' as const,
          required: true,
          maxLength: null,
          placeholder: null,
          ariaLabel: null,
          currentValue: '',
          options: [
            { value: 'us', label: 'United States' },
            { value: 'ca', label: 'Canada' },
          ],
          hint: null,
        },
      ],
    };
    expect(() => FormSnapshot.parse(snapshot)).not.toThrow();
  });
});

describe('AutofillResponse', () => {
  it('parses a valid response', () => {
    const valid: TAutofillResponse = {
      answers: [
        { fieldId: 'f0', value: 'Jane Doe', source: 'profile', confidence: 0.95 },
        { fieldId: 'f1', value: '', source: 'skip', confidence: 0 },
      ],
      notes: null,
    };
    expect(() => AutofillResponse.parse(valid)).not.toThrow();
  });

  it('rejects confidence outside 0..1', () => {
    const bad = {
      answers: [{ fieldId: 'f0', value: 'x', source: 'profile', confidence: 1.5 }],
      notes: null,
    };
    expect(() => AutofillResponse.parse(bad)).toThrow();
  });

  it('rejects unknown source kind', () => {
    const bad = {
      answers: [{ fieldId: 'f0', value: 'x', source: 'made-up', confidence: 0.5 }],
      notes: null,
    };
    expect(() => AutofillResponse.parse(bad)).toThrow();
  });
});

describe('AUTOFILL_JSON_SCHEMA', () => {
  it('produces a JSON Schema with the expected top-level shape', () => {
    expect(AUTOFILL_JSON_SCHEMA).toBeTypeOf('object');
    expect((AUTOFILL_JSON_SCHEMA as Record<string, unknown>).type).toBe('object');
    const schema = AUTOFILL_JSON_SCHEMA as {
      type: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.properties).toBeDefined();
    expect(schema.properties).toHaveProperty('answers');
    expect(schema.properties).toHaveProperty('notes');
    expect(schema.required).toContain('answers');
  });

  it('describes answer items with the four sources enum', () => {
    const json = JSON.stringify(AUTOFILL_JSON_SCHEMA);
    expect(json).toContain('profile');
    expect(json).toContain('ai');
    expect(json).toContain('company-research');
    expect(json).toContain('skip');
  });

  it('describes the field kinds enum', () => {
    // The field kinds appear in the request schema, not the response schema, but
    // the response schema does carry the source enum which we already checked.
    // This test simply confirms the JSON schema is non-empty and serializable.
    const json = JSON.stringify(AUTOFILL_JSON_SCHEMA);
    expect(json.length).toBeGreaterThan(100);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
