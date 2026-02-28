/**
 * Career Context Engine
 * Builds deep understanding of candidate's career profile
 * Similar to how Cursor understands a codebase
 */

import type { AIService } from '@/ai';
import type {
  MasterProfile,
  CareerContext,
  SkillsWithContext,
  AnswerBank,
  GeneratedProfile,
  CachedAnswer,
  CommonQuestionType,
} from '@shared/types/master-profile.types';
import {
  RESUME_PARSE_PROMPT,
  CAREER_CONTEXT_PROMPT,
  SKILLS_ENRICHMENT_PROMPT,
  PROFILE_GENERATOR_PROMPT,
  ANSWER_BANK_PROMPT,
  HUMANIZE_CONTENT_PROMPT,
} from '@/ai/prompts/templates';
import { sanitizePromptInput } from '@shared/utils/prompt-safety';
import { generateChecksum, estimateYearsOfExperience } from '../resume/text-utils';
import {
  detectBackgroundFromJD,
  getBackgroundConfig,
  detectRoleFromJD,
} from '@shared/types/background.types';
import type { UserBackgroundConfig } from '@shared/types/background.types';

export interface AnalysisProgress {
  stage: 'parsing' | 'extracting' | 'analyzing' | 'enriching' | 'generating' | 'complete';
  progress: number; // 0-100
  message: string;
}

export type ProgressCallback = (progress: AnalysisProgress) => void;

// Delay between AI calls to avoid rate limits (especially for Groq free tier)
// Groq free tier: 12000 TPM (tokens per minute)
// Each call uses ~2000-4000 tokens, so 3-4 calls max per minute
// With 5+ total calls, need ~15s between calls to stay under limit
const AI_CALL_DELAY_MS = 5000; // 5 seconds between calls

/**
 * Sleep helper to add delays between API calls
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract JSON from AI response, handling markdown code blocks and extra text
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJSON(content: string): any {
  console.log('[extractJSON] Attempting to extract JSON from response of length:', content.length);

  // Clean up the content first - remove any BOM and normalize whitespace
  const cleaned = content.trim();

  // Method 1: Try to extract from markdown code blocks (various formats)
  const codeBlockPatterns = [/```json\s*([\s\S]*?)```/i, /```\s*([\s\S]*?)```/, /`([\s\S]*?)`/];

  for (const pattern of codeBlockPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      try {
        const extracted = match[1].trim();
        console.log('[extractJSON] Found code block, trying to parse...');
        return JSON.parse(extracted);
      } catch (e) {
        console.log('[extractJSON] Code block parse failed, trying next method...');
      }
    }
  }

  // Method 2: Try direct parse (in case the response is pure JSON)
  try {
    return JSON.parse(cleaned);
  } catch {
    // Expected: direct parse may fail, continue to balanced JSON extraction
  }

  // Method 3: Find JSON object or array by matching balanced braces/brackets
  // This handles responses like "Here is the JSON:\n{...}\n\nLet me explain..."
  const jsonResult = findBalancedJSON(cleaned);
  if (jsonResult) {
    console.log('[extractJSON] Found balanced JSON structure');
    try {
      return JSON.parse(jsonResult);
    } catch (e) {
      // Try to fix common JSON issues
      const fixed = fixCommonJSONIssues(jsonResult);
      try {
        return JSON.parse(fixed);
      } catch (fixError) {
        console.error(
          '[extractJSON] Failed to parse even after fixes:',
          jsonResult.substring(0, 300)
        );
      }
    }
  }

  // Method 4: Try to find JSON-like structure with regex (last resort)
  // Look for object starting with { and containing key-value pairs
  const jsonObjectMatch = cleaned.match(/\{[\s\S]*?"[^"]+"\s*:\s*[\s\S]*\}/);
  if (jsonObjectMatch) {
    const potentialJson = jsonObjectMatch[0];
    // Find the balanced end
    const balanced = findBalancedJSON(potentialJson);
    if (balanced) {
      try {
        return JSON.parse(balanced);
      } catch {
        const fixed = fixCommonJSONIssues(balanced);
        try {
          return JSON.parse(fixed);
        } catch {
          // Expected: regex-matched JSON may not be valid, exhaust all methods
        }
      }
    }
  }

  console.error('[extractJSON] No JSON found. Content preview:', cleaned.substring(0, 500));
  throw new Error('No JSON found in AI response');
}

/**
 * Find balanced JSON (object or array) in a string
 */
