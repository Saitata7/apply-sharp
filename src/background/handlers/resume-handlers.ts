import type { MessageResponse } from '@shared/utils/messaging';
import type { ExtractedJob } from '@shared/types/job.types';
import { profileRepo, masterProfileRepo } from '@storage/index';
import { getKeywordsToAdd } from '@core/ats/matcher';
import { stripBoilerplate } from '@core/ats/hybrid-scorer';
import { validateAllClaims, detectAITells } from '@core/profile/claims-validator';
import { sanitizePromptInput } from '@shared/utils/prompt-safety';
import {
  buildSystemPrompt,
  PERSONAS,
  CORE_RULES,
  ATS_FORMATTING_RULES,
  BULLET_RULES,
  RESUME_GENERATION_RULES,
  COVER_LETTER_RULES,
} from '@/ai/prompts/system-rules';
import { buildLearningContext } from '@/ai/learning-context';
import {
  CORE_TECH_PATTERNS,
  ALL_PATTERNS,
  extractKeywordsWithFrequency,
} from '@core/ats/keyword-patterns';
import { cachedAICall, generateChecksum } from '@/ai/cache';
import { getAIService } from '../message-handler';

// ============================================================================
// Shared Utilities
// ============================================================================

/**
 * Extract unique keywords from JD text using shared patterns, plus any
 * explicitly identified missing keywords. Used by both JD analysis and
 * resume optimization scoring.
 */
export function extractKeywordsFromJD(jdLower: string, missingKeywords?: string[]): string[] {
  const frequencyMap = extractKeywordsWithFrequency(jdLower, ALL_PATTERNS);
  const jdKeywords = Array.from(frequencyMap.keys());

  // Add any explicitly identified missing keywords
  if (missingKeywords) {
    missingKeywords.forEach((kw) => {
      if (!jdKeywords.includes(kw.toLowerCase())) {
        jdKeywords.push(kw.toLowerCase());
      }
    });
  }

  return jdKeywords;
}

// ============================================================================
// Resume Optimization Handlers
// ============================================================================

