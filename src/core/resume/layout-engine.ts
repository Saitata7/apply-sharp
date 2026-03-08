/**
 * Resume Layout Engine — Research-Backed Standards
 *
 * Pure computation logic for resume structure decisions:
 * - Section ordering based on experience level
 * - Bullet point budgets based on recency and tenure
 * - Education detail visibility based on graduation recency
 * - Page satisfaction (auto-trim sections when over page budget)
 * - Section priority scoring for intelligent trimming
 *
 * Sources: ResumeGo (7,712 resumes), TalentWorks (6,000+ apps), Harvard/Wharton templates
 *
 * Extracted from ResumeGenerator.tsx for reuse across DOCX, PDF, and preview renderers.
 */

import type {
  EnrichedExperience,
  EnrichedEducation,
  EnrichedProject,
  Certification,
} from '@shared/types/master-profile.types';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'executive';
export type SectionType =
  | 'name'
  | 'contact'
  | 'summary'
  | 'skills'
  | 'experience'
  | 'education'
  | 'certifications'
  | 'projects';

export interface SectionConfig {
  type: SectionType;
  visible: boolean;
  headerText: string;
}

export interface ExperienceRoleLayout {
  expId: string;
  maxBullets: number;
  isEarlyCareer: boolean;
}

export interface EducationLayoutEntry {
  eduId: string;
  showGpa: boolean;
  showGraduationDate: boolean;
  showCoursework: boolean;
  showHonors: boolean;
}

export interface ResumeLayout {
  experienceLevel: ExperienceLevel;
  sections: SectionConfig[];
  experienceRoles: ExperienceRoleLayout[];
  educationEntries: EducationLayoutEntry[];
  totalBulletBudget: number;
  showProjects: boolean;
  recommendedPages: 1 | 2 | 3;
}

export interface ContentExclusions {
  excludedExperiences: Set<string>;
  excludedProjects: Set<string>;
  hiddenSections: Set<SectionType>;
}

// ─── Core Computations ──────────────────────────────────────────────────────

export function computeYearsFromDates(experience: EnrichedExperience[]): number {
  if (!experience.length) return 0;
  const now = new Date();
  let earliest = now;
  for (const exp of experience) {
    if (exp.startDate) {
      const d = new Date(exp.startDate);
      if (!isNaN(d.getTime()) && d < earliest) earliest = d;
    }
  }
  return Math.max(
    0,
    Math.round((now.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24 * 365))
  );
}

export function getExperienceLevel(years: number): ExperienceLevel {
  if (years <= 5) return 'entry';
  if (years <= 10) return 'mid';
  if (years <= 15) return 'senior';
  return 'executive';
}

export function getRecommendedPages(years: number): 1 | 2 | 3 {
  if (years <= 5) return 1;
  if (years <= 15) return 2;
  return 3;
}

// ─── Section Ordering ───────────────────────────────────────────────────────

export function getSectionOrder(
  level: ExperienceLevel,
  hasProjects: boolean,
  hasCerts: boolean
): SectionConfig[] {
  const section = (type: SectionType, header: string, visible = true): SectionConfig => ({
    type,
    visible,
    headerText: header,
  });

  const base: SectionConfig[] = [
    section('name', ''),
    section('contact', ''),
    section('summary', 'SUMMARY'),
  ];

  switch (level) {
    case 'entry':
      return [
        ...base,
        section('education', 'EDUCATION'),
        section('skills', 'TECHNICAL SKILLS'),
        section('experience', 'WORK EXPERIENCE'),
        section('projects', 'PROJECTS', hasProjects),
        section('certifications', 'CERTIFICATIONS', hasCerts),
      ];
    case 'mid':
      return [
        ...base,
        section('skills', 'TECHNICAL SKILLS'),
        section('experience', 'WORK EXPERIENCE'),
        section('education', 'EDUCATION'),
        section('certifications', 'CERTIFICATIONS', hasCerts),
        section('projects', 'PROJECTS', hasProjects),
      ];
    case 'senior':
      return [
        ...base,
        section('skills', 'TECHNICAL SKILLS'),
        section('experience', 'WORK EXPERIENCE'),
        section('education', 'EDUCATION'),
        section('certifications', 'CERTIFICATIONS', hasCerts),
      ];
    case 'executive':
      return [
        ...base,
        section('skills', 'TECHNICAL SKILLS'),
        section('experience', 'WORK EXPERIENCE'),
        section('education', 'EDUCATION'),
        section('certifications', 'CERTIFICATIONS', hasCerts),
      ];
  }
}

// ─── Bullet Budget Allocation ───────────────────────────────────────────────

