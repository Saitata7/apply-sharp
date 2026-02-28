/**
 * 4-Layer ATS Matching Architecture
 *
 * Layer 0: BACKGROUND - Educational/Professional Background (first filter)
 * Layer 1: ROLE - Specific job role within the background
 * Layer 2: SKILL AREAS - Domains with strength percentages
 * Layer 3: KEYWORDS - Specific technologies/skills within each area
 *
 * Example:
 * Background: Computer Science
 * └── Role: Full Stack Developer
 *     ├── Frontend (80%)
 *     │   └── React, TypeScript, CSS, HTML, Redux...
 *     ├── Backend (90%)
 *     │   └── Node.js, Python, PostgreSQL, REST APIs...
 *     ├── Cloud (75%)
 *     │   └── AWS, Docker, Kubernetes, CI/CD...
 *     └── QA (15%)
 *         └── Jest, Cypress, Unit Testing...
 */

// ============================================
// LAYER 0: BACKGROUND TYPES
// ============================================

export type BackgroundType =
  | 'computer-science'
  | 'data-analytics'
  | 'mba-business'
  | 'healthcare'
  | 'finance'
  | 'engineering'
  | 'design'
  | 'marketing'
  | 'legal'
  | 'education'
  | 'other';

export interface BackgroundConfig {
  id: BackgroundType;
  name: string;
  description: string;
  icon?: string;
  /** Roles available under this background */
  roles: RoleConfig[];
  /** Keywords that indicate this background in a JD */
  indicators: string[];
}

// ============================================
// LAYER 1: ROLE TYPES
// ============================================

export interface RoleConfig {
  id: string;
  name: string;
  description: string;
  /** Skill areas relevant to this role */
  skillAreas: SkillAreaTemplate[];
  /** Seniority levels this role supports */
  seniorityLevels: ('entry' | 'mid' | 'senior' | 'lead' | 'principal')[];
  /** Keywords that indicate this role in a JD */
  indicators: string[];
}

// ============================================
// LAYER 2: SKILL AREAS
// ============================================

export interface SkillAreaTemplate {
  id: string;
  name: string;
  description: string;
  /** Default weight for this skill area in the role (0-100) */
  defaultWeight: number;
  /** Is this skill area required for the role? */
  isRequired: boolean;
  /** Keywords that belong to this skill area */
  keywords: KeywordEntry[];
}

export interface UserSkillArea {
  id: string;
  name: string;
  /** User's strength in this area (0-100) */
  strength: number;
  /** Calculated from resume/experience */
  calculatedStrength?: number;
  /** User override of calculated strength */
  userOverride?: boolean;
  /** Specific skills/keywords within this area */
  keywords: UserKeyword[];
  /** Years of experience in this area */
  yearsOfExperience?: number;
}

// ============================================
// LAYER 3: KEYWORDS
// ============================================

export interface KeywordEntry {
  name: string;
  /** Alternative names/spellings */
  variations: string[];
  /** Regex pattern for complex matching */
  pattern?: string;
  /** Weight multiplier (1.0 = normal, 2.0 = critical) */
  weight: number;
  /** Is this a common/required keyword for the skill area? */
  isCore: boolean;
}

export interface UserKeyword {
  name: string;
  /** User's proficiency level */
  proficiency: 'basic' | 'intermediate' | 'advanced' | 'expert';
  /** Years of experience with this skill */
  yearsOfExperience: number;
  /** Last used (date or "current") */
  lastUsed: string;
  /** Evidence from experience/projects */
  evidence: string[];
}

// ============================================
// USER PROFILE ADDITIONS
// ============================================

/**
 * Background and skill configuration for a user's profile
 * This extends the MasterProfile with the 4-layer architecture
 */
export interface UserBackgroundConfig {
  /** Primary educational/professional background */
  background: BackgroundType;

  /** Current/target role */
  primaryRole: string;

  /** Secondary roles if applicable (e.g., "DevOps" for a Full Stack Dev) */
  secondaryRoles?: string[];

  /** Skill areas with user-specific strengths */
  skillAreas: UserSkillArea[];

  /** Auto-detected vs user-configured */
  isAutoDetected: boolean;

  /** Last time skills were recalculated */
  lastCalculated?: Date;
}

// ============================================
// ATS MATCHING RESULT
// ============================================

export interface LayeredATSResult {
  /** Overall match score (0-100) */
  overallScore: number;

  /** Background match (quick filter) */
  backgroundMatch: {
    isMatch: boolean;
    detected: BackgroundType | null;
    confidence: number;
  };

  /** Role match */
  roleMatch: {
    detectedRole: string | null;
    matchScore: number;
    seniorityMatch: boolean;
    detectedSeniority: string | null;
  };

  /** Per-skill-area breakdown */
  skillAreaScores: SkillAreaScore[];

  /** Detailed keyword matches */
  keywordMatches: KeywordMatch[];

  /** Missing critical keywords */
  criticalMissing: string[];

  /** Recommendations */
  recommendations: string[];

  /** Scoring tier */
  tier: 'excellent' | 'good' | 'moderate' | 'poor';
}

export interface SkillAreaScore {
  areaId: string;
  areaName: string;
  /** JD's weight for this area (detected from JD) */
  jdWeight: number;
  /** User's strength in this area */
  userStrength: number;
  /** Match score = min(jdWeight, userStrength) with bonus for exceeding */
  matchScore: number;
  /** Keywords matched in this area */
  matchedKeywords: string[];
  /** Keywords missing in this area */
  missingKeywords: string[];
}

export interface KeywordMatch {
  keyword: string;
  skillArea: string;
  found: boolean;
  jdMentions: number;
  userProficiency?: 'basic' | 'intermediate' | 'advanced' | 'expert';
  importance: 'critical' | 'important' | 'nice-to-have';
}

// ============================================
// BACKGROUND DEFINITIONS (Pre-configured)
// ============================================

/**
 * Computer Science Background Configuration
 */
