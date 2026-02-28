/**
 * Skills Gap Analyzer
 *
 * Takes QuickATSScore results and categorizes missing keywords into:
 * - Critical (dealbreaker), Addressable (learnable), Minor (nice-to-have)
 * - Groups by skill area with learning resources and roadmap
 */

import type { QuickATSScore, KeywordWithWeight } from './hybrid-scorer';
import { getSkillAreaForKeyword } from './keywords';

// ── Types ────────────────────────────────────────────────────────────────

export interface LearningResource {
  estimatedHours: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  freeResources: Array<{ name: string; type: 'course' | 'docs' | 'video' | 'tutorial' }>;
  transferableFrom: string[];
  framingTip?: string;
}

export type GapSeverity = 'critical' | 'addressable' | 'minor';

export interface CategorizedGap {
  keyword: string;
  severity: GapSeverity;
  weight: number;
  inRequirements: boolean;
  skillArea: string | null;
  learning?: LearningResource;
}

export interface AreaGapGroup {
  area: string;
  gaps: CategorizedGap[];
  totalWeight: number;
  topPriority: GapSeverity;
}

export interface RoadmapItem {
  keyword: string;
  severity: GapSeverity;
  estimatedHours: number | null;
  reason: string;
  actionText: string;
}

export interface GapAnalysisResult {
  gaps: CategorizedGap[];
  gapsByArea: AreaGapGroup[];
  roadmap: RoadmapItem[];
  summary: {
    critical: number;
    addressable: number;
    minor: number;
    total: number;
    topAreaToFocus: string | null;
  };
}

// ── Area Display Names ───────────────────────────────────────────────────

const AREA_DISPLAY_NAMES: Record<string, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  database: 'Database',
  devops: 'DevOps',
  testing: 'Testing',
  architecture: 'Architecture',
  mobile: 'Mobile',
  'ml-ai': 'AI / Machine Learning',
  security: 'Security',
  'data-analysis': 'Data Analysis',
  'data-visualization': 'Data Visualization',
  'bi-tools': 'BI Tools',
  programming: 'Programming',
  'ml-statistics': 'Statistics',
  'data-engineering': 'Data Engineering',
  'management-leadership': 'Management',
  operations: 'Operations',
  strategy: 'Strategy',
  'finance-accounting': 'Finance',
  'project-management': 'Project Management',
  communication: 'Communication',
  'technical-design': 'Technical Design',
  'project-engineering': 'Engineering',
  'quality-compliance': 'Quality & Compliance',
  manufacturing: 'Manufacturing',
  safety: 'Safety',
  'technical-analysis': 'Technical Analysis',
  'ux-design': 'UX Design',
  'ui-design': 'UI Design',
  'graphic-design': 'Graphic Design',
  'design-tools': 'Design Tools',
  'motion-design': 'Motion Design',
  'digital-marketing': 'Digital Marketing',
  'content-marketing': 'Content Marketing',
  'social-media': 'Social Media',
  'brand-marketing': 'Brand Marketing',
  'marketing-analytics': 'Marketing Analytics',
  'marketing-tools': 'Marketing Tools',
};

// ── Learning Resources Map ───────────────────────────────────────────────

