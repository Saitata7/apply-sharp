/**
 * Skill Categorizer — Groups skills into 13+ ATS-safe categories
 *
 * Extracted from ResumeGenerator.tsx. Pure function that takes profile skills,
 * role data, and optional JD keywords and returns categorized skill groups
 * for use in DOCX, PDF, and preview renderers.
 */

import type {
  SkillsWithContext,
  GeneratedProfile,
  MasterProfile,
} from '@shared/types/master-profile.types';
import { normalizeSkillName } from '@core/resume/layout-engine';

export interface KeywordWithFrequency {
  keyword: string;
  count: number;
  profileCount?: number;
}

export interface SkillCategory {
  category: string;
  skills: string[];
}

// Skills to exclude — generic technical terms that aren't real skills
const EXACT_SKIP = [
  'development',
  'database concepts',
  'api design and development',
  'api design',
  'web development',
  'agile methodologies',
  'software engineering',
  'backend development',
  'frontend development',
  'full-stack',
  'full stack',
  'object-oriented',
  'test-driven',
  'data processing',
  'data processing and optimization',
  'cloud computing',
  'sdlc',
  'oop',
];

// Soft skills and non-technical descriptors
const SOFT_SKIP = [
  'communication',
  'leadership',
  'teamwork',
  'team collaboration',
  'problem solving',
  'analytical',
  'critical thinking',
  'time management',
  'collaboration',
  'interpersonal',
  'decision making',
  'adaptability',
  'attention to detail',
  'organizational',
  'mentoring',
  'cross-functional',
  'stakeholder',
  'project management',
  'technical leadership',
];

// Acronym expansions for ATS — expand lone acronyms to "Full Form (ACRONYM)"
const ACRONYM_EXPANSIONS: Record<string, string> = {
  AWS: 'Amazon Web Services (AWS)',
  GCP: 'Google Cloud Platform (GCP)',
  ML: 'Machine Learning (ML)',
  NLP: 'Natural Language Processing (NLP)',
  AI: 'Artificial Intelligence (AI)',
  ETL: 'Extract, Transform, Load (ETL)',
};

// Category display order
const CATEGORY_ORDER = [
  'Programming Languages',
  'Web Frameworks',
  'Frontend Technologies',
  'Databases',
  'Cloud & DevOps',
  'APIs & Messaging',
  'Architecture & Design',
  'Security',
  'Testing & QA',
  'AI/ML Technologies',
  'Data & Analytics',
  'Version Control & PM',
  'Design Tools',
  'Office & Productivity',
  'Technical Skills',
];

/**
 * Categorize a skill name into one of 13+ categories.
 * Returns '__SKIP__' for skills that should be excluded (generic terms, soft skills).
 */
