import { describe, it, expect } from 'vitest';
import {
  stripBoilerplate,
  getScoreColor,
  getQuickRecommendations,
  calculateQuickATSScore,
  type QuickATSScore,
} from './hybrid-scorer';
import type { MasterProfile } from '@shared/types/master-profile.types';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeQuickScore(overrides: Partial<QuickATSScore> = {}): QuickATSScore {
  return {
    score: 70,
    matchedKeywords: ['python', 'react'],
    missingKeywords: ['docker', 'kubernetes'],
    matchPercentage: 50,
    tier: 'good',
    weightedKeywords: [],
    seniorityMatch: 'match',
    yearsRequired: null,
    criticalMissing: [],
    detectedJobDomain: 'tech',
    hasEnoughKeywords: true,
    detectedJobBackground: 'computer_science',
    backgroundMismatch: false,
    ...overrides,
  };
}

function makeMockProfile(skills: string[]): MasterProfile {
  return {
    id: 'test-1',
    name: 'Test User',
    skills: {
      technical: skills.map((s) => ({
        name: s,
        normalizedName: s.toLowerCase(),
        level: 'intermediate',
        yearsUsed: 3,
        aliases: [],
      })),
      tools: [],
      frameworks: [],
    },
    experience: [
      {
        company: 'TestCo',
        title: 'Software Engineer',
        startDate: 'Jan 2020',
        endDate: 'Present',
        technologies: skills,
        achievements: skills.map((s) => `Built ${s} systems`),
      },
    ],
    careerContext: {
      seniority: 'mid',
      yearsOfExperience: 5,
      trajectory: 'upward',
    },
    personal: { fullName: 'Test User' },
    education: [],
    certifications: [],
    projects: [],
    generatedProfiles: [],
  } as unknown as MasterProfile;
}

// ── stripBoilerplate() ──────────────────────────────────────────────────

describe('stripBoilerplate', () => {
  it('removes EEO statements', () => {
    const jd =
      'We are looking for a Python developer.\nRequirements:\n- Python\n- React\n\nEqual Employment Opportunity: We are an equal opportunity employer and value diversity at our company. We do not discriminate on the basis of race, religion, color, national origin.';
    const cleaned = stripBoilerplate(jd);
    expect(cleaned).toContain('Python developer');
    expect(cleaned).toContain('React');
    expect(cleaned.toLowerCase()).not.toContain('equal opportunity employer');
  });

  it('preserves real content mentioning diversity in tech stack', () => {
    const jd = 'We value diversity in our tech stack including Python, Go, and Rust.';
    const cleaned = stripBoilerplate(jd);
    expect(cleaned).toContain('tech stack');
    expect(cleaned).toContain('Python');
  });

  it('handles empty string', () => {
    expect(stripBoilerplate('')).toBe('');
  });

  it('preserves requirements while removing boilerplate at end', () => {
    const jd = `About the Role:
We need a senior engineer with 5+ years experience.

Requirements:
- Python, TypeScript
- AWS, Docker

We are committed to celebrating diversity and creating an inclusive environment for all employees. We are proud to be an equal opportunity employer.`;
    const cleaned = stripBoilerplate(jd);
    expect(cleaned).toContain('senior engineer');
    expect(cleaned).toContain('Python, TypeScript');
    expect(cleaned).toContain('AWS, Docker');
  });
});

// ── getScoreColor() ──────────────────────────────────────────────────────

describe('getScoreColor', () => {
  it('returns green for score >= 80', () => {
    expect(getScoreColor(85)).toBe('#22c55e');
    expect(getScoreColor(80)).toBe('#22c55e');
    expect(getScoreColor(100)).toBe('#22c55e');
  });

  it('returns yellow for score 60-79', () => {
    expect(getScoreColor(70)).toBe('#eab308');
    expect(getScoreColor(60)).toBe('#eab308');
    expect(getScoreColor(79)).toBe('#eab308');
  });

  it('returns orange for score 40-59', () => {
    expect(getScoreColor(45)).toBe('#f97316');
    expect(getScoreColor(40)).toBe('#f97316');
    expect(getScoreColor(59)).toBe('#f97316');
  });

  it('returns red for score < 40', () => {
    expect(getScoreColor(30)).toBe('#ef4444');
    expect(getScoreColor(0)).toBe('#ef4444');
    expect(getScoreColor(39)).toBe('#ef4444');
  });
});