function findBalancedJSON(content: string): string | null {
  // Find the first { or [
  let startChar: '{' | '[' | null = null;
  let endChar: '}' | ']' | null = null;
  let startIndex = -1;

  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') {
      startChar = '{';
      endChar = '}';
      startIndex = i;
      break;
    } else if (content[i] === '[') {
      startChar = '[';
      endChar = ']';
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1 || !startChar || !endChar) {
    return null;
  }

  // Now find the matching closing bracket, accounting for strings
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === startChar) {
      depth++;
    } else if (char === endChar) {
      depth--;
      if (depth === 0) {
        return content.substring(startIndex, i + 1);
      }
    }
  }

  return null;
}

/**
 * Fix common JSON formatting issues from AI responses
 */
function fixCommonJSONIssues(jsonStr: string): string {
  return (
    jsonStr
      // Remove trailing commas before } or ]
      .replace(/,(\s*[}\]])/g, '$1')
      // Fix unquoted keys (simple cases)
      .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
      // Remove comments (// style)
      .replace(/\/\/[^\n]*/g, '')
      // Remove unescaped newlines inside JSON string values
      .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match) => match.replace(/\n/g, '\\n'))
  );
}

/**
 * Career Context Engine
 * Orchestrates the entire profile analysis pipeline
 */
export class CareerContextEngine {
  private aiService: AIService;

  constructor(aiService: AIService) {
    this.aiService = aiService;
  }

  /**
   * Analyze resume from pre-extracted text
   * Used when parsing happens in browser context (options page)
   */
  async analyzeResumeText(
    rawText: string,
    basicInfo: {
      email?: string;
      phone?: string;
      linkedIn?: string;
      github?: string;
      name?: string;
      skills: string[];
    },
    fileName: string,
    onProgress?: ProgressCallback
  ): Promise<MasterProfile> {
    const progress = (stage: AnalysisProgress['stage'], pct: number, msg: string) => {
      onProgress?.({ stage, progress: pct, message: msg });
    };

    // Generate checksum
    const checksum = await generateChecksum(rawText);
    const yearsExp = estimateYearsOfExperience(rawText);

    // Create initial profile with basic info
    const initialProfile: Partial<MasterProfile> = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      sourceDocument: {
        fileName,
        fileType: fileName.endsWith('.pdf') ? 'pdf' : fileName.endsWith('.docx') ? 'docx' : 'txt',
        uploadedAt: new Date(),
        rawText,
        checksum,
      },
      personal: {
        fullName: basicInfo.name || '',
        firstName: basicInfo.name?.split(' ')[0] || '',
        lastName: basicInfo.name?.split(' ').slice(1).join(' ') || '',
        email: basicInfo.email || '',
        phone: basicInfo.phone || '',
        location: {
          city: '',
          state: '',
          country: '',
          formatted: '',
        },
        linkedInUrl: basicInfo.linkedIn,
        githubUrl: basicInfo.github,
      },
    };

    // Stage 1: AI-powered structured extraction
    progress('analyzing', 40, 'AI analyzing resume structure...');
    const structuredData = await this.extractStructuredData(rawText);

    console.log('[ContextEngine] Merging structured data with initial profile...');
    console.log('[ContextEngine] Initial personal:', initialProfile.personal);
    console.log('[ContextEngine] Structured personal:', structuredData.personal);