export function computeBulletBudgets(
  experience: EnrichedExperience[],
  targetPages: number,
  yearsOfExperience: number
): { roles: ExperienceRoleLayout[]; totalBudget: number } {
  const budgetByPages: Record<number, [number, number]> = {
    1: [12, 18],
    2: [20, 35],
    3: [30, 45],
  };
  const [, maxBudget] = budgetByPages[targetPages] || [20, 35];

  const now = new Date();

  const roles: ExperienceRoleLayout[] = experience.map((exp, idx) => {
    const endDate = exp.isCurrent ? now : exp.endDate ? new Date(exp.endDate) : now;
    const roleAgeYears = (now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
    const tenureMonths =
      exp.durationMonths ||
      Math.max(
        1,
        Math.round(
          (endDate.getTime() -
            (exp.startDate ? new Date(exp.startDate).getTime() : endDate.getTime())) /
            (1000 * 60 * 60 * 24 * 30)
        )
      );

    const isEarlyCareer = roleAgeYears >= 10 && yearsOfExperience >= 10;

    if (isEarlyCareer) {
      return { expId: exp.id || exp.company, maxBullets: 0, isEarlyCareer: true };
    }

    let positionMax: number;
    if (targetPages === 1) {
      positionMax = idx === 0 ? 6 : idx === 1 ? 4 : 3;
    } else if (targetPages === 2) {
      positionMax = idx === 0 ? 8 : idx === 1 ? 6 : idx === 2 ? 5 : 3;
    } else {
      positionMax = idx === 0 ? 8 : idx === 1 ? 7 : idx === 2 ? 6 : idx === 3 ? 5 : 3;
    }

    let tenureMax: number;
    if (tenureMonths < 6) tenureMax = 3;
    else if (tenureMonths < 12) tenureMax = 4;
    else if (tenureMonths < 24) tenureMax = 5;
    else if (tenureMonths < 36) tenureMax = 6;
    else tenureMax = 7;

    return {
      expId: exp.id || exp.company,
      maxBullets: Math.min(positionMax, tenureMax),
      isEarlyCareer: false,
    };
  });

  // Enforce total budget cap
  let currentTotal = roles.reduce((sum, r) => sum + r.maxBullets, 0);
  if (currentTotal > maxBudget) {
    for (let i = roles.length - 1; i >= 0 && currentTotal > maxBudget; i--) {
      const role = roles[i];
      if (role.isEarlyCareer || role.maxBullets <= 1) continue;
      const reduction = Math.min(role.maxBullets - 1, currentTotal - maxBudget);
      if (reduction > 0) {
        role.maxBullets -= reduction;
        currentTotal -= reduction;
      }
    }
  }

  return { roles, totalBudget: currentTotal };
}

// ─── Education Layout ───────────────────────────────────────────────────────

export function computeEducationLayout(
  education: EnrichedEducation[],
  yearsOfExperience: number
): EducationLayoutEntry[] {
  const now = new Date();
  return education.map((edu) => {
    const gradDate = edu.endDate ? new Date(edu.endDate) : null;
    const yearsSinceGrad = gradDate
      ? (now.getTime() - gradDate.getTime()) / (1000 * 60 * 60 * 24 * 365)
      : Infinity;

    return {
      eduId: edu.id,
      showGpa: edu.gpa !== undefined && edu.gpa >= 3.5 && yearsSinceGrad <= 3,
      showGraduationDate: yearsOfExperience < 10,
      showCoursework: yearsOfExperience <= 3 && (edu.relevantCoursework?.length ?? 0) > 0,
      showHonors: yearsOfExperience <= 5 && (edu.honors?.length ?? 0) > 0,
    };
  });
}

// ─── Main Layout Computation ────────────────────────────────────────────────

export function computeResumeLayout(input: {
  yearsOfExperience: number;
  targetPages: number;
  experience: EnrichedExperience[];
  education: EnrichedEducation[];
  projects: EnrichedProject[];
  certifications: Certification[];
}): ResumeLayout {
  const level = getExperienceLevel(input.yearsOfExperience);
  const recommendedPages = getRecommendedPages(input.yearsOfExperience);
  const hasProjects = input.projects.length > 0;
  const hasCerts = input.certifications.length > 0;
  const sections = getSectionOrder(level, hasProjects, hasCerts);
  const { roles, totalBudget } = computeBulletBudgets(
    input.experience,
    input.targetPages,
    input.yearsOfExperience
  );
  const educationEntries = computeEducationLayout(input.education, input.yearsOfExperience);

  return {
    experienceLevel: level,
    sections,
    experienceRoles: roles,
    educationEntries,
    totalBulletBudget: totalBudget,
    showProjects: input.yearsOfExperience <= 10 && hasProjects,
    recommendedPages,
  };
}

// ─── Section Priority Scoring ───────────────────────────────────────────────

export function computeSectionPriorities(input: {
  level: ExperienceLevel;
  yearsOfExperience: number;
  education: EnrichedEducation[];
  projects: EnrichedProject[];
  certifications: Certification[];
  jdText?: string;
}): Map<SectionType, number> {
  const priorities = new Map<SectionType, number>();
  priorities.set('name', 100);
  priorities.set('contact', 100);
  priorities.set('summary', 95);
  priorities.set('skills', 90);
  priorities.set('experience', 100);

  const now = new Date();
  const gradYearsAgo =
    input.education.length > 0
      ? Math.max(
          ...input.education.map((e) => {
            const d = e.endDate ? new Date(e.endDate) : now;
            return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 365);
          })
        )
      : Infinity;

  if (input.yearsOfExperience <= 3) priorities.set('education', 85);
  else if (gradYearsAgo > 15) priorities.set('education', 40);
  else priorities.set('education', 60);

  const hasCertRelevance = input.jdText
    ? input.certifications.some((c) =>
        input.jdText!.toLowerCase().includes(c.name.toLowerCase().split(' ')[0])
      )
    : input.certifications.length > 0;
  priorities.set('certifications', hasCertRelevance ? 70 : 30);

  if (input.level === 'entry') priorities.set('projects', 75);
  else if (input.level === 'mid') priorities.set('projects', 50);
  else priorities.set('projects', 10);

  return priorities;
}

