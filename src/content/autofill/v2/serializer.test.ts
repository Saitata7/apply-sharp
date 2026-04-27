/**
 * Tests for the autofill v2 form serializer.
 *
 * Synthesized DOMs (not full ATS HTML, just the parts the serializer cares
 * about) cover the layered label resolution, the visibility filter, the
 * radio-group de-duplication, the SPA modal fallback, and the synthetic id
 * round trip.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { serializeForm, findBestForm, getSyntheticId, resolveSyntheticId } from './serializer';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('serializer label resolution', () => {
  it('uses label[for=id] when present', () => {
    document.body.innerHTML = `
      <form id="apply">
        <label for="full-name">Full Name</label>
        <input id="full-name" type="text" required />
        <input id="email" type="email" required />
        <textarea id="why" required></textarea>
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'wellfound');
    expect(snap.fields[0].label).toBe('Full Name');
    expect(snap.fields[0].required).toBe(true);
  });

  it('falls back to ancestor label when wrapped', () => {
    document.body.innerHTML = `
      <form id="apply">
        <label>Email Address<input type="email" /></label>
        <textarea></textarea>
        <input type="text" placeholder="Phone" />
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    expect(snap.fields[0].label).toContain('Email');
  });

  it('falls back to aria-label', () => {
    document.body.innerHTML = `
      <form>
        <input aria-label="Phone Number" type="tel" />
        <input type="text" />
        <input type="email" />
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    expect(snap.fields[0].label).toBe('Phone Number');
  });

  it('falls back to placeholder when no label exists', () => {
    document.body.innerHTML = `
      <form>
        <input type="text" placeholder="Full name" />
        <input type="email" placeholder="Email" />
        <input type="tel" placeholder="Phone" />
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    expect(snap.fields[0].label).toBe('Full name');
    expect(snap.fields[1].label).toBe('Email');
  });

  it('humanizes the name attribute as last resort', () => {
    document.body.innerHTML = `
      <form>
        <input name="firstName" type="text" />
        <input name="last_name" type="text" />
        <input name="email" type="email" />
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    expect(snap.fields[0].label).toBe('first Name');
    expect(snap.fields[1].label).toBe('last name');
  });
});

describe('serializer field detection', () => {
  it('classifies common input types', () => {
    document.body.innerHTML = `
      <form>
        <input type="text" name="a" />
        <input type="email" name="b" />
        <input type="tel" name="c" />
        <input type="url" name="d" />
        <input type="number" name="e" />
        <input type="date" name="f" />
        <textarea name="g"></textarea>
        <select name="h"><option>X</option></select>
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    const types = snap.fields.map((f) => f.type);
    expect(types).toEqual(['text', 'email', 'tel', 'url', 'number', 'date', 'textarea', 'select']);
  });

  it('extracts select options', () => {
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
    expect(snap.fields[0].options).toEqual([
      { value: 'us', label: 'United States' },
      { value: 'ca', label: 'Canada' },
    ]);
  });

  it('skips hidden, submit, and button inputs', () => {
    document.body.innerHTML = `
      <form>
        <input type="hidden" name="csrf" value="x" />
        <input type="text" name="a" />
        <input type="text" name="b" />
        <input type="text" name="c" />
        <input type="submit" value="Apply" />
        <button type="button">Cancel</button>
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    expect(snap.fields).toHaveLength(3);
  });

  it('reads required from required attribute and aria-required', () => {
    document.body.innerHTML = `
      <form>
        <input type="text" name="a" required />
        <input type="text" name="b" aria-required="true" />
        <input type="text" name="c" />
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    expect(snap.fields[0].required).toBe(true);
    expect(snap.fields[1].required).toBe(true);
    expect(snap.fields[2].required).toBe(false);
  });
});

describe('findBestForm', () => {
  it('returns null when no form has 3+ fields', () => {
    document.body.innerHTML = `<form><input /><input /></form>`;
    expect(findBestForm()).toBe(null);
  });

  it('picks the form with the most fields', () => {
    document.body.innerHTML = `
      <form id="search"><input /><input /><input /></form>
      <form id="apply"><input /><input /><input /><input /><input /></form>`;
    const best = findBestForm() as HTMLFormElement;
    expect(best.id).toBe('apply');
  });

  it('prefers forms inside [role=dialog] (SPA modal pattern)', () => {
    document.body.innerHTML = `
      <form id="page-search"><input /><input /><input /><input /></form>
      <div role="dialog">
        <form id="apply-modal"><input /><input /><input /></form>
      </div>`;
    const best = findBestForm() as HTMLFormElement;
    expect(best.id).toBe('apply-modal');
  });

  it('falls back to dialog containers without a real form', () => {
    document.body.innerHTML = `
      <div role="dialog">
        <input name="a" /><input name="b" /><input name="c" /><textarea></textarea>
      </div>`;
    const best = findBestForm();
    expect(best).not.toBe(null);
    expect(best?.getAttribute('role')).toBe('dialog');
  });
});

describe('synthetic id round trip', () => {
  it('round trips id resolution', () => {
    document.body.innerHTML = `
      <form>
        <input name="a" /><input name="b" /><input name="c" />
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    const id = snap.fields[1].id;
    const resolved = resolveSyntheticId(form, id);
    expect(resolved).not.toBe(null);
    expect(getSyntheticId(resolved!)).toBe(id);
  });

  it('returns null when the field has been removed from DOM', () => {
    document.body.innerHTML = `
      <form id="f">
        <input name="a" /><input name="b" /><input name="c" />
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    const id = snap.fields[0].id;
    // Remove the first input
    form.querySelector('input')!.remove();
    expect(resolveSyntheticId(form, id)).toBe(null);
  });
});

describe('radio group dedup', () => {
  it('serializes a named radio group as one field', () => {
    document.body.innerHTML = `
      <form>
        <label><input type="radio" name="auth" value="citizen" />Citizen</label>
        <label><input type="radio" name="auth" value="visa" />Visa</label>
        <label><input type="radio" name="auth" value="other" />Other</label>
        <input name="email" type="email" />
        <input name="name" type="text" />
      </form>`;
    const form = document.querySelector('form')!;
    const snap = serializeForm(form, 'generic');
    // Three radios should collapse to one field with options.
    const radioField = snap.fields.find((f) => f.type === 'radio');
    expect(radioField).toBeDefined();
    expect(radioField?.options).toHaveLength(3);
    expect(radioField?.options?.map((o) => o.value)).toEqual(['citizen', 'visa', 'other']);
  });
});
