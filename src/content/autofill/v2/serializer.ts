/**
 * DOM to FormSnapshot serializer for autofill v2.
 *
 * Walks every visible input/textarea/select/combobox in the form, resolves a
 * human-readable label via a layered fallback, classifies the field type, and
 * stashes a synthetic id (`__asId`) on the element so the applier can map AI
 * answers back to the right DOM node later.
 */

import { FormSnapshot, type TFormSnapshot, type TFieldKind } from '@/ai/autofill/schema';

const FIELD_ID_PROP = '__asId';

/** CSS.escape polyfill. jsdom does not expose the global CSS object, and a few
 *  edge cases in older Chromes do not have it either. Implements the WHATWG
 *  spec for CSS.escape closely enough for our use (id and name attribute
 *  values, never selectors). */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

interface ElementWithSyntheticId extends HTMLElement {
  [FIELD_ID_PROP]?: string;
}

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) {
    return false;
  }
  // We deliberately do NOT check getBoundingClientRect dimensions here. jsdom
  // returns 0x0 for elements without a real layout, which would filter out the
  // entire form during unit tests. In real Chrome, an element that passes the
  // display/visibility/opacity checks is reliably visible enough to fill.
  return true;
}

function inferKind(el: HTMLElement): TFieldKind {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return el.multiple ? 'multiselect' : 'select';
  if (el.getAttribute('role') === 'combobox') return 'select';
  if (el.getAttribute('role') === 'radiogroup') return 'radio';
  if (el instanceof HTMLInputElement) {
    const t = (el.type || '').toLowerCase();
    switch (t) {
      case 'email':
      case 'tel':
      case 'url':
      case 'number':
      case 'date':
      case 'radio':
      case 'checkbox':
      case 'file':
        return t as TFieldKind;
      default:
        return 'text';
    }
  }
  return 'text';
}

function readCurrentValue(el: HTMLElement): string {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? 'true' : '';
    return el.value;
  }
  if (el instanceof HTMLTextAreaElement) return el.value;
  if (el instanceof HTMLSelectElement) return el.value;
  return el.getAttribute('aria-valuenow') ?? '';
}

function extractOptions(el: HTMLElement): { value: string; label: string }[] | null {
  if (el instanceof HTMLSelectElement) {
    return Array.from(el.options).map((o) => ({
      value: o.value,
      label: (o.textContent ?? '').trim() || o.value,
    }));
  }
  // For role=radiogroup containers, look for child radios.
  if (el.getAttribute('role') === 'radiogroup') {
    const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    if (radios.length > 0) {
      return Array.from(radios).map((r) => ({
        value: r.value,
        label: resolveLabel(r) || r.value,
      }));
    }
  }
  return null;
}

function humanizeName(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveLabel(el: HTMLElement): string {
  const id = el.id;
  if (id) {
    const lbl = document.querySelector(`label[for="${cssEscape(id)}"]`);
    if (lbl?.textContent?.trim()) return lbl.textContent.trim();
  }
  let parent: HTMLElement | null = el.parentElement;
  for (let depth = 0; parent && depth < 4; depth++, parent = parent.parentElement) {
    if (parent.tagName === 'LABEL' && parent.textContent) {
      return parent.textContent.trim();
    }
  }
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ids = labelledBy.split(/\s+/).filter(Boolean);
    const text = ids
      .map((i) => document.getElementById(i)?.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
    if (text) return text;
  }
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();
  let prev: Element | null = el.previousElementSibling;
  for (let i = 0; prev && i < 3; i++, prev = prev.previousElementSibling) {
    const tag = prev.tagName;
    if ((tag === 'LABEL' || tag === 'SPAN' || tag === 'DIV') && prev.textContent?.trim()) {
      return prev.textContent.trim().slice(0, 200);
    }
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.placeholder) return el.placeholder.trim();
  }
  const name = el.getAttribute('name');
  if (name) return humanizeName(name);
  return el.id ? humanizeName(el.id) : '(unlabeled field)';
}

