/**
 * AI Content Authenticity Guard
 *
 * Scores text on how "human" vs "AI-generated" it sounds.
 * Uses 5 detection dimensions: AI phrases, sentence variety,
 * specificity, tone naturalness, and structure variety.
 *
 * Higher score = more authentic (human-sounding).
 * Follows the same pattern as red-flag-scanner.ts.
 */

import { detectAIPatterns } from '@core/content/humanizer';

// ── Types ────────────────────────────────────────────────────────────────

export type AuthenticityIssueSeverity = 'error' | 'warning' | 'info';

export type AuthenticityCategory =
  | 'ai_phrases'
  | 'sentence_variety'
  | 'specificity'
  | 'tone_naturalness'
  | 'structure_variety';

export interface AuthenticityIssue {
  severity: AuthenticityIssueSeverity;
  category: AuthenticityCategory;
  message: string;
  suggestion?: string;
}

export interface AuthenticityReport {
  overallScore: number;
  passesMinimum: boolean;
  categories: {
    aiPhrases: number;
    sentenceVariety: number;
    specificity: number;
    toneNaturalness: number;
    structureVariety: number;
  };
  issues: AuthenticityIssue[];
  summary: { errors: number; warnings: number; info: number };
}

// ── Constants ────────────────────────────────────────────────────────────

const GENERIC_FILLER = [
  'various stakeholders',
  'cross-functional teams',
  'dynamic environment',
  'fast-paced environment',
  'diverse set of',
  'wide range of',
  'best practices',
  'industry standards',
  'world-class',
  'next-generation',
  'innovative solutions',
  'strategic initiatives',
  'key stakeholders',
  'business objectives',
  'organizational goals',
  'value proposition',
  'core competencies',
  'thought leadership',
  'mission-critical',
  'end-to-end',
];

const PASSIVE_PATTERNS = [
  /\bwas\s+\w+ed\b/gi,
  /\bwere\s+\w+ed\b/gi,
  /\bbeen\s+\w+ed\b/gi,
  /\bis\s+being\s+\w+ed\b/gi,
  /\bhas\s+been\s+\w+ed\b/gi,
];

// ── Detection Functions ──────────────────────────────────────────────────

/**
 * Detect AI-cliché phrases. Delegates to humanizer's detectAIPatterns
 * and adds scoring based on density.
 */
export function detectAIPhraseUsage(text: string): {
  score: number;
  issues: AuthenticityIssue[];
} {
  const { score: aiScore, patterns } = detectAIPatterns(text);
  const issues: AuthenticityIssue[] = [];

  // aiScore: 0-100 where higher = more AI-like. Invert for authenticity.
  const authenticityScore = Math.max(0, 100 - aiScore);

  if (patterns.length >= 4) {
    issues.push({
      severity: 'error',
      category: 'ai_phrases',
      message: `Found ${patterns.length} AI-cliché phrases: ${patterns.slice(0, 3).join(', ')}${patterns.length > 3 ? '...' : ''}`,
      suggestion: 'Replace generic phrases with specific, concrete language',
    });
  } else if (patterns.length >= 2) {
    issues.push({
      severity: 'warning',
      category: 'ai_phrases',
      message: `Found ${patterns.length} AI-cliché phrases: ${patterns.join(', ')}`,
      suggestion: 'Consider rephrasing to sound more natural',
    });
  } else if (patterns.length === 1) {
    issues.push({
      severity: 'info',
      category: 'ai_phrases',
      message: `Found AI-cliché phrase: "${patterns[0]}"`,
      suggestion: 'Consider using a more natural alternative',
    });
  }

  return { score: authenticityScore, issues };
}

/**
 * Measure how varied sentence lengths are. AI tends to produce
 * uniform-length sentences.
 */
