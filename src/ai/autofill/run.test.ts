/**
 * Tests for the one-pass autofill runner.
 *
 * The AIService is mocked. We focus on:
 *   1. The refusal sanitizer (model says "I cannot" → converted to skip).
 *   2. The defensive Zod parse rejecting malformed responses.
 *   3. The answered / skipped / hadRefusals counters.
 *
 * The actual prompt content is tested separately in prompt.test.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import { runAutofill } from './run';
import type { TFormSnapshot } from './schema';
import type { AutofillProfileSlice, AutofillJobContext } from './prompt';
import type { CompanyResearch } from '../../background/research/company-research';
import type { AIService } from '@ai/index';

function makeSnapshot(): TFormSnapshot {
  return {
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
        label: 'Why this company?',
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
}

const profile: AutofillProfileSlice = {
  fullName: 'Sai Tata',
  email: 'sai@example.com',
  phone: '555 0100',
  currentTitle: 'Senior Backend Engineer',
  yearsExperience: 6,
  skillsLine: 'Python, TypeScript, Postgres',
  recentCompany: 'Acme',
  topAchievements: ['Cut p99 from 2s to 200ms by rewriting the cache layer'],
};

const jd: AutofillJobContext = {
  company: 'Jireh',
  title: 'AI Engineer',
  description: 'Build B2B sales tooling.',
  url: 'https://wellfound.com/jobs/1',
};

const research: CompanyResearch = {
  tier: 2,
  text: 'Jireh helps B2B sellers find ready buyers and tells them what to say.',
  domain: 'jireh.ai',
  fetchedAt: new Date().toISOString(),
};

function makeMockService(returnValue: unknown): AIService {
  return {
    chatStructured: vi.fn(async () => returnValue),
  } as unknown as AIService;
}

describe('runAutofill', () => {
  it('returns parsed answers and counters on a clean response', async () => {
    const ai = makeMockService({
      answers: [
        { fieldId: 'f0', value: 'Sai Tata', source: 'profile', confidence: 1 },
        {
          fieldId: 'f1',
          value: 'Jireh helps sellers know what to say. I built a similar pipeline at Acme.',
          source: 'ai',
          confidence: 0.85,
        },
      ],
      notes: null,
    });
    const result = await runAutofill(ai, makeSnapshot(), profile, jd, research);
    expect(result.answered).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.hadRefusals).toBe(false);
    expect(result.response.answers).toHaveLength(2);
  });

  it('converts refusal text to skip and flips hadRefusals', async () => {
    const ai = makeMockService({
      answers: [
        { fieldId: 'f0', value: 'Sai Tata', source: 'profile', confidence: 1 },
        {
          fieldId: 'f1',
          value: 'I cannot generate a personalized response without more information.',
          source: 'ai',
          confidence: 0.4,
        },
      ],
      notes: null,
    });
    const result = await runAutofill(ai, makeSnapshot(), profile, jd, research);
    expect(result.hadRefusals).toBe(true);
    expect(result.answered).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.response.answers[1].source).toBe('skip');
    expect(result.response.answers[1].value).toBe('');
  });

  it('catches "As an AI" refusals', async () => {
    const ai = makeMockService({
      answers: [
        { fieldId: 'f0', value: 'Sai Tata', source: 'profile', confidence: 1 },
        {
          fieldId: 'f1',
          value: 'As an AI language model, I cannot speak for the candidate.',
          source: 'ai',
          confidence: 0.2,
        },
      ],
      notes: null,
    });
    const result = await runAutofill(ai, makeSnapshot(), profile, jd, research);
    expect(result.hadRefusals).toBe(true);
    expect(result.response.answers[1].source).toBe('skip');
  });

  it('counts explicit skips as skipped, not refusals', async () => {
    const ai = makeMockService({
      answers: [
        { fieldId: 'f0', value: 'Sai Tata', source: 'profile', confidence: 1 },
        { fieldId: 'f1', value: '', source: 'skip', confidence: 0 },
      ],
      notes: null,
    });
    const result = await runAutofill(ai, makeSnapshot(), profile, jd, research);
    expect(result.answered).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.hadRefusals).toBe(false);
  });

  it('throws on a malformed response (Zod parse failure)', async () => {
    const ai = makeMockService({ answers: 'not an array', notes: null });
    await expect(runAutofill(ai, makeSnapshot(), profile, jd, research)).rejects.toThrow();
  });

  it('throws on confidence outside 0..1', async () => {
    const ai = makeMockService({
      answers: [{ fieldId: 'f0', value: 'x', source: 'profile', confidence: 5 }],
      notes: null,
    });
    await expect(runAutofill(ai, makeSnapshot(), profile, jd, research)).rejects.toThrow();
  });
});