// ─── Page Satisfaction ──────────────────────────────────────────────────────

export function applyPageSatisfaction(
  layout: ResumeLayout,
  exclusions: ContentExclusions,
  experience: EnrichedExperience[],
  projects: EnrichedProject[],
  priorities: Map<SectionType, number>,
  targetPages: number
): ResumeLayout {
  const LINES_PER_PAGE = 52;
  const maxLines = targetPages * LINES_PER_PAGE;

  const sectionLines = new Map<SectionType, number>();
  sectionLines.set('name', 2);
  sectionLines.set('contact', 2);
  sectionLines.set('summary', 4);
  sectionLines.set('skills', 6);

  const activeExps = experience.filter(
    (e) => !exclusions.excludedExperiences.has(e.id || e.company)
  );
  let expLines = 2;
  for (const exp of activeExps) {
    const roleLayout = layout.experienceRoles.find((r) => r.expId === (exp.id || exp.company));
    expLines += 3 + (roleLayout?.maxBullets || 3) * 2;
  }
  sectionLines.set('experience', expLines);

  sectionLines.set('education', 2 + layout.educationEntries.length * 3);

  const certSection = layout.sections.find((s) => s.type === 'certifications');
  sectionLines.set('certifications', certSection?.visible ? 3 : 0);

  const activeProjects = projects.filter((p) => !exclusions.excludedProjects.has(p.id || p.name));
  sectionLines.set('projects', activeProjects.length > 0 ? 2 + activeProjects.length * 5 : 0);

  let totalLines = 0;
  for (const section of layout.sections) {
    if (section.visible && !exclusions.hiddenSections.has(section.type)) {
      totalLines += sectionLines.get(section.type) || 0;
    }
  }

  if (totalLines <= maxLines) return layout;

  const UNTOUCHABLE: SectionType[] = ['name', 'contact', 'experience', 'summary', 'skills'];
  const trimmable = layout.sections
    .filter(
      (s) => s.visible && !UNTOUCHABLE.includes(s.type) && !exclusions.hiddenSections.has(s.type)
    )
    .sort((a, b) => (priorities.get(a.type) || 0) - (priorities.get(b.type) || 0));

  const newSections = [...layout.sections];
  for (const trim of trimmable) {
    if (totalLines <= maxLines) break;
    const idx = newSections.findIndex((s) => s.type === trim.type);
    if (idx >= 0) {
      newSections[idx] = { ...newSections[idx], visible: false };
      totalLines -= sectionLines.get(trim.type) || 0;
    }
  }

  const newRoles = [...layout.experienceRoles];
  if (totalLines > maxLines) {
    for (let i = newRoles.length - 1; i >= 0 && totalLines > maxLines; i--) {
      if (newRoles[i].isEarlyCareer || newRoles[i].maxBullets <= 1) continue;
      const reduce = Math.min(2, newRoles[i].maxBullets - 1);
      newRoles[i] = { ...newRoles[i], maxBullets: newRoles[i].maxBullets - reduce };
      totalLines -= reduce * 2;
    }
  }

  return { ...layout, sections: newSections, experienceRoles: newRoles };
}