export function measureSentenceVariety(text: string): {
  score: number;
  issues: AuthenticityIssue[];
} {
  const issues: AuthenticityIssue[] = [];
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length < 3) {
    return { score: 80, issues };
  }

  const lengths = sentences.map((s) => s.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);
  const coeffOfVariation = mean > 0 ? stdDev / mean : 0;

  // coeffOfVariation: 0 = perfectly uniform, higher = more varied
  // Human writing typically has CV of 0.3-0.7
  let score: number;
  if (coeffOfVariation >= 0.35) {
    score = 100;
  } else if (coeffOfVariation >= 0.2) {
    score = 70 + ((coeffOfVariation - 0.2) / 0.15) * 30;
  } else {
    score = Math.max(20, coeffOfVariation * 350);
  }

  if (coeffOfVariation < 0.15) {
    issues.push({
      severity: 'warning',
      category: 'sentence_variety',
      message: 'Sentences are very uniform in length — a common AI pattern',
      suggestion: 'Mix short punchy sentences with longer detailed ones',
    });
  }

  // Check for repeated first-word patterns
  const firstWords = sentences.map((s) => s.split(/\s+/)[0].toLowerCase());
  const wordCounts = new Map<string, number>();
  for (const w of firstWords) {
    wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
  }

  for (const [word, count] of wordCounts) {
    const ratio = count / sentences.length;
    if (ratio > 0.4 && count >= 3) {
      issues.push({
        severity: 'warning',
        category: 'sentence_variety',
        message: `${Math.round(ratio * 100)}% of sentences start with "${word}"`,
        suggestion: 'Vary your sentence openings for a more natural flow',
      });
      score = Math.max(20, score - 15);
      break;
    }
  }

  return { score: Math.min(100, Math.round(score)), issues };
}

/**
 * Measure how specific vs. generic the content is.
 * Specific details (numbers, names, technologies) signal human authorship.
 */