export const CS_SKILL_AREAS: SkillAreaTemplate[] = [
  {
    id: 'frontend',
    name: 'Frontend Development',
    description: 'Client-side web development, UI/UX implementation',
    defaultWeight: 25,
    isRequired: false,
    keywords: [], // Populated from keyword files
  },
  {
    id: 'backend',
    name: 'Backend Development',
    description: 'Server-side development, APIs, business logic',
    defaultWeight: 30,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'database',
    name: 'Database & Data Storage',
    description: 'SQL, NoSQL, data modeling, query optimization',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'devops',
    name: 'DevOps & Infrastructure',
    description: 'CI/CD, cloud platforms, containerization',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'testing',
    name: 'Testing & QA',
    description: 'Unit testing, integration testing, test automation',
    defaultWeight: 10,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'architecture',
    name: 'System Architecture',
    description: 'System design, scalability, distributed systems',
    defaultWeight: 10,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'mobile',
    name: 'Mobile Development',
    description: 'iOS, Android, React Native, Flutter',
    defaultWeight: 0,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'ml-ai',
    name: 'Machine Learning & AI',
    description: 'ML frameworks, data science, NLP, computer vision',
    defaultWeight: 0,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'security',
    name: 'Security',
    description: 'Application security, authentication, encryption',
    defaultWeight: 5,
    isRequired: false,
    keywords: [],
  },
];

/**
 * MBA / Business Background Configuration
 */
export const MBA_SKILL_AREAS: SkillAreaTemplate[] = [
  {
    id: 'management-leadership',
    name: 'Management & Leadership',
    description: 'Team management, coaching, performance management',
    defaultWeight: 25,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'operations',
    name: 'Operations',
    description: 'Process improvement, workflow optimization, logistics',
    defaultWeight: 20,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'strategy',
    name: 'Strategy & Planning',
    description: 'Strategic planning, market analysis, business development',
    defaultWeight: 20,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'finance-accounting',
    name: 'Finance & Budgeting',
    description: 'Budgeting, P&L, financial analysis, forecasting',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'project-management',
    name: 'Project Management',
    description: 'Project planning, Agile, Scrum, stakeholder management',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'communication',
    name: 'Communication & Presentation',
    description: 'Presentations, stakeholder communication, reporting',
    defaultWeight: 10,
    isRequired: false,
    keywords: [],
  },
];

export const MBA_ROLES: RoleConfig[] = [
  {
    id: 'operations-manager',
    name: 'Operations Manager',
    description: 'Oversee daily operations, process improvement, team management',
    skillAreas: MBA_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'operations'
          ? 40
          : area.id === 'management-leadership'
            ? 30
            : area.id === 'finance-accounting'
              ? 15
              : area.id === 'project-management'
                ? 15
                : 5,
    })),
    seniorityLevels: ['mid', 'senior', 'lead', 'principal'],
    indicators: ['operations manager', 'operations director', 'ops manager', 'business operations'],
  },
  {
    id: 'project-manager',
    name: 'Project Manager',
    description: 'Plan and execute projects, coordinate teams, manage timelines',
    skillAreas: MBA_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'project-management'
          ? 50
          : area.id === 'communication'
            ? 20
            : area.id === 'management-leadership'
              ? 20
              : area.id === 'operations'
                ? 10
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
    indicators: ['project manager', 'program manager', 'pmp', 'scrum master', 'agile'],
  },
  {
    id: 'business-analyst',
    name: 'Business Analyst',
    description: 'Analyze business needs, requirements gathering, process documentation',
    skillAreas: MBA_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'operations'
          ? 30
          : area.id === 'communication'
            ? 25
            : area.id === 'strategy'
              ? 20
              : area.id === 'project-management'
                ? 15
                : 10,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
    indicators: ['business analyst', 'ba', 'requirements analyst', 'systems analyst'],
  },
  {
    id: 'product-manager',
    name: 'Product Manager',
    description: 'Product strategy, roadmap planning, cross-functional leadership',
    skillAreas: MBA_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'strategy'
          ? 35
          : area.id === 'communication'
            ? 25
            : area.id === 'project-management'
              ? 20
              : area.id === 'management-leadership'
                ? 15
                : 5,
    })),
    seniorityLevels: ['mid', 'senior', 'lead', 'principal'],
    indicators: ['product manager', 'product owner', 'pm', 'product lead'],
  },
  {
    id: 'management-consultant',
    name: 'Management Consultant',
    description: 'Strategic consulting, business transformation, client advisory',
    skillAreas: MBA_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'strategy'
          ? 40
          : area.id === 'communication'
            ? 25
            : area.id === 'operations'
              ? 20
              : area.id === 'finance-accounting'
                ? 15
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead', 'principal'],
    indicators: ['consultant', 'management consultant', 'strategy consultant', 'advisory'],
  },
];

/**
 * Engineering (Non-Software) Background Configuration
 */