export async function handleOptimizeResume(payload: {
  job: ExtractedJob;
}): Promise<MessageResponse> {
  try {
    // Try MasterProfile first, fall back to legacy profile
    const masterProfile = await masterProfileRepo.getActive();
    const legacyProfile = !masterProfile ? await profileRepo.getDefault() : null;
    const resumeText = masterProfile?.sourceDocument?.rawText || legacyProfile?.rawResumeText;

    if (!resumeText) {
      return { success: false, error: 'No resume found. Please upload your resume first.' };
    }

    const keywords = getKeywordsToAdd(resumeText, payload.job.description);

    // Try AI-powered optimization if available
    const ai = await getAIService();
    if (ai.service) {
      try {
        const aiService = ai.service!;
        const systemPrompt = buildSystemPrompt(PERSONAS.RESUME_OPTIMIZER, [
          CORE_RULES,
          ATS_FORMATTING_RULES,
        ]);
        const userPrompt = `Analyze this job posting and the candidate's resume, then provide specific, actionable optimization suggestions.

Job Title: ${sanitizePromptInput(payload.job.title || '', 'job_title')}
Company: ${sanitizePromptInput(payload.job.company || '', 'company')}
Job Description: ${sanitizePromptInput(payload.job.description || '', 'job_description')}

Resume Text: ${sanitizePromptInput(resumeText.slice(0, 3000), 'resume_text')}

Missing Keywords: ${keywords.slice(0, 10).join(', ')}`;

        const OPTIMIZATION_SUGGESTIONS_SCHEMA = {
          type: 'object' as const,
          properties: {
            suggestions: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific actionable optimization suggestions (5 items)',
            },
            summaryTip: {
              type: 'string',
              description: 'One-sentence tip for improving the professional summary for this role',
            },
            fitScore: {
              type: 'number',
              description: 'Fit score from 0-100',
            },
          },
          required: ['suggestions', 'summaryTip', 'fitScore'],
        };

        const parsed = await aiService.chatStructured<{
          suggestions: string[];
          summaryTip: string;
          fitScore: number;
        }>(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          OPTIMIZATION_SUGGESTIONS_SCHEMA,
          'optimization_suggestions',
          {
            temperature: 0.4,
            maxTokens: 1000,
            feature: 'optimization_suggestions',
          }
        );
        if (parsed && Array.isArray(parsed.suggestions)) {
          return {
            success: true,
            data: {
              keywordsToAdd: keywords,
              suggestions: parsed.suggestions,
              summaryTip: parsed.summaryTip || '',
              fitScore: parsed.fitScore || null,
              aiPowered: true,
            },
          };
        }
      } catch (aiError) {
        console.warn('[OptimizeResume] AI optimization failed, using keyword fallback:', aiError);
      }
    }

    // Fallback: keyword-based suggestions
    return {
      success: true,
      data: {
        keywordsToAdd: keywords,
        suggestions: [
          keywords.length > 0
            ? `Add these missing keywords: ${keywords.slice(0, 5).join(', ')}`
            : 'Your resume already contains the key terms from this job posting.',
          'Quantify your achievements with specific numbers and metrics.',
          'Tailor your professional summary to highlight skills matching this role.',
          'Use action verbs that match the job description language.',
          'Ensure your most relevant experience appears first.',
        ],
        aiPowered: false,
      },
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// ANALYZE_JD_FOR_RESUME Handler
// ============================================================================

export async function handleAnalyzeJDForResume(payload: {
  masterProfileId: string;
  jobDescription: string;
}): Promise<MessageResponse> {
  try {
    const masterProfile = await masterProfileRepo.getById(payload.masterProfileId);
    if (!masterProfile) {
      return { success: false, error: 'Master profile not found' };
    }

    const ai = await getAIService();
    if (ai.error) return { success: false, error: ai.error };
    const aiService = ai.service!;

    // Strip HR/EEO boilerplate before any analysis
    const cleanedJD = stripBoilerplate(payload.jobDescription);
    const jdLower = cleanedJD.toLowerCase();

    // =========================================================================
    // STEP 1: Deep JD Analysis - Parse INTENT, not just words
    // =========================================================================
    const deepJdSystemPrompt = buildSystemPrompt(PERSONAS.HIRING_MANAGER, [CORE_RULES]);
    const deepJdUserPrompt = `Analyze this job description DEEPLY.

${sanitizePromptInput(cleanedJD, 'job_description')}

Don't just extract keywords. Think like a hiring manager:

1. WHAT PROBLEM is this role solving? What pain made them open this position?
2. WHAT DOES SUCCESS look like in 6 months for this hire?
3. WHAT'S THE RISK they're trying to avoid with a bad hire?
4. READ BETWEEN THE LINES - what do phrases like "fast-paced", "self-starter", "wear many hats" really mean?

Return a JSON object:
{
  "businessContext": {
    "coreProblem": "The PRIMARY business problem this role solves (1 sentence)",
    "successIn6Months": "What a successful hire will have achieved",
    "riskOfBadHire": "What goes wrong if they hire the wrong person",
    "urgencyLevel": "critical|high|normal|exploratory"
  },
  "mustHaves": [
    { "skill": "Python", "context": "Why they need it", "yearsRequired": 5, "isNegotiable": false }
  ],
  "niceToHaves": [
    { "skill": "Kubernetes", "context": "Would help with..." }
  ],
  "hiddenRequirements": [
    "What they want but didn't explicitly state (e.g., 'fast-paced' = startup chaos tolerance)"
  ],
  "senioritySignals": {
    "level": "entry|mid|senior|lead|principal",
    "indicators": ["Words that reveal level: lead, mentor, architect, drive, own"],
    "teamContext": "Solo contributor, small team, large org, managing others?"
  },
  "cultureSignals": {
    "companyStage": "startup|scaleup|enterprise",
    "workStyle": "remote|hybrid|onsite",
    "values": ["What they emphasize: innovation, stability, speed, quality?"]
  },
  "redFlags": ["Any concerning patterns in the JD"]
}

`;

    const DEEP_JD_ANALYSIS_SCHEMA = {
      type: 'object' as const,
      properties: {
        businessContext: {
          type: 'object',
          properties: {
            coreProblem: { type: 'string' },
            successIn6Months: { type: 'string' },
            riskOfBadHire: { type: 'string' },
            urgencyLevel: { type: 'string' },
          },
          required: ['coreProblem', 'successIn6Months', 'riskOfBadHire', 'urgencyLevel'],
        },
        mustHaves: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              skill: { type: 'string' },
              context: { type: 'string' },
              yearsRequired: { type: 'number' },
              isNegotiable: { type: 'boolean' },
            },
            required: ['skill', 'context'],
          },
        },
        niceToHaves: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              skill: { type: 'string' },
              context: { type: 'string' },
            },
            required: ['skill', 'context'],
          },
        },
        hiddenRequirements: { type: 'array', items: { type: 'string' } },
        senioritySignals: {
          type: 'object',
          properties: {
            level: { type: 'string' },
            indicators: { type: 'array', items: { type: 'string' } },
            teamContext: { type: 'string' },
          },
          required: ['level', 'indicators', 'teamContext'],
        },
        cultureSignals: {
          type: 'object',
          properties: {
            companyStage: { type: 'string' },
            workStyle: { type: 'string' },
            values: { type: 'array', items: { type: 'string' } },
          },
          required: ['companyStage', 'workStyle', 'values'],
        },
        redFlags: { type: 'array', items: { type: 'string' } },
      },
      required: [
        'businessContext',
        'mustHaves',
        'niceToHaves',
        'hiddenRequirements',
        'senioritySignals',
        'cultureSignals',
        'redFlags',
      ],
    };

    const jdAnalysis = {
      businessContext: {
        coreProblem: '',
        successIn6Months: '',
        riskOfBadHire: '',
        urgencyLevel: 'normal' as string,
      },
      mustHaves: [] as Array<{
        skill: string;
        context: string;
        yearsRequired?: number;
        isNegotiable?: boolean;
      }>,
      niceToHaves: [] as Array<{ skill: string; context: string }>,
      hiddenRequirements: [] as string[],
      senioritySignals: {
        level: 'mid' as string,
        indicators: [] as string[],
        teamContext: '',
      },
      cultureSignals: {
        companyStage: 'enterprise' as string,
        workStyle: 'hybrid' as string,
        values: [] as string[],
      },
      redFlags: [] as string[],
      // Legacy fields for backwards compatibility
      requiredSkills: [] as string[],
      preferredSkills: [] as string[],
      seniorityLevel: 'mid',
      roleType: 'Fullstack',
      keyResponsibilities: [] as string[],
      industryContext: '',
    };

    try {
      const jdCacheKey = `deep-jd-analysis:${generateChecksum(cleanedJD)}`;
      const parsed = await cachedAICall(
        jdCacheKey,
        () =>
          aiService.chatStructured<{
            businessContext: {
              coreProblem: string;
              successIn6Months: string;
              riskOfBadHire: string;
              urgencyLevel: string;
            };
            mustHaves: Array<{
              skill: string;
              context: string;
              yearsRequired?: number;
              isNegotiable?: boolean;
            }>;
            niceToHaves: Array<{ skill: string; context: string }>;
            hiddenRequirements: string[];
            senioritySignals: { level: string; indicators: string[]; teamContext: string };
            cultureSignals: { companyStage: string; workStyle: string; values: string[] };
            redFlags: string[];
          }>(
            [
              { role: 'system', content: deepJdSystemPrompt },
              { role: 'user', content: deepJdUserPrompt },
            ],
            DEEP_JD_ANALYSIS_SCHEMA,
            'deep_jd_analysis',
            {
              temperature: 0.2,
              maxTokens: 1500,
              feature: 'deep_jd_analysis',
            }
          ),
        24 * 60 * 60 * 1000 // 24h TTL
      );
      if (parsed) {
        // Merge only known fields to preserve jdAnalysis type
        if (parsed.businessContext)
          jdAnalysis.businessContext = { ...jdAnalysis.businessContext, ...parsed.businessContext };
        if (parsed.mustHaves) jdAnalysis.mustHaves = parsed.mustHaves;
        if (parsed.niceToHaves) jdAnalysis.niceToHaves = parsed.niceToHaves;
        if (parsed.senioritySignals)
          jdAnalysis.senioritySignals = {
            ...jdAnalysis.senioritySignals,
            ...parsed.senioritySignals,
          };
        if (parsed.cultureSignals)
          jdAnalysis.cultureSignals = { ...jdAnalysis.cultureSignals, ...parsed.cultureSignals };
        if (parsed.hiddenRequirements) jdAnalysis.hiddenRequirements = parsed.hiddenRequirements;
        if (parsed.redFlags) jdAnalysis.redFlags = parsed.redFlags;
        // Map to legacy fields for backwards compatibility
        jdAnalysis.requiredSkills = parsed.mustHaves?.map((m: { skill: string }) => m.skill) || [];
        jdAnalysis.preferredSkills =
          parsed.niceToHaves?.map((n: { skill: string }) => n.skill) || [];
        jdAnalysis.seniorityLevel = parsed.senioritySignals?.level || 'mid';
      }
    } catch (parseError) {
      console.warn('[AnalyzeJD] AI analysis parse failed, using keyword extraction');
    }

    // =========================================================================
    // STEP 2: Extract keywords with frequency (comprehensive patterns)
    // =========================================================================
    const keywordFrequency = extractKeywordsWithFrequency(jdLower, CORE_TECH_PATTERNS);

    // Add AI-extracted skills to keywords (only short, keyword-like items)
    [...jdAnalysis.requiredSkills, ...jdAnalysis.preferredSkills].forEach((skill) => {
      const normalized = skill.toLowerCase().trim();
      // Skip verbose phrases (>4 words)  -  these are descriptions, not keywords
      const wordCount = normalized.split(/\s+/).length;
      if (wordCount > 4 || normalized.length > 40) return;
      // Skip generic non-skill phrases
      if (
        /^(ability|experience|knowledge|understanding|familiarity|strong|bachelor|master|degree)\b/.test(
          normalized
        )
      )
        return;
      if (!keywordFrequency.has(normalized)) {
        keywordFrequency.set(normalized, 1);
      }
    });

    const allJdKeywords = Array.from(keywordFrequency.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count);

    // =========================================================================
    // STEP 3: Match against profile and find best role
    // =========================================================================
    const generatedProfiles = masterProfile.generatedProfiles || [];
    const profileKeywords: string[] = [];

    // Collect all profile keywords
    generatedProfiles.forEach((role) => {
      if (role.highlightedSkills) profileKeywords.push(...role.highlightedSkills);
      if (role.atsKeywords) profileKeywords.push(...role.atsKeywords);
    });

    if (masterProfile.skills) {
      if (masterProfile.skills.technical)
        profileKeywords.push(...masterProfile.skills.technical.map((s) => s.name));
      if (masterProfile.skills.frameworks)
        profileKeywords.push(...masterProfile.skills.frameworks.map((s) => s.name));
      if (masterProfile.skills.tools)
        profileKeywords.push(...masterProfile.skills.tools.map((s) => s.name));
      if (masterProfile.skills.programmingLanguages)
        profileKeywords.push(...masterProfile.skills.programmingLanguages.map((s) => s.name));
    }

    if (masterProfile.experience) {
      masterProfile.experience.forEach((exp) => {
        if (exp.technologiesUsed) {
          profileKeywords.push(...exp.technologiesUsed.map((t) => t.skill));
        }
      });
    }

    const profileKeywordsLower = profileKeywords.map((k) => k.toLowerCase());

    // =========================================================================
    // STEP 4: Weighted Multi-Dimension Scoring
    // =========================================================================

    // Separate matched vs missing keywords
    const matchedKeywords: Array<{ keyword: string; count: number }> = [];
    const missingKeywords: Array<{ keyword: string; count: number }> = [];

    allJdKeywords.forEach((jdKwObj) => {
      const isMatched = profileKeywordsLower.some(
        (pKw) => pKw.includes(jdKwObj.keyword) || jdKwObj.keyword.includes(pKw)
      );
      if (isMatched) {
        matchedKeywords.push(jdKwObj);
      } else {
        missingKeywords.push(jdKwObj);
      }
    });

    // SKILL MATCH (40% weight)
    const totalJdKeywords = allJdKeywords.length;
    const skillMatchRatio = totalJdKeywords > 0 ? matchedKeywords.length / totalJdKeywords : 0;
    const skillScore = Math.round(skillMatchRatio * 100);

    // EXPERIENCE DEPTH (30% weight) - check years and scale indicators
    const profileYears = masterProfile.careerContext?.yearsOfExperience || 0;
    const requiredYears = jdAnalysis.mustHaves?.[0]?.yearsRequired || 3;
    const yearsMatch = Math.min(profileYears / requiredYears, 1.5); // Cap at 150%
    const experienceScore = Math.round(Math.min(yearsMatch * 100, 100));

    // SENIORITY ALIGNMENT (20% weight)
    const seniorityMap: Record<string, number> = {
      entry: 1,
      junior: 1,
      mid: 2,
      senior: 3,
      lead: 4,
      principal: 5,
      staff: 5,
    };
    const jdSeniority =
      seniorityMap[jdAnalysis.senioritySignals?.level?.toLowerCase() || 'mid'] || 2;
    const profileSeniority =
      seniorityMap[masterProfile.careerContext?.seniorityLevel?.toLowerCase() || 'mid'] || 2;
    const seniorityDiff = Math.abs(jdSeniority - profileSeniority);
    const seniorityScore =
      seniorityDiff === 0 ? 100 : seniorityDiff === 1 ? 75 : seniorityDiff === 2 ? 40 : 20;

    // CULTURE FIT (10% weight) - industry overlap, company stage match
    const profileIndustries =
      masterProfile.careerContext?.industryExperience?.map((i) => i.toLowerCase()) || [];
    const hasIndustryMatch = profileIndustries.some((ind) => cleanedJD.toLowerCase().includes(ind));
    const cultureScore = hasIndustryMatch ? 85 : profileIndustries.length > 0 ? 65 : 50;

    // WEIGHTED TOTAL SCORE
    const matchScore = Math.round(
      skillScore * 0.4 + experienceScore * 0.3 + seniorityScore * 0.2 + cultureScore * 0.1
    );

    // =========================================================================
    // STEP 5: Gap Severity Analysis
    // =========================================================================
    const mustHaveSkills =
      jdAnalysis.mustHaves?.map((m) => m.skill.toLowerCase()) ||
      jdAnalysis.requiredSkills?.map((s) => s.toLowerCase()) ||
      [];
    const niceToHaveSkills =
      jdAnalysis.niceToHaves?.map((n) => n.skill.toLowerCase()) ||
      jdAnalysis.preferredSkills?.map((s) => s.toLowerCase()) ||
      [];

    const gapAnalysis = {
      critical: [] as string[],
      addressable: [] as string[],
      minor: [] as string[],
    };

    missingKeywords.forEach((kw) => {
      const isMustHave = mustHaveSkills.some(
        (mh) => mh.includes(kw.keyword) || kw.keyword.includes(mh)
      );
      const isNiceToHave = niceToHaveSkills.some(
        (nth) => nth.includes(kw.keyword) || kw.keyword.includes(nth)
      );

      if (isMustHave) {
        // Check if there's related/transferable experience
        const hasRelated = profileKeywordsLower.some((pk) =>
          pk.split(' ').some((word) => kw.keyword.includes(word) || word.includes(kw.keyword))
        );
        if (hasRelated) {
          gapAnalysis.addressable.push(kw.keyword);
        } else {
          gapAnalysis.critical.push(kw.keyword);
        }
      } else if (isNiceToHave) {
        gapAnalysis.minor.push(kw.keyword);
      } else {
        gapAnalysis.addressable.push(kw.keyword);
      }
    });

    // Find best matching role
    let bestRole = generatedProfiles[0] || null;
    let bestRoleScore = 0;

    generatedProfiles.forEach((role) => {
      const roleKeywords = [...(role.highlightedSkills || []), ...(role.atsKeywords || [])].map(
        (k) => k.toLowerCase()
      );

      const roleMatches = allJdKeywords.filter((jdKwObj) =>
        roleKeywords.some((rKw) => rKw.includes(jdKwObj.keyword) || jdKwObj.keyword.includes(rKw))
      ).length;

      if (roleMatches > bestRoleScore) {
        bestRoleScore = roleMatches;
        bestRole = role;
      }
    });

    // Generate strategic suggestions based on analysis
    const suggestions: string[] = [];

    // Core problem alignment
    if (jdAnalysis.businessContext?.coreProblem) {
      suggestions.push(`🎯 Core problem: ${jdAnalysis.businessContext.coreProblem}`);
    }

    // Seniority alignment
    if (seniorityDiff > 1) {
      suggestions.push(
        `⚠️ Seniority gap: JD seeks ${jdAnalysis.senioritySignals?.level || 'unknown'}, profile shows ${masterProfile.careerContext?.seniorityLevel || 'unknown'}`
      );
    }

    // Critical gaps
    if (gapAnalysis.critical.length > 0) {
      suggestions.push(`🚨 Critical gaps: ${gapAnalysis.critical.slice(0, 3).join(', ')}`);
    }

    // Addressable gaps
    if (gapAnalysis.addressable.length > 0) {
      suggestions.push(`💡 Can highlight: ${gapAnalysis.addressable.slice(0, 3).join(', ')}`);
    }

    // Hidden requirements
    if (jdAnalysis.hiddenRequirements?.length > 0) {
      suggestions.push(`🔍 Hidden needs: ${jdAnalysis.hiddenRequirements.slice(0, 2).join('; ')}`);
    }

    // Match summary
    suggestions.push(
      `📊 Match: Skills ${skillScore}%, Experience ${experienceScore}%, Seniority ${seniorityScore}%`
    );

    console.log('[AnalyzeJD] Deep Analysis complete:', {
      totalKeywords: totalJdKeywords,
      matched: matchedKeywords.length,
      missing: missingKeywords.length,
      matchScore,
      scoreBreakdown: { skillScore, experienceScore, seniorityScore, cultureScore },
      gapAnalysis,
      coreProblem: jdAnalysis.businessContext?.coreProblem,
      bestRole: bestRole?.targetRole,
    });

    return {
      success: true,
      data: {
        matchedRole: bestRole,
        matchScore,
        matchedKeywords,
        missingKeywords: missingKeywords.slice(0, 15),
        suggestions,
        // Deep analysis data
        jdAnalysis,
        gapAnalysis,
        scoreBreakdown: {
          skills: skillScore,
          experience: experienceScore,
          seniority: seniorityScore,
          culture: cultureScore,
        },
      },
    };
  } catch (error) {
    console.error('[AnalyzeJD] Error:', error);
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// UPDATE_ANSWER_BANK Handler
// ============================================================================

export async function handleUpdateAnswerBank(payload: {
  masterProfileId: string;
  keywords: string[];
  context: string;
}): Promise<MessageResponse> {
  try {
    const masterProfile = await masterProfileRepo.getById(payload.masterProfileId);
    if (!masterProfile) {
      return { success: false, error: 'Master profile not found' };
    }

    const addedToSkills: string[] = [];
    const addedToAtsKeywords: string[] = [];

    // Filter valid keywords
    const validKeywords = payload.keywords.filter((kw) => {
      const kwLower = kw.toLowerCase();
      return (
        /^[a-z0-9#+.\-/\s]+$/i.test(kw) &&
        kw.length >= 2 &&
        kw.length <= 30 &&
        !['the', 'and', 'or', 'for', 'with', 'you', 'will', 'can', 'are'].includes(kwLower)
      );
    });

    if (validKeywords.length === 0) {
      return {
        success: true,
        data: { addedToSkills: [], addedToAtsKeywords: [], suggestions: [] },
      };
    }

    // Get the active generated profile
    const activeProfile =
      masterProfile.generatedProfiles?.find((p) => p.isActive) ||
      masterProfile.generatedProfiles?.[0];

    if (activeProfile) {
      // Add keywords to the active profile's ATS keywords
      const existingAtsKeywords = new Set(
        activeProfile.atsKeywords?.map((k) => k.toLowerCase()) || []
      );

      validKeywords.forEach((kw) => {
        if (!existingAtsKeywords.has(kw.toLowerCase())) {
          addedToAtsKeywords.push(kw);
        }
      });

      if (addedToAtsKeywords.length > 0) {
        const updatedProfiles = masterProfile.generatedProfiles?.map((p) => {
          if (p.id === activeProfile.id) {
            return {
              ...p,
              atsKeywords: [...(p.atsKeywords || []), ...addedToAtsKeywords],
              updatedAt: new Date(),
            };
          }
          return p;
        });

        await masterProfileRepo.update(payload.masterProfileId, {
          generatedProfiles: updatedProfiles,
        });
      }
    }

    console.log('[UpdateAnswerBank] Added keywords:', {
      addedToSkills: addedToSkills.length,
      addedToAtsKeywords: addedToAtsKeywords.length,
    });

    return {
      success: true,
      data: {
        addedToSkills,
        addedToAtsKeywords,
        suggestions:
          addedToAtsKeywords.length > 0
            ? [`Added ${addedToAtsKeywords.length} keywords to your profile`]
            : [],
      },
    };
  } catch (error) {
    console.error('[UpdateAnswerBank] Error:', error);
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// OPTIMIZE_RESUME_FOR_JD Handler
// ============================================================================

export async function handleOptimizeResumeForJD(payload: {
  masterProfileId: string;
  roleId: string;
  jobDescription: string;
  missingKeywords: string[];
  strengthKeywords?: Array<{ keyword: string; count: number }>;
  currentSummary: string;
  keyBulletPoints: Array<{
    expId: string;
    bullets: string[];
    expectedCount?: number;
    durationMonths?: number;
  }>;
}): Promise<MessageResponse> {
  try {
    const ai = await getAIService();
    if (ai.error) return { success: false, error: ai.error };
    const aiService = ai.service!;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const warnings: string[] = [];

    // =========================================================================
    // STEP 1: Deep JD Analysis - Understand what they REALLY need
    // =========================================================================
    const jdSystemPrompt = buildSystemPrompt(PERSONAS.HIRING_MANAGER, [CORE_RULES]);
    const jdUserPrompt = `Analyze this job description deeply.

${sanitizePromptInput(payload.jobDescription, 'job_description')}

Analyze and return a JSON object with:
{
  "coreNeed": "What is the PRIMARY business problem they're trying to solve? (1 sentence)",
  "mustHaves": ["Top 3 absolutely required skills/experiences"],
  "niceToHaves": ["Top 3 preferred but not required"],
  "hiddenPriorities": ["What do they care about that isn't explicitly stated? Read between the lines."],
  "teamContext": "What can you infer about the team size, stage, culture?",
  "impactExpected": "What kind of impact will this person need to deliver?"
}

Think like a hiring manager, not a keyword matcher.`;

    let jdAnalysis = {
      coreNeed: '',
      mustHaves: [] as string[],
      niceToHaves: [] as string[],
      hiddenPriorities: [] as string[],
      teamContext: '',
      impactExpected: '',
    };

    const JD_ANALYSIS_SCHEMA = {
      type: 'object' as const,
      properties: {
        coreNeed: {
          type: 'string',
          description: 'Primary business problem they are trying to solve (1 sentence)',
        },
        mustHaves: {
          type: 'array',
          items: { type: 'string' },
          description: 'Top 3 absolutely required skills/experiences',
        },
        niceToHaves: {
          type: 'array',
          items: { type: 'string' },
          description: 'Top 3 preferred but not required',
        },
        hiddenPriorities: {
          type: 'array',
          items: { type: 'string' },
          description: 'What they care about that is not explicitly stated',
        },
        teamContext: {
          type: 'string',
          description: 'What can you infer about the team size, stage, culture',
        },
        impactExpected: {
          type: 'string',
          description: 'What kind of impact this person needs to deliver',
        },
      },
      required: [
        'coreNeed',
        'mustHaves',
        'niceToHaves',
        'hiddenPriorities',
        'teamContext',
        'impactExpected',
      ],
    };

    try {
      const optimizeJdCacheKey = `jd-analysis:${generateChecksum(stripBoilerplate(payload.jobDescription))}`;
      const parsed = await cachedAICall(
        optimizeJdCacheKey,
        () =>
          aiService.chatStructured<{
            coreNeed: string;
            mustHaves: string[];
            niceToHaves: string[];
            hiddenPriorities: string[];
            teamContext: string;
            impactExpected: string;
          }>(
            [
              { role: 'system', content: jdSystemPrompt },
              { role: 'user', content: jdUserPrompt },
            ],
            JD_ANALYSIS_SCHEMA,
            'jd_analysis',
            {
              temperature: 0.3,
              maxTokens: 800,
              feature: 'deep_jd_analysis',
            }
          ),
        24 * 60 * 60 * 1000 // 24h TTL
      );
      jdAnalysis = {
        coreNeed: typeof parsed.coreNeed === 'string' ? parsed.coreNeed : '',
        mustHaves: Array.isArray(parsed.mustHaves) ? parsed.mustHaves : [],
        niceToHaves: Array.isArray(parsed.niceToHaves) ? parsed.niceToHaves : [],
        hiddenPriorities: Array.isArray(parsed.hiddenPriorities) ? parsed.hiddenPriorities : [],
        teamContext: typeof parsed.teamContext === 'string' ? parsed.teamContext : '',
        impactExpected: typeof parsed.impactExpected === 'string' ? parsed.impactExpected : '',
      };
    } catch (parseError) {
      warnings.push('JD analysis failed  -  optimization used basic keyword matching instead');
      console.warn('[OptimizeResume] JD analysis parse failed, continuing with basic approach');
    }

    // =========================================================================
    // STEP 2: Strategic Summary - Tell a story that matches their needs
    // =========================================================================
    // Format strength keywords for the prompt
    const strengthKeywordsText =
      payload.strengthKeywords && payload.strengthKeywords.length > 0
        ? payload.strengthKeywords
            .slice(0, 6)
            .map((k) => `${k.keyword} (${k.count}x in profile)`)
            .join(', ')
        : 'Technical skills from experience';

    const topStrengths =
      payload.strengthKeywords && payload.strengthKeywords.length > 0
        ? payload.strengthKeywords
            .slice(0, 3)
            .map((k) => k.keyword)
            .join(', ')
        : '';

    const learningCtx = await buildLearningContext().catch(() => '');
    const summarySystemPrompt = buildSystemPrompt(
      PERSONAS.RESUME_OPTIMIZER,
      [CORE_RULES, RESUME_GENERATION_RULES],
      learningCtx || undefined
    );
    const summaryUserPrompt = `THE EMPLOYER'S REAL NEED:
${sanitizePromptInput(jdAnalysis.coreNeed || 'Based on the job description keywords', 'core_need')}

WHAT THEY MUST SEE:
${sanitizePromptInput(jdAnalysis.mustHaves.length > 0 ? jdAnalysis.mustHaves.join(', ') : payload.missingKeywords.slice(0, 5).join(', '), 'must_haves')}

CANDIDATE'S PROVEN STRENGTHS (mention these prominently - they have deep experience):
${strengthKeywordsText}

HIDDEN PRIORITIES (read between the lines):
${jdAnalysis.hiddenPriorities.length > 0 ? jdAnalysis.hiddenPriorities.join(', ') : 'Reliability, ownership, impact'}

CANDIDATE'S CURRENT SUMMARY:
${sanitizePromptInput(payload.currentSummary, 'current_summary')}

KEYWORDS TO ADD (missing from profile):
${payload.missingKeywords.slice(0, 4).join(', ')}

YOUR TASK:
Rewrite this summary to tell a STORY that makes the hiring manager think "This person understands what we need."

Rules:
1. LEAD with the candidate's proven strengths: ${topStrengths || 'their core technical skills'}
2. EMPHASIZE keywords they're strong in (high counts) - these prove deep experience
3. Connect their experience to the employer's business problem
4. Show trajectory and growth, not just a list of skills
5. Weave in 2-3 missing keywords NATURALLY (they should feel invisible)
6. End with what value they'll bring (not just what they want)
7. Keep it 3-4 sentences, punchy and confident
8. NEVER fabricate experience - only reframe what's there

Return ONLY the rewritten summary, no explanation.`;

    const optimizedSummaryResponse = await aiService.chat(
      [
        { role: 'system', content: summarySystemPrompt },
        { role: 'user', content: summaryUserPrompt },
      ],
      { temperature: 0.6, maxTokens: 500, feature: 'summary_rewrite' }
    );
    let optimizedSummary = optimizedSummaryResponse.content.trim();

    // =========================================================================
    // STEP 3: Intelligent Bullet Enhancement - Add context, scale, impact
    // =========================================================================
    // Format strength keywords for bullets prompt
    const bulletStrengthKeywords =
      payload.strengthKeywords && payload.strengthKeywords.length > 0
        ? payload.strengthKeywords
            .slice(0, 8)
            .map((k) => `${k.keyword} (${k.count}x)`)
            .join(', ')
        : '';

    // Format bullets with expected counts based on tenure duration
    const bulletsWithCounts = payload.keyBulletPoints
      .map((exp) => {
        const duration = exp.durationMonths || 12;
        const durationLabel =
          duration <= 6
            ? '~6 months'
            : duration <= 12
              ? '~1 year'
              : duration <= 24
                ? '~2 years'
                : duration <= 36
                  ? '~3 years'
                  : `${Math.round(duration / 12)}+ years`;
        return `[${exp.expId}] (${durationLabel} tenure → Generate ${exp.expectedCount || 5} bullets)\nExisting bullets:\n${exp.bullets.map((b, i) => `${i + 1}. ${sanitizePromptInput(b, 'bullet')}`).join('\n')}`;
      })
      .join('\n\n');

    const bulletsSystemPrompt = buildSystemPrompt(PERSONAS.RESUME_OPTIMIZER, [
      CORE_RULES,
      BULLET_RULES,
      RESUME_GENERATION_RULES,
    ]);
    const bulletsUserPrompt = `WHAT THIS EMPLOYER VALUES:
- Core need: ${sanitizePromptInput(jdAnalysis.coreNeed || 'Technical excellence and ownership', 'core_need')}
- Must-haves: ${sanitizePromptInput(jdAnalysis.mustHaves.join(', ') || payload.missingKeywords.slice(0, 3).join(', '), 'must_haves')}
- Impact expected: ${sanitizePromptInput(jdAnalysis.impactExpected || 'Measurable business results', 'impact')}

CANDIDATE'S PROVEN STRENGTHS (EMPHASIZE these - high counts = deep experience):
${bulletStrengthKeywords || 'Based on their experience'}

KEYWORDS TO ADD (missing - weave in naturally):
${payload.missingKeywords.slice(0, 5).join(', ')}

EXPERIENCES TO ENHANCE (note the REQUIRED bullet count for each based on tenure):
${bulletsWithCounts}

BULLET COUNT RULES (VERY IMPORTANT - follow exactly):
- 6 months tenure: Generate exactly 4 bullets
- 1 year tenure: Generate exactly 7-8 bullets
- 2 years tenure: Generate exactly 11-12 bullets
- 3 years tenure: Generate exactly 15 bullets
- 4+ years tenure: Generate exactly 15-16 bullets

TRANSFORMATION RULES:
1. Generate the EXACT number of bullets specified for each role based on tenure
2. PRIORITIZE strength keywords - mention them frequently as they prove deep expertise
3. Add CONTEXT: Team size, company stage, complexity ("Led a team of 5" vs "Led team")
4. Add SCALE: Numbers, percentages, user counts ("Migrated 50+ microservices" vs "Migrated microservices")
5. Add IMPACT: Business value, not just technical outcome ("reducing customer churn by 15%" vs "improved performance")
6. Add OWNERSHIP: Show initiative ("Identified and fixed" vs "Fixed")
7. Match their LANGUAGE: Use terms from the JD naturally
8. Keep bullets CONCISE: 1-2 lines max, start with strong action verb
9. NEVER invent metrics - if scale isn't clear, describe complexity instead
10. For strength keywords with high counts: mention the technology explicitly in multiple bullets
11. If the candidate has fewer bullets than requested, expand existing bullets with more context, scale, and impact details rather than creating entirely new achievements. Every bullet must be based on the candidate's actual experience
12. Ensure bullets are diverse - cover different aspects: technical work, leadership, collaboration, impact

EXAMPLE TRANSFORMATION (if JavaScript has high count):
Before: "Built responsive web application for e-commerce"
After: "Architected responsive JavaScript e-commerce platform using React and Node.js, implementing real-time inventory updates via WebSocket, reducing cart abandonment by 23%"

Return in this exact JSON format (IMPORTANT: generate the exact bullet count specified for each expId):
{"enhancedBullets": [{"expId": "id", "bullets": ["bullet 1", "bullet 2", ... up to the required count]}]}`;

    const BULLET_ENHANCEMENT_SCHEMA = {
      type: 'object' as const,
      properties: {
        enhancedBullets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              expId: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
            required: ['expId', 'bullets'],
          },
        },
      },
      required: ['enhancedBullets'],
    };

    let enhancedBullets: Array<{ expId: string; bullets: string[] }> = payload.keyBulletPoints;

    try {
      const bulletsResult = await aiService.chatStructured<{
        enhancedBullets: Array<{ expId: string; bullets: string[] }>;
      }>(
        [
          { role: 'system', content: bulletsSystemPrompt },
          { role: 'user', content: bulletsUserPrompt },
        ],
        BULLET_ENHANCEMENT_SCHEMA,
        'bullet_enhancement',
        { temperature: 0.5, maxTokens: 2500, feature: 'bullet_enhancement' }
      );
      const parsed = bulletsResult.enhancedBullets;
      if (
        Array.isArray(parsed) &&
        parsed.every((item) => item.expId && Array.isArray(item.bullets))
      ) {
        enhancedBullets = parsed;
      }
    } catch (parseError) {
      // If parsing fails, keep original bullets
      warnings.push('Bullet enhancement failed  -  original bullets were kept unchanged');
      console.warn('[OptimizeResume] Failed to parse enhanced bullets:', parseError);
    }

    console.log('[OptimizeResume] JD Analysis:', {
      coreNeed: jdAnalysis.coreNeed,
      mustHaves: jdAnalysis.mustHaves,
      hiddenPriorities: jdAnalysis.hiddenPriorities,
    });

    // =========================================================================
    // STEP 4: Self-Evaluation & Quality Gates (one retry if below threshold)
    // =========================================================================
    const QUALITY_THRESHOLD = 80;

    // Evaluate keyword coverage on optimized content
    const evalContent = (
      optimizedSummary +
      ' ' +
      enhancedBullets.flatMap((eb) => eb.bullets).join(' ')
    ).toLowerCase();

    const evalJdKeywords = extractKeywordsFromJD(
      payload.jobDescription.toLowerCase(),
      payload.missingKeywords
    );
    const evalMatched = evalJdKeywords.filter((kw) => evalContent.includes(kw)).length;
    const evalTotalKw = Math.max(evalJdKeywords.length, 1);
    const keywordScore = Math.round((evalMatched / evalTotalKw) * 100);

    // Evaluate bullet quality using claims validator
    const claimsReport = validateAllClaims(
      enhancedBullets.map((eb) => ({
        company: eb.expId,
        title: eb.expId,
        achievements: eb.bullets,
      }))
    );
    const bulletQualityScore = claimsReport.overallScore;

    // Combined score: 60% keyword coverage, 40% bullet quality
    const combinedQualityScore = Math.round(keywordScore * 0.6 + bulletQualityScore * 0.4);

    console.log('[OptimizeResume] Quality gate evaluation:', {
      keywordScore,
      bulletQualityScore,
      combinedQualityScore,
      threshold: QUALITY_THRESHOLD,
      matchedKeywords: evalMatched,
      totalKeywords: evalTotalKw,
      claimsStrong: claimsReport.strong,
      claimsWeak: claimsReport.weak,
    });

    if (combinedQualityScore < QUALITY_THRESHOLD) {
      // Identify what's still missing for feedback
      const stillMissingKeywords = evalJdKeywords.filter((kw) => !evalContent.includes(kw));
      const weakBulletIssues = claimsReport.topIssues.slice(0, 3).map((i) => i.message);

      const regenerationFeedback = [
        `Previous quality score: ${combinedQualityScore}/100 (threshold: ${QUALITY_THRESHOLD}).`,
        stillMissingKeywords.length > 0
          ? `Missing keywords to weave in: ${stillMissingKeywords.slice(0, 8).join(', ')}.`
          : '',
        weakBulletIssues.length > 0 ? `Bullet issues: ${weakBulletIssues.join('; ')}.` : '',
      ]
        .filter(Boolean)
        .join(' ');

      console.log(
        '[OptimizeResume] Quality below threshold, regenerating Steps 2-3 with feedback:',
        regenerationFeedback
      );

      // Re-run Step 2: Summary with feedback
      try {
        const regenSummaryPrompt = `${summaryUserPrompt}

IMPORTANT FEEDBACK FROM QUALITY CHECK:
${regenerationFeedback}
Ensure the following missing keywords appear naturally in the summary: ${stillMissingKeywords.slice(0, 5).join(', ')}`;

        const regenSummaryResponse = await aiService.chat(
          [
            { role: 'system', content: summarySystemPrompt },
            { role: 'user', content: regenSummaryPrompt },
          ],
          { temperature: 0.6, maxTokens: 500, feature: 'summary_rewrite' }
        );
        optimizedSummary = regenSummaryResponse.content.trim();
      } catch (regenError) {
        console.warn('[OptimizeResume] Summary regeneration failed, keeping original:', regenError);
      }

      // Re-run Step 3: Bullets with feedback
      try {
        const regenBulletsPrompt = `${bulletsUserPrompt}

IMPORTANT FEEDBACK FROM QUALITY CHECK:
${regenerationFeedback}
Ensure these missing keywords appear naturally in the bullets: ${stillMissingKeywords.slice(0, 8).join(', ')}
Fix these bullet quality issues: ${weakBulletIssues.join('. ')}`;

        const regenBulletsResult = await aiService.chatStructured<{
          enhancedBullets: Array<{ expId: string; bullets: string[] }>;
        }>(
          [
            { role: 'system', content: bulletsSystemPrompt },
            { role: 'user', content: regenBulletsPrompt },
          ],
          BULLET_ENHANCEMENT_SCHEMA,
          'bullet_enhancement',
          { temperature: 0.5, maxTokens: 2500, feature: 'bullet_enhancement' }
        );
        const regenParsed = regenBulletsResult.enhancedBullets;
        if (
          Array.isArray(regenParsed) &&
          regenParsed.every((item) => item.expId && Array.isArray(item.bullets))
        ) {
          enhancedBullets = regenParsed;
        }
      } catch (regenError) {
        console.warn('[OptimizeResume] Bullet regeneration failed, keeping previous:', regenError);
      }

      // Log post-regeneration quality
      const regenContent = (
        optimizedSummary +
        ' ' +
        enhancedBullets.flatMap((eb) => eb.bullets).join(' ')
      ).toLowerCase();
      const regenMatched = evalJdKeywords.filter((kw) => regenContent.includes(kw)).length;
      const regenKeywordScore = Math.round((regenMatched / evalTotalKw) * 100);
      console.log('[OptimizeResume] Post-regeneration keyword score:', {
        before: keywordScore,
        after: regenKeywordScore,
      });
    }

    // Calculate new score - REAL recalculation based on actual keyword presence
    const optimizedContent = (
      optimizedSummary +
      ' ' +
      enhancedBullets.flatMap((eb) => eb.bullets).join(' ')
    ).toLowerCase();

    // Count which missing keywords are now present in optimized content
    const addedKeywords = payload.missingKeywords.filter((kw) =>
      optimizedContent.includes(kw.toLowerCase())
    );

    // Extract all keywords from the original JD using shared patterns
    const jdLower = payload.jobDescription.toLowerCase();
    const jdKeywords = extractKeywordsFromJD(jdLower, payload.missingKeywords);

    // Count how many JD keywords are now in optimized content
    const matchedInOptimized = jdKeywords.filter((kw) => optimizedContent.includes(kw)).length;

    // Calculate REAL score - no artificial inflation
    const totalJdKeywords = Math.max(jdKeywords.length, 1);
    const realScore = Math.round((matchedInOptimized / totalJdKeywords) * 100);

    // Cap at 95% max (no resume is perfect)
    const newScore = Math.min(realScore, 95);

    // Workstream 3 post-generation linter for resume bullets. Resumes are
    // higher-stakes than cover letters and were previously unscanned. Run
    // detectAITells across the optimized summary AND every enhanced bullet,
    // collect the worst tells, and surface them on the response so the UI
    // can render a "what to fix" banner. The agent loop in
    // ResumeGenerator.tsx can also use the result to decide whether to
    // regenerate.
    const aiTellsTexts: string[] = [optimizedSummary];
    for (const bulletGroup of enhancedBullets ?? []) {
      for (const b of bulletGroup.bullets ?? []) {
        if (typeof b === 'string') aiTellsTexts.push(b);
      }
    }
    const aiTells = detectAITells(aiTellsTexts.join('\n\n'));

    console.log('[OptimizeResume] Score calculation:', {
      totalJdKeywords,
      matchedInOptimized,
      addedKeywords: addedKeywords.length,
      originalMissing: payload.missingKeywords.length,
      realScore,
      finalScore: newScore,
      aiTellsClean: !aiTells.hasIssues,
    });

    return {
      success: true,
      data: {
        optimizedSummary,
        enhancedBullets,
        addedKeywords,
        newScore,
        aiTells,
        ...(warnings.length > 0 ? { warnings } : {}),
      },
    };
  } catch (error) {
    console.error('[OptimizeResume] Error:', error);
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// Quick Tailor Orchestrator
// ============================================================================

export async function handleQuickTailor(payload: {
  masterProfileId: string;
  roleId: string;
  jobDescription: string;
  companyName?: string;
  jobTitle?: string;
  includeCoverLetter?: boolean;
}): Promise<MessageResponse> {
  try {
    // Step 1: Analyze JD
    const analysisResult = await handleAnalyzeJDForResume({
      masterProfileId: payload.masterProfileId,
      jobDescription: payload.jobDescription,
    });

    if (!analysisResult.success) {
      return {
        success: false,
        error: `JD analysis failed: ${analysisResult.error}`,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const analysis = analysisResult.data as Record<string, any>;

    // Step 2: Optimize resume for JD
    const masterProfile = await masterProfileRepo.getById(payload.masterProfileId);
    if (!masterProfile) {
      return { success: false, error: 'Master profile not found' };
    }

    // Find the target role profile
    const roleProfile = masterProfile.generatedProfiles?.find((p) => p.id === payload.roleId);
    const currentSummary =
      roleProfile?.tailoredSummary || masterProfile.careerContext?.summary || '';

    // Build bullet points for optimization
    const keyBulletPoints = (masterProfile.experience || []).map((exp) => {
      const expId = exp.id || `${exp.company}-${exp.title}`.replace(/\s+/g, '-').toLowerCase();
      const allBullets = [
        ...(exp.achievements || []).map((a: string | { statement: string }) =>
          typeof a === 'string' ? a : a.statement
        ),
        ...(exp.responsibilities || []),
      ];
      return {
        expId,
        bullets: allBullets.slice(0, 10),
        expectedCount: Math.min(allBullets.length, 8),
        durationMonths: exp.durationMonths || 12,
      };
    });

    const missingKeywords = (analysis.missingKeywords || []).map(
      (kw: { keyword: string } | string) => (typeof kw === 'string' ? kw : kw.keyword)
    );

    const strengthKeywords = (analysis.matchedKeywords || [])
      .sort((a: { count?: number }, b: { count?: number }) => (b.count || 1) - (a.count || 1))
      .slice(0, 10)
      .map((kw: { keyword: string; count?: number }) => ({
        keyword: kw.keyword,
        count: kw.count || 1,
      }));

    const optimizeResult = await handleOptimizeResumeForJD({
      masterProfileId: payload.masterProfileId,
      roleId: payload.roleId,
      jobDescription: payload.jobDescription,
      missingKeywords,
      strengthKeywords,
      currentSummary,
      keyBulletPoints,
    });

    if (!optimizeResult.success) {
      return {
        success: false,
        error: `Resume optimization failed: ${optimizeResult.error}`,
      };
    }

    // Step 3: Optionally generate cover letter
    let coverLetterData = null;
    if (payload.includeCoverLetter && payload.companyName && payload.jobTitle) {
      const coverLetterResult = await handleGenerateCoverLetter({
        jobDescription: payload.jobDescription,
        companyName: payload.companyName,
        jobTitle: payload.jobTitle,
      });
      if (coverLetterResult.success) {
        coverLetterData = coverLetterResult.data;
      }
    }

    return {
      success: true,
      data: {
        analysis,
        tailoredContent: optimizeResult.data,
        coverLetter: coverLetterData,
        newScore: (optimizeResult.data as { newScore?: number })?.newScore,
      },
    };
  } catch (error) {
    console.error('[QuickTailor] Error:', error);
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// Cover Letter Generation Handler
// ============================================================================

export async function handleGenerateCoverLetter(payload: {
  jobDescription: string;
  companyName: string;
  jobTitle: string;
  tone?: 'professional' | 'conversational' | 'formal';
}): Promise<MessageResponse> {
  try {
    const tone = payload.tone || 'professional';

    const ai = await getAIService();
    if (ai.error) return { success: false, error: ai.error };
    const aiService = ai.service!;

    // Get active master profile for candidate info
    const masterProfile = await masterProfileRepo.getActive();
    if (!masterProfile) {
      return {
        success: false,
        error: 'No active master profile found. Please upload your resume first.',
      };
    }

    // =========================================================================
    // STEP 1: Deep JD Analysis - Understand what they REALLY need
    // =========================================================================
    const clJdSystemPrompt = buildSystemPrompt(PERSONAS.HIRING_MANAGER, [CORE_RULES]);
    const clJdUserPrompt = `Analyze this job description deeply.

${sanitizePromptInput(payload.jobDescription, 'job_description')}

Think like a hiring manager, not a keyword matcher.`;

    const CL_JD_ANALYSIS_SCHEMA = {
      type: 'object' as const,
      properties: {
        coreNeed: {
          type: 'string',
          description: 'The PRIMARY business problem they are trying to solve (1 sentence)',
        },
        companyMission: {
          type: 'string',
          description: 'What is the company mission or what do they do (1 sentence)',
        },
        teamContext: {
          type: 'string',
          description: 'What can you infer about the team size, stage, culture',
        },
        impactExpected: {
          type: 'string',
          description: 'What kind of impact will this person need to deliver',
        },
      },
      required: ['coreNeed', 'companyMission', 'teamContext', 'impactExpected'],
    };

    let jdAnalysis = {
      coreNeed: '',
      companyMission: '',
      teamContext: '',
      impactExpected: '',
    };

    try {
      const clJdCacheKey = `cl-jd-analysis:${generateChecksum(payload.jobDescription)}`;
      const parsed = await cachedAICall(
        clJdCacheKey,
        () =>
          aiService.chatStructured<typeof jdAnalysis>(
            [
              { role: 'system', content: clJdSystemPrompt },
              { role: 'user', content: clJdUserPrompt },
            ],
            CL_JD_ANALYSIS_SCHEMA,
            'cover_letter_jd_analysis',
            {
              temperature: 0.3,
              maxTokens: 800,
              feature: 'cover_letter_jd_analysis',
            }
          ),
        24 * 60 * 60 * 1000 // 24h TTL
      );
      if (parsed) {
        jdAnalysis = parsed;
      }
    } catch (parseError) {
      console.warn('[CoverLetter] JD analysis parse failed, continuing with basic approach');
    }

    // =========================================================================
    // STEP 2: Cover Letter Generation - Problem-Solution format
    // =========================================================================
    const candidateName = masterProfile.personal?.fullName || '';
    const candidateSummary = masterProfile.careerContext?.summary || '';
    const topSkills =
      masterProfile.skills?.technical
        ?.map((s) => s.name)
        .slice(0, 10)
        .join(', ') || '';
    const recentExperience = masterProfile.experience?.[0]
      ? `${masterProfile.experience[0].title} at ${masterProfile.experience[0].company}`
      : '';

    const clLearningCtx = await buildLearningContext().catch(() => '');
    const clSystemPrompt = buildSystemPrompt(
      PERSONAS.CAREER_ADVISOR,
      [CORE_RULES, COVER_LETTER_RULES],
      clLearningCtx || undefined
    );
    const clUserPrompt = `COMPANY: ${sanitizePromptInput(payload.companyName, 'company_name')}
ROLE: ${sanitizePromptInput(payload.jobTitle, 'job_title')}
TONE: ${tone}

EMPLOYER'S CORE NEED: ${jdAnalysis.coreNeed || 'Based on the job description'}
COMPANY CONTEXT: ${jdAnalysis.companyMission || jdAnalysis.teamContext || 'Not specified'}
IMPACT EXPECTED: ${jdAnalysis.impactExpected || 'Measurable business results'}

CANDIDATE'S BACKGROUND:
${sanitizePromptInput(candidateSummary || 'Experienced professional', 'candidate_summary')}
Key skills: ${sanitizePromptInput(topSkills || 'Not specified', 'top_skills')}
Recent experience: ${sanitizePromptInput(recentExperience || 'Not specified', 'recent_experience')}

Write a cover letter using the Problem-Solution format:
1. HOOK (1-2 sentences): Reference something specific about the company/role that excites you
2. VALUE (2-3 sentences): Map your most relevant achievement to their core need. Use specific numbers.
3. FIT (1-2 sentences): Connect to their culture/mission/team context
4. CLOSE (1 sentence): Confident call to action

Rules:
- 150-300 words total
- ${tone} tone
- Weave in 3-5 relevant skills naturally
- Reference specific company details (never generic)
- Start with "Dear Hiring Manager,"${candidateName ? ` and sign off with "${candidateName}"` : ''}
- NEVER fabricate achievements
- Make it feel human-written, not AI-generated
- Avoid clichés: "I am writing to express my interest", "I believe I would be a great fit"

Return ONLY the cover letter text, no explanation.`;

    const coverLetterResponse = await aiService.chat(
      [
        { role: 'system', content: clSystemPrompt },
        { role: 'user', content: clUserPrompt },
      ],
      { temperature: 0.65, maxTokens: 1000, feature: 'cover_letter' }
    );

    if (!coverLetterResponse?.content) {
      return { success: false, error: 'Cover letter generation failed: empty response from AI' };
    }

    const generatedText = coverLetterResponse.content.trim();
    const wordCount = generatedText.split(/\s+/).length;

    // Workstream 3 post-generation linter. Catches em-dashes, banned AI
    // vocabulary, "not just X but Y" structural tells, and uniform sentence
    // lengths in the generated cover letter. The summary field is a one-line
    // hint the UI can render below the cover letter so the user knows what
    // to fix.
    const aiTells = detectAITells(generatedText);

    console.log('[CoverLetter] Generated successfully:', {
      wordCount,
      tone,
      companyName: payload.companyName,
      jobTitle: payload.jobTitle,
      hadJdAnalysis: !!jdAnalysis.coreNeed,
      aiTellsClean: !aiTells.hasIssues,
    });

    return {
      success: true,
      data: {
        coverLetter: generatedText,
        wordCount,
        tone,
        aiTells,
      },
    };
  } catch (error) {
    console.error('[CoverLetter] Error:', error);
    return { success: false, error: `Cover letter generation failed: ${(error as Error).message}` };
  }
}