export function measureSpecificity(text: string): {
  score: number;
  issues: AuthenticityIssue[];
} {
  const issues: AuthenticityIssue[] = [];
  const words = text.split(/\s+/).length;

  if (words < 10) {
    return { score: 80, issues };
  }

  let specificityPoints = 0;

  // Numbers and percentages
  const numbers = text.match(/\b\d[\d,.]*%?\b/g) || [];
  specificityPoints += Math.min(numbers.length * 5, 30);

  // Dollar amounts / metrics
  const metrics = text.match(/\$[\d,.]+[KMBkmb]?|\b\d+[xX]\b/g) || [];
  specificityPoints += Math.min(metrics.length * 8, 24);

  // Technology / tool names (capitalized multi-word or known patterns)
  const techPatterns =
    text.match(
      /\b(?:AWS|GCP|Azure|React|Python|Java|TypeScript|Docker|Kubernetes|PostgreSQL|MongoDB|Redis|Kafka|GraphQL|REST|CI\/CD|Jenkins|Terraform|Node\.js|Spring|Django|Vue|Angular)\b/gi
    ) || [];
  specificityPoints += Math.min(techPatterns.length * 3, 18);

  // Company/product names (capitalized words that aren't sentence starters)
  const properNouns =
    text.match(/(?<=[,;]\s|and\s|at\s|for\s|with\s)[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g) || [];
  specificityPoints += Math.min(properNouns.length * 3, 12);

  // Generic filler penalty
  let fillerCount = 0;
  for (const filler of GENERIC_FILLER) {
    if (text.toLowerCase().includes(filler)) {
      fillerCount++;
    }
  }
  specificityPoints -= fillerCount * 8;

  // Normalize: target ~40+ points for a 200-word text
  const wordsNormalizer = Math.max(100, words) / 200;
  const normalizedPoints = specificityPoints / wordsNormalizer;

  let score: number;
  if (normalizedPoints >= 40) {
    score = 100;
  } else if (normalizedPoints >= 20) {
    score = 60 + ((normalizedPoints - 20) / 20) * 40;
  } else {
    score = Math.max(10, normalizedPoints * 3);
  }

  if (fillerCount >= 3) {
    issues.push({
      severity: 'warning',
      category: 'specificity',
      message: `Found ${fillerCount} generic filler phrases`,
      suggestion:
        'Replace vague phrases with concrete details: team sizes, project names, specific tools',
    });
  }

  if (numbers.length === 0 && words > 100) {
    issues.push({
      severity: 'info',
      category: 'specificity',
      message: 'No quantitative details found',
      suggestion:
        'Add numbers where possible: team size, users impacted, time saved, percentage improvements',
    });
  }

  return { score: Math.min(100, Math.round(score)), issues };
}

/**
 * Measure how natural the tone is.
 * Checks: contractions, passive voice ratio, overly formal hedging.
 */
export function measureToneNaturalness(text: string): {
  score: number;
  issues: AuthenticityIssue[];
} {
  const issues: AuthenticityIssue[] = [];
  const words = text.split(/\s+/).length;

  if (words < 20) {
    return { score: 80, issues };
  }

  let score = 80; // baseline

  // Contractions: humans use them, AI avoids them
  const contractionCount = (text.match(/'[a-z]/gi) || []).length;
  const contractionRatio = contractionCount / words;

  if (contractionRatio >= 0.02) {
    score += 15; // natural level of contractions
  } else if (contractionRatio > 0) {
    score += 5;
  } else if (words > 50) {
    issues.push({
      severity: 'info',
      category: 'tone_naturalness',
      message: 'No contractions used — sounds overly formal',
      suggestion: "Use contractions like I'm, don't, it's for a more natural tone",
    });
    score -= 10;
  }

  // Passive voice ratio
  let passiveCount = 0;
  for (const pattern of PASSIVE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) passiveCount += matches.length;
  }

  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const passiveRatio = sentences.length > 0 ? passiveCount / sentences.length : 0;

  if (passiveRatio > 0.4) {
    issues.push({
      severity: 'warning',
      category: 'tone_naturalness',
      message: `High passive voice usage (${Math.round(passiveRatio * 100)}% of sentences)`,
      suggestion: 'Use active voice: "I built X" instead of "X was built"',
    });
    score -= 15;
  } else if (passiveRatio > 0.25) {
    score -= 5;
  }

  // Excessive hedging
  const hedgingPhrases = [
    'I believe that',
    'I feel that',
    'it could be said',
    'it is worth noting',
    'it should be noted',
    'arguably',
    'to some extent',
    'in my humble opinion',
  ];

  let hedgeCount = 0;
  for (const hedge of hedgingPhrases) {
    if (text.toLowerCase().includes(hedge)) hedgeCount++;
  }

  if (hedgeCount >= 3) {
    issues.push({
      severity: 'info',
      category: 'tone_naturalness',
      message: 'Excessive hedging language detected',
      suggestion: 'Be more direct — state accomplishments as facts',
    });
    score -= 10;
  }

  return { score: Math.min(100, Math.max(0, Math.round(score))), issues };
}

/**
 * Measure structural variety in bullet points and paragraphs.
 * AI tends to use identical structure patterns.
 */
export function measureStructureVariety(text: string): {
  score: number;
  issues: AuthenticityIssue[];
} {
  const issues: AuthenticityIssue[] = [];

  // Split into lines/bullets
  const lines = text
    .split(/\n/)
    .map((l) => l.replace(/^[-•–*]\s*/, '').trim())
    .filter((l) => l.length > 0);

  if (lines.length < 3) {
    return { score: 85, issues };
  }

  let score = 100;

  // Check bullet/line starting word diversity
  const startingWords = lines.map((l) => l.split(/\s+/)[0].toLowerCase());
  const uniqueStarts = new Set(startingWords).size;
  const startDiversity = uniqueStarts / startingWords.length;

  if (startDiversity < 0.4 && lines.length >= 5) {
    issues.push({
      severity: 'warning',
      category: 'structure_variety',
      message: `Low diversity in line openings (${uniqueStarts} unique out of ${lines.length})`,
      suggestion: 'Vary how you start each bullet point — mix verbs, context, results',
    });
    score -= 20;
  } else if (startDiversity < 0.6 && lines.length >= 4) {
    score -= 10;
  }

  // Check for identical sentence structure patterns
  // Pattern: same POS-like structure (verb-noun-prep-noun)
  const structurePatterns = lines.map((l) => {
    const words = l.split(/\s+/).slice(0, 4);
    return words
      .map((w) => {
        if (/^[A-Z][a-z]+ed$/.test(w)) return 'VERB_PAST';
        if (/^[A-Z][a-z]+ing$/.test(w)) return 'VERB_ING';
        if (/^(the|a|an)$/i.test(w)) return 'ART';
        if (/^(and|or|but|with|for|to|in|on|at|by)$/i.test(w)) return 'PREP';
        return 'OTHER';
      })
      .join('-');
  });

  const patternCounts = new Map<string, number>();
  for (const p of structurePatterns) {
    patternCounts.set(p, (patternCounts.get(p) || 0) + 1);
  }

  const maxPatternRepeat = patternCounts.size > 0 ? Math.max(...patternCounts.values()) : 0;
  const patternRatio = maxPatternRepeat / lines.length;

  if (patternRatio > 0.6 && lines.length >= 5) {
    issues.push({
      severity: 'warning',
      category: 'structure_variety',
      message: 'Many lines follow the exact same grammatical structure',
      suggestion: 'Mix up your sentence patterns: start some with context, others with results',
    });
    score -= 15;
  }

  // Check paragraph length uniformity (if paragraphs exist)
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length >= 3) {
    const paraLengths = paragraphs.map((p) => p.split(/\s+/).length);
    const mean = paraLengths.reduce((a, b) => a + b, 0) / paraLengths.length;
    const maxDev = Math.max(...paraLengths.map((l) => Math.abs(l - mean)));

    if (mean > 0 && maxDev / mean < 0.15) {
      issues.push({
        severity: 'info',
        category: 'structure_variety',
        message: 'Paragraphs are suspiciously uniform in length',
        suggestion: 'Vary paragraph lengths — some short, some longer',
      });
      score -= 10;
    }
  }

  return { score: Math.max(0, Math.round(score)), issues };
}

// ── Main Scoring Function ────────────────────────────────────────────────

/**
 * Score how authentic (human-sounding) the content is.
 * Returns 0-100 where higher = more human, plus detailed issues.
 */
export function scoreAuthenticity(
  text: string,
  contentType: 'resume' | 'cover_letter' | 'email' = 'resume'
): AuthenticityReport {
  if (!text || text.trim().length === 0) {
    return {
      overallScore: 100,
      passesMinimum: true,
      categories: {
        aiPhrases: 100,
        sentenceVariety: 100,
        specificity: 100,
        toneNaturalness: 100,
        structureVariety: 100,
      },
      issues: [],
      summary: { errors: 0, warnings: 0, info: 0 },
    };
  }

  const phraseResult = detectAIPhraseUsage(text);
  const varietyResult = measureSentenceVariety(text);
  const specificityResult = measureSpecificity(text);
  const toneResult = measureToneNaturalness(text);
  const structureResult = measureStructureVariety(text);

  const allIssues = [
    ...phraseResult.issues,
    ...varietyResult.issues,
    ...specificityResult.issues,
    ...toneResult.issues,
    ...structureResult.issues,
  ];

  // Adjust weights by content type
  let weights = { phrases: 0.25, variety: 0.2, specificity: 0.25, tone: 0.15, structure: 0.15 };

  if (contentType === 'cover_letter') {
    // Tone matters more for cover letters
    weights = { phrases: 0.25, variety: 0.15, specificity: 0.2, tone: 0.25, structure: 0.15 };
  } else if (contentType === 'email') {
    // Tone and phrases matter most for emails
    weights = { phrases: 0.3, variety: 0.15, specificity: 0.15, tone: 0.25, structure: 0.15 };
  }

  const overallScore = Math.round(
    phraseResult.score * weights.phrases +
      varietyResult.score * weights.variety +
      specificityResult.score * weights.specificity +
      toneResult.score * weights.tone +
      structureResult.score * weights.structure
  );

  const summary = {
    errors: allIssues.filter((i) => i.severity === 'error').length,
    warnings: allIssues.filter((i) => i.severity === 'warning').length,
    info: allIssues.filter((i) => i.severity === 'info').length,
  };

  return {
    overallScore: Math.min(100, Math.max(0, overallScore)),
    passesMinimum: overallScore >= 70,
    categories: {
      aiPhrases: phraseResult.score,
      sentenceVariety: varietyResult.score,
      specificity: specificityResult.score,
      toneNaturalness: toneResult.score,
      structureVariety: structureResult.score,
    },
    issues: allIssues,
    summary,
  };
}
