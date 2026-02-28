import { describe, it, expect } from 'vitest';
import {
  analyzeBullet,
  validateRoleBullets,
  validateAllBullets,
  ACTION_VERB_TIERS,
  WEAK_VERB_STARTS,
  type SeniorityLevel,
} from './bullet-validator';

// ── analyzeBullet() ─────────────────────────────────────────────────────

describe('analyzeBullet', () => {
  it('scores a perfect bullet with action verb + quantification highly', () => {
    const result = analyzeBullet(
      'Architected microservices platform serving 2M users, reducing latency by 40%'
    );
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.hasActionVerb).toBe(true);
    expect(result.hasQuantification).toBe(true);
    expect(result.actionVerbTier).toBe(3); // tier3_technical
    expect(result.issues).toHaveLength(0);
  });

  it('flags weak verb start as error', () => {
    const result = analyzeBullet(
      'Responsible for managing the engineering team and setting quarterly goals'
    );
    const weakIssue = result.issues.find((i) => i.type === 'weak_verb');
    expect(weakIssue).toBeDefined();
    expect(weakIssue!.severity).toBe('error');
    expect(result.score).toBeLessThan(50);
  });

  it('flags missing action verb as warning', () => {
    const result = analyzeBullet(
      'The system was redesigned for scalability across multiple data centers and availability zones'
    );
    const noVerbIssue = result.issues.find((i) => i.type === 'no_action_verb');
    expect(noVerbIssue).toBeDefined();
    expect(noVerbIssue!.severity).toBe('warning');
  });

  it('flags too-short bullets', () => {
    const result = analyzeBullet('Built API');
    const shortIssue = result.issues.find((i) => i.type === 'too_short');
    expect(shortIssue).toBeDefined();
    expect(result.charCount).toBeLessThan(50);
  });

  it('flags too-long bullets', () => {
    const longText =
      'Engineered ' +
      'a comprehensive distributed data pipeline that processed real-time streaming events from multiple sources including Kafka, Kinesis, and custom webhooks, performing complex transformations and aggregations before storing results in a multi-region data warehouse with 99.99% uptime SLA';
    const result = analyzeBullet(longText);
    const longIssue = result.issues.find((i) => i.type === 'too_long');
    expect(longIssue).toBeDefined();
    expect(result.charCount).toBeGreaterThan(250);
  });

  it('gives bonus for ideal-length bullet with action verb and metrics', () => {
    // ~150 chars with good action verb + quantification
    const result = analyzeBullet(
      'Streamlined CI/CD pipeline reducing deployment time by 65%, enabling 200+ daily releases across 15 microservices with zero downtime'
    );
    expect(result.charCount).toBeGreaterThanOrEqual(100);
    expect(result.charCount).toBeLessThanOrEqual(200);
    expect(result.hasActionVerb).toBe(true);
    expect(result.hasQuantification).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it('flags missing quantification as info', () => {
    const result = analyzeBullet(
      'Developed a new onboarding flow for the platform that improved user engagement significantly'
    );
    const noQuantIssue = result.issues.find((i) => i.type === 'no_quantification');
    expect(noQuantIssue).toBeDefined();
    expect(noQuantIssue!.severity).toBe('info');
  });

  it('flags generic language', () => {
    const result = analyzeBullet(
      'Results-driven professional who delivered critical projects on time and within budget expectations'
    );
    const genericIssue = result.issues.find((i) => i.type === 'generic_language');
    expect(genericIssue).toBeDefined();
    expect(genericIssue!.message).toContain('results-driven');
  });

  it('strips bullet prefix characters', () => {
    const bullet = analyzeBullet('• Deployed CI/CD pipeline with automated testing and monitoring');
    expect(bullet.text).toMatch(/^Deployed/);
    expect(bullet.text).not.toContain('•');

    const dash = analyzeBullet(
      '- Built scalable microservices architecture with containerized deployments'
    );
    expect(dash.text).toMatch(/^Built/);

    const star = analyzeBullet(
      '* Optimized database queries reducing response time across all endpoints'
    );
    expect(star.text).toMatch(/^Optimized/);
  });

  it('detects all 13 weak verb starts', () => {
    for (const weakVerb of WEAK_VERB_STARTS) {
      const result = analyzeBullet(
        `${weakVerb} the engineering team and all related technical initiatives`
      );
      const weakIssue = result.issues.find((i) => i.type === 'weak_verb');
      expect(weakIssue, `Expected weak_verb issue for "${weakVerb}"`).toBeDefined();
    }
  });

  it('detects tier 1 leadership verbs', () => {
    const result = analyzeBullet(
      'Spearheaded company-wide migration to cloud infrastructure reducing costs by 40%'
    );
    expect(result.actionVerbTier).toBe(1);
    expect(result.detectedVerb).toBe('spearheaded');
  });

  it('detects tier 5 analysis verbs', () => {
    const result = analyzeBullet(
      'Identified critical performance bottleneck in the payment processing system affecting 50K transactions'
    );
    expect(result.actionVerbTier).toBe(5);
    expect(result.detectedVerb).toBe('identified');
  });

  it('clamps score to 0-100 range', () => {
    // Stack negatives: weak verb + generic language + too short
    const result = analyzeBullet('Helped team player');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('detects various quantification patterns', () => {
    const patterns = [
      '$2M in annual savings from process optimization',
      'Improved performance by 50% through query optimization',
      'Served 100 users daily across multiple regions',
      'Achieved 3x throughput improvement via parallelization',
    ];
    for (const text of patterns) {
      const result = analyzeBullet(text);
      expect(result.hasQuantification, `Expected quantification in: "${text}"`).toBe(true);
    }
  });
});

// ── validateRoleBullets() ───────────────────────────────────────────────

describe('validateRoleBullets', () => {
  const goodBullets = [
    'Architected event-driven microservices handling 10M daily transactions with 99.9% uptime',
    'Streamlined deployment pipeline reducing release cycle from 2 weeks to 2 hours with automated testing',
    'Led migration of monolithic application to cloud-native architecture serving 5M monthly active users',
  ];

  it('accepts entry-level with 3 bullets in range', () => {
    const report = validateRoleBullets('Acme', 'Engineer', goodBullets, 'entry');
    expect(report.expectedRange).toEqual([3, 5]);
    expect(report.bulletCount).toBe(3);
    // No role-level count issues
    const countIssue = report.issues.find((i) => i.type === 'too_short' || i.type === 'too_long');
    expect(countIssue).toBeUndefined();
  });

  it('flags too few bullets for entry-level', () => {
    const report = validateRoleBullets('Acme', 'Engineer', ['Built API endpoints'], 'entry');
    const shortIssue = report.issues.find((i) => i.message.includes('Only'));
    expect(shortIssue).toBeDefined();
  });

  it('flags too many bullets for senior-level', () => {
    const tenBullets = Array.from(
      { length: 10 },
      (_, i) => `Delivered feature ${i} impacting 100K users across the platform`
    );
    const report = validateRoleBullets('Acme', 'Senior Engineer', tenBullets, 'senior');
    const longIssue = report.issues.find((i) => i.message.includes('bullets'));
    expect(longIssue).toBeDefined();
  });

  it('returns score 0 for empty bullets', () => {
    const report = validateRoleBullets('Acme', 'Engineer', [], 'mid');
    expect(report.roleScore).toBe(0);
    expect(report.bulletCount).toBe(0);
  });

  it('averages scores from mixed quality bullets', () => {
    const mixed = [
      'Architected distributed caching layer reducing API latency by 60% across 20 microservices',
      'Responsible for doing stuff and various other tasks assigned by management',
    ];
    const report = validateRoleBullets('Acme', 'Engineer', mixed, 'mid');
    const scores = report.bullets.map((b) => b.score);
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(report.roleScore).toBe(Math.round((scores[0] + scores[1]) / 2));
  });

  it('returns valid expected range for all seniority levels', () => {
    const levels: SeniorityLevel[] = ['entry', 'mid', 'senior', 'lead', 'principal', 'executive'];
    for (const level of levels) {
      const report = validateRoleBullets('X', 'Y', ['Built something'], level);
      expect(report.expectedRange[0]).toBeGreaterThan(0);
      expect(report.expectedRange[1]).toBeGreaterThanOrEqual(report.expectedRange[0]);
    }
  });
});

// ── validateAllBullets() ────────────────────────────────────────────────

describe('validateAllBullets', () => {
  it('computes overall score as average of role scores', () => {
    const report = validateAllBullets([
      {
        company: 'A',
        title: 'Engineer',
        bullets: [
          'Architected distributed systems handling 5M daily requests across 12 microservices',
        ],
        seniority: 'mid',
      },
      {
        company: 'B',
        title: 'Developer',
        bullets: ['Responsible for general maintenance and various support tasks for the team'],
        seniority: 'mid',
      },
    ]);
    expect(report.roles).toHaveLength(2);
    const avg = Math.round((report.roles[0].roleScore + report.roles[1].roleScore) / 2);
    expect(report.overallScore).toBe(avg);
  });

  it('handles empty roles array', () => {
    const report = validateAllBullets([]);
    expect(report.overallScore).toBe(0);
    expect(report.totalBullets).toBe(0);
    expect(report.bulletsWithIssues).toBe(0);
    expect(report.roles).toHaveLength(0);
  });

  it('deduplicates topIssues by type with occurrence count', () => {
    // Two roles, each with a weak verb bullet → topIssues should have count
    const report = validateAllBullets([
      {
        company: 'A',
        title: 'Eng',
        bullets: ['Responsible for managing cloud infrastructure and deployments'],
      },
      {
        company: 'B',
        title: 'Dev',
        bullets: ['Responsible for building frontend components and features'],
      },
    ]);
    const weakVerbTop = report.topIssues.find((i) => i.type === 'weak_verb');
    expect(weakVerbTop).toBeDefined();
    expect(weakVerbTop!.message).toContain('2 occurrence');
  });

  it('counts bulletsWithIssues correctly', () => {
    const report = validateAllBullets([
      {
        company: 'X',
        title: 'Y',
        bullets: [
          'Architected platform serving 10M users with 99.99% uptime SLA across three data centers', // good
          'Helped with stuff', // bad — weak verb + too short
        ],
      },
    ]);
    // Good bullet may have no_quantification info, but the weak one has guaranteed issues
    expect(report.bulletsWithIssues).toBeGreaterThanOrEqual(1);
  });

  it('limits topIssues to 5 entries max', () => {
    // Create many roles with diverse issues
    const roles = Array.from({ length: 10 }, (_, i) => ({
      company: `Co${i}`,
      title: `Title${i}`,
      bullets: [
        'Responsible for stuff',
        'x', // too short
        'Results-driven professional who is a team player and fast learner', // generic
      ],
    }));
    const report = validateAllBullets(roles);
    expect(report.topIssues.length).toBeLessThanOrEqual(5);
  });
});

// ── Constants ───────────────────────────────────────────────────────────

describe('Constants', () => {
  it('ACTION_VERB_TIERS has 5 tiers with 75 total verbs', () => {
    const tiers = Object.keys(ACTION_VERB_TIERS);
    expect(tiers).toHaveLength(5);
    const totalVerbs = Object.values(ACTION_VERB_TIERS).flat().length;
    expect(totalVerbs).toBe(75);
    for (const tier of tiers) {
      const verbs = ACTION_VERB_TIERS[tier as keyof typeof ACTION_VERB_TIERS];
      expect(verbs.length).toBeGreaterThan(0);
    }
  });

  it('WEAK_VERB_STARTS has 13 lowercase entries', () => {
    expect(WEAK_VERB_STARTS).toHaveLength(13);
    for (const verb of WEAK_VERB_STARTS) {
      expect(verb).toBe(verb.toLowerCase());
      expect(typeof verb).toBe('string');
    }
  });
});
