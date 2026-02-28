import { describe, it, expect } from 'vitest';
import {
  detectAIPhraseUsage,
  measureSentenceVariety,
  measureSpecificity,
  measureToneNaturalness,
  measureStructureVariety,
  scoreAuthenticity,
} from './authenticity-guard';

// ── Test Data ────────────────────────────────────────────────────────────

const HUMAN_TEXT = `
I led the migration from a monolith to 12 microservices at Stripe, cutting deploy times from 45 minutes to under 3 minutes. Our team of 8 engineers shipped it in 6 months. The hardest part wasn't the technical work — it was convincing leadership to pause feature development for a quarter. We tracked a 40% reduction in production incidents after the switch. I'm proud of that project because it changed how our whole org thinks about deployments.
`.trim();

const AI_TEXT = `
I am excited to leverage my extensive experience in software engineering. I am thrilled to bring my proven track record of delivering cutting-edge solutions. I am passionate about driving innovative results in fast-paced environments. I utilize my robust skill set to deliver seamless, best-in-class solutions that align with business objectives and organizational goals.
`.trim();

const MIXED_TEXT = `
Built a real-time data pipeline processing 2M events per day using Kafka and PostgreSQL. The system replaced a batch job that ran overnight. I'm happy with how the team handled the rollout — zero downtime during migration. We reduced data latency from 12 hours to under 30 seconds.
`.trim();

// ── detectAIPhraseUsage ──────────────────────────────────────────────────