export function categorizeSkill(name: string, existing?: string): string {
  const n = name.toLowerCase().trim();

  // Skip check first
  if (EXACT_SKIP.includes(n)) return '__SKIP__';
  if (SOFT_SKIP.some((s) => n.includes(s))) return '__SKIP__';

  // Programming Languages
  if (
    /^(java|javascript|typescript|python|c#|c\+\+|golang|go|rust|scala|ruby|php|swift|kotlin|sql|r|matlab|perl|bash|shell)$/i.test(
      name
    )
  )
    return 'Programming Languages';

  // Web Frameworks
  if (
    [
      'spring',
      'node',
      'express',
      'fastapi',
      'flask',
      'django',
      'rails',
      '.net',
      'nestjs',
      'asp.net',
    ].some((f) => n.includes(f))
  )
    return 'Web Frameworks';

  // Frontend Technologies
  if (
    [
      'react',
      'angular',
      'vue',
      'html',
      'css',
      'bootstrap',
      'tailwind',
      'redux',
      'next',
      'sass',
      'webpack',
    ].some((f) => n.includes(f))
  )
    return 'Frontend Technologies';

  // Databases
  if (
    [
      'mongodb',
      'postgresql',
      'mysql',
      'redis',
      'firebase',
      'oracle',
      'cassandra',
      'dynamodb',
      'elasticsearch',
      'sql server',
      'sqlite',
      'mariadb',
      'snowflake',
      'bigquery',
    ].some((d) => n.includes(d))
  )
    return 'Databases';

  // Cloud & DevOps
  if (
    [
      'aws',
      'azure',
      'gcp',
      'docker',
      'kubernetes',
      'terraform',
      'jenkins',
      'ci/cd',
      'devops',
      'lambda',
      'ec2',
      's3',
      'cloudformation',
      'ansible',
      'nginx',
      'linux',
      'unix',
      'grafana',
      'loki',
      'prometheus',
      'datadog',
      'new relic',
      'elk',
      'monitoring',
    ].some((c) => n.includes(c))
  )
    return 'Cloud & DevOps';

  // Testing & Automation
  if (
    [
      'junit',
      'mockito',
      'cypress',
      'jest',
      'pytest',
      'selenium',
      'postman',
      'testing',
      'qa',
      'automation',
    ].some((t) => n.includes(t))
  )
    return 'Testing & QA';

  // AI/ML Technologies
  if (
    [
      'tensorflow',
      'pytorch',
      'keras',
      'scikit',
      'mlflow',
      'openai',
      'llm',
      'machine learning',
      'deep learning',
      'nlp',
      'neural',
      'opencv',
      'computer vision',
      'hugging',
      'ai/ml',
      'langchain',
    ].some((m) => n.includes(m))
  )
    return 'AI/ML Technologies';

  // Data & Analytics
  if (
    [
      'pandas',
      'numpy',
      'tableau',
      'powerbi',
      'power bi',
      'excel',
      'looker',
      'data analysis',
      'data visualization',
      'analytics',
      'statistical',
      'statistics',
      'big data',
      'spark',
      'hadoop',
      'etl',
      'data warehouse',
      'business intelligence',
      'bi ',
    ].some((d) => n.includes(d))
  )
    return 'Data & Analytics';

  // Version Control & PM
  if (
    [
      'git',
      'github',
      'gitlab',
      'bitbucket',
      'jira',
      'confluence',
      'agile',
      'scrum',
      'kanban',
      'trello',
      'asana',
    ].some((v) => n.includes(v))
  )
    return 'Version Control & PM';

  // APIs & Messaging
  if (
    ['rest', 'graphql', 'grpc', 'api', 'kafka', 'rabbitmq', 'soap', 'web services'].some((a) =>
      n.includes(a)
    )
  )
    return 'APIs & Messaging';

  // Architecture & Design
  if (
    [
      'microservices',
      'architecture',
      'system design',
      'design patterns',
      'solid',
      'distributed systems',
      'event-driven',
      'event driven',
      'cqrs',
      'event sourcing',
      'domain-driven',
      'ddd',
      'scalability',
      'high availability',
      'load balancing',
    ].some((a) => n.includes(a))
  )
    return 'Architecture & Design';

  // Security
  if (
    [
      'oauth',
      'jwt',
      'sso',
      'encryption',
      'owasp',
      'security',
      'authentication',
      'authorization',
      'rbac',
      'zero trust',
      'penetration',
      'vulnerability',
      'ssl',
      'tls',
      'saml',
      'ldap',
      'iam',
      'identity',
    ].some((s) => n.includes(s))
  )
    return 'Security';

  // Office & Productivity
  if (
    [
      'word',
      'powerpoint',
      'outlook',
      'microsoft office',
      'google sheets',
      'sharepoint',
      'teams',
      'slack',
      'notion',
    ].some((o) => n.includes(o))
  )
    return 'Office & Productivity';

  // Design & Diagramming Tools
  if (
    [
      'figma',
      'sketch',
      'adobe',
      'photoshop',
      'illustrator',
      'draw.io',
      'visio',
      'lucidchart',
      'miro',
      'canva',
      'xd',
    ].some((d) => n.includes(d))
  )
    return 'Design Tools';

  // Clean up malformed categories from existing
  if (existing) {
    const cleanCat = existing.replace(/^(ai|other|database|skills?):\s*/gi, '').trim();
    if (cleanCat && cleanCat.length > 2 && !cleanCat.includes(':')) {
      return cleanCat.charAt(0).toUpperCase() + cleanCat.slice(1);
    }
  }

  return 'Technical Skills';
}

/**
 * Build categorized skill groups for resume generation.
 *
 * Collects skills from profile data and role profiles, categorizes them,
 * deduplicates, expands acronyms, injects AI-added keywords,
 * and sorts by JD relevance.
 */