export const ENGINEERING_SKILL_AREAS: SkillAreaTemplate[] = [
  {
    id: 'technical-design',
    name: 'Technical Design',
    description: 'CAD, technical drawings, design specifications',
    defaultWeight: 25,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'project-engineering',
    name: 'Project Engineering',
    description: 'Project planning, scheduling, resource management',
    defaultWeight: 20,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'quality-compliance',
    name: 'Quality & Compliance',
    description: 'QA/QC, standards compliance, inspection, testing',
    defaultWeight: 20,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'manufacturing',
    name: 'Manufacturing & Production',
    description: 'Production processes, lean manufacturing, assembly',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'safety',
    name: 'Safety & Environmental',
    description: 'OSHA, safety protocols, environmental compliance',
    defaultWeight: 10,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'technical-analysis',
    name: 'Technical Analysis',
    description: 'Calculations, simulations, problem solving',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
];

export const ENGINEERING_ROLES: RoleConfig[] = [
  {
    id: 'mechanical-engineer',
    name: 'Mechanical Engineer',
    description: 'Design mechanical systems, product development, analysis',
    skillAreas: ENGINEERING_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'technical-design'
          ? 40
          : area.id === 'technical-analysis'
            ? 25
            : area.id === 'manufacturing'
              ? 20
              : area.id === 'quality-compliance'
                ? 15
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead', 'principal'],
    indicators: [
      'mechanical engineer',
      'mechanical design',
      'product engineer',
      'cad',
      'solidworks',
    ],
  },
  {
    id: 'electrical-engineer',
    name: 'Electrical Engineer',
    description: 'Design electrical systems, circuits, power systems',
    skillAreas: ENGINEERING_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'technical-design'
          ? 40
          : area.id === 'technical-analysis'
            ? 30
            : area.id === 'quality-compliance'
              ? 15
              : area.id === 'safety'
                ? 15
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead', 'principal'],
    indicators: ['electrical engineer', 'ee', 'power systems', 'circuits', 'plc', 'controls'],
  },
  {
    id: 'civil-engineer',
    name: 'Civil Engineer',
    description: 'Infrastructure design, construction, site development',
    skillAreas: ENGINEERING_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'technical-design'
          ? 35
          : area.id === 'project-engineering'
            ? 30
            : area.id === 'quality-compliance'
              ? 20
              : area.id === 'safety'
                ? 15
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead', 'principal'],
    indicators: ['civil engineer', 'structural engineer', 'construction', 'autocad', 'pe license'],
  },
  {
    id: 'manufacturing-engineer',
    name: 'Manufacturing Engineer',
    description: 'Production processes, lean manufacturing, continuous improvement',
    skillAreas: ENGINEERING_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'manufacturing'
          ? 40
          : area.id === 'quality-compliance'
            ? 25
            : area.id === 'technical-design'
              ? 20
              : area.id === 'safety'
                ? 15
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
    indicators: [
      'manufacturing engineer',
      'process engineer',
      'industrial engineer',
      'lean',
      'six sigma',
    ],
  },
  {
    id: 'quality-engineer',
    name: 'Quality Engineer',
    description: 'Quality assurance, testing, compliance, root cause analysis',
    skillAreas: ENGINEERING_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'quality-compliance'
          ? 50
          : area.id === 'technical-analysis'
            ? 25
            : area.id === 'manufacturing'
              ? 15
              : area.id === 'safety'
                ? 10
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
    indicators: ['quality engineer', 'qa engineer', 'qc engineer', 'iso', 'root cause', 'fmea'],
  },
];

/**
 * Design / Creative Background Configuration
 */
export const DESIGN_SKILL_AREAS: SkillAreaTemplate[] = [
  {
    id: 'ux-design',
    name: 'UX Design',
    description: 'User research, wireframes, user flows, usability testing',
    defaultWeight: 30,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'ui-design',
    name: 'UI Design',
    description: 'Visual design, design systems, prototyping',
    defaultWeight: 30,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'graphic-design',
    name: 'Graphic Design',
    description: 'Visual identity, branding, print, digital assets',
    defaultWeight: 20,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'design-tools',
    name: 'Design Tools',
    description: 'Figma, Sketch, Adobe Creative Suite, prototyping tools',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'motion-design',
    name: 'Motion & Animation',
    description: 'Animation, motion graphics, video editing',
    defaultWeight: 10,
    isRequired: false,
    keywords: [],
  },
];

export const DESIGN_ROLES: RoleConfig[] = [
  {
    id: 'ux-designer',
    name: 'UX Designer',
    description: 'User experience design, research, information architecture',
    skillAreas: DESIGN_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'ux-design'
          ? 50
          : area.id === 'ui-design'
            ? 25
            : area.id === 'design-tools'
              ? 20
              : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead', 'principal'],
    indicators: ['ux designer', 'user experience', 'ux research', 'interaction design'],
  },
  {
    id: 'ui-designer',
    name: 'UI Designer',
    description: 'Visual interface design, design systems, prototypes',
    skillAreas: DESIGN_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'ui-design'
          ? 50
          : area.id === 'ux-design'
            ? 20
            : area.id === 'design-tools'
              ? 20
              : area.id === 'graphic-design'
                ? 10
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
    indicators: ['ui designer', 'visual designer', 'interface design', 'design system'],
  },
  {
    id: 'product-designer',
    name: 'Product Designer',
    description: 'End-to-end product design, UX + UI, user-centered design',
    skillAreas: DESIGN_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'ux-design'
          ? 40
          : area.id === 'ui-design'
            ? 40
            : area.id === 'design-tools'
              ? 15
              : 5,
    })),
    seniorityLevels: ['mid', 'senior', 'lead', 'principal'],
    indicators: ['product designer', 'digital product', 'end-to-end design'],
  },
  {
    id: 'graphic-designer',
    name: 'Graphic Designer',
    description: 'Visual design, branding, marketing materials',
    skillAreas: DESIGN_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'graphic-design'
          ? 50
          : area.id === 'design-tools'
            ? 25
            : area.id === 'motion-design'
              ? 15
              : area.id === 'ui-design'
                ? 10
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
    indicators: ['graphic designer', 'visual designer', 'brand designer', 'creative designer'],
  },
];

/**
 * Marketing / Communications Background Configuration
 */
export const MARKETING_SKILL_AREAS: SkillAreaTemplate[] = [
  {
    id: 'digital-marketing',
    name: 'Digital Marketing',
    description: 'SEO, SEM, paid ads, email marketing, analytics',
    defaultWeight: 25,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'content-marketing',
    name: 'Content Marketing',
    description: 'Content strategy, copywriting, blogging, storytelling',
    defaultWeight: 20,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'social-media',
    name: 'Social Media',
    description: 'Social strategy, community management, influencer marketing',
    defaultWeight: 20,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'brand-marketing',
    name: 'Brand & Communications',
    description: 'Brand strategy, PR, corporate communications',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'marketing-analytics',
    name: 'Marketing Analytics',
    description: 'Campaign analysis, attribution, reporting, A/B testing',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'marketing-tools',
    name: 'Marketing Tools',
    description: 'HubSpot, Salesforce, Google Analytics, marketing automation',
    defaultWeight: 10,
    isRequired: false,
    keywords: [],
  },
];

