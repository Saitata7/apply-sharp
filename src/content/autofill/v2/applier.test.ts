/**
 * Tests for the autofill v2 applier.
 *
 * Synthesized DOMs in jsdom. Verifies the applier writes text/textarea/select/
 * radio/checkbox/date correctly, marks AI-generated free-text answers for
 * review, and throws FormRacedError when the form has been mostly torn down.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { serializeForm } from './serializer';
import { applyAnswers, FormRacedError } from './applier';
import type { TAutofillResponse } from '@/ai/autofill/schema';

beforeEach(() => {
  document.body.innerHTML = '';
});

function buildResponse(answers: TAutofillResponse['answers']): TAutofillResponse {
  return { answers, notes: null };
}

describe('applier text/textarea/email', () => {
  it('writes text and textarea values via the React-compatible setter', () => {
    document.body.innerHTML = `
      <form>
        <input type="text" name="name" />
        <input type="email" name="email" />
        <textarea name="why"></textarea>
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    const response = buildResponse([
      { fieldId: snap.fields[0].id, value: 'Sai Tata', source: 'profile', confidence: 1 },
      { fieldId: snap.fields[1].id, value: 'sai@example.com', source: 'profile', confidence: 1 },
      { fieldId: snap.fields[2].id, value: 'Because Jireh.', source: 'ai', confidence: 0.9 },
    ]);
    const result = applyAnswers(form, snap, response);
    expect(result.written).toBe(3);
    expect(result.skipped).toBe(0);
    expect((form.querySelector('input[name=name]') as HTMLInputElement).value).toBe('Sai Tata');
    expect((form.querySelector('input[name=email]') as HTMLInputElement).value).toBe(
      'sai@example.com'
    );
    expect((form.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Because Jireh.');
  });

  it('marks AI-source free-text fields for review', () => {
    document.body.innerHTML = `
      <form>
        <input type="text" name="a" />
        <input type="text" name="b" />
        <textarea name="why"></textarea>
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    const response = buildResponse([
      { fieldId: snap.fields[0].id, value: 'Sai', source: 'profile', confidence: 1 },
      { fieldId: snap.fields[1].id, value: 'X', source: 'profile', confidence: 1 },
      { fieldId: snap.fields[2].id, value: 'Generated answer.', source: 'ai', confidence: 0.8 },
    ]);
    const result = applyAnswers(form, snap, response);
    expect(result.reviewMarked).toBe(1);
    const textarea = form.querySelector('textarea')!;
    expect(textarea.getAttribute('data-applysharp-review')).toBe('true');
    expect(textarea.style.borderLeft).toContain('3px');
  });
});

describe('applier select', () => {
  it('matches by exact value', () => {
    document.body.innerHTML = `
      <form>
        <select name="country">
          <option value="us">United States</option>
          <option value="ca">Canada</option>
        </select>
        <input name="a" /><input name="b" />
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    const response = buildResponse([
      { fieldId: snap.fields[0].id, value: 'ca', source: 'profile', confidence: 1 },
      { fieldId: snap.fields[1].id, value: 'x', source: 'profile', confidence: 1 },
      { fieldId: snap.fields[2].id, value: 'y', source: 'profile', confidence: 1 },
    ]);
    applyAnswers(form, snap, response);
    expect((form.querySelector('select') as HTMLSelectElement).value).toBe('ca');
  });

  it('matches by exact label text when the model returned the visible label', () => {
    document.body.innerHTML = `
      <form>
        <select name="country">
          <option value="us">United States</option>
          <option value="ca">Canada</option>
        </select>
        <input name="a" /><input name="b" />
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    const response = buildResponse([
      { fieldId: snap.fields[0].id, value: 'United States', source: 'profile', confidence: 1 },
      { fieldId: snap.fields[1].id, value: 'x', source: 'profile', confidence: 1 },
      { fieldId: snap.fields[2].id, value: 'y', source: 'profile', confidence: 1 },
    ]);
    applyAnswers(form, snap, response);
    expect((form.querySelector('select') as HTMLSelectElement).value).toBe('us');
  });
});

describe('applier checkbox', () => {
  it('toggles a checkbox to true on truthy value', () => {
    document.body.innerHTML = `
      <form>
        <input type="checkbox" name="agree" />
        <input name="a" /><input name="b" />
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    const response = buildResponse([
      { fieldId: snap.fields[0].id, value: 'true', source: 'profile', confidence: 1 },
      { fieldId: snap.fields[1].id, value: 'x', source: 'profile', confidence: 1 },
      { fieldId: snap.fields[2].id, value: 'y', source: 'profile', confidence: 1 },
    ]);
    applyAnswers(form, snap, response);
    expect((form.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(true);
  });
});

describe('applier date', () => {
  it('accepts YYYY-MM-DD', () => {
    document.body.innerHTML = `
      <form>
        <input type="date" name="start" />
        <input name="a" /><input name="b" />
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    const response = buildResponse([
      { fieldId: snap.fields[0].id, value: '2026-05-01', source: 'profile', confidence: 1 },
      { fieldId: snap.fields[1].id, value: 'x', source: 'profile', confidence: 1 },
      { fieldId: snap.fields[2].id, value: 'y', source: 'profile', confidence: 1 },
    ]);
    const result = applyAnswers(form, snap, response);
    expect(result.errors.filter((e) => e.fieldId === snap.fields[0].id)).toHaveLength(0);
  });

  it('rejects malformed dates and counts as skipped', () => {
    document.body.innerHTML = `
      <form>
        <input type="date" name="start" />
        <input name="a" /><input name="b" />
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    const response = buildResponse([
      { fieldId: snap.fields[0].id, value: 'May 1, 2026', source: 'profile', confidence: 1 },
      { fieldId: snap.fields[1].id, value: 'x', source: 'profile', confidence: 1 },
      { fieldId: snap.fields[2].id, value: 'y', source: 'profile', confidence: 1 },
    ]);
    const result = applyAnswers(form, snap, response);
    expect(result.written).toBe(2); // the two text inputs only
  });
});

describe('applier skip and refusal', () => {
  it('honors source: "skip"', () => {
    document.body.innerHTML = `
      <form>
        <input type="text" name="a" />
        <textarea name="why"></textarea>
        <input type="text" name="b" />
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    const response = buildResponse([
      { fieldId: snap.fields[0].id, value: 'Sai', source: 'profile', confidence: 1 },
      { fieldId: snap.fields[1].id, value: '', source: 'skip', confidence: 0 },
      { fieldId: snap.fields[2].id, value: 'X', source: 'profile', confidence: 1 },
    ]);
    const result = applyAnswers(form, snap, response);
    expect(result.written).toBe(2);
    expect(result.skipped).toBe(1);
    expect((form.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('applier race condition', () => {
  it('throws FormRacedError when over half the fields have been removed', () => {
    document.body.innerHTML = `
      <form>
        <input name="a" /><input name="b" /><input name="c" /><input name="d" />
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    // Remove 3 of 4 fields after serialization
    form.querySelectorAll('input').forEach((el, i) => {
      if (i < 3) el.remove();
    });
    const response = buildResponse(
      snap.fields.map((f) => ({
        fieldId: f.id,
        value: 'x',
        source: 'profile' as const,
        confidence: 1,
      }))
    );
    expect(() => applyAnswers(form, snap, response)).toThrow(FormRacedError);
  });
});
