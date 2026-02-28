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

// Re-export from text-utils.ts (single source of truth for text extraction)
export { generateChecksum, extractBasicInfo } from './text-utils';
