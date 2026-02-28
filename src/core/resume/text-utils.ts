/**
 * Text Utility Functions
 * Pure functions that can run in any context (browser or service worker)
 * No DOM dependencies
 */

/**
 * Generate checksum for file content
 */
export async function generateChecksum(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract the work experience section from resume text, excluding education/projects/skills.
 * This prevents education dates from being counted as work experience.
 */
function extractWorkExperienceSection(rawText: string): string {
  // Common work experience section headers
  const expHeaders =
    /\b(work\s+experience|professional\s+experience|experience|employment\s+history|career\s+history|work\s+history)\b/i;
  // Section headers that END the work experience section
  const endHeaders =
    /\b(education|academic|skills|technical\s+skills|certifications|projects|publications|awards|honors|volunteer|interests|references|additional)\b/i;

  const expMatch = expHeaders.exec(rawText);
  if (!expMatch) return rawText; // Can't find experience section, use full text

  const startIdx = expMatch.index;
  const afterExp = rawText.substring(startIdx + expMatch[0].length);
  const endMatch = endHeaders.exec(afterExp);

  if (endMatch) {
    return rawText.substring(startIdx, startIdx + expMatch[0].length + endMatch.index);
  }
  return rawText.substring(startIdx); // Experience goes to end of document
}

/**
 * Calculate years of experience from text
 * Only counts work experience dates, not education dates
 */
export function estimateYearsOfExperience(rawText: string): number {
  // Look for explicit years of experience mentions
  const expMatch = rawText.match(
    /(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:professional\s+)?(?:experience|exp)/i
  );
  if (expMatch) {
    return parseInt(expMatch[1], 10);
  }

  // Extract only the work experience section to avoid counting education dates
  const workText = extractWorkExperienceSection(rawText);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-12

  // Month name mapping
  const monthMap: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  // Extract date ranges with various formats
  interface DateRange {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
  }

  const dateRanges: DateRange[] = [];

  // Pattern 1: "Month YYYY - Month YYYY" or "Month YYYY - Present"
  const monthYearPattern =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*[,.]?\s*((?:19|20)\d{2})\s*[-–—to]+\s*(present|current|now|(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*[,.]?\s*((?:19|20)\d{2}))/gi;

  for (const match of workText.matchAll(monthYearPattern)) {
    const startMonth = monthMap[match[1].toLowerCase().substring(0, 3)] || 1;
    const startYear = parseInt(match[2], 10);
    let endMonth = currentMonth;
    let endYear = currentYear;

    if (
      match[3].toLowerCase() !== 'present' &&
      match[3].toLowerCase() !== 'current' &&
      match[3].toLowerCase() !== 'now'
    ) {
      endMonth = match[4] ? monthMap[match[4].toLowerCase().substring(0, 3)] || 12 : 12;
      endYear = match[5] ? parseInt(match[5], 10) : currentYear;
    }

    if (endYear >= startYear) {
      dateRanges.push({ startYear, startMonth, endYear, endMonth });
    }
  }

  // Pattern 2: "MM/YYYY - MM/YYYY" or "MM/YYYY - Present"
  const numericDatePattern =
    /\b(\d{1,2})\s*[/\-.]\s*((?:19|20)\d{2})\s*[-–—to]+\s*(present|current|now|(\d{1,2})\s*[/\-.]\s*((?:19|20)\d{2}))/gi;

  for (const match of workText.matchAll(numericDatePattern)) {
    const startMonth = Math.min(12, Math.max(1, parseInt(match[1], 10)));
    const startYear = parseInt(match[2], 10);
    let endMonth = currentMonth;
    let endYear = currentYear;

    if (
      match[3].toLowerCase() !== 'present' &&
      match[3].toLowerCase() !== 'current' &&
      match[3].toLowerCase() !== 'now'
    ) {
      endMonth = match[4] ? Math.min(12, Math.max(1, parseInt(match[4], 10))) : 12;
      endYear = match[5] ? parseInt(match[5], 10) : currentYear;
    }

    if (endYear >= startYear) {
      dateRanges.push({ startYear, startMonth, endYear, endMonth });
    }
  }

  // Pattern 3: "YYYY - YYYY" or "YYYY - Present" (fallback for year-only formats)
  const yearOnlyPattern =
    /\b((?:19|20)\d{2})\s*[-–—to]+\s*(present|current|now|(?:19|20)\d{2})\b/gi;

  for (const match of workText.matchAll(yearOnlyPattern)) {
    const startYear = parseInt(match[1], 10);
    let endYear = currentYear;

    if (
      match[2].toLowerCase() !== 'present' &&
      match[2].toLowerCase() !== 'current' &&
      match[2].toLowerCase() !== 'now'
    ) {
      endYear = parseInt(match[2], 10);
    }

    // Only add if we don't already have a more precise match for this range
    const hasOverlap = dateRanges.some((r) => r.startYear === startYear || r.endYear === endYear);

    if (!hasOverlap && endYear >= startYear) {
      // Use conservative estimate: assume full years
      dateRanges.push({ startYear, startMonth: 1, endYear, endMonth: 12 });
    }
  }

  // Sort by start date and merge overlapping ranges
  dateRanges.sort((a, b) => {
    const aStart = a.startYear * 12 + a.startMonth;
    const bStart = b.startYear * 12 + b.startMonth;
    return aStart - bStart;
  });

  // Merge overlapping ranges to avoid double-counting
  const mergedRanges: DateRange[] = [];
  for (const range of dateRanges) {
    if (mergedRanges.length === 0) {
      mergedRanges.push(range);
    } else {
      const last = mergedRanges[mergedRanges.length - 1];
      const lastEnd = last.endYear * 12 + last.endMonth;
      const rangeStart = range.startYear * 12 + range.startMonth;

      if (rangeStart <= lastEnd + 1) {
        // Overlapping or adjacent, extend the last range
        const rangeEnd = range.endYear * 12 + range.endMonth;
        if (rangeEnd > lastEnd) {
          last.endYear = range.endYear;
          last.endMonth = range.endMonth;
        }
      } else {
        // Non-overlapping, add new range
        mergedRanges.push(range);
      }
    }
  }

  // Calculate total months from merged ranges
  let totalMonths = 0;
  for (const range of mergedRanges) {
    const months = (range.endYear - range.startYear) * 12 + (range.endMonth - range.startMonth) + 1;
    totalMonths += months;
  }

  // Convert to years — floor to avoid inflating experience
  return Math.floor(totalMonths / 12);
}

/**
 * Extract structured data without AI (regex-based, fast & free)
 * This provides basic extraction for instant use while AI analyzes in background
 */
export function extractBasicInfo(rawText: string): {
  email?: string;
  phone?: string;
  linkedIn?: string;
  github?: string;
  name?: string;
  skills: string[];
} {
  // Email
  const emailMatch = rawText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  const email = emailMatch?.[0];

  // Phone (various formats)
  const phoneMatch = rawText.match(/\b\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/);
  const phone = phoneMatch?.[0];

  // LinkedIn - handle various formats
  const linkedInMatch = rawText.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)\/?(?:\?[^\s]*)?/i
  );
  let linkedIn = linkedInMatch ? `https://www.linkedin.com/in/${linkedInMatch[1]}` : undefined;

  if (!linkedIn) {
    const linkedInAltMatch = rawText.match(/linkedin[:\s]+(?:\/in\/)?([a-zA-Z0-9_-]{3,})/i);
    if (linkedInAltMatch && linkedInAltMatch[1].length >= 3) {
      linkedIn = `https://www.linkedin.com/in/${linkedInAltMatch[1]}`;
    }
  }

  // GitHub - handle various formats
  const githubMatch = rawText.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)\/?(?:\?[^\s]*)?/i
  );
  let github = githubMatch ? `https://github.com/${githubMatch[1]}` : undefined;

  if (!github) {
    const githubAltMatch = rawText.match(/github[:\s]+([a-zA-Z0-9_-]{2,})/i);
    if (githubAltMatch && githubAltMatch[1].length >= 2) {
      github = `https://github.com/${githubAltMatch[1]}`;
    }
  }

  // Name (usually first line or near top) - robust detection
  const lines = rawText.split('\n').filter((l) => l.trim());
  let name: string | undefined;
  for (const line of lines.slice(0, 10)) {
    const cleaned = line.trim();

    // Skip lines that look like section headers or contact info
    if (/^(experience|education|skills|summary|profile|contact|email|phone|address)/i.test(cleaned))
      continue;
    if (/@/.test(cleaned) || /linkedin|github|http/i.test(cleaned)) continue;
    if (/^\d/.test(cleaned)) continue;

    // Pattern 1: Title Case "John Smith"
    if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+){1,3}$/.test(cleaned) && cleaned.length < 50) {
      name = cleaned;
      break;
    }
    // Pattern 2: ALL CAPS "JOHN SMITH"
    if (/^[A-Z]+(\s+[A-Z]+){1,3}$/.test(cleaned) && cleaned.length > 3 && cleaned.length < 50) {
      name = cleaned.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      break;
    }
    // Pattern 3: Middle initial "John A. Smith"
    if (/^[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+$/.test(cleaned)) {
      name = cleaned;
      break;
    }
    // Pattern 4: 2-4 capitalized words
    const words = cleaned.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && cleaned.length < 50) {
      const looksLikeName = words.every((w) => /^[A-Z]/.test(w)) && !cleaned.includes(':');
      if (looksLikeName) {
        name = cleaned;
        break;
      }
    }
  }

  // Extract skills using common tech keywords
  const skills = extractSkillsFromText(rawText);

  console.debug('[BasicInfo] Extracted fields:', {
    hasName: !!name,
    hasEmail: !!email,
    hasLinkedIn: !!linkedIn,
    hasGithub: !!github,
    skillsCount: skills.length,
  });

  return { email, phone, linkedIn, github, name, skills };
}

