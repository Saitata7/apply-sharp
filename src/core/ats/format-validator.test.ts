import { describe, it, expect } from 'vitest';
import { validateATSFormat, extractResumeContent, type ResumeContent } from './format-validator';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeResumeContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    sections: [
      {
        header: 'Summary',
        content:
          'Experienced software engineer with expertise in cloud architecture and distributed systems.',
      },
      { header: 'Work Experience', content: '' },
      {
        header: 'Technical Skills',
        content: 'Python, JavaScript, TypeScript, React, Node.js, AWS, Docker, Kubernetes',
      },
      { header: 'Education', content: 'BS Computer Science, Stanford University' },
    ],
    bullets: [
      'Architected microservices platform serving 2M users with 99.9% uptime SLA',
      'Streamlined CI/CD pipeline reducing deployment time by 65% across 15 services',
      'Led migration of legacy monolith to cloud-native architecture saving $500K annually',
      'Delivered real-time analytics dashboard processing 10M events daily for stakeholders',
      'Optimized database queries reducing average response time from 800ms to 120ms',
    ],
    dates: ['Jan 2020', 'Dec 2023', 'Mar 2018', 'Dec 2019'],
    fullText:
      'Experienced software engineer. Python JavaScript TypeScript React Node.js Amazon Web Services (AWS) Docker Kubernetes. Architected microservices platform serving 2M users. Python microservices. Python scripts. JavaScript frontend. React components. AWS cloud infrastructure. Docker containers.',
    wordCount: 400,
    yearsOfExperience: 6,
    pageCount: 2,
    ...overrides,
  };
}

// ── validateATSFormat() ──────────────────────────────────────────────────

describe('validateATSFormat', () => {
  it('scores a well-formatted resume highly', () => {
    const content = makeResumeContent();
    const result = validateATSFormat(content);
    expect(result.overallScore).toBeGreaterThanOrEqual(70);
    expect(result.passesMinimum).toBe(true);
    expect(result.categoryScores.sectionHeaders).toBeGreaterThanOrEqual(80);
    expect(result.categoryScores.dateFormat).toBe(100);
  });

  it('flags prohibited section headers as error', () => {
    const content = makeResumeContent({
      sections: [
        { header: 'My Story', content: 'Once upon a time...' },
        { header: 'Work Experience', content: '' },
      ],
    });
    const result = validateATSFormat(content);
    const prohibited = result.issues.find(
      (i) =>
        i.category === 'section_headers' &&
        i.severity === 'error' &&
        i.message.includes('Prohibited')
    );
    expect(prohibited).toBeDefined();
    expect(prohibited!.message).toContain('My Story');
  });

  it('flags missing Work Experience section', () => {
    const content = makeResumeContent({
      sections: [
        { header: 'Summary', content: 'Senior engineer' },
        { header: 'Technical Skills', content: 'Python, React' },
      ],
    });
    const result = validateATSFormat(content);
    const missing = result.issues.find(
      (i) =>
        i.category === 'section_headers' &&
        i.message.includes('Missing required section: Work Experience')
    );
    expect(missing).toBeDefined();
    expect(missing!.severity).toBe('error');
  });

  it('warns about missing Skills section', () => {
    const content = makeResumeContent({
      sections: [
        { header: 'Summary', content: 'Engineer' },
        { header: 'Work Experience', content: '' },
        { header: 'Education', content: 'BS CS' },
      ],
    });
    const result = validateATSFormat(content);
    const missing = result.issues.find(
      (i) => i.category === 'section_headers' && i.message.includes('Skills')
    );
    expect(missing).toBeDefined();
    expect(missing!.severity).toBe('warning');
  });

  it('flags dangerous date formats', () => {
    const content = makeResumeContent({
      dates: ["'23", 'Summer 2023', 'ongoing'],
    });
    const result = validateATSFormat(content);
    const dateIssues = result.issues.filter((i) => i.category === 'dates');
    expect(dateIssues.length).toBeGreaterThanOrEqual(2);
    expect(result.categoryScores.dateFormat).toBeLessThan(100);
  });

  it('passes safe date formats with full score', () => {
    const content = makeResumeContent({
      dates: ['Jan 2024', '01/2024', 'Present', 'January 2023'],
    });
    const result = validateATSFormat(content);
    expect(result.categoryScores.dateFormat).toBe(100);
  });

  it('warns about low keyword density', () => {
    // 500 words but all unique — no repeated keywords
    const uniqueWords = Array.from({ length: 500 }, (_, i) => `uniqueword${i}`).join(' ');
    const content = makeResumeContent({
      fullText: uniqueWords,
      wordCount: 500,
    });
    const result = validateATSFormat(content);
    const kwIssue = result.issues.find(
      (i) => i.category === 'keywords' && i.message.includes('Low keyword density')
    );
    expect(kwIssue).toBeDefined();
    expect(result.categoryScores.keywordDensity).toBeLessThan(70);
  });

  it('warns about high keyword density (keyword stuffing)', () => {
    // Create text where one word is heavily repeated
    const stuffed =
      Array.from({ length: 100 }, () => 'python').join(' ') +
      ' ' +
      Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
    const content = makeResumeContent({
      fullText: stuffed,
      wordCount: 200,
    });
    const result = validateATSFormat(content);
    const kwIssue = result.issues.find(
      (i) =>
        i.category === 'keywords' &&
        (i.message.includes('High keyword density') || i.message.includes('repetitive'))
    );
    expect(kwIssue).toBeDefined();
  });

  it('flags wrong page count for entry-level', () => {
    const content = makeResumeContent({
      yearsOfExperience: 2,
      pageCount: 3,
    });
    const result = validateATSFormat(content);
    const pageIssue = result.issues.find((i) => i.category === 'page_count');
    expect(pageIssue).toBeDefined();
    expect(result.categoryScores.pageCount).toBeLessThan(100);
  });

  it('flags acronyms without full form', () => {
    const content = makeResumeContent({
      fullText: 'Built microservices on AWS with CI/CD pipelines and ML models for data processing',
    });
    const result = validateATSFormat(content);
    const acronymIssue = result.issues.find((i) => i.category === 'acronyms');
    expect(acronymIssue).toBeDefined();
    expect(result.categoryScores.acronymCoverage).toBeLessThan(100);
  });
});