    // Merge structured data - AI data takes priority but fall back to basicInfo
    if (structuredData.personal) {
      initialProfile.personal = {
        fullName: structuredData.personal.fullName || initialProfile.personal?.fullName || '',
        firstName: structuredData.personal.firstName || initialProfile.personal?.firstName || '',
        lastName: structuredData.personal.lastName || initialProfile.personal?.lastName || '',
        email: structuredData.personal.email || initialProfile.personal?.email || '',
        phone: structuredData.personal.phone || initialProfile.personal?.phone || '',
        location: structuredData.personal.location ||
          initialProfile.personal?.location || {
            city: '',
            state: '',
            country: '',
            formatted: '',
          },
        linkedInUrl: structuredData.personal.linkedInUrl || initialProfile.personal?.linkedInUrl,
        githubUrl: structuredData.personal.githubUrl || initialProfile.personal?.githubUrl,
        portfolioUrl: structuredData.personal.portfolioUrl || initialProfile.personal?.portfolioUrl,
      };
    }

    console.log('[ContextEngine] Final merged personal:', initialProfile.personal);

    initialProfile.experience = structuredData.experience || [];
    initialProfile.education = structuredData.education || [];
    initialProfile.projects = structuredData.projects || [];
    initialProfile.certifications = structuredData.certifications || [];

    // Stage 2: Career context analysis (with delay to avoid rate limits)
    console.log('[ContextEngine] Waiting before career context call...');
    await sleep(AI_CALL_DELAY_MS);
    progress('enriching', 60, 'Building career context...');
    const careerContext = await this.buildCareerContext(structuredData, yearsExp);
    initialProfile.careerContext = careerContext;

    // Stage 3: Skills enrichment (with delay)
    console.log('[ContextEngine] Waiting before skills enrichment call...');
    await sleep(AI_CALL_DELAY_MS);
    progress('enriching', 70, 'Analyzing skills...');
    const skillsWithContext = await this.enrichSkills(structuredData, basicInfo.skills);
    initialProfile.skills = skillsWithContext;

    // Stage 4: Generate answer bank (with delay)
    console.log('[ContextEngine] Waiting before answer bank call...');
    await sleep(AI_CALL_DELAY_MS);
    progress('generating', 85, 'Generating answer bank...');
    console.log('[ContextEngine] Starting answer bank generation...');
    const answerBank = await this.generateAnswerBank(initialProfile as MasterProfile);
    console.log(
      '[ContextEngine] Answer bank generated:',
      answerBank.commonQuestions?.length || 0,
      'answers'
    );
    initialProfile.answerBank = answerBank;

    // Stage 5: Generate initial role profiles (with delay)
    console.log('[ContextEngine] Waiting before profile generation call...');
    await sleep(AI_CALL_DELAY_MS);
    progress('generating', 95, 'Creating role-specific profiles...');
    console.log('[ContextEngine] Starting profile generation...');
    console.log(
      '[ContextEngine] Best fit roles for profile generation:',
      careerContext.bestFitRoles?.length || 0
    );
    const generatedProfiles = await this.generateInitialProfiles(initialProfile as MasterProfile);
    console.log('[ContextEngine] Generated profiles:', generatedProfiles.length);
    initialProfile.generatedProfiles = generatedProfiles;

    // Initialize autofill data with defaults
    initialProfile.autofillData = {
      workAuthorization: 'citizen',
      workAuthorizationText: '',
      requiresSponsorship: false,
      canStartImmediately: false,
      willingToRelocate: false,
      remotePreference: 'flexible',
      linkedInConsent: true,
      portfolioConsent: true,
      backgroundCheckConsent: true,
      drugTestConsent: true,
      currentlyEmployed: initialProfile.experience?.[0]?.isCurrent || false,
    };