export const LEARNING_RESOURCES: Record<string, LearningResource> = {
  // ── Frontend ───────────────────────────────────────
  react: {
    estimatedHours: 60,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'React Official Docs (react.dev)', type: 'docs' },
      { name: 'React Tutorial for Beginners (react.dev)', type: 'tutorial' },
    ],
    transferableFrom: ['javascript', 'vue', 'angular', 'html', 'css'],
    framingTip: 'Highlight component-based UI experience from any framework',
  },
  angular: {
    estimatedHours: 80,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'Angular Official Tutorial', type: 'tutorial' },
      { name: 'Angular University (free tier)', type: 'course' },
    ],
    transferableFrom: ['typescript', 'react', 'vue', 'rxjs'],
    framingTip: 'Emphasize TypeScript and component architecture experience',
  },
  vue: {
    estimatedHours: 40,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Vue.js Official Guide', type: 'docs' },
      { name: 'Vue Mastery (free intro)', type: 'course' },
    ],
    transferableFrom: ['react', 'angular', 'javascript', 'html'],
  },
  'next.js': {
    estimatedHours: 40,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'Next.js Learn Course (nextjs.org)', type: 'tutorial' },
      { name: 'Next.js Docs', type: 'docs' },
    ],
    transferableFrom: ['react', 'node.js', 'typescript'],
  },
  svelte: {
    estimatedHours: 20,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Svelte Interactive Tutorial', type: 'tutorial' },
      { name: 'Svelte Docs', type: 'docs' },
    ],
    transferableFrom: ['react', 'vue', 'javascript'],
  },
  typescript: {
    estimatedHours: 30,
    difficulty: 'beginner',
    freeResources: [
      { name: 'TypeScript Handbook (typescriptlang.org)', type: 'docs' },
      { name: 'TypeScript Deep Dive (free book)', type: 'tutorial' },
    ],
    transferableFrom: ['javascript', 'java', 'c#'],
    framingTip: 'If you know JavaScript, mention typed language experience',
  },
  tailwind: {
    estimatedHours: 15,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Tailwind CSS Docs', type: 'docs' },
      { name: 'Tailwind CSS YouTube Crash Course', type: 'video' },
    ],
    transferableFrom: ['css', 'bootstrap', 'sass'],
  },
  css: {
    estimatedHours: 40,
    difficulty: 'beginner',
    freeResources: [
      { name: 'MDN CSS Guide', type: 'docs' },
      { name: 'CSS-Tricks', type: 'tutorial' },
    ],
    transferableFrom: ['html', 'sass', 'less'],
  },
  html: {
    estimatedHours: 15,
    difficulty: 'beginner',
    freeResources: [
      { name: 'MDN HTML Guide', type: 'docs' },
      { name: 'freeCodeCamp HTML Course', type: 'course' },
    ],
    transferableFrom: ['xml', 'markdown'],
  },

  // ── Backend ────────────────────────────────────────
  'node.js': {
    estimatedHours: 50,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'Node.js Official Docs', type: 'docs' },
      { name: 'The Odin Project - Node.js', type: 'course' },
    ],
    transferableFrom: ['javascript', 'express', 'typescript'],
  },
  python: {
    estimatedHours: 40,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Python Official Tutorial', type: 'docs' },
      { name: 'Automate the Boring Stuff (free book)', type: 'tutorial' },
    ],
    transferableFrom: ['ruby', 'javascript', 'r'],
  },
  java: {
    estimatedHours: 80,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'Java Official Tutorials (Oracle)', type: 'docs' },
      { name: 'MOOC.fi Java Course', type: 'course' },
    ],
    transferableFrom: ['c#', 'kotlin', 'c++', 'typescript'],
  },
  go: {
    estimatedHours: 40,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'A Tour of Go (go.dev)', type: 'tutorial' },
      { name: 'Go by Example', type: 'tutorial' },
    ],
    transferableFrom: ['c', 'rust', 'python', 'java'],
    framingTip: 'Highlight systems programming or concurrent programming experience',
  },
  rust: {
    estimatedHours: 100,
    difficulty: 'advanced',
    freeResources: [
      { name: 'The Rust Book (free)', type: 'docs' },
      { name: 'Rustlings (exercises)', type: 'tutorial' },
    ],
    transferableFrom: ['c', 'c++', 'go'],
  },
  spring: {
    estimatedHours: 60,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'Spring.io Guides', type: 'docs' },
      { name: 'Spring Boot Tutorial (Baeldung)', type: 'tutorial' },
    ],
    transferableFrom: ['java', 'django', 'express'],
  },
  django: {
    estimatedHours: 40,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'Django Official Tutorial', type: 'tutorial' },
      { name: 'Django Girls Tutorial', type: 'tutorial' },
    ],
    transferableFrom: ['python', 'flask', 'rails'],
  },
  express: {
    estimatedHours: 20,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Express.js Getting Started', type: 'docs' },
      { name: 'MDN Express Tutorial', type: 'tutorial' },
    ],
    transferableFrom: ['node.js', 'javascript', 'fastify'],
  },
  fastapi: {
    estimatedHours: 20,
    difficulty: 'beginner',
    freeResources: [
      { name: 'FastAPI Official Tutorial', type: 'docs' },
      { name: 'FastAPI Full Course (YouTube)', type: 'video' },
    ],
    transferableFrom: ['python', 'flask', 'django'],
  },
  flask: {
    estimatedHours: 20,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Flask Mega-Tutorial (Miguel Grinberg)', type: 'tutorial' },
      { name: 'Flask Official Docs', type: 'docs' },
    ],
    transferableFrom: ['python', 'django', 'express'],
  },

  // ── Database ───────────────────────────────────────
  postgresql: {
    estimatedHours: 40,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'PostgreSQL Official Tutorial', type: 'docs' },
      { name: 'PostgreSQL Exercises (pgexercises.com)', type: 'tutorial' },
    ],
    transferableFrom: ['sql', 'mysql', 'oracle', 'sqlite'],
  },
  mongodb: {
    estimatedHours: 30,
    difficulty: 'beginner',
    freeResources: [
      { name: 'MongoDB University (free courses)', type: 'course' },
      { name: 'MongoDB Manual', type: 'docs' },
    ],
    transferableFrom: ['sql', 'dynamodb', 'firebase'],
  },
  redis: {
    estimatedHours: 15,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Redis University (free)', type: 'course' },
      { name: 'Try Redis (interactive)', type: 'tutorial' },
    ],
    transferableFrom: ['memcached', 'caching concepts'],
  },
  mysql: {
    estimatedHours: 30,
    difficulty: 'beginner',
    freeResources: [
      { name: 'MySQL Official Tutorial', type: 'docs' },
      { name: 'SQLBolt (interactive)', type: 'tutorial' },
    ],
    transferableFrom: ['sql', 'postgresql', 'sqlite'],
  },
  dynamodb: {
    estimatedHours: 25,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'DynamoDB Guide (dynamodbguide.com)', type: 'tutorial' },
      { name: 'AWS DynamoDB Docs', type: 'docs' },
    ],
    transferableFrom: ['mongodb', 'nosql', 'aws'],
  },
  elasticsearch: {
    estimatedHours: 40,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'Elasticsearch Official Guide', type: 'docs' },
      { name: 'Elastic Training (free courses)', type: 'course' },
    ],
    transferableFrom: ['sql', 'lucene', 'solr'],
  },
  sql: {
    estimatedHours: 25,
    difficulty: 'beginner',
    freeResources: [
      { name: 'SQLBolt (interactive)', type: 'tutorial' },
      { name: 'Mode Analytics SQL Tutorial', type: 'tutorial' },
    ],
    transferableFrom: ['excel', 'data analysis'],
  },

  // ── DevOps / Cloud ─────────────────────────────────
  docker: {
    estimatedHours: 40,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'Docker Official Get Started', type: 'tutorial' },
      { name: 'Docker Docs', type: 'docs' },
    ],
    transferableFrom: ['linux', 'virtual machines', 'command line'],
    framingTip: 'Highlight any containerization, VM, or deployment automation experience',
  },
  kubernetes: {
    estimatedHours: 100,
    difficulty: 'advanced',
    freeResources: [
      { name: 'Kubernetes Official Tutorials', type: 'docs' },
      { name: 'KodeKloud Free Labs', type: 'course' },
    ],
    transferableFrom: ['docker', 'devops', 'cloud', 'linux'],
  },
  terraform: {
    estimatedHours: 40,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'HashiCorp Learn (free tutorials)', type: 'tutorial' },
      { name: 'Terraform Docs', type: 'docs' },
    ],
    transferableFrom: ['aws', 'gcp', 'azure', 'cloudformation'],
  },
  aws: {
    estimatedHours: 80,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'AWS Free Tier + Getting Started', type: 'docs' },
      { name: 'AWS Skill Builder (free courses)', type: 'course' },
    ],
    transferableFrom: ['gcp', 'azure', 'cloud computing'],
    framingTip: 'Mention any cloud platform experience — skills are transferable',
  },
  gcp: {
    estimatedHours: 60,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'Google Cloud Skills Boost (free tier)', type: 'course' },
      { name: 'GCP Docs', type: 'docs' },
    ],
    transferableFrom: ['aws', 'azure', 'cloud computing'],
  },
  azure: {
    estimatedHours: 60,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'Microsoft Learn (free paths)', type: 'course' },
      { name: 'Azure Docs', type: 'docs' },
    ],
    transferableFrom: ['aws', 'gcp', 'cloud computing'],
  },
  'ci/cd': {
    estimatedHours: 25,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'GitHub Actions Docs', type: 'docs' },
      { name: 'GitLab CI Tutorial', type: 'tutorial' },
    ],
    transferableFrom: ['git', 'docker', 'jenkins', 'bash'],
  },
  jenkins: {
    estimatedHours: 30,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'Jenkins User Documentation', type: 'docs' },
      { name: 'Jenkins Tutorial (Tutorialspoint)', type: 'tutorial' },
    ],
    transferableFrom: ['ci/cd', 'bash', 'groovy'],
  },
  linux: {
    estimatedHours: 40,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Linux Journey (linuxjourney.com)', type: 'tutorial' },
      { name: 'The Linux Command Line (free book)', type: 'docs' },
    ],
    transferableFrom: ['macos', 'bash', 'command line'],
  },
  'github actions': {
    estimatedHours: 15,
    difficulty: 'beginner',
    freeResources: [
      { name: 'GitHub Actions Quickstart', type: 'docs' },
      { name: 'GitHub Actions Tutorial (YouTube)', type: 'video' },
    ],
    transferableFrom: ['ci/cd', 'yaml', 'bash', 'git'],
  },

  // ── Architecture ───────────────────────────────────
  microservices: {
    estimatedHours: 60,
    difficulty: 'advanced',
    freeResources: [
      { name: 'microservices.io (patterns)', type: 'docs' },
      { name: 'Martin Fowler - Microservices', type: 'tutorial' },
    ],
    transferableFrom: ['monolith', 'api design', 'docker', 'message queues'],
    framingTip: 'Describe any service decomposition or distributed systems work',
  },
  graphql: {
    estimatedHours: 25,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'GraphQL Official Learn', type: 'tutorial' },
      { name: 'Apollo GraphQL Tutorial', type: 'tutorial' },
    ],
    transferableFrom: ['rest api', 'sql', 'api design'],
  },
  'rest api': {
    estimatedHours: 15,
    difficulty: 'beginner',
    freeResources: [
      { name: 'RESTful API Design (restfulapi.net)', type: 'docs' },
      { name: 'MDN HTTP Overview', type: 'docs' },
    ],
    transferableFrom: ['http', 'api design', 'web development'],
  },
  kafka: {
    estimatedHours: 40,
    difficulty: 'advanced',
    freeResources: [
      { name: 'Apache Kafka Quickstart', type: 'docs' },
      { name: 'Confluent Developer (free courses)', type: 'course' },
    ],
    transferableFrom: ['rabbitmq', 'message queues', 'event-driven'],
  },
  rabbitmq: {
    estimatedHours: 20,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'RabbitMQ Official Tutorials', type: 'tutorial' },
      { name: 'RabbitMQ Docs', type: 'docs' },
    ],
    transferableFrom: ['kafka', 'message queues', 'sqs'],
  },
  grpc: {
    estimatedHours: 20,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'gRPC Official Guide', type: 'docs' },
      { name: 'gRPC Quick Start', type: 'tutorial' },
    ],
    transferableFrom: ['rest api', 'protobuf', 'api design'],
  },

  // ── Data / ML ──────────────────────────────────────
  pandas: {
    estimatedHours: 25,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Pandas Getting Started', type: 'docs' },
      { name: 'Kaggle Pandas Course (free)', type: 'course' },
    ],
    transferableFrom: ['python', 'sql', 'excel', 'r'],
  },
  tensorflow: {
    estimatedHours: 80,
    difficulty: 'advanced',
    freeResources: [
      { name: 'TensorFlow Official Tutorials', type: 'tutorial' },
      { name: 'Deep Learning Specialization (Coursera audit)', type: 'course' },
    ],
    transferableFrom: ['python', 'numpy', 'pytorch', 'math'],
  },
  pytorch: {
    estimatedHours: 60,
    difficulty: 'advanced',
    freeResources: [
      { name: 'PyTorch Official Tutorials', type: 'tutorial' },
      { name: 'Fast.ai Practical Deep Learning (free)', type: 'course' },
    ],
    transferableFrom: ['python', 'numpy', 'tensorflow', 'math'],
  },
  spark: {
    estimatedHours: 60,
    difficulty: 'advanced',
    freeResources: [
      { name: 'Apache Spark Quick Start', type: 'docs' },
      { name: 'Databricks Free Training', type: 'course' },
    ],
    transferableFrom: ['python', 'sql', 'hadoop', 'data engineering'],
  },
  tableau: {
    estimatedHours: 25,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Tableau Public (free)', type: 'tutorial' },
      { name: 'Tableau eLearning', type: 'course' },
    ],
    transferableFrom: ['excel', 'power bi', 'data visualization'],
  },
  dbt: {
    estimatedHours: 20,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'dbt Learn (free courses)', type: 'course' },
      { name: 'dbt Docs', type: 'docs' },
    ],
    transferableFrom: ['sql', 'data engineering', 'etl'],
  },

  // ── Testing ────────────────────────────────────────
  jest: {
    estimatedHours: 15,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Jest Official Getting Started', type: 'docs' },
      { name: 'Testing JavaScript (Kent C. Dodds)', type: 'tutorial' },
    ],
    transferableFrom: ['mocha', 'vitest', 'jasmine', 'unit testing'],
  },
  pytest: {
    estimatedHours: 15,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Pytest Official Docs', type: 'docs' },
      { name: 'Real Python Pytest Tutorial', type: 'tutorial' },
    ],
    transferableFrom: ['python', 'unittest', 'unit testing'],
  },
  cypress: {
    estimatedHours: 20,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Cypress Official Docs', type: 'docs' },
      { name: 'Cypress Real World App (free)', type: 'tutorial' },
    ],
    transferableFrom: ['selenium', 'playwright', 'e2e testing'],
  },
  selenium: {
    estimatedHours: 30,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'Selenium Official Docs', type: 'docs' },
      { name: 'Selenium WebDriver Tutorial', type: 'tutorial' },
    ],
    transferableFrom: ['cypress', 'playwright', 'e2e testing'],
  },
  playwright: {
    estimatedHours: 15,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Playwright Official Docs', type: 'docs' },
      { name: 'Playwright Getting Started', type: 'tutorial' },
    ],
    transferableFrom: ['cypress', 'selenium', 'puppeteer'],
  },

  // ── Other common ───────────────────────────────────
  git: {
    estimatedHours: 15,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Pro Git Book (free)', type: 'docs' },
      { name: 'Learn Git Branching (interactive)', type: 'tutorial' },
    ],
    transferableFrom: ['svn', 'version control'],
  },
  agile: {
    estimatedHours: 10,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Agile Manifesto + Scrum Guide (free)', type: 'docs' },
      { name: 'Atlassian Agile Coach', type: 'tutorial' },
    ],
    transferableFrom: ['project management', 'scrum', 'kanban'],
  },
  scrum: {
    estimatedHours: 10,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Scrum Guide (free)', type: 'docs' },
      { name: 'Scrum.org Learning Path', type: 'tutorial' },
    ],
    transferableFrom: ['agile', 'kanban', 'project management'],
  },
  javascript: {
    estimatedHours: 60,
    difficulty: 'beginner',
    freeResources: [
      { name: 'MDN JavaScript Guide', type: 'docs' },
      { name: 'javascript.info (free)', type: 'tutorial' },
    ],
    transferableFrom: ['python', 'typescript', 'ruby'],
  },
  'c++': {
    estimatedHours: 100,
    difficulty: 'advanced',
    freeResources: [
      { name: 'LearnCpp.com (free)', type: 'tutorial' },
      { name: 'C++ Reference (cppreference.com)', type: 'docs' },
    ],
    transferableFrom: ['c', 'java', 'rust'],
  },
  kotlin: {
    estimatedHours: 30,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Kotlin Official Docs', type: 'docs' },
      { name: 'Kotlin Koans (interactive)', type: 'tutorial' },
    ],
    transferableFrom: ['java', 'scala', 'swift'],
  },
  swift: {
    estimatedHours: 40,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'Swift.org Documentation', type: 'docs' },
      { name: 'Hacking with Swift (free)', type: 'tutorial' },
    ],
    transferableFrom: ['kotlin', 'objective-c', 'java'],
  },
  'react native': {
    estimatedHours: 40,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'React Native Official Docs', type: 'docs' },
      { name: 'React Native Express (free)', type: 'tutorial' },
    ],
    transferableFrom: ['react', 'javascript', 'mobile development'],
  },
  flutter: {
    estimatedHours: 50,
    difficulty: 'intermediate',
    freeResources: [
      { name: 'Flutter Official Codelabs', type: 'tutorial' },
      { name: 'Flutter Docs', type: 'docs' },
    ],
    transferableFrom: ['dart', 'react native', 'mobile development'],
  },
  nginx: {
    estimatedHours: 15,
    difficulty: 'beginner',
    freeResources: [
      { name: 'Nginx Beginner Guide', type: 'docs' },
      { name: 'DigitalOcean Nginx Tutorials', type: 'tutorial' },
    ],
    transferableFrom: ['apache', 'web servers', 'linux'],
  },
};