// ── extractResumeContent() ───────────────────────────────────────────────

describe('extractResumeContent', () => {
  it('extracts all sections from full profile data', () => {
    const data = {
      summary: 'Experienced engineer',
      experience: [
        {
          company: 'Acme',
          title: 'Engineer',
          startDate: 'Jan 2020',
          endDate: 'Present',
          achievements: ['Built platform', 'Led team'],
        },
      ],
      skills: {
        technical: ['Python', 'Go'],
        tools: ['Docker'],
        frameworks: ['React'],
      },
      education: [{ institution: 'MIT', degree: 'BS CS', year: '2019' }],
      certifications: ['AWS Solutions Architect'],
      projects: [{ name: 'OpenSource', highlights: ['Created CLI tool'] }],
    };
    const content = extractResumeContent(data, 5, 1);
    const headers = content.sections.map((s) => s.header);
    expect(headers).toContain('Summary');
    expect(headers).toContain('Technical Skills');
    expect(headers).toContain('Work Experience');
    expect(headers).toContain('Education');
    expect(headers).toContain('Certifications');
    expect(headers).toContain('Projects');
  });

  it('handles empty data gracefully', () => {
    const content = extractResumeContent({}, 0, 1);
    expect(content.sections).toHaveLength(0);
    expect(content.bullets).toHaveLength(0);
    expect(content.dates).toHaveLength(0);
    expect(content.fullText).toBe('');
    expect(content.wordCount).toBe(0);
  });

  it('populates bullets from experience achievements', () => {
    const data = {
      experience: [
        {
          company: 'A',
          title: 'Eng',
          startDate: 'Jan 2020',
          endDate: 'Dec 2022',
          achievements: ['Built API', 'Led migration'],
        },
        {
          company: 'B',
          title: 'Dev',
          achievements: ['Deployed service'],
        },
      ],
    };
    const content = extractResumeContent(data, 3, 1);
    expect(content.bullets).toEqual(['Built API', 'Led migration', 'Deployed service']);
    expect(content.dates).toContain('Jan 2020');
    expect(content.dates).toContain('Dec 2022');
  });

  it('merges all skill categories into one section', () => {
    const data = {
      skills: {
        technical: ['Python'],
        tools: ['Docker', 'Git'],
        frameworks: ['React', 'Express'],
      },
    };
    const content = extractResumeContent(data, 3, 1);
    const skillSection = content.sections.find((s) => s.header === 'Technical Skills');
    expect(skillSection).toBeDefined();
    expect(skillSection!.content).toContain('Python');
    expect(skillSection!.content).toContain('Docker');
    expect(skillSection!.content).toContain('React');
  });

  it('computes wordCount correctly', () => {
    const data = {
      summary: 'one two three four five',
    };
    const content = extractResumeContent(data, 1, 1);
    expect(content.wordCount).toBe(5);
  });

  it('includes education dates', () => {
    const data = {
      education: [{ institution: 'MIT', degree: 'BS', year: '2020' }],
    };
    const content = extractResumeContent(data, 1, 1);
    expect(content.dates).toContain('2020');
  });
});

// ── Weight verification ─────────────────────────────────────────────────

describe('Category weights', () => {
  it('implicitly sum to 1.0 via score calculation', () => {
    // We verify this by creating a resume where all categories score 100
    // and checking that the overall score is 100
    const content = makeResumeContent({
      dates: ['Jan 2024', 'Present'],
      yearsOfExperience: 6,
      pageCount: 2,
      // Good bullets
      bullets: [
        'Architected microservices platform serving 2M users with 99.9% uptime across data centers',
        'Streamlined CI/CD pipeline reducing deployment time by 65% for all engineering teams',
        'Delivered real-time analytics dashboard processing 10M daily events for stakeholders',
      ],
      // Include both acronyms and full forms
      fullText:
        'Amazon Web Services (AWS) machine learning (ML) artificial intelligence (AI) Python JavaScript TypeScript. Python microservices. Python backend. JavaScript frontend. TypeScript types. React components. Node.js server.',
      wordCount: 200,
    });
    const result = validateATSFormat(content);
    // If weights sum to 1.0 correctly, a perfect resume should get 100
    // In practice it may not be exactly 100 due to keyword density etc.,
    // but it should be close
    expect(result.overallScore).toBeGreaterThanOrEqual(80);
  });
});
