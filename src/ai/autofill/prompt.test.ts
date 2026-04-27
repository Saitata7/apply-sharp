/**
 * Tests for the autofill prompt builder.
 *
 * The prompt is the most important piece of the autofill rewrite because it
 * encodes the message philosophy ("read the company first, write about me
 * second", "only relevant experience", "no em-dash", "no AI tells"). These
 * tests verify that all the constraints actually appear in the rendered prompt
 * and that the form, profile, JD, and research data flow through correctly.
 */

import { describe, it, expect } from 'vitest';
import { buildAutofillPrompt, type AutofillProfileSlice, type AutofillJobContext } from './prompt';
import type { TFormSnapshot } from './schema';
import type { CompanyResearch } from '../../background/research/company-research';

const snapshot: TFormSnapshot = {
  url: 'https://wellfound.com/jobs/1',
  host: 'wellfound.com',
  platform: 'wellfound',
  formId: 'apply',
  fields: [
    {
      id: 'f0',
      label: 'Full name',
      type: 'text',
      required: true,
      maxLength: null,
      placeholder: null,
      ariaLabel: null,
      currentValue: '',
      options: null,
      hint: null,
    },
    {
      id: 'f1',
      label: 'Why are you interested in working at Jireh?',
      type: 'textarea',
      required: true,
      maxLength: 500,
      placeholder: null,
      ariaLabel: null,
      currentValue: '',
      options: null,
      hint: null,
    },
  ],
};

const profile: AutofillProfileSlice = {
  fullName: 'Jane Doe',
  email: 'jane@example.com',
  phone: '555 0100',
  linkedin: 'linkedin.com/in/janedoe',
  github: 'github.com/janedoe',
  currentTitle: 'Senior Backend Engineer',
  yearsExperience: 6,
  skillsLine: 'Python, TypeScript, Postgres',
  recentCompany: 'Acme',
  topAchievements: ['Cut p99 from 2s to 200ms', 'Shipped multi-tenant billing'],
  workAuth: 'US Citizen',
};

const jd: AutofillJobContext = {
  company: 'Jireh',
  title: 'AI Engineer',
  description: 'Build B2B sales tooling for finding ready buyers.',
  url: 'https://wellfound.com/jobs/1',
};

const research: CompanyResearch = {
  tier: 2,
  text: 'Jireh helps B2B sellers find ready buyers and tells them what to say.',
  domain: 'jireh.ai',
  fetchedAt: new Date().toISOString(),
};

describe('buildAutofillPrompt', () => {
  it('returns both system and user prompts', () => {
    const built = buildAutofillPrompt(snapshot, profile, jd, research);
    expect(built.system).toBeTruthy();
    expect(built.user).toBeTruthy();
    expect(built.system.length).toBeGreaterThan(200);
    expect(built.user.length).toBeGreaterThan(200);
  });

  it('system prompt enforces the no-em-dash and banned vocab rules', () => {
    const built = buildAutofillPrompt(snapshot, profile, jd, research);
    // The ANTI_AI_TELLS block must be in the system message.
    expect(built.system).toMatch(/em-dash/i);
    expect(built.system).toMatch(/leverage/i);
    expect(built.system).toMatch(/delve/i);
  });

  it('system prompt itself contains zero em-dashes (the anti-tell rule applies recursively)', () => {
    const built = buildAutofillPrompt(snapshot, profile, jd, research);
    // The em-dash character is U+2014. If our own prompts contain it, the model
    // mirrors it back. This was the most common AI tell in our generated output
    // before the cleanup.
    expect(built.system).not.toContain('\u2014');
  });

  it('system prompt encodes the company-first message philosophy', () => {
    const built = buildAutofillPrompt(snapshot, profile, jd, research);
    expect(built.system).toMatch(/Read the COMPANY first/i);
    expect(built.system).toMatch(/relevant.*role/i);
  });

  it('user prompt includes the profile fields the model needs', () => {
    const built = buildAutofillPrompt(snapshot, profile, jd, research);
    expect(built.user).toContain('Sai Tata');
    expect(built.user).toContain('sai@example.com');
    expect(built.user).toContain('Senior Backend Engineer');
    expect(built.user).toContain('Cut p99');
    expect(built.user).toContain('US Citizen');
  });

  it('user prompt includes the actual company name, never the literal "the company"', () => {
    const built = buildAutofillPrompt(snapshot, profile, jd, research);
    // The bug we are killing: learning-handlers.ts:246 used to pass "the company"
    // when companyName was empty. With the new path, the AI gets the real name.
    expect(built.user).toContain('Jireh');
    expect(built.user).not.toMatch(/Company:\s*the company/);
  });

  it('user prompt includes the company research text and tier marker', () => {
    const built = buildAutofillPrompt(snapshot, profile, jd, research);
    expect(built.user).toContain('research tier 2');
    expect(built.user).toContain('jireh.ai');
    expect(built.user).toContain('B2B sellers');
  });

  it('user prompt serializes the form fields as JSON', () => {
    const built = buildAutofillPrompt(snapshot, profile, jd, research);
    expect(built.user).toContain('"id":"f0"');
    expect(built.user).toContain('"id":"f1"');
    expect(built.user).toContain('Why are you interested');
  });

  it('handles tier-1 research (model knowledge only) without crashing', () => {
    const tier1: CompanyResearch = {
      tier: 1,
      text: 'No company domain available. Use only what you know about "Jireh".',
      domain: null,
      fetchedAt: new Date().toISOString(),
    };
    const built = buildAutofillPrompt(snapshot, profile, jd, tier1);
    expect(built.user).toContain('No company domain available');
    expect(built.user).not.toContain('research tier 2');
  });

  it('truncates very long job descriptions', () => {
    const longJd: AutofillJobContext = { ...jd, description: 'X'.repeat(5000) };
    const built = buildAutofillPrompt(snapshot, profile, longJd, research);
    // Should be capped under MAX_JD_CHARS (1500), not the full 5000.
    expect(built.user.length).toBeLessThan(8000);
  });
});