    // Auto-detect background from resume text + career context
    const detectedBackground = detectBackgroundFromJD(rawText);
    if (detectedBackground) {
      const bgConfig = getBackgroundConfig(detectedBackground);
      const detectedRole =
        detectRoleFromJD(detectedBackground, rawText) || bgConfig?.roles?.[0]?.id || '';
      initialProfile.backgroundConfig = {
        background: detectedBackground,
        primaryRole: detectedRole,
        skillAreas: [],
        isAutoDetected: true,
      } as UserBackgroundConfig;
      console.log(
        `[ContextEngine] Auto-detected background: ${detectedBackground}, role: ${detectedRole}`
      );
    }

    progress('complete', 100, 'Analysis complete!');

    return initialProfile as MasterProfile;
  }

  /**
   * Extract structured data using AI
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async extractStructuredData(rawText: string): Promise<any> {
    const prompt = RESUME_PARSE_PROMPT.replace(
      '{resumeText}',
      sanitizePromptInput(rawText, 'resume_text')
    );

    try {
      console.log('[ContextEngine] Calling AI for structured extraction...');
      const response = await this.aiService.chat([{ role: 'user', content: prompt }], {
        temperature: 0.1,
        maxTokens: 4000,
      });

      console.log('[ContextEngine] AI response length:', response.content.length);
      console.log('[ContextEngine] AI response preview:', response.content.substring(0, 500));

      const parsed = extractJSON(response.content);
      console.log('[ContextEngine] Parsed data - personal:', parsed.personal);
      console.log('[ContextEngine] Parsed data - experience count:', parsed.experience?.length);
      console.log('[ContextEngine] Parsed data - skills:', parsed.skills);

      return parsed;
    } catch (error) {
      console.error('[ContextEngine] Failed to extract structured data:', error);
      return {};
    }
  }

  /**
   * Build career context using AI
   */
  private async buildCareerContext(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parsedData: any,
    estimatedYears: number
  ): Promise<CareerContext> {
    const prompt = CAREER_CONTEXT_PROMPT.replace(
      '{parsedData}',
      sanitizePromptInput(JSON.stringify(parsedData, null, 2), 'parsed_resume')
    );

    try {
      console.log('[ContextEngine] Building career context...');
      const response = await this.aiService.chat([{ role: 'user', content: prompt }], {
        temperature: 0.3,
        maxTokens: 2500,
      });

      console.log(
        '[ContextEngine] Career context response preview:',
        response.content.substring(0, 300)
      );

      const context = extractJSON(response.content) as CareerContext;
      console.log(
        '[ContextEngine] Career context parsed - summary:',
        context.summary?.substring(0, 100)
      );
      console.log('[ContextEngine] Career context - bestFitRoles:', context.bestFitRoles?.length);

      // Override with calculated years if AI estimate seems off
      if (Math.abs(context.yearsOfExperience - estimatedYears) > 3) {
        context.yearsOfExperience = estimatedYears;
      }

      // Ensure seniorityLevel matches years (AI often overestimates)
      const years = context.yearsOfExperience;
      const correctLevel =
        years <= 5 ? 'entry' : years <= 10 ? 'mid' : years <= 15 ? 'senior' : 'executive';
      if (context.seniorityLevel !== correctLevel) {
        console.log(
          `[ContextEngine] Correcting seniority: AI said "${context.seniorityLevel}" but ${years} years → "${correctLevel}"`
        );
        context.seniorityLevel = correctLevel;
      }

      return context;
    } catch (error) {
      console.error('[ContextEngine] Failed to build career context:', error);
      // Return minimal context
      return {
        summary: '',
        careerTrajectory: 'stable',
        yearsOfExperience: estimatedYears,
        seniorityLevel:
          estimatedYears <= 5
            ? 'entry'
            : estimatedYears <= 10
              ? 'mid'
              : estimatedYears <= 15
                ? 'senior'
                : 'executive',
        primaryDomain: 'Software Engineering',
        secondaryDomains: [],
        industryExperience: [],
        bestFitRoles: [],
        strengthAreas: [],
        growthAreas: [],
        writingStyle: {
          tone: 'professional',
          complexity: 'moderate',
          preferredVoice: 'first-person',
        },
        topAccomplishments: [],
        uniqueValueProps: [],
      };
    }
  }

  /**
   * Enrich skills with context
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async enrichSkills(parsedData: any, basicSkills: string[]): Promise<SkillsWithContext> {
    const prompt = SKILLS_ENRICHMENT_PROMPT.replace(
      '{parsedData}',
      sanitizePromptInput(
        JSON.stringify({ ...parsedData, detectedSkills: basicSkills }, null, 2),
        'parsed_resume'
      )
    );

    try {
      console.log('[ContextEngine] Calling AI for skills enrichment...');
      const response = await this.aiService.chat([{ role: 'user', content: prompt }], {
        temperature: 0.2,
        maxTokens: 2000,
      });

      console.log('[ContextEngine] Skills enrichment response length:', response.content.length);
      console.log(
        '[ContextEngine] Skills enrichment response preview:',
        response.content.substring(0, 500)
      );

      const result = extractJSON(response.content) as SkillsWithContext;
      console.log(
        '[ContextEngine] Skills enrichment parsed successfully, technical skills:',
        result.technical?.length || 0
      );
      return result;
    } catch (error) {
      console.error('[ContextEngine] Failed to enrich skills:', error);
      // Return basic skills as fallback
      return {
        technical: basicSkills.map((s) => ({
          name: s,
          normalizedName: s,
          category: 'other',
          yearsOfExperience: 0,
          proficiency: 'intermediate' as const,
          lastUsed: 'current',
          evidenceFrom: [],
          aliases: [],
        })),
        tools: [],
        frameworks: [],
        soft: [],
        programmingLanguages: [],
        naturalLanguages: [],
        clusters: [],
      };
    }
  }

  /**
   * Generate answer bank for common questions
   */
  private async generateAnswerBank(profile: MasterProfile): Promise<AnswerBank> {
    const candidateProfile = this.formatProfileForPrompt(profile);
    const prompt = ANSWER_BANK_PROMPT.replace(
      '{candidateProfile}',
      sanitizePromptInput(candidateProfile, 'candidate_profile')
    );

    try {
      console.log('[ContextEngine] Calling AI for answer bank...');
      const response = await this.aiService.chat([{ role: 'user', content: prompt }], {
        temperature: 0.5,
        maxTokens: 3000,
      });

      console.log('[ContextEngine] Answer bank AI response length:', response.content.length);
      console.log(
        '[ContextEngine] Answer bank response preview:',
        response.content.substring(0, 300)
      );

      const answers = extractJSON(response.content);
      console.log('[ContextEngine] Answer bank parsed, keys:', Object.keys(answers));

      // Convert to CachedAnswer format
      const commonQuestions: CachedAnswer[] = [];
      const questionTypes: CommonQuestionType[] = [
        'why_interested',
        'greatest_strength',
        'challenge_overcome',
        'leadership_example',
        'why_leaving',
        'career_goals',
        'technical_achievement',
        'handle_pressure',
      ];

      for (const type of questionTypes) {
        if (answers[type]) {
          commonQuestions.push({
            questionType: type,
            question: this.getQuestionText(type),
            answer: answers[type].answer || answers[type],
            shortAnswer: answers[type].shortAnswer,
            generatedAt: new Date(),
            usageCount: 0,
          });
        }
      }

      return {
        commonQuestions,
        patterns: this.getDefaultQuestionPatterns(),
        customAnswers: {},
      };
    } catch (error) {
      console.error('Failed to generate answer bank:', error);
      return {
        commonQuestions: [],
        patterns: this.getDefaultQuestionPatterns(),
        customAnswers: {},
      };
    }
  }

  /**
   * Generate initial role-specific profiles
   */
  private async generateInitialProfiles(profile: MasterProfile): Promise<GeneratedProfile[]> {
    const profiles: GeneratedProfile[] = [];
    const bestRoles = profile.careerContext?.bestFitRoles?.slice(0, 3) || [];

    console.log(
      '[ContextEngine] Generating profiles for roles:',
      bestRoles.map((r) => r.title)
    );

    if (bestRoles.length === 0) {
      console.warn('[ContextEngine] No bestFitRoles found, skipping profile generation');
      return profiles;
    }

    for (let i = 0; i < bestRoles.length; i++) {
      const role = bestRoles[i];
      try {
        // Add delay between role profile generations (skip first)
        if (i > 0) {
          console.log(`[ContextEngine] Waiting before next role profile call...`);
          await sleep(AI_CALL_DELAY_MS);
        }
        console.log(`[ContextEngine] Generating profile for: ${role.title}`);
        const generated = await this.generateRoleProfile(profile, role.title);
        if (generated) {
          console.log(`[ContextEngine] Successfully generated profile for: ${role.title}`);
          profiles.push(generated);
        } else {
          console.warn(`[ContextEngine] No profile generated for: ${role.title}`);
        }
      } catch (error) {
        console.error(`[ContextEngine] Failed to generate profile for ${role.title}:`, error);
      }
    }

    return profiles;
  }

  /**
   * Generate a single role-specific profile
   */
  async generateRoleProfile(
    masterProfile: MasterProfile,
    targetRole: string
  ): Promise<GeneratedProfile | null> {
    const prompt = PROFILE_GENERATOR_PROMPT.replace(
      '{masterProfile}',
      sanitizePromptInput(
        JSON.stringify(this.formatMasterForPrompt(masterProfile), null, 2),
        'master_profile'
      )
    ).replace('{targetRole}', targetRole);

    try {
      const response = await this.aiService.chat([{ role: 'user', content: prompt }], {
        temperature: 0.4,
        maxTokens: 1500,
      });

      const result = extractJSON(response.content);

      return {
        id: crypto.randomUUID(),
        masterProfileId: masterProfile.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        name: result.name,
        targetRole: result.targetRole,
        targetIndustries: [],
        isActive: true,
        tailoredSummary: result.tailoredSummary,
        highlightedSkills: result.highlightedSkills || [],
        selectedExperiences: result.relevantExperience || [],
        selectedProjects: [],
        atsKeywords: result.atsKeywords || [],
        applicationsUsed: 0,
      };
    } catch (error) {
      console.error('Failed to generate role profile:', error);
      return null;
    }
  }

  /**
   * Humanize content to not sound AI-generated
   */
  async humanizeContent(
    content: string,
    writingStyle: CareerContext['writingStyle']
  ): Promise<string> {
    const prompt = HUMANIZE_CONTENT_PROMPT.replace(
      '{content}',
      sanitizePromptInput(content, 'original_content')
    )
      .replace('{tone}', writingStyle.tone)
      .replace('{complexity}', writingStyle.complexity)
      .replace('{voice}', writingStyle.preferredVoice);

    try {
      const response = await this.aiService.chat([{ role: 'user', content: prompt }], {
        temperature: 0.7,
        maxTokens: 1000,
      });

      return response.content.trim();
    } catch (error) {
      console.error('Failed to humanize content:', error);
      return content; // Return original on failure
    }
  }

  /**
   * Format profile for AI prompts (minimal data to save tokens)
   */
  private formatProfileForPrompt(profile: MasterProfile): string {
    const exp = profile.experience?.slice(0, 3).map((e) => ({
      title: e.title,
      company: e.company,
      duration: e.durationMonths ? `${Math.round(e.durationMonths / 12)} years` : '',
      achievements: e.achievements?.slice(0, 2),
    }));

    return `
Name: ${profile.personal?.fullName}
Years of Experience: ${profile.careerContext?.yearsOfExperience || 0}
Primary Domain: ${profile.careerContext?.primaryDomain || 'Unknown'}
Top Skills: ${
      profile.skills?.technical
        ?.slice(0, 10)
        .map((s) => s.name)
        .join(', ') || 'N/A'
    }
Recent Experience:
${JSON.stringify(exp, null, 2)}
Key Strengths: ${profile.careerContext?.strengthAreas?.slice(0, 5).join(', ') || 'N/A'}
Top Accomplishments:
${
  profile.careerContext?.topAccomplishments
    ?.slice(0, 2)
    .map((a) => `- ${a.statement}`)
    .join('\n') || 'N/A'
}
    `.trim();
  }

  /**
   * Format master profile for role generation (trimmed for tokens)
   */
  private formatMasterForPrompt(profile: MasterProfile): object {
    return {
      name: profile.personal?.fullName,
      yearsExp: profile.careerContext?.yearsOfExperience,
      seniority: profile.careerContext?.seniorityLevel,
      primaryDomain: profile.careerContext?.primaryDomain,
      skills: profile.skills?.technical?.slice(0, 15).map((s) => ({
        name: s.name,
        years: s.yearsOfExperience,
        proficiency: s.proficiency,
      })),
      experience: profile.experience?.slice(0, 4).map((e) => ({
        id: e.id,
        title: e.title,
        company: e.company,
        achievements: e.achievements?.slice(0, 3),
        technologies: e.technologiesUsed?.slice(0, 5),
      })),
      strengths: profile.careerContext?.strengthAreas,
      accomplishments: profile.careerContext?.topAccomplishments?.slice(0, 3),
    };
  }

  /**
   * Get human-readable question text
   */
  private getQuestionText(type: CommonQuestionType): string {
    const questions: Record<CommonQuestionType, string> = {
      why_interested: 'Why are you interested in this position?',
      greatest_strength: 'What is your greatest professional strength?',
      greatest_weakness: 'What is your greatest weakness?',
      leadership_example: 'Tell me about a time you demonstrated leadership',
      conflict_resolution: 'Describe a conflict you resolved at work',
      challenge_overcome: 'Describe a challenging situation and how you handled it',
      failure_learned: 'Tell me about a time you failed and what you learned',
      teamwork_example: 'Give an example of successful teamwork',
      why_leaving: 'Why are you leaving your current role?',
      salary_expectations: 'What are your salary expectations?',
      career_goals: 'Where do you see yourself in 5 years?',
      technical_achievement: 'What is your greatest technical achievement?',
      work_style: 'How would you describe your work style?',
      handle_pressure: 'How do you handle working under pressure?',
      diversity_contribution: 'How do you contribute to diversity and inclusion?',
    };
    return questions[type] || type;
  }

  /**
   * Get default question patterns for matching
   */
  private getDefaultQuestionPatterns() {
    return [
      {
        type: 'why_interested' as CommonQuestionType,
        patterns: ['why.*(interested|apply|want)', 'what.*(attracts|excites)', 'motivat'],
        keywords: ['interested', 'apply', 'position', 'role', 'company'],
      },
      {
        type: 'greatest_strength' as CommonQuestionType,
        patterns: ['(greatest|biggest|main).*(strength|skill)', 'what.*best at'],
        keywords: ['strength', 'best', 'skill', 'strongest'],
      },
      {
        type: 'challenge_overcome' as CommonQuestionType,
        patterns: ['challenge|difficult|obstacle|problem', 'how.*handle|overcome'],
        keywords: ['challenge', 'difficult', 'overcome', 'problem', 'solved'],
      },
      {
        type: 'leadership_example' as CommonQuestionType,
        patterns: ['leadership|led|managed|team'],
        keywords: ['leadership', 'lead', 'managed', 'team', 'mentor'],
      },
      {
        type: 'why_leaving' as CommonQuestionType,
        patterns: ['why.*(leaving|left|leave)', 'reason.*(leaving|change)'],
        keywords: ['leaving', 'left', 'current', 'previous', 'change'],
      },
      {
        type: 'career_goals' as CommonQuestionType,
        patterns: ['(5|five).*years', 'career.*(goal|plan|aspir)', 'where.*see.*yourself'],
        keywords: ['years', 'future', 'goals', 'career', 'aspiration'],
      },
    ];
  }
}