// ── Core Analysis Function ───────────────────────────────────────────────

const SEVERITY_ORDER: Record<GapSeverity, number> = { critical: 0, addressable: 1, minor: 2 };

function classifySeverity(kw: KeywordWithWeight): GapSeverity {
  if (kw.weight >= 3 && kw.inRequirements) return 'critical';
  if (kw.weight >= 2 || kw.inRequirements) return 'addressable';
  return 'minor';
}

function buildReason(kw: KeywordWithWeight): string {
  const parts: string[] = [];
  if (kw.inRequirements) parts.push('Required in JD');
  if (kw.frequency > 1) parts.push(`appears ${kw.frequency} times`);
  else parts.push('mentioned in JD');
  return parts.join(', ');
}

function buildActionText(gap: CategorizedGap): string {
  if (gap.learning) {
    const topResource = gap.learning.freeResources[0]?.name || 'online resources';
    const hours = gap.learning.estimatedHours;
    return `Learn ${gap.keyword} via ${topResource} (~${hours} hrs)`;
  }
  return `Research ${gap.keyword} — check official documentation`;
}

export function analyzeSkillGaps(
  quickScore: QuickATSScore,
  profileSkills: string[]
): GapAnalysisResult {
  const missingSet = new Set(quickScore.missingKeywords.map((k) => k.toLowerCase()));
  const profileSet = new Set(profileSkills.map((s) => s.toLowerCase()));

  // Get weighted data for missing keywords only
  const missingWeighted = quickScore.weightedKeywords.filter(
    (kw) => missingSet.has(kw.keyword.toLowerCase()) && !profileSet.has(kw.keyword.toLowerCase())
  );

  // Classify each gap
  const gaps: CategorizedGap[] = missingWeighted.map((kw) => ({
    keyword: kw.keyword,
    severity: classifySeverity(kw),
    weight: kw.weight,
    inRequirements: kw.inRequirements,
    skillArea: getSkillAreaForKeyword(kw.keyword),
    learning: LEARNING_RESOURCES[kw.keyword.toLowerCase()],
  }));

  // Sort by severity then weight
  gaps.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.weight - a.weight
  );

  // Group by skill area
  const areaMap = new Map<string, CategorizedGap[]>();
  for (const gap of gaps) {
    const area = gap.skillArea || 'other';
    if (!areaMap.has(area)) areaMap.set(area, []);
    areaMap.get(area)!.push(gap);
  }

  const gapsByArea: AreaGapGroup[] = Array.from(areaMap.entries())
    .map(([area, areaGaps]) => ({
      area: AREA_DISPLAY_NAMES[area] || area,
      gaps: areaGaps,
      totalWeight: areaGaps.reduce((sum, g) => sum + g.weight, 0),
      topPriority: areaGaps.reduce(
        (best, g) => (SEVERITY_ORDER[g.severity] < SEVERITY_ORDER[best] ? g.severity : best),
        'minor' as GapSeverity
      ),
    }))
    .sort((a, b) => b.totalWeight - a.totalWeight);

  // Build roadmap — top 7 gaps
  const roadmap: RoadmapItem[] = gaps.slice(0, 7).map((gap) => {
    const kw = missingWeighted.find((w) => w.keyword === gap.keyword)!;
    return {
      keyword: gap.keyword,
      severity: gap.severity,
      estimatedHours: gap.learning?.estimatedHours ?? null,
      reason: buildReason(kw),
      actionText: buildActionText(gap),
    };
  });

  // Summary
  const critical = gaps.filter((g) => g.severity === 'critical').length;
  const addressable = gaps.filter((g) => g.severity === 'addressable').length;
  const minor = gaps.filter((g) => g.severity === 'minor').length;

  return {
    gaps,
    gapsByArea,
    roadmap,
    summary: {
      critical,
      addressable,
      minor,
      total: gaps.length,
      topAreaToFocus: gapsByArea.length > 0 ? gapsByArea[0].area : null,
    },
  };
}
