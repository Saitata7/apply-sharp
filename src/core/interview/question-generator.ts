/**
 * Interview Preparation Question Generator
 *
 * Generates tailored interview questions and STAR-method answers
 * based on a specific JD + the candidate's MasterProfile data.
 */

import type { AIService } from '@ai/index';
import type { MasterProfile } from '@shared/types/master-profile.types';
import { sanitizePromptInput } from '@shared/utils/prompt-safety';
import { extractJSONFromResponse } from '@shared/utils/json-utils';
import { buildSystemPrompt, PERSONAS, CORE_RULES } from '@/ai/prompts/system-rules';

// ── Types ───────────────────────────────────────────────────────────────

export type QuestionCategory =
  | 'behavioral'
  | 'technical'
  | 'role_specific'
  | 'company_culture'
  | 'weakness_gap'
  | 'curveball';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface InterviewQuestion {
  id: string;
  category: QuestionCategory;
  question: string;
  why: string;
  difficulty: DifficultyLevel;
  tips: string[];
}

export interface PreparedAnswer {
  questionId: string;
  answer: string;
  keyPoints: string[];
}

export interface InterviewPrepResult {
  questions: InterviewQuestion[];
  answers: PreparedAnswer[];
  companyInsights: string[];
  generalTips: string[];
  estimatedPrepTime: number;
  generatedAt: string;
}

// ── Helpers (pure, testable) ────────────────────────────────────────────

const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  behavioral: 'Behavioral',
  technical: 'Technical',
  role_specific: 'Role-Specific',
  company_culture: 'Company & Culture',
  weakness_gap: 'Weakness / Gap',
  curveball: 'Curveball',
};

const DIFFICULTY_COLORS: Record<DifficultyLevel, string> = {
  easy: '#10b981',
  medium: '#f59e0b',
  hard: '#ef4444',
};

export function getCategoryLabel(category: QuestionCategory): string {
  return CATEGORY_LABELS[category] || category;
}

export function getDifficultyColor(difficulty: DifficultyLevel): string {
  return DIFFICULTY_COLORS[difficulty] || '#94a3b8';
}

export interface ProfileContext {
  name: string;
  title: string;
  seniority: string;
  yearsExperience: number;
  skills: string;
  recentExperience: string;
  accomplishments: string;
  strengthAreas: string;
  growthAreas: string;
}

export function buildProfileContext(profile: MasterProfile): ProfileContext {
  const name = profile.personal?.fullName || 'the candidate';
  const title = profile.experience?.[0]?.title || 'Software Professional';
  const seniority = profile.careerContext?.seniorityLevel || 'mid';
  const yearsExperience = profile.careerContext?.yearsOfExperience || 0;

  const skills =
    profile.skills?.technical
      ?.map((s) => s.name)
      .slice(0, 15)
      .join(', ') || '';

  const recentExperience = (profile.experience || [])
    .slice(0, 3)
    .map((exp) => {
      const bullets = (exp.achievements || [])
        .slice(0, 3)
        .map((a) => a.statement)
        .join('; ');
      return `${exp.title} at ${exp.company}${exp.companyContext ? ` (${exp.companyContext})` : ''}: ${bullets}`;
    })
    .join('\n');

  const accomplishments = (profile.careerContext?.topAccomplishments || [])
    .slice(0, 5)
    .map((a) => `${a.statement} (Impact: ${a.impact})`)
    .join('\n');

  const strengthAreas = (profile.careerContext?.strengthAreas || []).join(', ');
  const growthAreas = (profile.careerContext?.growthAreas || []).join(', ');

  return {
    name,
    title,
    seniority,
    yearsExperience,
    skills,
    recentExperience,
    accomplishments,
    strengthAreas,
    growthAreas,
  };
}

// ── AI Generation ───────────────────────────────────────────────────────