/**
 * Quick score calculation (no AI, instant)
 * Uses keyword matching for immediate feedback
 */
export function calculateQuickScore(
  profile: MasterProfile,
  jobDescription: string
): { score: number; matched: string[]; missing: string[] } {
  const profileSkills = new Set(
    [
      ...(profile.skills?.technical || []).map((s) => s.normalizedName.toLowerCase()),
      ...(profile.skills?.frameworks || []).map((s) => s.normalizedName.toLowerCase()),
      ...(profile.skills?.tools || []).map((s) => s.normalizedName.toLowerCase()),
    ].filter(Boolean)
  );

  // Extract keywords from job description
  const jobLower = jobDescription.toLowerCase();
  const techKeywords = extractJobTechKeywords(jobLower);

  const matched: string[] = [];
  const missing: string[] = [];

  for (const keyword of techKeywords) {
    const lower = keyword.toLowerCase();
    if (profileSkills.has(lower) || hasVariantMatch(lower, profileSkills)) {
      matched.push(keyword);
    } else {
      missing.push(keyword);
    }
  }

  const score =
    techKeywords.length > 0 ? Math.round((matched.length / techKeywords.length) * 100) : 0;

  return { score, matched, missing };
}

/**
 * Extract tech keywords from job description (no AI)
 */