export function buildSkillCategories(
  skillsData: SkillsWithContext | undefined,
  role: GeneratedProfile | null,
  experience: MasterProfile['experience'],
  matchedKeywords?: KeywordWithFrequency[],
  addedKeywords?: string[]
): SkillCategory[] {
  const allSkills: Array<{ name: string; category?: string }> = [];

  if (skillsData?.programmingLanguages?.length) {
    skillsData.programmingLanguages.forEach((s) =>
      allSkills.push({ name: s.name, category: 'Programming Languages' })
    );
  }
  if (skillsData?.frameworks?.length) {
    skillsData.frameworks.forEach((s) =>
      allSkills.push({ name: s.name, category: s.category || 'Frameworks' })
    );
  }
  if (skillsData?.tools?.length) {
    skillsData.tools.forEach((s) =>
      allSkills.push({ name: s.name, category: s.category || 'Tools' })
    );
  }
  if (skillsData?.technical?.length) {
    skillsData.technical.forEach((s) =>
      allSkills.push({ name: s.name, category: s.category || 'Technical' })
    );
  }

  if (experience?.length) {
    experience.forEach((exp) => {
      exp.technologiesUsed?.forEach((t) => {
        if (!allSkills.some((s) => s.name.toLowerCase() === t.skill.toLowerCase())) {
          allSkills.push({ name: t.skill });
        }
      });
    });
  }

  if (role?.highlightedSkills?.length) {
    role.highlightedSkills.forEach((skill) => {
      if (!allSkills.some((s) => s.name.toLowerCase() === skill.toLowerCase())) {
        allSkills.push({ name: skill });
      }
    });
  }
  if (role?.atsKeywords?.length) {
    role.atsKeywords.forEach((skill) => {
      if (!allSkills.some((s) => s.name.toLowerCase() === skill.toLowerCase())) {
        allSkills.push({ name: skill });
      }
    });
  }

  const categoryMap = new Map<string, Set<string>>();
  // Track lowercase versions to prevent duplicates like "API design" / "API Design"
  const seenLower = new Map<string, string>(); // lowercase -> normalized display name
  allSkills.forEach((skill) => {
    const cat = categorizeSkill(skill.name, skill.category);
    if (cat === '__SKIP__') return;
    const normalized = normalizeSkillName(skill.name);
    // Split compound skills (e.g., "Kafka, RabbitMQ" from "kafka or rabbitmq")
    const parts = normalized.includes(', ') ? normalized.split(', ') : [normalized];
    parts.forEach((part) => {
      const lower = part.toLowerCase().trim();
      if (!lower || seenLower.has(lower)) return;
      seenLower.set(lower, part);
      if (!categoryMap.has(cat)) categoryMap.set(cat, new Set());
      categoryMap.get(cat)!.add(part);
    });
  });

  // Inject addedKeywords from AI tailoring (keywords found in JD, not yet in profile)
  if (addedKeywords?.length) {
    addedKeywords.forEach((kw) => {
      const normalized = normalizeSkillName(kw);
      const lower = normalized.toLowerCase().trim();
      if (!lower || seenLower.has(lower)) return;
      const cat = categorizeSkill(kw);
      if (cat === '__SKIP__') return;
      seenLower.set(lower, normalized);
      if (!categoryMap.has(cat)) categoryMap.set(cat, new Set());
      categoryMap.get(cat)!.add(normalized);
    });
  }

  // Acronym expansion for ATS — expand lone acronyms to "Full Form (ACRONYM)"
  const expandedLower = new Set<string>();
  categoryMap.forEach((skills) => {
    const expanded: string[] = [];
    const toRemove: string[] = [];
    skills.forEach((skill) => {
      const upper = skill.toUpperCase();
      if (ACRONYM_EXPANSIONS[upper] && !expandedLower.has(upper.toLowerCase())) {
        // Check if full form already exists in any category
        const fullFormLower = ACRONYM_EXPANSIONS[upper].toLowerCase();
        const alreadyHasFullForm = Array.from(seenLower.keys()).some(
          (k) => fullFormLower.includes(k) && k.length > upper.length
        );
        if (!alreadyHasFullForm) {
          toRemove.push(skill);
          expanded.push(ACRONYM_EXPANSIONS[upper]);
          expandedLower.add(upper.toLowerCase());
        }
      }
    });
    toRemove.forEach((s) => skills.delete(s));
    expanded.forEach((s) => skills.add(s));
  });

  // Build JD-matched keyword set for sorting
  const jdMatchedLower = new Set<string>();
  if (matchedKeywords?.length) {
    matchedKeywords.forEach((kw) => jdMatchedLower.add(kw.keyword.toLowerCase().trim()));
  }

  const result: SkillCategory[] = [];
  CATEGORY_ORDER.forEach((cat) => {
    const skills = categoryMap.get(cat);
    if (skills && skills.size > 0) {
      const arr = Array.from(skills);
      // Sort JD-matched skills to front within category
      if (jdMatchedLower.size > 0) {
        arr.sort((a, b) => {
          const aMatch = jdMatchedLower.has(a.toLowerCase()) ? 1 : 0;
          const bMatch = jdMatchedLower.has(b.toLowerCase()) ? 1 : 0;
          return bMatch - aMatch;
        });
      }
      result.push({ category: cat, skills: arr });
    }
  });
  // Add any remaining categories not in the order
  categoryMap.forEach((skills, cat) => {
    if (!CATEGORY_ORDER.includes(cat) && skills.size > 0 && cat !== '__SKIP__') {
      const arr = Array.from(skills);
      if (jdMatchedLower.size > 0) {
        arr.sort((a, b) => {
          const aMatch = jdMatchedLower.has(a.toLowerCase()) ? 1 : 0;
          const bMatch = jdMatchedLower.has(b.toLowerCase()) ? 1 : 0;
          return bMatch - aMatch;
        });
      }
      result.push({ category: cat, skills: arr });
    }
  });

  // Reorder categories: those with more JD matches come first
  if (jdMatchedLower.size > 0) {
    result.sort((a, b) => {
      const aMatches = a.skills.filter((s) => jdMatchedLower.has(s.toLowerCase())).length;
      const bMatches = b.skills.filter((s) => jdMatchedLower.has(s.toLowerCase())).length;
      if (bMatches !== aMatches) return bMatches - aMatches;
      return 0; // Keep original order if tie
    });
  }

  return result;
}