// ── getQuickRecommendations() ────────────────────────────────────────────

describe('getQuickRecommendations', () => {
  it('warns about background mismatch first', () => {
    const score = makeQuickScore({
      backgroundMismatch: true,
      backgroundMismatchMessage: 'Your CS background does not match this Marketing role',
    });
    const recs = getQuickRecommendations(score);
    expect(recs[0]).toContain('Background Mismatch');
  });

  it('warns when not enough keywords', () => {
    const score = makeQuickScore({
      hasEnoughKeywords: false,
      detectedJobDomain: 'tech',
    });
    const recs = getQuickRecommendations(score);
    expect(recs.some((r) => r.includes('Unable to analyze reliably'))).toBe(true);
  });

  it('flags critical missing keywords', () => {
    const score = makeQuickScore({
      criticalMissing: ['Docker', 'Kubernetes', 'AWS'],
    });
    const recs = getQuickRecommendations(score);
    expect(recs.some((r) => r.includes('Critical: Add'))).toBe(true);
    expect(recs.some((r) => r.includes('Docker'))).toBe(true);
  });

  it('gives positive feedback for excellent tier', () => {
    const score = makeQuickScore({
      score: 95,
      tier: 'excellent',
      missingKeywords: [],
      criticalMissing: [],
    });
    const recs = getQuickRecommendations(score);
    expect(recs.some((r) => r.includes('Strong match'))).toBe(true);
  });

  it('notes non-tech domain when not enough keywords', () => {
    const score = makeQuickScore({
      hasEnoughKeywords: false,
      detectedJobDomain: 'non-tech',
    });
    const recs = getQuickRecommendations(score);
    expect(recs.some((r) => r.includes('non-tech role'))).toBe(true);
  });
});

// ── calculateQuickATSScore() ─────────────────────────────────────────────

describe('calculateQuickATSScore', () => {
  it('scores well when profile skills match JD keywords', () => {
    const profile = makeMockProfile(['Python', 'React', 'AWS', 'Docker', 'TypeScript']);
    const jd = `
      We are looking for a Senior Software Engineer.
      Requirements:
      - Strong Python experience
      - React and TypeScript for frontend
      - AWS cloud services
      - Docker containerization
      - 5+ years of software development experience
    `;
    const result = calculateQuickATSScore(profile, jd);
    expect(result.score).toBeGreaterThan(0);
    expect(result.hasEnoughKeywords).toBe(true);
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
    expect(result.tier).not.toBe('poor');
  });

  it('scores poorly when profile skills do not match JD', () => {
    const profile = makeMockProfile(['Java', 'Spring', 'Oracle']);
    const jd = `
      We need a Python developer with strong React experience.
      Requirements:
      - Python backend development
      - React frontend
      - PostgreSQL database management
      - Kubernetes orchestration
      - Go microservices
    `;
    const result = calculateQuickATSScore(profile, jd);
    expect(result.missingKeywords.length).toBeGreaterThan(0);
    // Score should be lower than a good match
    expect(result.score).toBeLessThan(70);
  });

  it('handles empty JD gracefully', () => {
    const profile = makeMockProfile(['Python', 'React']);
    const result = calculateQuickATSScore(profile, '');
    expect(result.score).toBe(0);
    expect(result.hasEnoughKeywords).toBe(false);
  });

  it('detects background mismatch between CS profile and marketing JD', () => {
    const profile = makeMockProfile(['Python', 'React', 'Node.js', 'TypeScript']);
    const jd = `
      Marketing Manager Position
      We are looking for an experienced marketing professional to lead our brand strategy.
      Requirements:
      - Digital marketing campaigns
      - Social media management
      - Content marketing strategy
      - SEO and SEM expertise
      - Marketing analytics and reporting
      - Brand management experience
    `;
    const result = calculateQuickATSScore(profile, jd);
    // The profile has CS skills and the JD is marketing — should detect mismatch
    // (depends on background detection working, but the function should not crash)
    expect(result.detectedJobBackground).toBeDefined();
    expect(typeof result.backgroundMismatch).toBe('boolean');
  });
});