function extractJobTechKeywords(text: string): string[] {
  const keywords = new Set<string>();

  const patterns: [RegExp, string][] = [
    [/\b(javascript|js)\b/gi, 'JavaScript'],
    [/\b(typescript|ts)\b/gi, 'TypeScript'],
    [/\bpython\b/gi, 'Python'],
    [/\bjava\b(?!\s*script)/gi, 'Java'],
    [/\breact(?:\.?js)?\b/gi, 'React'],
    [/\bangular\b/gi, 'Angular'],
    [/\bvue(?:\.?js)?\b/gi, 'Vue.js'],
    [/\bnode\.?js\b/gi, 'Node.js'],
    [/\baws\b/gi, 'AWS'],
    [/\bazure\b/gi, 'Azure'],
    [/\bgcp\b|google\s*cloud/gi, 'GCP'],
    [/\bdocker\b/gi, 'Docker'],
    [/\bkubernetes\b|\bk8s\b/gi, 'Kubernetes'],
    [/\bpostgresql?\b/gi, 'PostgreSQL'],
    [/\bmongodb\b/gi, 'MongoDB'],
    [/\bredis\b/gi, 'Redis'],
    [/\bgraphql\b/gi, 'GraphQL'],
    [/\brest\s*api/gi, 'REST API'],
    [/\bmachine\s*learning\b/gi, 'Machine Learning'],
    [/\btensorflow\b/gi, 'TensorFlow'],
    [/\bpytorch\b/gi, 'PyTorch'],
    [/\bgit\b/gi, 'Git'],
    [/\bci\s*\/?\s*cd\b/gi, 'CI/CD'],
    [/\bsql\b/gi, 'SQL'],
  ];

  for (const [pattern, name] of patterns) {
    if (pattern.test(text)) {
      keywords.add(name);
    }
  }

  return Array.from(keywords);
}

/**
 * Check for variant matches (e.g., "ReactJS" matches "React")
 */
function hasVariantMatch(keyword: string, skills: Set<string>): boolean {
  const variants: Record<string, string[]> = {
    javascript: ['js', 'es6', 'ecmascript'],
    typescript: ['ts'],
    react: ['reactjs', 'react.js'],
    vue: ['vuejs', 'vue.js'],
    node: ['nodejs', 'node.js'],
    postgres: ['postgresql', 'psql'],
    kubernetes: ['k8s'],
  };

  for (const [main, alts] of Object.entries(variants)) {
    if (keyword === main || alts.includes(keyword)) {
      if (skills.has(main) || alts.some((a) => skills.has(a))) {
        return true;
      }
    }
  }

  return false;
}