export const MARKETING_ROLES: RoleConfig[] = [
  {
    id: 'digital-marketing-manager',
    name: 'Digital Marketing Manager',
    description: 'Digital campaigns, paid media, SEO/SEM strategy',
    skillAreas: MARKETING_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'digital-marketing'
          ? 45
          : area.id === 'marketing-analytics'
            ? 25
            : area.id === 'marketing-tools'
              ? 15
              : area.id === 'content-marketing'
                ? 15
                : 5,
    })),
    seniorityLevels: ['mid', 'senior', 'lead'],
    indicators: [
      'digital marketing',
      'performance marketing',
      'growth marketing',
      'seo',
      'sem',
      'ppc',
    ],
  },
  {
    id: 'content-marketing-manager',
    name: 'Content Marketing Manager',
    description: 'Content strategy, editorial calendar, copywriting',
    skillAreas: MARKETING_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'content-marketing'
          ? 50
          : area.id === 'social-media'
            ? 20
            : area.id === 'brand-marketing'
              ? 15
              : area.id === 'digital-marketing'
                ? 15
                : 5,
    })),
    seniorityLevels: ['mid', 'senior', 'lead'],
    indicators: [
      'content marketing',
      'content strategist',
      'copywriter',
      'editorial',
      'content manager',
    ],
  },
  {
    id: 'social-media-manager',
    name: 'Social Media Manager',
    description: 'Social strategy, community management, content creation',
    skillAreas: MARKETING_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'social-media'
          ? 50
          : area.id === 'content-marketing'
            ? 25
            : area.id === 'marketing-analytics'
              ? 15
              : area.id === 'brand-marketing'
                ? 10
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
    indicators: [
      'social media',
      'community manager',
      'social strategist',
      'instagram',
      'tiktok',
      'linkedin',
    ],
  },
  {
    id: 'marketing-manager',
    name: 'Marketing Manager',
    description: 'Marketing strategy, campaign management, team leadership',
    skillAreas: MARKETING_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'brand-marketing'
          ? 30
          : area.id === 'digital-marketing'
            ? 25
            : area.id === 'marketing-analytics'
              ? 20
              : area.id === 'content-marketing'
                ? 15
                : 10,
    })),
    seniorityLevels: ['mid', 'senior', 'lead', 'principal'],
    indicators: ['marketing manager', 'marketing director', 'head of marketing', 'vp marketing'],
  },
  {
    id: 'brand-manager',
    name: 'Brand Manager',
    description: 'Brand strategy, positioning, brand guidelines',
    skillAreas: MARKETING_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'brand-marketing'
          ? 50
          : area.id === 'content-marketing'
            ? 20
            : area.id === 'marketing-analytics'
              ? 15
              : area.id === 'social-media'
                ? 15
                : 5,
    })),
    seniorityLevels: ['mid', 'senior', 'lead'],
    indicators: ['brand manager', 'brand marketing', 'brand strategist', 'communications manager'],
  },
];

/**
 * Data Analytics Background Configuration
 */
export const DATA_SKILL_AREAS: SkillAreaTemplate[] = [
  {
    id: 'data-analysis',
    name: 'Data Analysis',
    description: 'Statistical analysis, data exploration, insights',
    defaultWeight: 30,
    isRequired: true,
    keywords: [],
  },
  {
    id: 'data-visualization',
    name: 'Data Visualization',
    description: 'Charts, dashboards, storytelling with data',
    defaultWeight: 20,
    isRequired: true,
    keywords: [],
  },
  {
    id: 'sql-databases',
    name: 'SQL & Databases',
    description: 'SQL queries, database management, data extraction',
    defaultWeight: 20,
    isRequired: true,
    keywords: [],
  },
  {
    id: 'bi-tools',
    name: 'BI Tools',
    description: 'Tableau, Power BI, Looker, reporting tools',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'programming',
    name: 'Programming',
    description: 'Python, R, scripting for data analysis',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'ml-statistics',
    name: 'ML & Statistics',
    description: 'Predictive modeling, statistical methods, ML basics',
    defaultWeight: 10,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'data-engineering',
    name: 'Data Engineering',
    description: 'ETL, data pipelines, big data tools',
    defaultWeight: 10,
    isRequired: false,
    keywords: [],
  },
];

/**
 * Role templates for Computer Science background
 */
