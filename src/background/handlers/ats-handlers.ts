import type { MessageResponse } from '@shared/utils/messaging';
import type { ExtractedJob } from '@shared/types/job.types';
import { masterProfileRepo } from '@storage/index';
import { AIService } from '@/ai';
import { calculateQuickATSScore, getQuickRecommendations } from '@core/ats/hybrid-scorer';
import { validateATSFormat, extractResumeContent } from '@core/ats/format-validator';
import { validateAllBullets } from '@core/resume/bullet-validator';
import type { SeniorityLevel } from '@core/resume/bullet-validator';
import { calculateLayeredATSScore } from '@core/ats/layered-scorer';
import { analyzeSkillGaps } from '@core/ats/gap-analyzer';
import { scanRedFlags } from '@core/resume/red-flag-scanner';
import type { MasterProfile } from '@shared/types/master-profile.types';
import type { ResumeContent } from '@core/ats/format-validator';
import { sanitizePromptInput } from '@shared/utils/prompt-safety';
import { buildSystemPrompt, PERSONAS, CORE_RULES } from '@/ai/prompts/system-rules';
import { cachedAICall, generateChecksum } from '@/ai/cache';
import { getAIService } from '../message-handler';

// ============================================================================
// ATS Skill Matching Helpers
// ============================================================================

/**
 * Extract profile skills as a Set for matching
 */
function extractProfileSkillsAsSet(profile: MasterProfile): Set<string> {
  const skills = new Set<string>();

  if (profile.skills) {
    // Add technical skills
    if (Array.isArray(profile.skills.technical)) {
      for (const s of profile.skills.technical) {
        if (s && s.name) {
          skills.add(s.name.toLowerCase());
          if (s.normalizedName) skills.add(s.normalizedName.toLowerCase());
          // Handle aliases if they exist (cast to handle potential runtime data)
          const aliases = (s as { aliases?: string[] }).aliases;
          if (aliases) {
            for (const alias of aliases) {
              skills.add(alias.toLowerCase());
            }
          }
        }
      }
    }

    // Add tools
    if (Array.isArray(profile.skills.tools)) {
      for (const s of profile.skills.tools) {
        if (s && s.name) {
          skills.add(s.name.toLowerCase());
        }
      }
    }

    // Add frameworks
    if (Array.isArray(profile.skills.frameworks)) {
      for (const s of profile.skills.frameworks) {
        if (s && s.name) {
          skills.add(s.name.toLowerCase());
        }
      }
    }

    // Add programming languages
    if (Array.isArray(profile.skills.programmingLanguages)) {
      for (const s of profile.skills.programmingLanguages) {
        if (s && s.name) {
          skills.add(s.name.toLowerCase());
        }
      }
    }
  }

  return skills;
}

/** Cache for normalized skill sets to avoid O(n) normalization on every call */
let _normalizedSkillsCache: { source: Set<string>; normalized: Set<string> } | null = null;

function getNormalizedSkills(profileSkills: Set<string>): Set<string> {
  if (_normalizedSkillsCache?.source === profileSkills) return _normalizedSkillsCache.normalized;
  const normalized = new Set<string>();
  for (const skill of profileSkills) {
    normalized.add(skill.replace(/[\s\-/]/g, ''));
  }
  _normalizedSkillsCache = { source: profileSkills, normalized };
  return normalized;
}

/**
 * Check if a keyword matches any profile skill
 */
function matchesProfileSkill(keyword: string, profileSkills: Set<string>): boolean {
  const kwLower = keyword.toLowerCase();

  // Direct match
  if (profileSkills.has(kwLower)) return true;

  const normalizedKw = kwLower.replace(/[\s\-/]/g, '');
  const normalizedSkills = getNormalizedSkills(profileSkills);

  // Check normalized exact match first
  if (normalizedSkills.has(normalizedKw)) return true;

  // Partial match (e.g., "Java" matches "Java 8+")
  for (const skill of profileSkills) {
    if (skill.includes(kwLower) || kwLower.includes(skill)) {
      return true;
    }
    const normalizedSkill = skill.replace(/[\s\-/]/g, '');
    if (normalizedSkill.includes(normalizedKw) || normalizedKw.includes(normalizedSkill)) {
      return true;
    }
  }

  return false;
}