export async function generateInterviewPrep(
  aiService: AIService,
  profile: MasterProfile,
  jobDescription: string,
  companyName: string,
  jobTitle: string
): Promise<InterviewPrepResult> {
  const ctx = buildProfileContext(profile);

  // ── Call 1: Generate questions ──────────────────────────────────────
  const qSystemPrompt = buildSystemPrompt(PERSONAS.CAREER_ADVISOR, [CORE_RULES]);
  const qUserPrompt = `You are preparing a candidate for a specific job interview. Generate exactly 12 interview questions that are LIKELY to be asked for this role.

CANDIDATE PROFILE:
- Name: ${ctx.name}
- Current Title: ${ctx.title}
- Seniority: ${ctx.seniority}
- Years of Experience: ${ctx.yearsExperience}
- Key Skills: ${ctx.skills}
- Strength Areas: ${ctx.strengthAreas}
- Growth Areas: ${ctx.growthAreas}

RECENT EXPERIENCE:
${ctx.recentExperience}

TARGET COMPANY: ${sanitizePromptInput(companyName, 'company_name')}
TARGET ROLE: ${sanitizePromptInput(jobTitle, 'job_title')}

JOB DESCRIPTION:
${sanitizePromptInput(jobDescription.substring(0, 3000), 'job_description')}

Generate exactly 12 questions with this distribution:
- 3 behavioral (teamwork, leadership, conflict, etc.)
- 3 technical (specific to JD required skills)
- 2 role_specific (must-haves from JD, seniority expectations)
- 2 company_culture (company mission, values, fit)
- 1 weakness_gap (addressing resume gaps vs JD requirements)
- 1 curveball (uncommon but realistic for this role level)

Respond with a JSON object:
{
  "questions": [
    {
      "id": "q1",
      "category": "behavioral",
      "question": "...",
      "why": "One sentence explaining why this question is likely",
      "difficulty": "easy|medium|hard",
      "tips": ["tip 1", "tip 2"]
    }
  ],
  "companyInsights": ["Research suggestion 1", "Research suggestion 2", "Research suggestion 3"],
  "generalTips": ["Tip based on role level 1", "Tip 2", "Tip 3"]
}

Return ONLY valid JSON, no other text.`;

  const questionsResponse = await aiService.chat(
    [
      { role: 'system', content: qSystemPrompt },
      { role: 'user', content: qUserPrompt },
    ],
    {
      temperature: 0.4,
      maxTokens: 2500,
    }
  );

  if (!questionsResponse?.content) {
    throw new Error('Failed to generate interview questions');
  }

  const questionsData = extractJSONFromResponse<{
    questions: InterviewQuestion[];
    companyInsights: string[];
    generalTips: string[];
  }>(questionsResponse.content);

  if (!questionsData?.questions?.length) {
    throw new Error('Failed to parse interview questions from AI response');
  }

  // ── Call 2: Generate STAR answers ───────────────────────────────────
  const questionsList = questionsData.questions
    .map((q, i) => `${i + 1}. [${q.id}] ${q.question}`)
    .join('\n');

  const aSystemPrompt = buildSystemPrompt(PERSONAS.CAREER_ADVISOR, [CORE_RULES]);
  const aUserPrompt = `You are preparing STAR-method answers for a candidate's interview.
Use ONLY the candidate's real experience — NEVER fabricate achievements or metrics.

CANDIDATE PROFILE:
- Name: ${ctx.name}
- Title: ${ctx.title}
- Years of Experience: ${ctx.yearsExperience}
- Skills: ${ctx.skills}

RECENT EXPERIENCE:
${ctx.recentExperience}

KEY ACCOMPLISHMENTS:
${ctx.accomplishments || 'Not provided — use experience details above'}

TARGET ROLE: ${sanitizePromptInput(jobTitle, 'job_title')} at ${sanitizePromptInput(companyName, 'company_name')}

QUESTIONS TO ANSWER:
${questionsList}

For each question, generate a prepared answer using the STAR method (Situation, Task, Action, Result) where applicable. For technical or company questions, provide structured talking points instead.

Respond with a JSON object:
{
  "answers": [
    {
      "questionId": "q1",
      "answer": "Full 3-5 sentence answer using real experience...",
      "keyPoints": ["Quick bullet 1", "Quick bullet 2", "Quick bullet 3"]
    }
  ]
}

CRITICAL RULES:
- Reference REAL experience from the profile — no fabricated stories
- If no specific experience matches, frame transferable skills honestly
- Keep answers concise (3-5 sentences) but specific
- For "weakness" questions, show genuine self-awareness with a growth plan
- For company/culture questions, suggest what to research (don't make up facts)

Return ONLY valid JSON, no other text.`;

  let answers: PreparedAnswer[] = [];
  try {
    const answersResponse = await aiService.chat(
      [
        { role: 'system', content: aSystemPrompt },
        { role: 'user', content: aUserPrompt },
      ],
      {
        temperature: 0.5,
        maxTokens: 3500,
      }
    );

    if (answersResponse?.content) {
      const answersData = extractJSONFromResponse<{ answers: PreparedAnswer[] }>(
        answersResponse.content
      );
      if (answersData?.answers?.length) {
        answers = answersData.answers;
      }
    }
  } catch (error) {
    console.warn('[InterviewPrep] Answer generation failed, returning questions only:', error);
  }

  return {
    questions: questionsData.questions,
    answers,
    companyInsights: questionsData.companyInsights || [],
    generalTips: questionsData.generalTips || [],
    estimatedPrepTime: questionsData.questions.length * 5,
    generatedAt: new Date().toISOString(),
  };
}
