/**
 * Resume File Parser
 * Extracts text from PDF and DOCX files
 * Cost-effective: No AI needed for text extraction
 *
 * IMPORTANT: This module uses dynamic imports to prevent mammoth and pdfjs-dist
 * from being bundled into shared chunks that could be loaded by the service worker.
 * These libraries require DOM access and will fail in service worker context.
 */

import type { ResumeParseResult } from '@shared/types/master-profile.types';

// Track if PDF.js worker has been configured
let pdfWorkerConfigured = false;

/**
 * Parse a resume file and extract raw text
 */
export async function parseResumeFile(file: File): Promise<ResumeParseResult> {
  const fileType = getFileType(file.name);

  if (!fileType) {
    return {
      success: false,
      rawText: '',
      confidence: 0,
      errors: [`Unsupported file type: ${file.name}. Please use PDF, DOCX, or TXT files.`],
    };
  }

  try {
    let rawText = '';

    switch (fileType) {
      case 'pdf':
        rawText = await extractTextFromPDF(file);
        break;
      case 'docx':
        rawText = await extractTextFromDOCX(file);
        break;
      case 'txt':
        rawText = await extractTextFromTXT(file);
        break;
    }

    // Clean and normalize the text
    rawText = normalizeText(rawText);

    if (!rawText.trim()) {
      return {
        success: false,
        rawText: '',
        confidence: 0,
        errors: ['Could not extract text from file. The file may be image-based or corrupted.'],
      };
    }

    // Quick validation that this looks like a resume
    const validation = validateResumeContent(rawText);

    return {
      success: validation.isValid,
      rawText,
      confidence: validation.confidence,
      warnings: validation.warnings,
    };
  } catch (error) {
    console.error('Resume parsing error:', error);
    return {
      success: false,
      rawText: '',
      confidence: 0,
      errors: [`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

/**
 * Get file type from filename
 */
function getFileType(filename: string): 'pdf' | 'docx' | 'txt' | null {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf':
      return 'pdf';
    case 'docx':
    case 'doc':
      return 'docx';
    case 'txt':
      return 'txt';
    default:
      return null;
  }
}

/**
 * Extract text from PDF file
 * Uses dynamic import to prevent pdfjs-dist from being bundled into shared chunks
 */
async function extractTextFromPDF(file: File): Promise<string> {
  // Dynamic import to avoid bundling pdfjs-dist into shared chunks
  const pdfjsLib = await import('pdfjs-dist');

  // Configure worker only once
  if (!pdfWorkerConfigured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
    pdfWorkerConfigured = true;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const textParts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => {
        if ('str' in item) {
          return item.str;
        }
        return '';
      })
      .join(' ');
    textParts.push(pageText);
  }

  return textParts.join('\n\n');
}

/**
 * Extract text from DOCX file
 * Uses dynamic import to prevent mammoth from being bundled into shared chunks
 */
async function extractTextFromDOCX(file: File): Promise<string> {
  // Dynamic import to avoid bundling mammoth into shared chunks
  const mammoth = await import('mammoth');

  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });

  if (result.messages.length > 0) {
    console.warn('DOCX parsing warnings:', result.messages);
  }

  return result.value;
}

/**
 * Extract text from TXT file
 */
async function extractTextFromTXT(file: File): Promise<string> {
  return await file.text();
}

/**
 * Normalize and clean extracted text
 */
function normalizeText(text: string): string {
  return (
    text
      // Normalize whitespace
      .replace(/[\t\f\v]+/g, ' ')
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive newlines (more than 2)
      .replace(/\n{3,}/g, '\n\n')
      // Remove leading/trailing whitespace from lines
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      // Remove leading/trailing whitespace from document
      .trim()
  );
}

/**
 * Validate that the extracted text looks like a resume
 */
function validateResumeContent(text: string): {
  isValid: boolean;
  confidence: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let score = 0;
  const maxScore = 10;

  // Check minimum length
  if (text.length < 200) {
    warnings.push('Document seems too short to be a resume');
    return { isValid: false, confidence: 0, warnings };
  }

  // Check for common resume sections
  const sectionPatterns = [
    /experience|employment|work history/i,
    /education|academic|degree/i,
    /skills|technical skills|competencies/i,
    /summary|objective|profile/i,
    /projects?|portfolio/i,
  ];

  let sectionsFound = 0;
  for (const pattern of sectionPatterns) {
    if (pattern.test(text)) {
      sectionsFound++;
      score += 1.5;
    }
  }

  if (sectionsFound < 2) {
    warnings.push('Could not find common resume sections (Experience, Education, Skills)');
  }

  // Check for contact info patterns
  const contactPatterns = [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
    /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, // Phone
    /linkedin\.com\/in\//i, // LinkedIn
    /github\.com\//i, // GitHub
  ];

  let contactFound = 0;
  for (const pattern of contactPatterns) {
    if (pattern.test(text)) {
      contactFound++;
      score += 0.5;
    }
  }

  if (contactFound === 0) {
    warnings.push('No contact information found (email, phone, LinkedIn)');
  }

  // Check for date patterns (employment dates)
  const datePatterns = [
    /\b(19|20)\d{2}\s*[-–]\s*(present|current|(19|20)\d{2})/gi,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(19|20)\d{2}/gi,
    /\b\d{1,2}\/\d{4}/g,
  ];

  for (const pattern of datePatterns) {
    if (pattern.test(text)) {
      score += 1;
      break;
    }
  }

  // Check for common job titles
  const titlePatterns =
    /\b(engineer|developer|manager|analyst|designer|architect|lead|director|specialist|consultant|coordinator)\b/i;
  if (titlePatterns.test(text)) {
    score += 1;
  }

  // Calculate confidence
  const confidence = Math.min(score / maxScore, 1);
  const isValid = confidence >= 0.3; // At least 30% confidence

  if (!isValid) {
    warnings.push('This document may not be a resume. Please verify the content.');
  }

  return { isValid, confidence, warnings };
}

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
  // Matches: linkedin.com/in/username, www.linkedin.com/in/username, https://linkedin.com/in/username
  // Also handles: linkedin.com/in/username/, trailing parameters, underscores in usernames
  const linkedInMatch = rawText.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)\/?(?:\?[^\s]*)?/i
  );
  let linkedIn = linkedInMatch ? `https://www.linkedin.com/in/${linkedInMatch[1]}` : undefined;

  // Also try to find LinkedIn mentioned in other formats
  // e.g., "LinkedIn: username" or "linkedin/username"
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

  // Also try to find GitHub in other formats
  if (!github) {
    const githubAltMatch = rawText.match(/github[:\s]+([a-zA-Z0-9_-]{2,})/i);
    if (githubAltMatch && githubAltMatch[1].length >= 2) {
      github = `https://github.com/${githubAltMatch[1]}`;
    }
  }

  // Name (usually first line or near top)
  const lines = rawText.split('\n').filter((l) => l.trim());
  let name: string | undefined;
  for (const line of lines.slice(0, 10)) {
    // Check first 10 lines
    const cleaned = line.trim();

    // Skip lines that look like section headers or contact info
    if (
      /^(experience|education|skills|summary|profile|contact|email|phone|address)/i.test(cleaned)
    ) {
      continue;
    }
    if (/@/.test(cleaned) || /linkedin|github|http/i.test(cleaned)) {
      continue;
    }
    if (/^\d/.test(cleaned)) {
      continue; // Starts with number (phone, address)
    }

    // Pattern 1: Title Case "John Smith" or "John Adam Smith"
    if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+){1,3}$/.test(cleaned) && cleaned.length < 50) {
      name = cleaned;
      break;
    }

    // Pattern 2: ALL CAPS "JOHN SMITH"
    if (/^[A-Z]+(\s+[A-Z]+){1,3}$/.test(cleaned) && cleaned.length > 3 && cleaned.length < 50) {
      // Convert to title case
      name = cleaned.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      break;
    }

    // Pattern 3: Mixed with middle initial "John A. Smith" or "John A Smith"
    if (/^[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+$/.test(cleaned)) {
      name = cleaned;
      break;
    }

    // Pattern 4: Just 2-4 words that look like a name (after cleaning)
    const words = cleaned.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && cleaned.length < 50) {
      // Check if all words start with capital letter
      const looksLikeName = words.every((w) => /^[A-Z]/.test(w)) && !cleaned.includes(':');
      if (looksLikeName) {
        name = cleaned;
        break;
      }
    }
  }

  // Extract skills using common tech keywords
  const skills = extractSkillsFromText(rawText);

  console.log('[BasicInfo] Extracted name:', name);
  console.log('[BasicInfo] Extracted email:', email);
  console.log('[BasicInfo] Extracted linkedIn:', linkedIn);
  console.log('[BasicInfo] Extracted github:', github);
  console.log('[BasicInfo] Extracted skills count:', skills.length);

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

// estimateYearsOfExperience is in text-utils.ts (single source of truth)