export const CS_ROLES: RoleConfig[] = [
  {
    id: 'fullstack-developer',
    name: 'Full Stack Developer',
    description: 'End-to-end web development, frontend and backend',
    skillAreas: CS_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'frontend'
          ? 40
          : area.id === 'backend'
            ? 40
            : area.id === 'database'
              ? 20
              : area.id === 'devops'
                ? 15
                : area.id === 'testing'
                  ? 10
                  : area.defaultWeight,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead', 'principal'],
    indicators: ['full stack', 'fullstack', 'full-stack', 'frontend and backend'],
  },
  {
    id: 'frontend-developer',
    name: 'Frontend Developer',
    description: 'Client-side development, UI/UX implementation',
    skillAreas: CS_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'frontend' ? 70 : area.id === 'testing' ? 15 : area.id === 'devops' ? 10 : 0,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead', 'principal'],
    indicators: [
      'frontend',
      'front-end',
      'front end',
      'ui developer',
      'react developer',
      'vue developer',
    ],
  },
  {
    id: 'backend-developer',
    name: 'Backend Developer',
    description: 'Server-side development, APIs, microservices',
    skillAreas: CS_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'backend'
          ? 60
          : area.id === 'database'
            ? 25
            : area.id === 'devops'
              ? 20
              : area.id === 'architecture'
                ? 15
                : area.id === 'testing'
                  ? 10
                  : 0,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead', 'principal'],
    indicators: ['backend', 'back-end', 'back end', 'api developer', 'server-side'],
  },
  {
    id: 'devops-engineer',
    name: 'DevOps Engineer',
    description: 'CI/CD, infrastructure, cloud platforms',
    skillAreas: CS_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'devops'
          ? 70
          : area.id === 'security'
            ? 20
            : area.id === 'backend'
              ? 15
              : area.id === 'architecture'
                ? 15
                : 0,
    })),
    seniorityLevels: ['mid', 'senior', 'lead', 'principal'],
    indicators: [
      'devops',
      'dev ops',
      'site reliability',
      'sre',
      'platform engineer',
      'infrastructure',
    ],
  },
  {
    id: 'data-engineer',
    name: 'Data Engineer',
    description: 'Data pipelines, ETL, big data infrastructure',
    skillAreas: [
      ...CS_SKILL_AREAS.filter((a) =>
        ['database', 'backend', 'devops', 'architecture'].includes(a.id)
      ),
      ...DATA_SKILL_AREAS.filter((a) => ['data-engineering', 'sql-databases'].includes(a.id)),
    ].map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'data-engineering'
          ? 50
          : area.id === 'sql-databases' || area.id === 'database'
            ? 30
            : area.id === 'devops'
              ? 20
              : area.id === 'backend'
                ? 15
                : 10,
    })),
    seniorityLevels: ['mid', 'senior', 'lead', 'principal'],
    indicators: ['data engineer', 'data infrastructure', 'etl developer', 'big data'],
  },
  {
    id: 'ml-engineer',
    name: 'Machine Learning Engineer',
    description: 'ML systems, model deployment, MLOps',
    skillAreas: CS_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'ml-ai'
          ? 60
          : area.id === 'backend'
            ? 25
            : area.id === 'devops'
              ? 20
              : area.id === 'database'
                ? 15
                : 0,
    })),
    seniorityLevels: ['mid', 'senior', 'lead', 'principal'],
    indicators: ['machine learning', 'ml engineer', 'ai engineer', 'deep learning', 'mlops'],
  },
  {
    id: 'mobile-developer',
    name: 'Mobile Developer',
    description: 'iOS, Android, cross-platform mobile apps',
    skillAreas: CS_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'mobile' ? 70 : area.id === 'backend' ? 20 : area.id === 'testing' ? 15 : 0,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
    indicators: [
      'mobile developer',
      'ios developer',
      'android developer',
      'react native',
      'flutter',
    ],
  },
  {
    id: 'software-engineer',
    name: 'Software Engineer',
    description: 'General software development',
    skillAreas: CS_SKILL_AREAS,
    seniorityLevels: ['entry', 'mid', 'senior', 'lead', 'principal'],
    indicators: ['software engineer', 'software developer', 'sde', 'swe'],
  },
];

/**
 * Healthcare Background Configuration
 */
export const HEALTHCARE_SKILL_AREAS: SkillAreaTemplate[] = [
  {
    id: 'clinical-skills',
    name: 'Clinical Skills',
    description: 'Patient assessment, triage, medication administration, wound care',
    defaultWeight: 25,
    isRequired: true,
    keywords: [],
  },
  {
    id: 'patient-care',
    name: 'Patient Care & Communication',
    description: 'Care plans, patient advocacy, discharge planning, education',
    defaultWeight: 20,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'healthcare-technology',
    name: 'Healthcare Technology',
    description: 'EMR/EHR systems (Epic, Cerner), telemedicine, health informatics',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'healthcare-compliance',
    name: 'Healthcare Compliance',
    description: 'HIPAA, JCAHO, infection control, quality measures, evidence-based practice',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'healthcare-admin',
    name: 'Healthcare Administration',
    description: 'Medical billing, insurance, scheduling, revenue cycle, credentialing',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'healthcare-certifications',
    name: 'Certifications & Credentials',
    description: 'RN, NP, PA, BLS, ACLS, BSN, MSN',
    defaultWeight: 10,
    isRequired: false,
    keywords: [],
  },
];

export const HEALTHCARE_ROLES: RoleConfig[] = [
  {
    id: 'registered-nurse',
    name: 'Registered Nurse (RN)',
    description: 'Direct patient care, clinical assessment, medication administration',
    skillAreas: HEALTHCARE_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'clinical-skills'
          ? 40
          : area.id === 'patient-care'
            ? 30
            : area.id === 'healthcare-certifications'
              ? 15
              : area.id === 'healthcare-compliance'
                ? 10
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
    indicators: ['registered nurse', 'rn', 'staff nurse', 'charge nurse', 'nursing'],
  },
  {
    id: 'healthcare-administrator',
    name: 'Healthcare Administrator',
    description: 'Hospital operations, staff management, regulatory compliance',
    skillAreas: HEALTHCARE_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'healthcare-admin'
          ? 35
          : area.id === 'healthcare-compliance'
            ? 25
            : area.id === 'healthcare-technology'
              ? 20
              : area.id === 'patient-care'
                ? 10
                : 5,
    })),
    seniorityLevels: ['mid', 'senior', 'lead', 'principal'],
    indicators: [
      'healthcare administrator',
      'hospital administrator',
      'health services manager',
      'clinical director',
    ],
  },
  {
    id: 'nurse-practitioner',
    name: 'Nurse Practitioner (NP)',
    description: 'Advanced clinical practice, diagnosis, treatment planning',
    skillAreas: HEALTHCARE_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'clinical-skills'
          ? 45
          : area.id === 'patient-care'
            ? 25
            : area.id === 'healthcare-certifications'
              ? 15
              : area.id === 'healthcare-compliance'
                ? 10
                : 5,
    })),
    seniorityLevels: ['mid', 'senior', 'lead'],
    indicators: ['nurse practitioner', 'np', 'aprn', 'advanced practice nurse'],
  },
  {
    id: 'health-information-specialist',
    name: 'Health Information Specialist',
    description: 'Clinical informatics, EHR management, data analytics, compliance',
    skillAreas: HEALTHCARE_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'healthcare-technology'
          ? 40
          : area.id === 'healthcare-admin'
            ? 25
            : area.id === 'healthcare-compliance'
              ? 20
              : area.id === 'clinical-skills'
                ? 10
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
    indicators: [
      'health information',
      'clinical informatics',
      'health informatics',
      'medical records',
      'him',
    ],
  },
];