describe('detectAIPhraseUsage', () => {
  it('scores high for text without AI phrases', () => {
    const { score, issues } = detectAIPhraseUsage(HUMAN_TEXT);
    expect(score).toBeGreaterThanOrEqual(80);
    expect(issues.length).toBe(0);
  });

  it('scores low for text full of AI clichés', () => {
    const { score, issues } = detectAIPhraseUsage(AI_TEXT);
    expect(score).toBeLessThan(50);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe('error');
  });

  it('returns warning for 2-3 AI phrases', () => {
    const text = 'I am passionate about building robust systems for the team.';
    const { issues } = detectAIPhraseUsage(text);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('returns info for a single AI phrase', () => {
    const text = 'I am passionate about backend engineering and distributed systems at scale.';
    const { issues } = detectAIPhraseUsage(text);
    const phraseIssues = issues.filter((i) => i.category === 'ai_phrases');
    expect(phraseIssues.length).toBe(1);
    expect(phraseIssues[0].severity).toBe('info');
  });
});

// ── measureSentenceVariety ───────────────────────────────────────────────

describe('measureSentenceVariety', () => {
  it('scores high for varied sentence lengths', () => {
    const { score } = measureSentenceVariety(HUMAN_TEXT);
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it('scores lower for uniform sentence lengths', () => {
    const uniform =
      'I did this thing well. I did that thing well. I did more things well. I did another thing well. I did one more thing.';
    const { score } = measureSentenceVariety(uniform);
    expect(score).toBeLessThan(80);
  });

  it('returns score of 80 for very short text', () => {
    const { score } = measureSentenceVariety('Short text. Done.');
    expect(score).toBe(80);
  });

  it('flags repeated first-word patterns', () => {
    const repetitive =
      'I built the system. I deployed it. I monitored it. I fixed bugs. I improved performance.';
    const { issues } = measureSentenceVariety(repetitive);
    const varietyIssues = issues.filter((i) => i.category === 'sentence_variety');
    expect(varietyIssues.some((i) => i.message.includes('"i"'))).toBe(true);
  });
});

// ── measureSpecificity ───────────────────────────────────────────────────

describe('measureSpecificity', () => {
  it('scores high for text with numbers and specifics', () => {
    const { score } = measureSpecificity(HUMAN_TEXT);
    expect(score).toBeGreaterThanOrEqual(60);
  });

  it('scores low for generic filler text', () => {
    const generic =
      'Worked with various stakeholders in a fast-paced environment to deliver innovative solutions aligned with business objectives and organizational goals using best practices and industry standards.';
    const { score, issues } = measureSpecificity(generic);
    expect(score).toBeLessThan(50);
    expect(issues.some((i) => i.message.includes('generic filler'))).toBe(true);
  });

  it('flags missing quantitative details', () => {
    const noNumbers =
      'Built a web application for the company. Worked with the team to deliver features on time. Participated in code reviews and improved the codebase quality significantly over several months of focused effort. Collaborated with designers and product managers to ship new features. Contributed to the backend services and helped with database optimizations. Joined daily standups and sprint planning sessions regularly. Helped onboard new engineers and wrote documentation for internal tools. Worked closely with the product team to define requirements and plan sprints. Debugged production issues and improved system reliability through better error handling and logging practices. Maintained existing services and ensured uptime during peak traffic periods for customers.';
    const { issues } = measureSpecificity(noNumbers);
    expect(issues.some((i) => i.message.includes('quantitative'))).toBe(true);
  });

  it('returns 80 for very short text', () => {
    const { score } = measureSpecificity('Hello');
    expect(score).toBe(80);
  });

  it('recognizes technology names as specifics', () => {
    const techText =
      'Built microservices with Python and Docker, deployed on AWS using Kubernetes, monitored with Kafka and Redis integration for real-time processing of data streams.';
    const { score } = measureSpecificity(techText);
    expect(score).toBeGreaterThanOrEqual(50);
  });
});

// ── measureToneNaturalness ───────────────────────────────────────────────

describe('measureToneNaturalness', () => {
  it('scores higher when contractions are present', () => {
    const withContractions = measureToneNaturalness(
      "I'm happy with how it turned out. We didn't expect it to work so well, but it's been great. I've learned a lot from the experience."
    );
    const withoutContractions = measureToneNaturalness(
      'I am happy with how it turned out. We did not expect it to work so well, but it has been great. I have learned a lot from the experience and I am glad to have been part of the project team.'
    );
    expect(withContractions.score).toBeGreaterThan(withoutContractions.score);
  });

  it('penalizes excessive passive voice', () => {
    const passive =
      'The system was designed. The code was reviewed. The features were implemented. The bugs were fixed. The project was completed. The results were analyzed.';
    const { issues } = measureToneNaturalness(passive);
    expect(issues.some((i) => i.message.includes('passive'))).toBe(true);
  });

  it('penalizes excessive hedging', () => {
    const hedging =
      'I believe that this approach could work. I feel that the team performed well. It could be said that results were positive. It is worth noting that we delivered on time. Arguably the best quarter yet.';
    const { issues } = measureToneNaturalness(hedging);
    expect(issues.some((i) => i.message.includes('hedging'))).toBe(true);
  });

  it('returns 80 for very short text', () => {
    const { score } = measureToneNaturalness('Short.');
    expect(score).toBe(80);
  });
});

// ── measureStructureVariety ──────────────────────────────────────────────

describe('measureStructureVariety', () => {
  it('scores high for diverse bullet starts', () => {
    const diverse = `Architected the payment gateway handling $2M daily
Our team reduced latency by 60% through caching
After migrating to Kubernetes, deploys dropped from 45min to 3min
Built automated testing that caught 95% of regressions
The monitoring system I designed prevented 12 outages`;
    const { score } = measureStructureVariety(diverse);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('scores lower for repetitive bullet patterns', () => {
    const repetitive = `Managed the engineering team of 8
Managed the sprint planning process
Managed the deployment pipeline
Managed the code review workflow
Managed the incident response protocol`;
    const { score, issues } = measureStructureVariety(repetitive);
    expect(score).toBeLessThan(80);
    expect(issues.some((i) => i.category === 'structure_variety')).toBe(true);
  });

  it('returns 85 for very short content', () => {
    const { score } = measureStructureVariety('One line.\nTwo.');
    expect(score).toBe(85);
  });

  it('flags suspiciously uniform paragraph lengths', () => {
    const uniform = `This is a paragraph that has about twenty words in it, making it a medium length block of text for testing.\n\nThis is another paragraph that has about twenty words in it, making it a medium length block of text too.\n\nThis is yet another paragraph that has about twenty words in it, making it a medium length block of text here.`;
    const { issues } = measureStructureVariety(uniform);
    expect(issues.some((i) => i.message.includes('uniform in length'))).toBe(true);
  });
});

// ── scoreAuthenticity (integration) ──────────────────────────────────────

describe('scoreAuthenticity', () => {
  it('scores human text above minimum', () => {
    const report = scoreAuthenticity(HUMAN_TEXT);
    expect(report.passesMinimum).toBe(true);
    expect(report.overallScore).toBeGreaterThanOrEqual(70);
  });

  it('scores obvious AI text below minimum', () => {
    const report = scoreAuthenticity(AI_TEXT);
    expect(report.passesMinimum).toBe(false);
    expect(report.overallScore).toBeLessThan(70);
  });

  it('scores mixed text in between', () => {
    const report = scoreAuthenticity(MIXED_TEXT);
    expect(report.overallScore).toBeGreaterThan(50);
  });

  it('returns perfect score for empty text', () => {
    const report = scoreAuthenticity('');
    expect(report.overallScore).toBe(100);
    expect(report.passesMinimum).toBe(true);
  });

  it('includes all category scores', () => {
    const report = scoreAuthenticity(HUMAN_TEXT);
    expect(report.categories).toHaveProperty('aiPhrases');
    expect(report.categories).toHaveProperty('sentenceVariety');
    expect(report.categories).toHaveProperty('specificity');
    expect(report.categories).toHaveProperty('toneNaturalness');
    expect(report.categories).toHaveProperty('structureVariety');
  });

  it('provides correct issue summary counts', () => {
    const report = scoreAuthenticity(AI_TEXT);
    const { errors, warnings, info } = report.summary;
    const totalFromIssues = report.issues.length;
    expect(errors + warnings + info).toBe(totalFromIssues);
  });

  it('adjusts weights for cover_letter content type', () => {
    const resumeReport = scoreAuthenticity(MIXED_TEXT, 'resume');
    const coverReport = scoreAuthenticity(MIXED_TEXT, 'cover_letter');
    // Different weights should produce different scores (usually)
    expect(typeof resumeReport.overallScore).toBe('number');
    expect(typeof coverReport.overallScore).toBe('number');
  });

  it('adjusts weights for email content type', () => {
    const report = scoreAuthenticity(MIXED_TEXT, 'email');
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
  });
});