// ─── Utility Functions ──────────────────────────────────────────────────────

export function formatResumeDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'N/A') return '';
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const lower = trimmed.toLowerCase();
  if (lower === 'current' || lower === 'present') return 'Present';
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (isoMatch) {
    const monthIndex = parseInt(isoMatch[2], 10) - 1;
    if (monthIndex >= 0 && monthIndex < 12) return `${months[monthIndex]} ${isoMatch[1]}`;
  }
  const slashMatch = trimmed.match(/^(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const monthIndex = parseInt(slashMatch[1], 10) - 1;
    if (monthIndex >= 0 && monthIndex < 12) return `${months[monthIndex]} ${slashMatch[2]}`;
  }
  if (/^\d{4}$/.test(trimmed)) return trimmed;
  if (/^[A-Z][a-z]+\s+\d{4}$/.test(trimmed)) return trimmed;
  if (/^[A-Z][a-z]{2}\s+\d{4}$/.test(trimmed)) return trimmed;
  return trimmed;
}

export function normalizeSkillName(name: string): string {
  if (!name) return name;
  const trimmed = name.trim();

  const acronyms: Record<string, string> = {
    'ci/cd': 'CI/CD',
    aws: 'AWS',
    gcp: 'GCP',
    api: 'API',
    apis: 'APIs',
    sql: 'SQL',
    nosql: 'NoSQL',
    html: 'HTML',
    html5: 'HTML5',
    css: 'CSS',
    css3: 'CSS3',
    oop: 'OOP',
    sdlc: 'SDLC',
    solid: 'SOLID',
    rest: 'REST',
    grpc: 'gRPC',
    graphql: 'GraphQL',
    'ai/ml': 'AI/ML',
    ai: 'AI',
    ml: 'ML',
    nlp: 'NLP',
    etl: 'ETL',
    jwt: 'JWT',
    oauth: 'OAuth',
    ssl: 'SSL',
    tls: 'TLS',
    ssh: 'SSH',
    dns: 'DNS',
    cdn: 'CDN',
    ui: 'UI',
    ux: 'UX',
    qa: 'QA',
    sre: 'SRE',
    bi: 'BI',
    devops: 'DevOps',
    devsecops: 'DevSecOps',
    saas: 'SaaS',
    paas: 'PaaS',
    iaas: 'IaaS',
  };

  const products: Record<string, string> = {
    kubernetes: 'Kubernetes',
    elasticsearch: 'Elasticsearch',
    postgresql: 'PostgreSQL',
    mysql: 'MySQL',
    mongodb: 'MongoDB',
    redis: 'Redis',
    docker: 'Docker',
    jenkins: 'Jenkins',
    terraform: 'Terraform',
    ansible: 'Ansible',
    kafka: 'Kafka',
    rabbitmq: 'RabbitMQ',
    nginx: 'Nginx',
    linux: 'Linux',
    'node.js': 'Node.js',
    'react.js': 'React.js',
    react: 'React',
    angular: 'Angular',
    'vue.js': 'Vue.js',
    vue: 'Vue',
    'next.js': 'Next.js',
    express: 'Express',
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    python: 'Python',
    java: 'Java',
    golang: 'Go',
    go: 'Go',
    rust: 'Rust',
    swift: 'Swift',
    kotlin: 'Kotlin',
    ruby: 'Ruby',
    php: 'PHP',
    scala: 'Scala',
    jira: 'Jira',
    confluence: 'Confluence',
    figma: 'Figma',
    tableau: 'Tableau',
    grafana: 'Grafana',
    prometheus: 'Prometheus',
    loki: 'Loki',
    openai: 'OpenAI',
    langchain: 'LangChain',
    'spring boot': 'Spring Boot',
    spring: 'Spring',
    dynamodb: 'DynamoDB',
    snowflake: 'Snowflake',
    firebase: 'Firebase',
    'github actions': 'GitHub Actions',
    git: 'Git',
    github: 'GitHub',
    gitlab: 'GitLab',
    bitbucket: 'Bitbucket',
  };

  const lower = trimmed.toLowerCase();

  if (acronyms[lower]) return acronyms[lower];
  if (products[lower]) return products[lower];

  if (lower.includes(' or ') || lower.includes(' and ')) {
    return trimmed
      .split(/\s+(?:or|and)\s+/i)
      .map((part) => normalizeSkillName(part.trim()))
      .join(', ');
  }

  if (/^[a-z]/.test(trimmed) && trimmed.length > 2) {
    return trimmed
      .split(/[\s-]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(trimmed.includes('-') ? '-' : ' ');
  }

  return trimmed;
}

export function shortenUrl(url: string | undefined): string {
  if (!url) return '';
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}