/**
 * Extract technical skills from text (regex-based, no AI)
 */
function extractSkillsFromText(text: string): string[] {
  const skillsSet = new Set<string>();
  const lowerText = text.toLowerCase();

  // Common tech skills to look for
  const skillPatterns: [RegExp, string][] = [
    // Languages
    [/\bjavascript\b|\bjs\b/g, 'JavaScript'],
    [/\btypescript\b|\bts\b/g, 'TypeScript'],
    [/\bpython\b/g, 'Python'],
    [/\bjava\b(?!\s*script)/g, 'Java'],
    [/\bc\+\+\b/g, 'C++'],
    [/\bc#\b|csharp/g, 'C#'],
    [/\bgolang\b|\bgo\b(?=\s+(?:programming|language|experience))/g, 'Go'],
    [/\brust\b/g, 'Rust'],
    [/\bruby\b/g, 'Ruby'],
    [/\bphp\b/g, 'PHP'],
    [/\bswift\b/g, 'Swift'],
    [/\bkotlin\b/g, 'Kotlin'],
    [/\bscala\b/g, 'Scala'],
    [/\br\b(?=\s+(?:programming|language|statistical))/g, 'R'],

    // Frontend
    [/\breact(?:\.?js)?\b/g, 'React'],
    [/\bangular\b/g, 'Angular'],
    [/\bvue(?:\.?js)?\b/g, 'Vue.js'],
    [/\bnext\.?js\b/g, 'Next.js'],
    [/\bsvelte\b/g, 'Svelte'],
    [/\bredux\b/g, 'Redux'],
    [/\bgraphql\b/g, 'GraphQL'],
    [/\bhtml5?\b/g, 'HTML'],
    [/\bcss3?\b/g, 'CSS'],
    [/\bsass\b|\bscss\b/g, 'SASS'],
    [/\btailwind\b/g, 'Tailwind CSS'],

    // Backend
    [/\bnode\.?js\b/g, 'Node.js'],
    [/\bexpress\.?js\b/g, 'Express.js'],
    [/\bdjango\b/g, 'Django'],
    [/\bflask\b/g, 'Flask'],
    [/\bfastapi\b/g, 'FastAPI'],
    [/\bspring\b(?:\s*boot)?\b/g, 'Spring'],
    [/\brails\b/g, 'Rails'],
    [/\b\.net\b/g, '.NET'],

    // Cloud & DevOps
    [/\baws\b|amazon\s*web\s*services/g, 'AWS'],
    [/\bazure\b/g, 'Azure'],
    [/\bgcp\b|google\s*cloud/g, 'GCP'],
    [/\bdocker\b/g, 'Docker'],
    [/\bkubernetes\b|\bk8s\b/g, 'Kubernetes'],
    [/\bterraform\b/g, 'Terraform'],
    [/\bjenkins\b/g, 'Jenkins'],
    [/\bci\s*\/?\s*cd\b/g, 'CI/CD'],
    [/\bgithub\s*actions\b/g, 'GitHub Actions'],
    [/\blinux\b/g, 'Linux'],

    // Databases
    [/\bpostgresql\b|\bpostgres\b/g, 'PostgreSQL'],
    [/\bmysql\b/g, 'MySQL'],
    [/\bmongodb\b/g, 'MongoDB'],
    [/\bredis\b/g, 'Redis'],
    [/\belasticsearch\b/g, 'Elasticsearch'],
    [/\bdynamodb\b/g, 'DynamoDB'],
    [/\bsql\b/g, 'SQL'],

    // AI/ML
    [/\bmachine\s*learning\b/g, 'Machine Learning'],
    [/\bdeep\s*learning\b/g, 'Deep Learning'],
    [/\btensorflow\b/g, 'TensorFlow'],
    [/\bpytorch\b/g, 'PyTorch'],
    [/\bllm\b|large\s*language\s*model/g, 'LLM'],
    [/\bnlp\b|natural\s*language\s*processing/g, 'NLP'],
    [/\bcomputer\s*vision\b/g, 'Computer Vision'],

    // Tools
    [/\bgit\b/g, 'Git'],
    [/\bjira\b/g, 'Jira'],
    [/\bagile\b/g, 'Agile'],
    [/\bscrum\b/g, 'Scrum'],
    [/\brest\s*(?:api|ful)?\b/g, 'REST API'],
    [/\bmicroservices\b/g, 'Microservices'],
  ];

  for (const [pattern, skill] of skillPatterns) {
    if (pattern.test(lowerText)) {
      skillsSet.add(skill);
    }
  }

  return Array.from(skillsSet).sort();
}

/**
 * Extract keywords from resume for ATS matching
 * Pure function - no DOM dependencies
 */
export function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-./+#]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  // Common tech terms and skills
  const techTerms = new Set<string>();

  // Single words
  const singleWordSkills = [
    'javascript',
    'typescript',
    'python',
    'java',
    'golang',
    'rust',
    'ruby',
    'php',
    'swift',
    'kotlin',
    'react',
    'angular',
    'vue',
    'svelte',
    'nextjs',
    'nuxt',
    'gatsby',
    'nodejs',
    'express',
    'fastapi',
    'django',
    'flask',
    'spring',
    'rails',
    'aws',
    'azure',
    'gcp',
    'heroku',
    'vercel',
    'netlify',
    'docker',
    'kubernetes',
    'terraform',
    'ansible',
    'jenkins',
    'circleci',
    'github',
    'postgresql',
    'mysql',
    'mongodb',
    'redis',
    'elasticsearch',
    'dynamodb',
    'cassandra',
    'graphql',
    'rest',
    'grpc',
    'websocket',
    'linux',
    'unix',
    'bash',
    'powershell',
    'git',
    'jira',
    'confluence',
    'slack',
    'agile',
    'scrum',
    'kanban',
    'tensorflow',
    'pytorch',
    'pandas',
    'numpy',
    'scikit',
    'html',
    'css',
    'sass',
    'tailwind',
    'bootstrap',
  ];

  for (const word of words) {
    if (singleWordSkills.includes(word)) {
      techTerms.add(word);
    }
  }

  // Multi-word terms
  const lowerText = text.toLowerCase();
  const multiWordTerms = [
    'machine learning',
    'deep learning',
    'natural language processing',
    'nlp',
    'ci/cd',
    'ci cd',
    'continuous integration',
    'continuous deployment',
    'test driven development',
    'tdd',
    'behavior driven development',
    'bdd',
    'amazon web services',
    'google cloud',
    'microsoft azure',
    'node.js',
    'react.js',
    'vue.js',
    'next.js',
    'rest api',
    'restful api',
    'graphql api',
    'sql server',
    'oracle database',
    'data structures',
    'algorithms',
    'system design',
    'microservices',
    'serverless',
    'event driven',
    'unit testing',
    'integration testing',
    'e2e testing',
    'project management',
    'product management',
    'team leadership',
  ];

  for (const term of multiWordTerms) {
    if (lowerText.includes(term)) {
      techTerms.add(term);
    }
  }

  return [...techTerms].sort();
}
