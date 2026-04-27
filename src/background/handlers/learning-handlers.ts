import type { MessageResponse } from '@shared/utils/messaging';
import { masterProfileRepo } from '@storage/index';
import { learningService } from '@core/learning';
import { generateInterviewPrep } from '@core/interview/question-generator';
import { generateEmailTemplate } from '@core/communication/email-templates';
import type { EmailGenerationPayload } from '@core/communication/email-templates';
import {
  findMatchingAnswer,
  addAnswerToBank,
  classifyQuestion,
  generateDefaultAnswerBank,
} from '@core/autofill/answer-bank';
import { sanitizePromptInput } from '@shared/utils/prompt-safety';
import { buildSystemPrompt, PERSONAS, CORE_RULES } from '@/ai/prompts/system-rules';
import { getAIService } from '../message-handler';

// ============================================================================
// Learning & Self-Improvement Handlers
// ============================================================================

export interface TrackApplicationPayload {
  jobId: string;
  jobTitle: string;
  company: string;
  platform: string;
  industry?: string;
  profileId: string;
  keywordsUsed: string[];
  resumeVersion?: string;
  coverLetterGenerated?: boolean;
}

export async function handleTrackApplication(
  payload: TrackApplicationPayload
): Promise<MessageResponse> {
  try {
    const applicationId = await learningService.trackApplication(payload);
    return { success: true, data: { applicationId } };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleRecordOutcome(payload: {
  applicationId: string;
  status: string;
  notes?: string;
}): Promise<MessageResponse> {
  try {
    const validStatuses = ['viewed', 'rejected', 'interview', 'offer', 'no_response'] as const;
    type ValidStatus = (typeof validStatuses)[number];

    if (!validStatuses.includes(payload.status as ValidStatus)) {
      return { success: false, error: `Invalid status: ${payload.status}` };
    }

    await learningService.recordOutcome(
      payload.applicationId,
      payload.status as ValidStatus,
      payload.notes
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleGetLearningInsights(): Promise<MessageResponse> {
  try {
    const insights = await learningService.getInsights();
    return { success: true, data: insights };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleGetApplicationStats(): Promise<MessageResponse> {
  try {
    const stats = await learningService.getStats();
    return { success: true, data: stats };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleGetImprovements(): Promise<MessageResponse> {
  try {
    const improvements = learningService.getImprovements();
    return { success: true, data: improvements };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleGetKeywordRecommendations(payload: {
  jobKeywords: string[];
  resumeKeywords: string[];
  platform: string;
}): Promise<MessageResponse> {
  try {
    const recommendations = await learningService.getRecommendations(
      payload.jobKeywords,
      payload.resumeKeywords,
      payload.platform
    );
    return { success: true, data: recommendations };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleRunLearningAnalysis(): Promise<MessageResponse> {
  try {
    const improvements = await learningService.runAnalysis();
    return { success: true, data: improvements };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// Answer Bank Handlers
// ============================================================================

export async function handleSaveAnswer(payload: {
  questionText: string;
  answer: string;
}): Promise<MessageResponse> {
  try {
    const { questionText, answer } = payload;

    // Get active master profile
    const masterProfile = await masterProfileRepo.getActive();
    if (!masterProfile) {
      return { success: false, error: 'No active profile found' };
    }

    // Initialize answer bank if empty
    let answerBank = masterProfile.answerBank || {
      commonQuestions: [],
      patterns: [],
      customAnswers: {},
    };

    // Add the new answer
    answerBank = addAnswerToBank(questionText, answer, answerBank);

    // Save back to profile
    await masterProfileRepo.update(masterProfile.id, { answerBank });

    console.log('[MessageHandler] Saved answer to bank:', {
      question: questionText.substring(0, 50),
      type: classifyQuestion(questionText),
    });

    return { success: true, data: { saved: true } };
  } catch (error) {
    console.error('[MessageHandler] Error saving answer:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function handleGetAnswerSuggestion(payload: {
  questionText: string;
  companyName?: string;
  jobTitle?: string;
}): Promise<MessageResponse> {
  try {
    const { questionText, companyName } = payload;
    // Note: jobTitle available in payload for future use

    // Get active master profile
    const masterProfile = await masterProfileRepo.getActive();
    if (!masterProfile) {
      return { success: false, error: 'No active profile found' };
    }

    // Initialize answer bank if needed
    let answerBank = masterProfile.answerBank;
    if (!answerBank || !answerBank.commonQuestions?.length) {
      // Generate default answers
      answerBank = generateDefaultAnswerBank({
        name: masterProfile.personal?.fullName || 'Professional',
        title: masterProfile.careerContext?.primaryDomain || 'Software Engineer',
        yearsExperience: masterProfile.careerContext?.yearsOfExperience || 5,
        skills: masterProfile.skills?.technical?.map((s) => s.name) || [],
        summary: masterProfile.careerContext?.summary,
      });

      // Save the generated bank
      await masterProfileRepo.update(masterProfile.id, { answerBank });
    }

    // Find matching answer
    const answer = findMatchingAnswer(questionText, answerBank, companyName);
    const questionType = classifyQuestion(questionText);

    return {
      success: true,
      data: {
        answer,
        questionType,
        source: answer ? 'bank' : null,
      },
    };
  } catch (error) {
    console.error('[MessageHandler] Error getting answer suggestion:', error);
    return { success: false, error: (error as Error).message };
  }
}

// handleGenerateAIAnswer was removed in the cutover commit. The per-field
// AI generation path it implemented was the source of the literal
// "the company" fallback bug that the v2 autofill rewrite fixes by sending
// the entire form to a single structured-output call with real company
// research. See src/background/handlers/autofill-handlers.ts for the
// replacement, and src/ai/autofill/run.ts for the runner.

// ============================================================================
// Interview Prep Handler
// ============================================================================

export async function handleGenerateInterviewPrep(payload: {
  jobDescription: string;
  companyName: string;
  jobTitle: string;
}): Promise<MessageResponse> {
  try {
    const { jobDescription, companyName, jobTitle } = payload;

    if (!jobDescription?.trim()) {
      return { success: false, error: 'Job description is required' };
    }

    const ai = await getAIService();
    if (ai.error) return { success: false, error: ai.error };
    const aiService = ai.service!;

    const masterProfile = await masterProfileRepo.getActive();
    if (!masterProfile) {
      return { success: false, error: 'No active profile found. Upload a resume first.' };
    }

    const result = await generateInterviewPrep(
      aiService,
      masterProfile,
      jobDescription,
      companyName || 'the company',
      jobTitle || 'the role'
    );

    return { success: true, data: result };
  } catch (error) {
    console.error('[ApplySharp] Interview prep generation failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// Email Template Handler
// ============================================================================

export async function handleGenerateEmailTemplate(
  payload: EmailGenerationPayload
): Promise<MessageResponse> {
  try {
    if (!payload?.emailType) {
      return { success: false, error: 'Email type is required' };
    }

    const ai = await getAIService();
    if (ai.error) return { success: false, error: ai.error };
    const aiService = ai.service!;

    const masterProfile = await masterProfileRepo.getActive();
    if (!masterProfile) {
      return { success: false, error: 'No active profile found. Upload a resume first.' };
    }

    const result = await generateEmailTemplate(aiService, masterProfile, payload);
    return { success: true, data: result };
  } catch (error) {
    console.error('[ApplySharp] Email template generation failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// AI Fallback Job Detection
// ============================================================================

export async function handleAIExtractJob(payload: {
  pageText: string;
  url: string;
  pageTitle: string;
  ogTitle?: string;
  ogDescription?: string;
  ogCompany?: string;
}): Promise<MessageResponse> {
  try {
    const ai = await getAIService();
    if (ai.error) return { success: false, error: ai.error };
    const aiService = ai.service!;

    const systemPrompt = buildSystemPrompt(PERSONAS.ATS_ANALYST, [CORE_RULES]);

    // Build context from metadata
    const metaContext = [
      payload.ogTitle ? `Page Title (OG): ${payload.ogTitle}` : '',
      payload.ogDescription ? `Description (OG): ${payload.ogDescription}` : '',
      payload.ogCompany ? `Site Name: ${payload.ogCompany}` : '',
      `Page Title: ${payload.pageTitle}`,
      `URL: ${payload.url}`,
    ]
      .filter(Boolean)
      .join('\n');

    const userPrompt = `Extract job posting information from this page content.

## Page Metadata
${metaContext}

## Page Content
${sanitizePromptInput(payload.pageText.slice(0, 5000), 'page_content')}

## Task
Extract the job posting details. If this is NOT a job posting page, return null values.`;

    const JOB_EXTRACTION_SCHEMA = {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Job title or null' },
        company: { type: 'string', description: 'Company name or null' },
        location: { type: 'string', description: 'Job location or null' },
        description: { type: 'string', description: 'Full job description text or null' },
        employmentType: {
          type: 'string',
          description: 'full-time|part-time|contract|internship or null',
        },
        salary: { type: 'string', description: 'Salary range as text or null' },
      },
      required: ['title', 'company', 'location', 'description'],
    };

    const parsed = await aiService.chatStructured<{
      title?: string | null;
      company?: string | null;
      location?: string | null;
      description?: string | null;
      employmentType?: string | null;
      salary?: string | null;
    }>(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      JOB_EXTRACTION_SCHEMA,
      'job_extraction',
      { temperature: 0.1, maxTokens: 1000, feature: 'skills_extraction' }
    );

    if (!parsed?.title || !parsed?.description) {
      return { success: false, error: 'AI could not extract job data from page' };
    }

    return {
      success: true,
      data: {
        title: parsed.title,
        company: parsed.company || payload.ogCompany || 'Unknown Company',
        location: parsed.location || '',
        description: parsed.description,
        employmentType: parsed.employmentType || undefined,
      },
    };
  } catch (error) {
    console.error('[AIExtractJob] Failed:', error);
    return { success: false, error: (error as Error).message };
  }
}