/**
 * Finance / Accounting Background Configuration
 */
export const FINANCE_SKILL_AREAS: SkillAreaTemplate[] = [
  {
    id: 'financial-analysis',
    name: 'Financial Analysis',
    description: 'Financial modeling, valuation, DCF, reporting, ROI analysis',
    defaultWeight: 25,
    isRequired: true,
    keywords: [],
  },
  {
    id: 'accounting',
    name: 'Accounting',
    description: 'GAAP, IFRS, general ledger, reconciliation, AP/AR, tax',
    defaultWeight: 20,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'budgeting-forecasting',
    name: 'Budgeting & Forecasting',
    description: 'Budget management, P&L, cash flow, FP&A, treasury',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'investment-banking',
    name: 'Investment & Banking',
    description: 'Portfolio management, M&A, underwriting, equity research, securities',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'financial-compliance',
    name: 'Compliance & Audit',
    description: 'SOX, internal audit, risk management, AML, KYC, SEC, FINRA',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'finance-tools',
    name: 'Finance Tools',
    description: 'SAP, Oracle, QuickBooks, Bloomberg, Excel, Power BI, Tableau',
    defaultWeight: 10,
    isRequired: false,
    keywords: [],
  },
];

export const FINANCE_ROLES: RoleConfig[] = [
  {
    id: 'financial-analyst',
    name: 'Financial Analyst',
    description: 'Financial modeling, reporting, forecasting, variance analysis',
    skillAreas: FINANCE_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'financial-analysis'
          ? 40
          : area.id === 'budgeting-forecasting'
            ? 25
            : area.id === 'finance-tools'
              ? 20
              : area.id === 'accounting'
                ? 10
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
    indicators: ['financial analyst', 'finance analyst', 'fp&a analyst', 'financial planning'],
  },
  {
    id: 'accountant',
    name: 'Accountant',
    description: 'General ledger, reconciliation, tax, financial statements',
    skillAreas: FINANCE_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'accounting'
          ? 45
          : area.id === 'financial-compliance'
            ? 20
            : area.id === 'finance-tools'
              ? 15
              : area.id === 'financial-analysis'
                ? 10
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
    indicators: [
      'accountant',
      'accounting',
      'cpa',
      'staff accountant',
      'senior accountant',
      'controller',
    ],
  },
  {
    id: 'investment-banker',
    name: 'Investment Banker',
    description: 'M&A, capital markets, underwriting, due diligence',
    skillAreas: FINANCE_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'investment-banking'
          ? 45
          : area.id === 'financial-analysis'
            ? 30
            : area.id === 'financial-compliance'
              ? 15
              : area.id === 'finance-tools'
                ? 10
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead', 'principal'],
    indicators: [
      'investment banker',
      'investment banking',
      'capital markets',
      'equity research',
      'ibd',
    ],
  },
  {
    id: 'financial-controller',
    name: 'Financial Controller',
    description: 'Financial oversight, accounting operations, compliance, reporting',
    skillAreas: FINANCE_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'accounting'
          ? 35
          : area.id === 'financial-compliance'
            ? 25
            : area.id === 'budgeting-forecasting'
              ? 20
              : area.id === 'financial-analysis'
                ? 15
                : 5,
    })),
    seniorityLevels: ['senior', 'lead', 'principal'],
    indicators: ['financial controller', 'controller', 'finance director', 'vp finance'],
  },
  {
    id: 'fpa-analyst',
    name: 'FP&A Analyst',
    description: 'Financial planning, budgeting, forecasting, business partnering',
    skillAreas: FINANCE_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'budgeting-forecasting'
          ? 40
          : area.id === 'financial-analysis'
            ? 30
            : area.id === 'finance-tools'
              ? 15
              : area.id === 'accounting'
                ? 10
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
    indicators: ['fp&a', 'financial planning', 'fpa analyst', 'budget analyst'],
  },
];

/**
 * Legal Background Configuration
 */
export const LEGAL_SKILL_AREAS: SkillAreaTemplate[] = [
  {
    id: 'legal-practice',
    name: 'Legal Practice Areas',
    description: 'Litigation, corporate, IP, employment, regulatory, tax law',
    defaultWeight: 25,
    isRequired: true,
    keywords: [],
  },
  {
    id: 'legal-research',
    name: 'Legal Research & Writing',
    description: 'Case law, briefs, motions, memoranda, discovery, argumentation',
    defaultWeight: 25,
    isRequired: true,
    keywords: [],
  },
  {
    id: 'contract-management',
    name: 'Contract Management',
    description: 'Contract drafting, negotiation, review, NDA, SLA, MSA',
    defaultWeight: 20,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'legal-tools',
    name: 'Legal Tools & Technology',
    description: 'Westlaw, LexisNexis, e-discovery, case management, CLM',
    defaultWeight: 10,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'legal-compliance',
    name: 'Compliance & Governance',
    description: 'Regulatory compliance, corporate governance, due diligence, ethics',
    defaultWeight: 20,
    isRequired: false,
    keywords: [],
  },
];

