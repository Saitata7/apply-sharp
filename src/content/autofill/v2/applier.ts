/**
 * Form applier for autofill v2.
 *
 * Takes the AI's {fieldId: value} answer map and writes each value back to
 * the corresponding DOM element. Handles text/textarea/select/combobox/radio/
 * checkbox/date with framework compatibility (React, Vue, Svelte, vanilla)
 * via the native value setter pattern.
 *
 * Race condition guard: if the form has been re-rendered since serialization
 * (more than half the original fields are gone), throws FormRacedError so the
 * caller can re-serialize and retry.
 */

import type { TFormSnapshot, TAutofillResponse, TAutofillAnswer } from '@/ai/autofill/schema';
import { resolveSyntheticId } from './serializer';

const REVIEW_BORDER_COLOR = '#a855f7';

export class FormRacedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormRacedError';
  }
}

export interface ApplyResult {
  written: number;
  skipped: number;
  reviewMarked: number;
  errors: Array<{ fieldId: string; error: string }>;
}

/**
 * Set a value on a React/Vue-controlled input by calling the native setter
 * directly and dispatching real input/change events. The standard
 * `el.value = x` does NOT trigger React's onChange because React patches the
 * property setter. This is the same pattern as filler.ts:706-727.
 */
function setReactValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement, value: string): boolean {
  const lower = value.toLowerCase().trim();
  // Try exact value match
  for (const opt of Array.from(select.options)) {
    if (opt.value === value) {
      select.value = opt.value;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (setter) setter.call(select, opt.value);
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
  // Exact label match
  for (const opt of Array.from(select.options)) {
    if (opt.text.trim().toLowerCase() === lower) {
      select.value = opt.value;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (setter) setter.call(select, opt.value);
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
  // Contains match
  for (const opt of Array.from(select.options)) {
    if (opt.text.trim().toLowerCase().includes(lower)) {
      select.value = opt.value;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (setter) setter.call(select, opt.value);
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
  return false;
}

function setRadioValue(form: HTMLElement, name: string, value: string): boolean {
  const lower = value.toLowerCase().trim();
  const radios = form.querySelectorAll<HTMLInputElement>(
    `input[type="radio"][name="${CSS.escape(name)}"]`
  );
  // Match by exact value
  for (const r of Array.from(radios)) {
    if (r.value === value) {
      r.click();
      return true;
    }
  }
  // Match by label text
  for (const r of Array.from(radios)) {
    const label = r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`) : null;
    const text = (label?.textContent ?? r.value).trim().toLowerCase();
    if (text === lower || text.includes(lower) || lower.includes(text)) {
      r.click();
      return true;
    }
  }
  return false;
}

function setCheckboxValue(checkbox: HTMLInputElement, value: string): boolean {
  const truthy = ['true', 'yes', '1', 'on', 'checked', 'agree', 'i agree'].includes(
    value.toLowerCase().trim()
  );
  if (checkbox.checked !== truthy) {
    checkbox.click();
  }
  return true;
}

function setDateValue(input: HTMLInputElement, value: string): boolean {
  // Accept YYYY-MM-DD only. The prompt enforces this format.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  setReactValue(input, value);
  return true;
}

function markForReview(el: HTMLElement): void {
  // Subtle left border + a small purple dot. Inline styles so we don't depend
  // on injected CSS surviving the host page.
  const cur = el.style.borderLeft;
  if (cur && cur.includes(REVIEW_BORDER_COLOR)) return;
  el.style.borderLeft = `3px solid ${REVIEW_BORDER_COLOR}`;
  el.style.paddingLeft = '8px';
  el.setAttribute('data-applysharp-review', 'true');
}

/**
 * Apply the AI's answer map to the live form.
 *
 * @param form Same form element passed to serializeForm()
 * @param snapshot The snapshot returned by serializeForm() (used for race detection)
 * @param response The model's answers
 * @returns Counts of written/skipped/reviewMarked fields
 * @throws FormRacedError if the DOM has changed enough that we can't trust the mapping
 */
export function applyAnswers(
  form: HTMLFormElement | HTMLElement,
  snapshot: TFormSnapshot,
  response: TAutofillResponse
): ApplyResult {
  const result: ApplyResult = { written: 0, skipped: 0, reviewMarked: 0, errors: [] };

  // Race detection: count how many original fields are still resolvable.
  const stillPresent = snapshot.fields.filter(
    (f) => resolveSyntheticId(form, f.id) !== null
  ).length;
  if (stillPresent < snapshot.fields.length * 0.5) {
    throw new FormRacedError(
      `Only ${stillPresent}/${snapshot.fields.length} fields still present; form has been re-rendered`
    );
  }

  const byId = new Map<string, TAutofillAnswer>();
  for (const a of response.answers) byId.set(a.fieldId, a);

  for (const field of snapshot.fields) {
    const answer = byId.get(field.id);
    if (!answer || answer.source === 'skip' || !answer.value) {
      result.skipped++;
      continue;
    }

    const el = resolveSyntheticId(form, field.id);
    if (!el) {
      result.errors.push({ fieldId: field.id, error: 'element no longer in DOM' });
      result.skipped++;
      continue;
    }

    try {
      let ok = false;

      if (el instanceof HTMLSelectElement) {
        ok = setSelectValue(el, answer.value);
      } else if (el instanceof HTMLInputElement) {
        if (el.type === 'radio') {
          if (el.name) ok = setRadioValue(form, el.name, answer.value);
        } else if (el.type === 'checkbox') {
          ok = setCheckboxValue(el, answer.value);
        } else if (el.type === 'date') {
          ok = setDateValue(el, answer.value);
        } else if (el.type === 'file') {
          // Cannot programmatically set file inputs.
          ok = false;
        } else {
          setReactValue(el, answer.value);
          ok = true;
        }
      } else if (el instanceof HTMLTextAreaElement) {
        setReactValue(el, answer.value);
        ok = true;
      } else if (el.getAttribute('role') === 'combobox') {
        // Combobox: try to set the inner input value via React-compatible setter.
        const inner = el.querySelector('input');
        if (inner instanceof HTMLInputElement) {
          setReactValue(inner, answer.value);
          ok = true;
        }
      }

      if (ok) {
        result.written++;
        if (answer.source === 'ai' || answer.source === 'company-research') {
          markForReview(el);
          result.reviewMarked++;
        }
      } else {
        result.skipped++;
        result.errors.push({ fieldId: field.id, error: `could not write to ${field.type}` });
      }
    } catch (err) {
      result.errors.push({ fieldId: field.id, error: (err as Error).message });
      result.skipped++;
    }
  }

  return result;
}