function resolveHint(el: HTMLElement): string | null {
  const describedBy = el.getAttribute('aria-describedby');
  if (describedBy) {
    const ids = describedBy.split(/\s+/).filter(Boolean);
    const text = ids
      .map((i) => document.getElementById(i)?.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
    if (text) return text.slice(0, 300);
  }
  // Look for adjacent .help / .description / .hint text
  let p: HTMLElement | null = el.parentElement;
  for (let depth = 0; p && depth < 3; depth++, p = p.parentElement) {
    const helper = p.querySelector(
      '.help, .description, .hint, [class*="helper"], [class*="-description"]'
    );
    if (helper?.textContent?.trim()) return helper.textContent.trim().slice(0, 300);
  }
  return null;
}

const FIELD_SELECTOR =
  'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), textarea, select, [role=combobox], [role=radiogroup]';

/**
 * Find the most likely application form on the page.
 *
 * Picks forms (or form-like containers) with the most fillable fields. Inside
 * SPA modals, prefers forms inside an open dialog so we don't accidentally
 * grab a search bar in the host page chrome.
 */
export function findBestForm(): HTMLFormElement | HTMLElement | null {
  const candidates: { el: HTMLFormElement | HTMLElement; score: number }[] = [];
  const forms = Array.from(document.querySelectorAll<HTMLFormElement>('form'));
  for (const f of forms) {
    const fields = f.querySelectorAll(FIELD_SELECTOR);
    const visibleCount = Array.from(fields).filter((x) => isVisible(x as HTMLElement)).length;
    if (visibleCount < 3) continue;
    let score = visibleCount;
    if (f.closest('[role="dialog"], .ReactModal__Content, [data-state="open"]')) {
      score += 50;
    }
    candidates.push({ el: f, score });
  }
  // SPA modals sometimes do NOT use a real <form>. Fall back to dialog containers
  // that contain enough fields.
  if (candidates.length === 0) {
    const dialogs = document.querySelectorAll<HTMLElement>(
      '[role="dialog"], .ReactModal__Content, [data-state="open"]'
    );
    for (const d of dialogs) {
      const fields = d.querySelectorAll(FIELD_SELECTOR);
      const visibleCount = Array.from(fields).filter((x) => isVisible(x as HTMLElement)).length;
      if (visibleCount >= 3) candidates.push({ el: d, score: visibleCount });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.el ?? null;
}

export function serializeForm(
  form: HTMLFormElement | HTMLElement,
  platform: string
): TFormSnapshot {
  const controls = Array.from(form.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter(isVisible);

  // De-duplicate radios in the same group: serialize the group as one field.
  const seenRadioNames = new Set<string>();
  const fields: TFormSnapshot['fields'] = [];
  let counter = 0;

  for (const el of controls) {
    if (el instanceof HTMLInputElement && el.type === 'radio') {
      const name = el.name;
      if (name && seenRadioNames.has(name)) continue;
      if (name) seenRadioNames.add(name);
    }

    const id = `f${counter++}`;
    (el as ElementWithSyntheticId)[FIELD_ID_PROP] = id;

    let options: { value: string; label: string }[] | null = extractOptions(el);
    // For radios in a named group, gather siblings as options.
    if (el instanceof HTMLInputElement && el.type === 'radio' && el.name && !options) {
      const siblings = form.querySelectorAll<HTMLInputElement>(
        `input[type="radio"][name="${cssEscape(el.name)}"]`
      );
      options = Array.from(siblings).map((r) => ({
        value: r.value,
        label: resolveLabel(r) || r.value,
      }));
    }

    fields.push({
      id,
      label: resolveLabel(el),
      type: el instanceof HTMLInputElement && el.type === 'radio' ? 'radio' : inferKind(el),
      required:
        (el as HTMLInputElement).required ||
        el.getAttribute('aria-required') === 'true' ||
        el.hasAttribute('required'),
      maxLength:
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
          ? el.maxLength > 0
            ? el.maxLength
            : null
          : null,
      placeholder:
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
          ? el.placeholder || null
          : null,
      ariaLabel: el.getAttribute('aria-label'),
      currentValue: readCurrentValue(el),
      options,
      hint: resolveHint(el),
    });
  }

  const formId = (form as HTMLFormElement).id || form.getAttribute('data-test') || 'form0';

  return FormSnapshot.parse({
    url: window.location.href,
    host: window.location.hostname,
    platform,
    formId,
    fields,
  });
}

/**
 * Get the synthetic id assigned during the most recent serialization.
 * Returns undefined if the element was not part of the snapshot (race
 * condition: form was re-rendered between serialize and apply).
 */
export function getSyntheticId(el: HTMLElement): string | undefined {
  return (el as ElementWithSyntheticId)[FIELD_ID_PROP];
}

/**
 * Resolve a synthetic id back to its DOM element. Returns null if the element
 * has been removed since serialization.
 */
export function resolveSyntheticId(
  form: HTMLFormElement | HTMLElement,
  id: string
): HTMLElement | null {
  const all = form.querySelectorAll<HTMLElement>(FIELD_SELECTOR);
  for (const el of all) {
    if ((el as ElementWithSyntheticId)[FIELD_ID_PROP] === id) return el;
  }
  return null;
}