export const LEGAL_ROLES: RoleConfig[] = [
  {
    id: 'attorney',
    name: 'Attorney / Lawyer',
    description: 'Legal practice, litigation, client representation, legal strategy',
    skillAreas: LEGAL_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'legal-practice'
          ? 35
          : area.id === 'legal-research'
            ? 30
            : area.id === 'legal-compliance'
              ? 15
              : area.id === 'contract-management'
                ? 15
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead', 'principal'],
    indicators: ['attorney', 'lawyer', 'counsel', 'associate attorney', 'partner', 'of counsel'],
  },
  {
    id: 'paralegal',
    name: 'Paralegal',
    description: 'Legal research, document preparation, case management, filing',
    skillAreas: LEGAL_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'legal-research'
          ? 35
          : area.id === 'contract-management'
            ? 25
            : area.id === 'legal-tools'
              ? 20
              : area.id === 'legal-practice'
                ? 15
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior'],
    indicators: ['paralegal', 'legal assistant', 'litigation paralegal', 'corporate paralegal'],
  },
  {
    id: 'compliance-officer',
    name: 'Compliance Officer',
    description: 'Regulatory compliance, policy development, risk assessment, governance',
    skillAreas: LEGAL_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'legal-compliance'
          ? 45
          : area.id === 'legal-practice'
            ? 25
            : area.id === 'legal-research'
              ? 15
              : area.id === 'contract-management'
                ? 10
                : 5,
    })),
    seniorityLevels: ['mid', 'senior', 'lead', 'principal'],
    indicators: [
      'compliance officer',
      'compliance manager',
      'compliance director',
      'chief compliance',
    ],
  },
  {
    id: 'contract-manager',
    name: 'Contract Manager',
    description: 'Contract lifecycle, vendor negotiations, agreement drafting',
    skillAreas: LEGAL_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'contract-management'
          ? 45
          : area.id === 'legal-compliance'
            ? 20
            : area.id === 'legal-practice'
              ? 15
              : area.id === 'legal-tools'
                ? 15
                : 5,
    })),
    seniorityLevels: ['mid', 'senior', 'lead'],
    indicators: [
      'contract manager',
      'contracts manager',
      'contract administrator',
      'contract specialist',
    ],
  },
];

/**
 * Education Background Configuration
 */
export const EDUCATION_SKILL_AREAS: SkillAreaTemplate[] = [
  {
    id: 'teaching-instruction',
    name: 'Teaching & Instruction',
    description: 'Pedagogy, differentiated instruction, assessment, lesson planning',
    defaultWeight: 25,
    isRequired: true,
    keywords: [],
  },
  {
    id: 'curriculum-design',
    name: 'Curriculum Design',
    description: 'Curriculum development, standards alignment, backward design, course creation',
    defaultWeight: 20,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'student-management',
    name: 'Student Management & Support',
    description: 'Classroom management, special education, IEP, ESL, counseling',
    defaultWeight: 20,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'educational-technology',
    name: 'Educational Technology',
    description: 'LMS, e-learning, edtech tools, SCORM, adaptive learning',
    defaultWeight: 15,
    isRequired: false,
    keywords: [],
  },
  {
    id: 'training-development',
    name: 'Training & Development',
    description: 'Instructional design, ADDIE, corporate training, L&D, facilitation',
    defaultWeight: 20,
    isRequired: false,
    keywords: [],
  },
];

export const EDUCATION_ROLES: RoleConfig[] = [
  {
    id: 'teacher',
    name: 'Teacher (K-12)',
    description: 'Classroom instruction, lesson planning, student assessment, parent communication',
    skillAreas: EDUCATION_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'teaching-instruction'
          ? 40
          : area.id === 'student-management'
            ? 25
            : area.id === 'curriculum-design'
              ? 20
              : area.id === 'educational-technology'
                ? 10
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
    indicators: [
      'teacher',
      'classroom teacher',
      'k-12',
      'k12',
      'elementary teacher',
      'high school teacher',
    ],
  },
  {
    id: 'instructional-designer',
    name: 'Instructional Designer',
    description: 'Course design, e-learning development, ADDIE, learning technology',
    skillAreas: EDUCATION_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'training-development'
          ? 35
          : area.id === 'curriculum-design'
            ? 25
            : area.id === 'educational-technology'
              ? 25
              : area.id === 'teaching-instruction'
                ? 10
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
    indicators: [
      'instructional designer',
      'learning designer',
      'e-learning developer',
      'course developer',
    ],
  },
  {
    id: 'professor',
    name: 'Professor / Lecturer',
    description: 'Higher education teaching, research, curriculum, academic advising',
    skillAreas: EDUCATION_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'teaching-instruction'
          ? 40
          : area.id === 'curriculum-design'
            ? 30
            : area.id === 'educational-technology'
              ? 15
              : area.id === 'student-management'
                ? 10
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead', 'principal'],
    indicators: [
      'professor',
      'lecturer',
      'adjunct',
      'assistant professor',
      'associate professor',
      'tenure',
    ],
  },
  {
    id: 'corporate-trainer',
    name: 'Corporate Trainer',
    description: 'Employee training, workshop facilitation, onboarding, L&D',
    skillAreas: EDUCATION_SKILL_AREAS.map((area) => ({
      ...area,
      defaultWeight:
        area.id === 'training-development'
          ? 45
          : area.id === 'educational-technology'
            ? 20
            : area.id === 'teaching-instruction'
              ? 20
              : area.id === 'curriculum-design'
                ? 10
                : 5,
    })),
    seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
    indicators: [
      'corporate trainer',
      'training specialist',
      'l&d',
      'learning and development',
      'facilitator',
    ],
  },
];

/**
 * All background configurations
 */