/**
 * Get tier from score
 */
function getTierFromScore(score: number): 'excellent' | 'good' | 'moderate' | 'poor' {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'moderate';
  return 'poor';
}

/**
 * Extract keywords from JD using AI
 */
async function extractKeywordsWithAI(
  aiService: AIService,
  jobDescription: string,
  jobTitle?: string
): Promise<{ highPriority: string[]; lowPriority: string[] }> {
  const systemPrompt = buildSystemPrompt(PERSONAS.ATS_ANALYST, [CORE_RULES]);
  const userPrompt = `Analyze this job description and extract technical keywords/skills.

Job Title: ${jobTitle || 'Not specified'}

${sanitizePromptInput(jobDescription.substring(0, 4000), 'job_description')}

Extract keywords into two categories:
1. HIGH PRIORITY: Must-have skills explicitly required (technologies, frameworks, languages, tools)
2. LOW PRIORITY: Nice-to-have skills, or skills mentioned but not required

Rules:
- Only extract TECHNICAL skills (programming languages, frameworks, tools, methodologies)
- Include version numbers if specified (e.g., "Java 8+", "Python 3")
- Include compound terms (e.g., "Spring Boot", "REST API", "Unix/Linux")
- Do NOT include soft skills (communication, teamwork, etc.)
- Do NOT include generic terms (technology, application, system, etc.)
- Maximum 15 high priority, 10 low priority`;

  const KEYWORD_EXTRACTION_SCHEMA = {
    type: 'object' as const,
    properties: {
      highPriority: {
        type: 'array',
        items: { type: 'string' },
        description: 'Must-have skills explicitly required',
      },
      lowPriority: {
        type: 'array',
        items: { type: 'string' },
        description: 'Nice-to-have skills, or mentioned but not required',
      },
    },
    required: ['highPriority', 'lowPriority'],
  };

  try {
    const cacheKey = `keyword-extraction:${generateChecksum(jobDescription.substring(0, 4000) + (jobTitle || ''))}`;
    const result = await cachedAICall(
      cacheKey,
      () =>
        aiService.chatStructured<{ highPriority: string[]; lowPriority: string[] }>(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          KEYWORD_EXTRACTION_SCHEMA,
          'keyword_extraction',
          {
            temperature: 0.2,
            maxTokens: 800,
            feature: 'keyword_extraction',
          }
        ),
      24 * 60 * 60 * 1000 // 24h TTL
    );
    return {
      highPriority: Array.isArray(result.highPriority) ? result.highPriority : [],
      lowPriority: Array.isArray(result.lowPriority) ? result.lowPriority : [],
    };
  } catch (parseError) {
    console.error('[MessageHandler] Failed to parse AI keywords:', parseError);
  }

  return { highPriority: [], lowPriority: [] };
}

function mapSeniority(level: string): SeniorityLevel {
  const map: Record<string, SeniorityLevel> = {
    entry: 'entry',
    junior: 'entry',
    mid: 'mid',
    intermediate: 'mid',
    senior: 'senior',
    lead: 'lead',
    staff: 'lead',
    principal: 'principal',
    executive: 'executive',
    director: 'executive',
    vp: 'executive',
  };
  return map[level.toLowerCase()] || 'mid';
}

// ============================================================================
// ATS Handlers
// ============================================================================

