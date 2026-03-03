import { describe, it, expect } from 'vitest';
import { humanizeWithRules, detectAIPatterns } from '../humanizer';

describe('humanizeWithRules', () => {
  it('produces identical output for the same input', () => {
    const input =
      'I am excited to leverage my skills and utilize my expertise in this cutting-edge role.';
    const result1 = humanizeWithRules(input);
    const result2 = humanizeWithRules(input);
    expect(result1).toBe(result2);
  });

  it('produces identical output across many calls', () => {
    const input =
      'I am thrilled to express my passionate about results-driven approaches. ' +
      'I have a proven track record of delivering seamless robust solutions.';
    const results = Array.from({ length: 10 }, () => humanizeWithRules(input));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBe(results[0]);
    }
  });

  it('replaces AI phrases with natural alternatives', () => {
    const input = 'I am excited to leverage my experience in this role.';
    const result = humanizeWithRules(input);
    expect(result).not.toContain('I am excited to');
    expect(result).not.toContain('leverage');
  });

  it('replaces "passionate about"', () => {
    const input = 'I am passionate about building great software.';
    const result = humanizeWithRules(input);
    expect(result).not.toContain('passionate about');
  });

  it('replaces "proven track record"', () => {
    const input = 'I have a proven track record of delivering projects on time.';
    const result = humanizeWithRules(input);
    expect(result).not.toContain('proven track record');
    // Should be replaced with one of: 'experience with' or 'history of'
    const hasAlternative = result.includes('experience with') || result.includes('history of');
    expect(hasAlternative).toBe(true);
  });

  it('simplifies "I am writing to express my interest in"', () => {
    const input = 'I am writing to express my interest in the Software Engineer position.';
    const result = humanizeWithRules(input);
    expect(result).not.toContain('I am writing to express my interest in');
  });

  it('removes "successfully" before action verbs', () => {
    const input = 'I successfully managed a team of 10.';
    const result = humanizeWithRules(input);
    expect(result).not.toMatch(/successfully managed/i);
  });

  it('applies contractions deterministically', () => {
    const input = 'I am a developer. I have built apps. I will continue learning.';
    const result1 = humanizeWithRules(input);
    const result2 = humanizeWithRules(input);
    expect(result1).toBe(result2);
  });

  it('preserves content that has no AI patterns', () => {
    const input = 'Built a React application serving 50k users daily.';
    const result = humanizeWithRules(input);
    expect(result).toContain('React');
    expect(result).toContain('50k users');
  });

  it('handles empty input', () => {
    expect(humanizeWithRules('')).toBe('');
  });

  it('varies sentence structure when too many start with "I"', () => {
    const input =
      'I developed the backend. I managed the team. I improved performance. I deployed the app.';
    const result = humanizeWithRules(input);
    // At least one sentence should have been restructured
    const sentences = result.split(/(?<=[.!?])\s+/);
    const iStarts = sentences.filter((s) => s.match(/^I\s/i)).length;
    expect(iStarts).toBeLessThan(4);
  });
});

describe('detectAIPatterns', () => {
  it('returns low score for natural text', () => {
    const text =
      'Built a React app serving 50k users. Used Python for data pipelines. Led a team of 5.';
    const result = detectAIPatterns(text);
    expect(result.score).toBeLessThan(20);
  });

  it('returns high score for AI-heavy text', () => {
    const text =
      'I am excited to leverage my skills in this cutting-edge role. ' +
      'I am passionate about delivering seamless, robust solutions with a proven track record. ' +
      'I am highly motivated and results-driven.';
    const result = detectAIPatterns(text);
    expect(result.score).toBeGreaterThan(40);
    expect(result.patterns.length).toBeGreaterThan(3);
  });

  it('detects lack of contractions', () => {
    const words = Array(60).fill('I am writing code and it is working well').join('. ');
    const result = detectAIPatterns(words);
    expect(result.patterns).toContain('Lack of contractions');
  });
});