export const BACKGROUND_CONFIGS: BackgroundConfig[] = [
  {
    id: 'computer-science',
    name: 'Computer Science / Software Engineering',
    description: 'Software development, programming, technical roles',
    roles: CS_ROLES,
    indicators: [
      'software',
      'developer',
      'engineer',
      'programming',
      'coding',
      'frontend',
      'backend',
      'fullstack',
      'devops',
      'data engineer',
      'machine learning',
      'web development',
      'mobile development',
    ],
  },
  {
    id: 'data-analytics',
    name: 'Data Analytics / Business Intelligence',
    description: 'Data analysis, visualization, business insights',
    roles: [
      {
        id: 'data-analyst',
        name: 'Data Analyst',
        description: 'Data analysis, reporting, insights',
        skillAreas: DATA_SKILL_AREAS,
        seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
        indicators: ['data analyst', 'business analyst', 'analytics'],
      },
      {
        id: 'bi-analyst',
        name: 'BI Analyst',
        description: 'Business intelligence, dashboards, reporting',
        skillAreas: DATA_SKILL_AREAS.map((area) => ({
          ...area,
          defaultWeight:
            area.id === 'bi-tools'
              ? 50
              : area.id === 'data-visualization'
                ? 30
                : area.id === 'sql-databases'
                  ? 20
                  : 10,
        })),
        seniorityLevels: ['entry', 'mid', 'senior', 'lead'],
        indicators: ['bi analyst', 'business intelligence', 'power bi', 'tableau'],
      },
      {
        id: 'data-scientist',
        name: 'Data Scientist',
        description: 'Statistical modeling, ML, predictive analytics',
        skillAreas: DATA_SKILL_AREAS.map((area) => ({
          ...area,
          defaultWeight:
            area.id === 'ml-statistics'
              ? 40
              : area.id === 'programming'
                ? 30
                : area.id === 'data-analysis'
                  ? 25
                  : 10,
        })),
        seniorityLevels: ['mid', 'senior', 'lead', 'principal'],
        indicators: ['data scientist', 'data science', 'predictive analytics', 'ml scientist'],
      },
    ],
    indicators: [
      'data analyst',
      'data scientist',
      'business intelligence',
      'bi analyst',
      'analytics',
      'insights',
      'visualization',
      'tableau',
      'power bi',
    ],
  },
  // MBA / Business - IMPLEMENTED
  {
    id: 'mba-business',
    name: 'MBA / Business',
    description: 'Business management, strategy, operations',
    roles: MBA_ROLES,
    indicators: [
      'mba',
      'business',
      'management',
      'strategy',
      'operations',
      'consulting',
      'project manager',
      'product manager',
    ],
  },
  // Engineering (Non-Software) - IMPLEMENTED
  {
    id: 'engineering',
    name: 'Engineering (Non-Software)',
    description: 'Mechanical, electrical, civil, chemical engineering',
    roles: ENGINEERING_ROLES,
    indicators: [
      'mechanical',
      'electrical',
      'civil',
      'chemical',
      'structural',
      'pe license',
      'cad',
      'manufacturing',
      'quality engineer',
    ],
  },
  // Design / Creative - IMPLEMENTED
  {
    id: 'design',
    name: 'Design / Creative',
    description: 'UI/UX, graphic design, product design',
    roles: DESIGN_ROLES,
    indicators: [
      'designer',
      'ux',
      'ui',
      'graphic',
      'product design',
      'figma',
      'creative',
      'visual design',
    ],
  },
  // Marketing / Communications - IMPLEMENTED
  {
    id: 'marketing',
    name: 'Marketing / Communications',
    description: 'Digital marketing, content, communications',
    roles: MARKETING_ROLES,
    indicators: [
      'marketing',
      'seo',
      'content',
      'social media',
      'brand',
      'communications',
      'digital marketing',
      'growth',
    ],
  },
  // Healthcare - IMPLEMENTED
  {
    id: 'healthcare',
    name: 'Healthcare',
    description: 'Medical, clinical, health administration',
    roles: HEALTHCARE_ROLES,
    indicators: [
      'healthcare',
      'medical',
      'clinical',
      'hospital',
      'patient',
      'nursing',
      'nurse',
      'physician',
    ],
  },
  // Finance / Accounting - IMPLEMENTED
  {
    id: 'finance',
    name: 'Finance / Accounting',
    description: 'Financial analysis, accounting, investment',
    roles: FINANCE_ROLES,
    indicators: [
      'finance',
      'accounting',
      'investment',
      'banking',
      'financial',
      'cpa',
      'cfa',
      'audit',
    ],
  },
  // Legal - IMPLEMENTED
  {
    id: 'legal',
    name: 'Legal',
    description: 'Law, compliance, legal operations',
    roles: LEGAL_ROLES,
    indicators: [
      'lawyer',
      'attorney',
      'legal',
      'compliance',
      'paralegal',
      'jd degree',
      'litigation',
    ],
  },
  // Education - IMPLEMENTED
  {
    id: 'education',
    name: 'Education',
    description: 'Teaching, training, instructional design',
    roles: EDUCATION_ROLES,
    indicators: [
      'teacher',
      'instructor',
      'professor',
      'education',
      'training',
      'curriculum',
      'instructional design',
    ],
  },
  {
    id: 'other',
    name: 'Other',
    description: 'Custom background',
    roles: [],
    indicators: [],
  },
];

/**
 * Helper: Get background config by ID
 */
export function getBackgroundConfig(backgroundId: BackgroundType): BackgroundConfig | undefined {
  return BACKGROUND_CONFIGS.find((b) => b.id === backgroundId);
}

/**
 * Helper: Get role config by ID within a background
 */
export function getRoleConfig(
  backgroundId: BackgroundType,
  roleId: string
): RoleConfig | undefined {
  const background = getBackgroundConfig(backgroundId);
  return background?.roles.find((r) => r.id === roleId);
}

/**
 * Helper: Detect background from job description
 */
export function detectBackgroundFromJD(jobDescription: string): BackgroundType | null {
  const jdLower = jobDescription.toLowerCase();

  let bestMatch: { background: BackgroundType; score: number } | null = null;

  for (const config of BACKGROUND_CONFIGS) {
    let score = 0;
    for (const indicator of config.indicators) {
      if (jdLower.includes(indicator.toLowerCase())) {
        score++;
      }
    }

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { background: config.id, score };
    }
  }

  return bestMatch?.background ?? null;
}

/**
 * Helper: Detect role from job description within a background
 */
export function detectRoleFromJD(
  backgroundId: BackgroundType,
  jobDescription: string
): string | null {
  const background = getBackgroundConfig(backgroundId);
  if (!background) return null;

  const jdLower = jobDescription.toLowerCase();

  let bestMatch: { roleId: string; score: number } | null = null;

  for (const role of background.roles) {
    let score = 0;
    for (const indicator of role.indicators) {
      if (jdLower.includes(indicator.toLowerCase())) {
        score++;
      }
    }

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { roleId: role.id, score };
    }
  }

  return bestMatch?.roleId ?? null;
}