export async function handleAnalyzeJob(payload: {
  job: ExtractedJob;
  platform?: string;
  useAI?: boolean;
}): Promise<MessageResponse> {
  try {
    const { job, useAI = false } = payload;

    // Get the active master profile
    const profile = await masterProfileRepo.getActive();

    if (!profile) {
      return {
        success: false,
        error: 'No active profile. Please upload a resume first.',
      };
    }

    if (!job.description) {
      return {
        success: false,
        error: 'No job description available to analyze.',
      };
    }

    // Extract profile skills for matching
    const profileSkills = extractProfileSkillsAsSet(profile);
    console.log('[MessageHandler] Profile skills:', profileSkills.size, 'skills');

    // Try AI-based keyword extraction first
    let aiKeywords: { highPriority: string[]; lowPriority: string[] } | null = null;

    if (useAI) {
      try {
        const ai = await getAIService();
        if (ai.service) {
          const aiService = ai.service!;
          console.log('[MessageHandler] Extracting keywords with AI...');
          aiKeywords = await extractKeywordsWithAI(aiService, job.description, job.title);
          console.log('[MessageHandler] AI extracted keywords:', {
            highPriority: aiKeywords.highPriority.length,
            lowPriority: aiKeywords.lowPriority.length,
          });
        } else {
          console.log('[MessageHandler] AI not available, using fallback scoring:', ai.error);
        }
      } catch (aiError) {
        const errorMessage = aiError instanceof Error ? aiError.message : 'Unknown error';
        if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
          console.warn('[MessageHandler] AI rate limited, using fallback scoring');
        } else if (
          errorMessage.includes('API key') ||
          errorMessage.includes('401') ||
          errorMessage.includes('403')
        ) {
          console.warn('[MessageHandler] AI authentication failed, check API key');
        } else if (errorMessage.includes('timeout') || errorMessage.includes('ECONNREFUSED')) {
          console.warn('[MessageHandler] AI service unreachable, using fallback scoring');
        } else {
          console.warn('[MessageHandler] AI keyword extraction failed:', errorMessage);
        }
      }
    }

    // Use the layered scoring system as fallback/supplement
    const layeredScore = calculateLayeredATSScore({
      profile,
      jobDescription: job.description,
      jobTitle: job.title,
    });

    // Also get quick score for backwards compatibility
    const quickScore = calculateQuickATSScore(profile, job.description);
    const recommendations = getQuickRecommendations(quickScore);

    // Determine matched/missing keywords
    let matchedKeywords: string[] = [];
    let missingKeywords: string[] = [];
    const highPriorityMatched: string[] = [];
    const highPriorityMissing: string[] = [];
    const lowPriorityMatched: string[] = [];
    const lowPriorityMissing: string[] = [];

    if (aiKeywords) {
      // Use AI-extracted keywords
      for (const kw of aiKeywords.highPriority) {
        if (matchesProfileSkill(kw, profileSkills)) {
          highPriorityMatched.push(kw);
          matchedKeywords.push(kw);
        } else {
          highPriorityMissing.push(kw);
          missingKeywords.push(kw);
        }
      }

      for (const kw of aiKeywords.lowPriority) {
        if (matchesProfileSkill(kw, profileSkills)) {
          lowPriorityMatched.push(kw);
          matchedKeywords.push(kw);
        } else {
          lowPriorityMissing.push(kw);
          missingKeywords.push(kw);
        }
      }
    } else {
      // Fallback to layered scorer keywords
      for (const area of layeredScore.skillAreaScores) {
        matchedKeywords.push(...area.matchedKeywords);
        missingKeywords.push(...area.missingKeywords);
      }
    }

    // Dedupe
    matchedKeywords = [...new Set(matchedKeywords)];
    missingKeywords = [...new Set(missingKeywords)];

    // Calculate score based on AI keywords if available
    let overallScore = layeredScore.overallScore;
    if (aiKeywords) {
      const totalKeywords = aiKeywords.highPriority.length + aiKeywords.lowPriority.length;
      if (totalKeywords > 0) {
        // Weight high priority more
        const highPriorityScore =
          aiKeywords.highPriority.length > 0
            ? (highPriorityMatched.length / aiKeywords.highPriority.length) * 70
            : 35;
        const lowPriorityScore =
          aiKeywords.lowPriority.length > 0
            ? (lowPriorityMatched.length / aiKeywords.lowPriority.length) * 30
            : 15;
        overallScore = Math.round(highPriorityScore + lowPriorityScore);
      }
    }

    // Combine both for comprehensive result
    const atsScore = {
      overallScore,
      keywordScore: quickScore.matchPercentage,
      matchedKeywords,
      missingKeywords,
      criticalMissing: layeredScore.criticalMissing,
      highPriority: aiKeywords
        ? { matched: highPriorityMatched, missing: highPriorityMissing }
        : undefined,
      lowPriority: aiKeywords
        ? { matched: lowPriorityMatched, missing: lowPriorityMissing }
        : undefined,
      suggestions: [
        ...layeredScore.recommendations,
        ...recommendations.filter(
          (r) => !layeredScore.recommendations.some((lr) => lr.includes(r.substring(0, 20)))
        ),
      ].slice(0, 5),
      tier: getTierFromScore(overallScore),
      seniorityMatch: quickScore.seniorityMatch,
      yearsRequired: quickScore.yearsRequired,
      keywordSource: aiKeywords ? 'ai' : 'library',
      layeredAnalysis: {
        background: layeredScore.backgroundMatch,
        role: layeredScore.roleMatch,
        skillAreas: layeredScore.skillAreaScores.map((area) => ({
          name: area.areaName,
          jdWeight: area.jdWeight,
          matchScore: area.matchScore,
          matched: area.matchedKeywords,
          missing: area.missingKeywords,
        })),
      },
      backgroundMismatch: quickScore.backgroundMismatch,
      backgroundMismatchMessage: quickScore.backgroundMismatchMessage,
      detectedJobBackground: quickScore.detectedJobBackground,
    };

    console.log('[MessageHandler] Job analysis complete:', {
      score: atsScore.overallScore,
      keywordSource: atsScore.keywordSource,
      matched: atsScore.matchedKeywords.length,
      missing: atsScore.missingKeywords.length,
      highPriorityMatched: highPriorityMatched.length,
      highPriorityMissing: highPriorityMissing.length,
    });

    return { success: true, data: atsScore };
  } catch (error) {
    console.error('[MessageHandler] Job analysis failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Quick score a job description against a specific role profile (for comparison view)
 */
export async function handleScoreJob(payload: {
  jobDescription: string;
  roleProfile: {
    id: string;
    targetRole?: string;
    highlightedSkills?: string[];
    atsKeywords?: string[];
  };
}): Promise<MessageResponse> {
  try {
    const { jobDescription, roleProfile } = payload;

    if (!jobDescription) {
      return { success: false, error: 'No job description provided' };
    }

    // Build a minimal skill set from the role profile for quick matching
    const profileSkills = new Set<string>();
    for (const skill of roleProfile.highlightedSkills || []) {
      profileSkills.add(skill.toLowerCase());
    }
    for (const kw of roleProfile.atsKeywords || []) {
      profileSkills.add(kw.toLowerCase());
    }

    // Simple keyword match score
    const jdLower = jobDescription.toLowerCase();
    const jdWords = jdLower.split(/[\s,;:.()[\]{}|/\\]+/).filter((w) => w.length > 2);
    const jdWordSet = new Set(jdWords);

    let matched = 0;
    const total = profileSkills.size || 1;

    for (const skill of profileSkills) {
      if (jdLower.includes(skill) || jdWordSet.has(skill)) {
        matched++;
      }
    }

    const overallScore = Math.min(100, Math.round((matched / total) * 100));

    return {
      success: true,
      data: { overallScore, matched, total },
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ── ATS Score Handler ───────────────────────────────────────────────────

export async function handleScoreResumeATS(payload: {
  masterProfileId: string;
  targetPages: number;
  jobDescription?: string;
}): Promise<MessageResponse> {
  try {
    const profile = await masterProfileRepo.getById(payload.masterProfileId);
    if (!profile) {
      return { success: false, error: 'Master profile not found' };
    }

    type AchievementLike = string | { statement: string };
    type SkillLike = string | { name: string };

    const yearsOfExp = profile.careerContext?.yearsOfExperience || 0;
    const seniority = mapSeniority(profile.careerContext?.seniorityLevel || 'mid');

    const getAchievementStrings = (exp: {
      achievements?: AchievementLike[];
      responsibilities?: string[];
    }) => [
      ...(exp.achievements?.map((a: AchievementLike) =>
        typeof a === 'string' ? a : a.statement
      ) || []),
      ...(exp.responsibilities || []),
    ];

    const getSkillNames = (skills: SkillLike[]) =>
      skills.map((s: SkillLike) => (typeof s === 'string' ? s : s.name));

    // Build data for extractResumeContent
    const data = {
      summary: profile.careerContext?.summary || '',
      experience: (profile.experience || []).map((exp: (typeof profile.experience)[number]) => ({
        company: exp.company,
        title: exp.title,
        startDate: exp.startDate,
        endDate: exp.endDate || (exp.isCurrent ? 'Present' : undefined),
        achievements: getAchievementStrings(exp),
      })),
      skills: {
        technical: getSkillNames(profile.skills?.technical || []),
        tools: getSkillNames(profile.skills?.tools || []),
        frameworks: getSkillNames(profile.skills?.frameworks || []),
      },
      education: (profile.education || []).map((edu: (typeof profile.education)[number]) => ({
        institution: edu.institution,
        degree: edu.degree || edu.normalizedDegree || '',
        year: edu.endDate,
      })),
      certifications: (profile.certifications || []).map(
        (c: (typeof profile.certifications)[number]) => (typeof c === 'string' ? c : c.name)
      ),
      projects: (profile.projects || []).map((p: (typeof profile.projects)[number]) => ({
        name: p.name,
        highlights: p.highlights,
      })),
    };

    // 1. Format validation
    const resumeContent = extractResumeContent(data, yearsOfExp, payload.targetPages);
    const formatScore = validateATSFormat(resumeContent);

    // 2. Bullet validation
    const roles = (profile.experience || []).map((exp: (typeof profile.experience)[number]) => ({
      company: exp.company,
      title: exp.title,
      bullets: getAchievementStrings(exp),
      seniority,
    }));
    const bulletReport = validateAllBullets(roles);

    // 3. Optional keyword scoring (needs JD)
    let keywordScore = undefined;
    if (payload.jobDescription?.trim()) {
      try {
        keywordScore = calculateQuickATSScore(profile, payload.jobDescription);
      } catch {
        // Keyword scoring failed  -  not critical
      }
    }

    // 4. Compute overall weighted score
    let overallScore: number;
    if (keywordScore) {
      overallScore = Math.round(
        formatScore.overallScore * 0.25 +
          bulletReport.overallScore * 0.35 +
          keywordScore.score * 0.4
      );
    } else {
      overallScore = Math.round(formatScore.overallScore * 0.4 + bulletReport.overallScore * 0.6);
    }

    // 5. Gap analysis (only when keyword scoring is available)
    let gapAnalysis = undefined;
    if (keywordScore) {
      const profileSkills = [
        ...getSkillNames(profile.skills?.technical || []),
        ...getSkillNames(profile.skills?.tools || []),
        ...getSkillNames(profile.skills?.frameworks || []),
      ];
      gapAnalysis = analyzeSkillGaps(keywordScore, profileSkills);
    }

    // 6. Red flag scan (always available  -  profile-based, no JD needed)
    const redFlagReport = scanRedFlags(profile);

    return {
      success: true,
      data: {
        formatScore,
        bulletReport,
        keywordScore,
        gapAnalysis,
        redFlagReport,
        overallScore,
      },
    };
  } catch (error) {
    console.error('[ApplySharp] ATS scoring failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

// ── File-based ATS Score Handler ────────────────────────────────────────

function parseResumeContentFromText(rawText: string, targetPages: number): ResumeContent {
  const lines = rawText.split('\n').filter((l) => l.trim());
  const sections: Array<{ header: string; content: string }> = [];
  const bullets: string[] = [];
  const dates: string[] = [];

  // Common section header patterns
  const sectionPattern =
    /^(summary|profile|professional summary|executive summary|work experience|professional experience|experience|employment history|education|academic background|skills|technical skills|core competencies|certifications|projects|academic projects|personal projects|key projects|publications|awards|honors|volunteer experience)$/i;

  let currentSection: { header: string; content: string } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if line is a section header
    if (
      sectionPattern.test(trimmed) ||
      (trimmed.length < 40 &&
        trimmed === trimmed.toUpperCase() &&
        /^[A-Z\s&/]+$/.test(trimmed) &&
        trimmed.length > 3)
    ) {
      if (currentSection) sections.push(currentSection);
      currentSection = { header: trimmed, content: '' };
      continue;
    }

    // Check if line is a bullet point
    if (/^[•\-–*]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      const bulletText = trimmed.replace(/^[•\-–*\d.]\s*/, '');
      if (bulletText.length > 20) bullets.push(bulletText);
    }

    // Extract dates
    const dateMatches = trimmed.match(
      /\b(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4}|\d{1,2}\/\d{4}|(?:19|20)\d{2}|Present|Current)\b/gi
    );
    if (dateMatches) dates.push(...dateMatches);

    // Add to current section content
    if (currentSection) {
      currentSection.content += (currentSection.content ? ' ' : '') + trimmed;
    }
  }
  if (currentSection) sections.push(currentSection);

  // Estimate years of experience from date ranges
  let yearsOfExperience = 0;
  const yearPattern = /\b((?:19|20)\d{2})\s*[-–]\s*(Present|Current|(?:19|20)\d{2})/gi;
  const currentYear = new Date().getFullYear();
  let totalMonths = 0;
  let match;
  while ((match = yearPattern.exec(rawText)) !== null) {
    const start = parseInt(match[1], 10);
    const end = /present|current/i.test(match[2]) ? currentYear : parseInt(match[2], 10);
    if (end >= start) totalMonths += (end - start + 1) * 12;
  }
  yearsOfExperience = Math.round(totalMonths / 12);

  const wordCount = rawText.split(/\s+/).filter(Boolean).length;

  return {
    sections,
    bullets,
    dates,
    fullText: rawText,
    wordCount,
    yearsOfExperience,
    pageCount: targetPages,
  };
}

export async function handleScoreResumeFileATS(payload: {
  rawText: string;
  targetPages: number;
  jobDescription?: string;
}): Promise<MessageResponse> {
  try {
    if (!payload.rawText?.trim()) {
      return { success: false, error: 'No text content to score' };
    }

    // Build ResumeContent from raw text
    const resumeContent = parseResumeContentFromText(payload.rawText, payload.targetPages);

    // 1. Format validation
    const formatScore = validateATSFormat(resumeContent);

    // 2. Bullet validation  -  group all bullets under a single "Uploaded Resume" role
    const bulletRoles =
      resumeContent.bullets.length > 0
        ? [
            {
              company: 'Uploaded Resume',
              title: 'All Roles',
              bullets: resumeContent.bullets,
              seniority: mapSeniority('mid'),
            },
          ]
        : [];
    const bulletReport = validateAllBullets(bulletRoles);

    // 3. Compute overall (no keyword scoring for file-only  -  no profile context)
    const overallScore = Math.round(
      formatScore.overallScore * 0.4 + bulletReport.overallScore * 0.6
    );

    return {
      success: true,
      data: {
        formatScore,
        bulletReport,
        overallScore,
      },
    };
  } catch (error) {
    console.error('[ApplySharp] File ATS scoring failed:', error);
    return { success: false, error: (error as Error).message };
  }
}
