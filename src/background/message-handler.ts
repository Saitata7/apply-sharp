import type { Message, MessageResponse } from '@shared/utils/messaging';
import {
  profileRepo,
  jobRepo,
  settingsRepo,
  masterProfileRepo,
  applicationRepo,
  resumeVersionRepo,
} from '@storage/index';
import type { Job, ExtractedJob } from '@shared/types/job.types';
// Static imports required for service worker (dynamic import() is not allowed)
import { AIService } from '@/ai';
import { CareerContextEngine } from '@core/profile/context-engine';
import { getKeywordsToAdd } from '@core/ats/matcher';
import {
  calculateQuickATSScore,
  getQuickRecommendations,
  stripBoilerplate,
} from '@core/ats/hybrid-scorer';
import { validateATSFormat, extractResumeContent } from '@core/ats/format-validator';
import { validateAllBullets } from '@core/resume/bullet-validator';
import type { SeniorityLevel } from '@core/resume/bullet-validator';
import { calculateLayeredATSScore } from '@core/ats/layered-scorer';
import { analyzeSkillGaps } from '@core/ats/gap-analyzer';
import { scanRedFlags } from '@core/resume/red-flag-scanner';
import { generateInterviewPrep } from '@core/interview/question-generator';
import { generateEmailTemplate } from '@core/communication/email-templates';
import type { EmailGenerationPayload } from '@core/communication/email-templates';
import { exportAllData, importData, exportApplicationsCSV } from '@storage/export-import';
import type { ExportData } from '@storage/export-import';
import { learningService } from '@core/learning';
import { sanitizePromptInput, PROMPT_SAFETY_PREAMBLE } from '@shared/utils/prompt-safety';
import { extractJSONFromResponse } from '@shared/utils/json-utils';
import { DEPRECATED_GROQ_MODELS } from '@shared/constants/models';

export async function handleMessage(
  message: Message,
  _sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  switch (message.type) {
    case 'GET_PROFILES':
      return handleGetProfiles();

    case 'GET_CURRENT_PROFILE':
    case 'GET_ACTIVE_PROFILE':
      return handleGetCurrentProfile();

    case 'SET_CURRENT_PROFILE':
      return handleSetCurrentProfile(message.payload as string);

    case 'CREATE_PROFILE':
      return handleCreateProfile(message.payload as Parameters<typeof profileRepo.create>[0]);

    case 'UPDATE_PROFILE':
      return handleUpdateProfile(
        message.payload as { id: string; updates: Parameters<typeof profileRepo.update>[1] }
      );

    case 'DELETE_PROFILE':
      return handleDeleteProfile(message.payload as string);

    case 'SAVE_JOB':
      return handleSaveJob(message.payload as ExtractedJob & { url: string; platform: string });

    case 'GET_JOB':
      return handleGetJob(message.payload as string);

    case 'GET_RECENT_JOBS':
      return handleGetRecentJobs(message.payload as number | undefined);

    case 'GET_SETTINGS':
      return handleGetSettings();

    case 'UPDATE_SETTINGS':
      return handleUpdateSettings(message.payload);

    case 'OPEN_OPTIONS':
      return handleOpenOptions((message.payload as { tab?: string } | undefined)?.tab);

    case 'JOB_DETECTED':
      // Log job detection, could trigger auto-save or notifications
      console.log(
        '[ApplySharp] Job detected:',
        (message.payload as { title?: string } | undefined)?.title
      );
      return { success: true };

    case 'ANALYZE_JOB':
      return handleAnalyzeJob(
        message.payload as { job: ExtractedJob; platform?: string; useAI?: boolean }
      );

    case 'SCORE_JOB':
      return handleScoreJob(
        message.payload as {
          jobDescription: string;
          roleProfile: {
            id: string;
            targetRole?: string;
            highlightedSkills?: string[];
            atsKeywords?: string[];
          };
        }
      );

    case 'START_AUTOFILL':
      return handleStartAutofill(_sender.tab?.id);

    case 'OPTIMIZE_RESUME':
      return handleOptimizeResume(message.payload as { job: ExtractedJob });

    case 'GENERATE_COVER_LETTER':
      return handleGenerateCoverLetter(
        message.payload as {
          jobDescription: string;
          companyName: string;
          jobTitle: string;
          tone?: 'professional' | 'conversational' | 'formal';
        }
      );

    // Master Profile handlers
    case 'ANALYZE_RESUME':
      return handleAnalyzeResume(
        message.payload as {
          fileName: string;
          rawText: string;
          basicInfo: {
            email?: string;
            phone?: string;
            linkedIn?: string;
            github?: string;
            name?: string;
            skills: string[];
          };
          confidence: number;
        }
      );

    case 'GET_MASTER_PROFILES':
      return handleGetMasterProfiles();

    case 'GET_ACTIVE_MASTER_PROFILE':
      return handleGetActiveMasterProfile();

    case 'SET_ACTIVE_MASTER_PROFILE':
      return handleSetActiveMasterProfile(message.payload as string);

    case 'DELETE_MASTER_PROFILE':
      return handleDeleteMasterProfile(message.payload as string);

    case 'UPDATE_MASTER_PROFILE':
      return handleUpdateMasterProfile(
        message.payload as {
          id: string;
          updates: Partial<import('@shared/types/master-profile.types').MasterProfile>;
        }
      );

    case 'PROCESS_PROFILE_UPDATE':
      return handleProcessProfileUpdate(
        message.payload as { profileId: string; context: string; updateType?: string }
      );

    case 'APPLY_PROFILE_UPDATE':
      return handleApplyProfileUpdate(message.payload as { profileId: string; context: string });

    case 'GENERATE_ROLE_PROFILE':
      return handleGenerateRoleProfile(
        message.payload as { masterProfileId: string; targetRole: string }
      );

    case 'DELETE_ROLE_PROFILE':
      return handleDeleteRoleProfile(
        message.payload as { masterProfileId: string; roleProfileId: string }
      );

    case 'SET_ACTIVE_ROLE_PROFILE':
      return handleSetActiveRoleProfile(
        message.payload as { masterProfileId: string; roleProfileId: string }
      );

    case 'ANALYZE_JD_FOR_RESUME':
      return handleAnalyzeJDForResume(
        message.payload as {
          masterProfileId: string;
          jobDescription: string;
        }
      );

    case 'UPDATE_ANSWER_BANK':
      return handleUpdateAnswerBank(
        message.payload as {
          masterProfileId: string;
          keywords: string[];
          context: string;
        }
      );

    case 'SAVE_ANSWER':
      return handleSaveAnswer(
        message.payload as {
          questionText: string;
          answer: string;
        }
      );

    case 'GET_ANSWER_SUGGESTION':
      return handleGetAnswerSuggestion(
        message.payload as {
          questionText: string;
          companyName?: string;
          jobTitle?: string;
        }
      );

    case 'GENERATE_AI_ANSWER':
      return handleGenerateAIAnswer(
        message.payload as {
          questionText: string;
          companyName?: string;
          jobTitle?: string;
          jobDescription?: string;
        }
      );

    case 'OPTIMIZE_RESUME_FOR_JD':
      return handleOptimizeResumeForJD(
        message.payload as {
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
        }
      );

    // Learning & Self-Improvement handlers
    case 'TRACK_APPLICATION':
      return handleTrackApplication(message.payload as TrackApplicationPayload);

    case 'RECORD_OUTCOME':
      return handleRecordOutcome(
        message.payload as { applicationId: string; status: string; notes?: string }
      );

    case 'GET_LEARNING_INSIGHTS':
      return handleGetLearningInsights();

    case 'GET_APPLICATION_STATS':
      return handleGetApplicationStats();

    case 'GET_IMPROVEMENTS':
      return handleGetImprovements();

    case 'GET_KEYWORD_RECOMMENDATIONS':
      return handleGetKeywordRecommendations(
        message.payload as {
          jobKeywords: string[];
          resumeKeywords: string[];
          platform: string;
        }
      );

    case 'RUN_LEARNING_ANALYSIS':
      return handleRunLearningAnalysis();

    // Application management handlers
    case 'GET_APPLICATIONS':
      return handleGetApplications();

    case 'GET_APPLICATION':
      return handleGetApplication(message.payload as string);

    case 'GET_APPLICATIONS_WITH_JOBS':
      return handleGetApplicationsWithJobs();

    case 'CREATE_APPLICATION':
      return handleCreateApplication(
        message.payload as Parameters<typeof applicationRepo.create>[0]
      );

    case 'UPDATE_APPLICATION_STATUS':
      return handleUpdateApplicationStatus(
        message.payload as {
          id: string;
          status: import('@shared/types/application.types').ApplicationStatus;
          note?: string;
        }
      );

    case 'UPDATE_APPLICATION':
      return handleUpdateApplication(
        message.payload as {
          id: string;
          updates: Partial<import('@shared/types/application.types').Application>;
        }
      );

    case 'DELETE_APPLICATION':
      return handleDeleteApplication(message.payload as string);

    case 'BULK_ARCHIVE_APPLICATIONS':
      return handleBulkArchiveApplications(message.payload as { olderThanDays: number });

    case 'GET_APPLICATION_COUNTS':
      return handleGetApplicationCounts();

    // Resume version handlers
    case 'SAVE_RESUME_VERSION':
      return handleSaveResumeVersion(
        message.payload as Parameters<typeof resumeVersionRepo.create>[0]
      );

    case 'GET_RESUME_VERSIONS':
      return handleGetResumeVersions(message.payload as { profileId?: string } | undefined);

    case 'GET_RESUME_VERSION':
      return handleGetResumeVersion(message.payload as string);

    case 'DELETE_RESUME_VERSION':
      return handleDeleteResumeVersion(message.payload as string);

    case 'SCORE_RESUME_ATS':
      return handleScoreResumeATS(
        message.payload as {
          masterProfileId: string;
          targetPages: number;
          jobDescription?: string;
        }
      );

    case 'SCORE_RESUME_FILE_ATS':
      return handleScoreResumeFileATS(
        message.payload as {
          rawText: string;
          targetPages: number;
          jobDescription?: string;
        }
      );

    case 'GENERATE_INTERVIEW_PREP':
      return handleGenerateInterviewPrep(
        message.payload as {
          jobDescription: string;
          companyName: string;
          jobTitle: string;
        }
      );

    case 'GENERATE_EMAIL_TEMPLATE':
      return handleGenerateEmailTemplate(message.payload as EmailGenerationPayload);

    case 'EXPORT_ALL_DATA':
      return handleExportAllData();

    case 'IMPORT_DATA':
      return handleImportData(message.payload as { data: ExportData });

    case 'EXPORT_APPLICATIONS_CSV':
      return handleExportApplicationsCSV();

    default:
      return { success: false, error: `Unknown message type: ${message.type}` };
  }
}

async function handleGetProfiles(): Promise<MessageResponse> {
  try {
    const profiles = await profileRepo.getAll();
    return { success: true, data: profiles };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleGetCurrentProfile(): Promise<MessageResponse> {
  try {
    // First, try to get the active MasterProfile and convert it
    const masterProfile = await masterProfileRepo.getActive();
    if (masterProfile) {
      // Convert MasterProfile to ResumeProfile format for autofill compatibility
      const resumeProfile = convertMasterToResumeProfile(masterProfile);
      return { success: true, data: resumeProfile };
    }

    // Fall back to old profile system
    const profile = await profileRepo.getDefault();
    return { success: true, data: profile };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Convert MasterProfile to ResumeProfile format for autofill compatibility
 */
function convertMasterToResumeProfile(
  master: import('@shared/types/master-profile.types').MasterProfile
): import('@shared/types/profile.types').ResumeProfile {
  return {
    id: master.id,
    name: master.personal?.fullName || 'Profile',
    isDefault: true,
    createdAt: master.createdAt,
    updatedAt: master.updatedAt,

    personal: {
      fullName: master.personal?.fullName || '',
      email: master.personal?.email || '',
      phone: master.personal?.phone || '',
      location: master.personal?.location?.formatted || '',
      linkedInUrl: master.personal?.linkedInUrl,
      portfolioUrl: master.personal?.portfolioUrl,
      githubUrl: master.personal?.githubUrl,
    },

    summary: master.careerContext?.summary || '',

    skills: {
      technical: master.skills?.technical?.map((s) => s.name) || [],
      soft: master.skills?.soft?.map((s) => s.name) || [],
      tools: master.skills?.tools?.map((s) => s.name) || [],
      certifications: master.certifications?.map((c) => c.name) || [],
    },

    experience:
      master.experience?.map((exp) => ({
        id: exp.id,
        company: exp.company,
        title: exp.title,
        location: exp.location || '',
        startDate: exp.startDate,
        endDate: exp.endDate,
        isCurrent: exp.isCurrent,
        description: exp.description || '',
        achievements: exp.achievements?.map((a) => a.statement) || [],
        technologies: exp.technologiesUsed?.map((t) => t.skill) || [],
      })) || [],

    education:
      master.education?.map((edu) => ({
        id: edu.id,
        institution: edu.institution,
        degree: edu.degree,
        field: edu.field,
        startDate: edu.startDate || '',
        endDate: edu.endDate || '',
        gpa: edu.gpa,
        honors: edu.honors || [],
      })) || [],

    projects:
      master.projects?.map((proj) => ({
        id: proj.id,
        name: proj.name,
        description: proj.description || '',
        technologies: proj.technologies || [],
        url: proj.url,
        highlights: proj.highlights || [],
      })) || [],

    targetRoles: master.careerContext?.bestFitRoles?.map((r) => r.title) || [],

    autofillData: {
      workAuthorization: master.autofillData?.workAuthorization || 'other',
      visaType: master.autofillData?.visaType,
      requiresSponsorship: master.autofillData?.requiresSponsorship || false,
      availableStartDate: master.autofillData?.availableStartDate,
      noticePeriod: master.autofillData?.noticePeriod,
      willingToRelocate: master.autofillData?.willingToRelocate || false,
      relocationPreferences: master.autofillData?.relocationPreferences,
      remotePreference: master.autofillData?.remotePreference || 'flexible',
      workPreference:
        master.autofillData?.remotePreference === 'flexible'
          ? 'hybrid'
          : master.autofillData?.remotePreference,
      travelWillingness: master.autofillData?.travelWillingness,
      demographics: master.autofillData?.demographics,
      customAnswers: {},
    },

    rawResumeText: master.sourceDocument?.rawText,
  };
}

async function handleSetCurrentProfile(profileId: string): Promise<MessageResponse> {
  try {
    const profile = await profileRepo.setDefault(profileId);
    return { success: true, data: profile };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleCreateProfile(
  profileData: Parameters<typeof profileRepo.create>[0]
): Promise<MessageResponse> {
  try {
    const profile = await profileRepo.create(profileData);
    return { success: true, data: profile };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleUpdateProfile(payload: {
  id: string;
  updates: Parameters<typeof profileRepo.update>[1];
}): Promise<MessageResponse> {
  try {
    const profile = await profileRepo.update(payload.id, payload.updates);
    return { success: true, data: profile };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleDeleteProfile(profileId: string): Promise<MessageResponse> {
  try {
    const deleted = await profileRepo.delete(profileId);
    return { success: true, data: deleted };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleSaveJob(
  jobData: ExtractedJob & { url: string; platform: string }
): Promise<MessageResponse> {
  try {
    const job: Omit<Job, 'id' | 'createdAt' | 'firstSeenAt' | 'lastSeenAt'> = {
      url: jobData.url,
      platform: jobData.platform as Job['platform'],
      title: jobData.title,
      company: jobData.company,
      location: jobData.location || '',
      locationType: 'unknown',
      description: jobData.description,
      descriptionHtml: jobData.descriptionHtml,
      requirements: [],
      responsibilities: [],
      qualifications: { required: [], preferred: [] },
      extractedSkills: { technical: [], soft: [], experience: [] },
      salary: jobData.salary,
      employmentType: jobData.employmentType || 'unknown',
      postedDate: jobData.postedDate,
    };

    const saved = await jobRepo.upsertByUrl(job);
    return { success: true, data: saved };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleGetJob(jobId: string): Promise<MessageResponse> {
  try {
    const job = await jobRepo.getById(jobId);
    return { success: true, data: job };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleGetRecentJobs(limit?: number): Promise<MessageResponse> {
  try {
    const jobs = await jobRepo.getRecent(limit || 10);
    return { success: true, data: jobs };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// Deprecated Groq models imported from @shared/constants/models

/**
 * Get settings with migrations applied
 * Use this instead of settingsRepo.get() directly to ensure migrations run
 */
async function getSettingsWithMigrations() {
  let settings = await settingsRepo.get();

  // Migrate deprecated Groq models
  if (settings?.ai?.groq?.model && DEPRECATED_GROQ_MODELS[settings.ai.groq.model]) {
    const newModel = DEPRECATED_GROQ_MODELS[settings.ai.groq.model];
    console.log(
      `[ApplySharp] Migrating deprecated Groq model: ${settings.ai.groq.model} -> ${newModel}`
    );
    settings = await settingsRepo.update({
      ai: {
        ...settings.ai,
        groq: {
          ...settings.ai.groq,
          model: newModel,
        },
      },
    });
  }

  return settings;
}

async function handleGetSettings(): Promise<MessageResponse> {
  try {
    const settings = await getSettingsWithMigrations();
    return { success: true, data: settings };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleUpdateSettings(updates: unknown): Promise<MessageResponse> {
  try {
    const settings = await settingsRepo.update(
      updates as Parameters<typeof settingsRepo.update>[0]
    );
    return { success: true, data: settings };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleOpenOptions(tab?: string): Promise<MessageResponse> {
  try {
    await chrome.runtime.openOptionsPage();
    // If a specific tab is requested, we'd need to communicate that to the options page
    // For now, just open the options page
    if (tab) {
      // Could use chrome.storage to pass the tab selection
      await chrome.storage.local.set({ optionsTab: tab });
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleStartAutofill(tabId?: number): Promise<MessageResponse> {
  if (!tabId) {
    return { success: false, error: 'No active tab' };
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'START_AUTOFILL',
      payload: { showPreview: true },
    });
    return response;
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleOptimizeResume(payload: { job: ExtractedJob }): Promise<MessageResponse> {
  // This would use AI to suggest resume optimizations
  // For now, return the keywords to add
  try {
    const profile = await profileRepo.getDefault();
    if (!profile?.rawResumeText) {
      return { success: false, error: 'No resume text in profile' };
    }

    const keywords = getKeywordsToAdd(profile.rawResumeText, payload.job.description);

    return {
      success: true,
      data: {
        keywordsToAdd: keywords,
        suggestions: [
          `Add these keywords to improve your ATS score: ${keywords.slice(0, 5).join(', ')}`,
          'Consider adding specific achievements with numbers',
          'Tailor your summary to match the job requirements',
        ],
      },
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// Master Profile Handlers
// ============================================================================

async function handleAnalyzeResume(payload: {
  fileName: string;
  rawText: string;
  basicInfo: {
    email?: string;
    phone?: string;
    linkedIn?: string;
    github?: string;
    name?: string;
    skills: string[];
  };
  confidence: number;
}): Promise<MessageResponse> {
  try {
    // Get settings for AI provider (with migrations applied)
    const settings = await getSettingsWithMigrations();
    if (!settings?.ai?.provider) {
      return {
        success: false,
        error: 'AI provider not configured. Please configure AI settings first.',
      };
    }

    // Initialize AI service (static import)
    const aiService = new AIService(settings.ai);

    // Check if AI is available
    const isAvailable = await aiService.isAvailable();
    if (!isAvailable) {
      return { success: false, error: 'AI provider is not available. Please check your settings.' };
    }

    // Run career context engine with raw text (static import)
    const engine = new CareerContextEngine(aiService);

    // Use the new method that accepts raw text
    const masterProfile = await engine.analyzeResumeText(
      payload.rawText,
      payload.basicInfo,
      payload.fileName
    );

    // Save the master profile
    console.log('[MessageHandler] Saving master profile with ID:', masterProfile.id);
    await masterProfileRepo.save(masterProfile);
    console.log('[MessageHandler] Master profile saved successfully');

    // Verify it was saved
    const savedProfile = await masterProfileRepo.getActive();
    console.log('[MessageHandler] Verification - Active profile:', savedProfile?.id);

    // SYNC: Also create a ResumeProfile for the Profile Manager
    // This ensures both systems stay in sync
    const existingProfiles = await profileRepo.getAll();
    const isFirstProfile = existingProfiles.length === 0;

    // Build location string from MasterProfile location object
    const locationStr =
      masterProfile.personal?.location?.formatted ||
      [masterProfile.personal?.location?.city, masterProfile.personal?.location?.state]
        .filter(Boolean)
        .join(', ') ||
      '';

    const resumeProfile = {
      name: masterProfile.personal?.fullName || payload.fileName.replace(/\.[^/.]+$/, ''),
      isDefault: isFirstProfile,
      personal: {
        fullName: masterProfile.personal?.fullName || '',
        email: masterProfile.personal?.email || payload.basicInfo.email || '',
        phone: masterProfile.personal?.phone || payload.basicInfo.phone || '',
        location: locationStr,
        linkedInUrl: masterProfile.personal?.linkedInUrl || payload.basicInfo.linkedIn || '',
        githubUrl: masterProfile.personal?.githubUrl || payload.basicInfo.github || '',
        portfolioUrl: masterProfile.personal?.portfolioUrl || '',
      },
      summary: masterProfile.careerContext?.summary || '',
      skills: {
        technical:
          masterProfile.skills?.technical?.map((s: { name: string }) => s.name) ||
          payload.basicInfo.skills ||
          [],
        soft: masterProfile.skills?.soft?.map((s: { name: string }) => s.name) || [],
        tools: masterProfile.skills?.tools?.map((s: { name: string }) => s.name) || [],
        certifications: masterProfile.certifications?.map((c: { name: string }) => c.name) || [],
      },
      experience:
        masterProfile.experience?.map((exp) => ({
          id: exp.id || crypto.randomUUID(),
          company: exp.company || '',
          title: exp.title || '',
          location: exp.location || '',
          startDate: exp.startDate || '',
          endDate: exp.endDate,
          isCurrent: exp.isCurrent || false,
          description: exp.description || '',
          achievements: exp.achievements?.map((a) => a.statement) || [],
          technologies: exp.technologiesUsed?.map((t) => t.skill) || [],
        })) || [],
      education:
        masterProfile.education?.map((edu) => ({
          id: edu.id || crypto.randomUUID(),
          institution: edu.institution || '',
          degree: edu.degree || '',
          field: edu.field || '',
          startDate: edu.startDate || '',
          endDate: edu.endDate || '',
          gpa: edu.gpa,
          honors: edu.honors || [],
        })) || [],
      targetRoles: masterProfile.careerContext?.bestFitRoles?.map((r) => r.title) || [],
      autofillData: {
        workAuthorization: 'citizen' as const,
        requiresSponsorship: false,
        willingToRelocate: false,
        remotePreference: 'flexible' as const,
        customAnswers: {},
      },
      rawResumeText: payload.rawText,
    };

    await profileRepo.create(resumeProfile);
    console.log('[ApplySharp] Created synced ResumeProfile from MasterProfile');

    return { success: true, data: masterProfile };
  } catch (error) {
    console.error('Resume analysis error:', error);
    return { success: false, error: (error as Error).message };
  }
}

async function handleAnalyzeJob(payload: {
  job: ExtractedJob;
  platform?: string;
  useAI?: boolean;
}): Promise<MessageResponse> {
  try {
    const { job, useAI = false } = payload; // Default to predefined keywords, AI only when explicitly requested

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
        const settings = await settingsRepo.get();
        if (settings?.ai?.provider) {
          const aiService = new AIService(settings.ai);
          const isAvailable = await aiService.isAvailable();

          if (isAvailable) {
            console.log('[MessageHandler] Extracting keywords with AI...');
            aiKeywords = await extractKeywordsWithAI(aiService, job.description, job.title);
            console.log('[MessageHandler] AI extracted keywords:', {
              highPriority: aiKeywords.highPriority.length,
              lowPriority: aiKeywords.lowPriority.length,
            });
          } else {
            console.log('[MessageHandler] AI service not available, using fallback scoring');
          }
        } else {
          console.log('[MessageHandler] No AI provider configured, using fallback scoring');
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
      // Overall scores
      overallScore,
      keywordScore: quickScore.matchPercentage,

      // Keywords (AI-extracted if available, otherwise from layered scorer)
      matchedKeywords,
      missingKeywords,
      criticalMissing: layeredScore.criticalMissing,

      // NEW: High/Low priority breakdown (only if AI was used)
      highPriority: aiKeywords
        ? {
            matched: highPriorityMatched,
            missing: highPriorityMissing,
          }
        : undefined,
      lowPriority: aiKeywords
        ? {
            matched: lowPriorityMatched,
            missing: lowPriorityMissing,
          }
        : undefined,

      // Recommendations
      suggestions: [
        ...layeredScore.recommendations,
        ...recommendations.filter(
          (r) => !layeredScore.recommendations.some((lr) => lr.includes(r.substring(0, 20)))
        ),
      ].slice(0, 5),

      // Tier and seniority
      tier: getTierFromScore(overallScore),
      seniorityMatch: quickScore.seniorityMatch,
      yearsRequired: quickScore.yearsRequired,

      // Source of keywords
      keywordSource: aiKeywords ? 'ai' : 'library',

      // 4-Layer analysis data
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

      // Background mismatch detection
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
async function handleScoreJob(payload: {
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
      // Check if the skill appears in the JD
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

/**
 * Extract keywords from JD using AI
 */
async function extractKeywordsWithAI(
  aiService: AIService,
  jobDescription: string,
  jobTitle?: string
): Promise<{ highPriority: string[]; lowPriority: string[] }> {
  const prompt = `${PROMPT_SAFETY_PREAMBLE}

Analyze this job description and extract technical keywords/skills.

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
- Maximum 15 high priority, 10 low priority

Return ONLY valid JSON:
{
  "highPriority": ["Java", "Spring Boot", "Microservices", "AWS"],
  "lowPriority": ["Docker", "Kubernetes", "Jenkins"]
}`;

  const response = await aiService.chat([{ role: 'user', content: prompt }], {
    temperature: 0.2,
    maxTokens: 500,
  });

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        highPriority: Array.isArray(result.highPriority) ? result.highPriority : [],
        lowPriority: Array.isArray(result.lowPriority) ? result.lowPriority : [],
      };
    }
  } catch (parseError) {
    console.error('[MessageHandler] Failed to parse AI keywords:', parseError);
  }

  return { highPriority: [], lowPriority: [] };
}

/**
 * Extract profile skills as a Set for matching
 */
function extractProfileSkillsAsSet(
  profile: import('@shared/types/master-profile.types').MasterProfile
): Set<string> {
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

/**
 * Check if a keyword matches any profile skill
 */
function matchesProfileSkill(keyword: string, profileSkills: Set<string>): boolean {
  const kwLower = keyword.toLowerCase();

  // Direct match
  if (profileSkills.has(kwLower)) return true;

  // Partial match (e.g., "Java" matches "Java 8+")
  for (const skill of profileSkills) {
    if (skill.includes(kwLower) || kwLower.includes(skill)) {
      return true;
    }
    // Handle variations (e.g., "Spring Boot" vs "SpringBoot")
    const normalizedKw = kwLower.replace(/[\s\-/]/g, '');
    const normalizedSkill = skill.replace(/[\s\-/]/g, '');
    if (
      normalizedKw === normalizedSkill ||
      normalizedSkill.includes(normalizedKw) ||
      normalizedKw.includes(normalizedSkill)
    ) {
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

async function handleGetMasterProfiles(): Promise<MessageResponse> {
  try {
    const profiles = await masterProfileRepo.getAll();
    return { success: true, data: profiles };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleGetActiveMasterProfile(): Promise<MessageResponse> {
  try {
    console.log('[MessageHandler] Getting active master profile...');
    const profile = await masterProfileRepo.getActive();
    console.log('[MessageHandler] Active profile found:', profile?.personal?.fullName || 'None');
    console.log('[MessageHandler] Profile ID:', profile?.id || 'None');
    return { success: true, data: profile };
  } catch (error) {
    console.error('[MessageHandler] Error getting active profile:', error);
    return { success: false, error: (error as Error).message };
  }
}

async function handleSetActiveMasterProfile(profileId: string): Promise<MessageResponse> {
  try {
    await masterProfileRepo.setActive(profileId);
    const profile = await masterProfileRepo.getById(profileId);
    return { success: true, data: profile };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleDeleteMasterProfile(profileId: string): Promise<MessageResponse> {
  try {
    const deleted = await masterProfileRepo.delete(profileId);
    if (deleted) {
      return { success: true, data: { deleted: true } };
    }
    return { success: false, error: 'Profile not found' };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleUpdateMasterProfile(payload: {
  id: string;
  updates: Partial<import('@shared/types/master-profile.types').MasterProfile>;
}): Promise<MessageResponse> {
  try {
    const existingProfile = await masterProfileRepo.getById(payload.id);
    if (!existingProfile) {
      return { success: false, error: 'Profile not found' };
    }

    // Deep merge the updates with existing profile
    const updatedProfile = {
      ...existingProfile,
      ...payload.updates,
      personal: {
        ...existingProfile.personal,
        ...(payload.updates.personal || {}),
        location: {
          ...existingProfile.personal?.location,
          ...(payload.updates.personal?.location || {}),
        },
      },
      updatedAt: new Date(),
    };

    // Handle certifications array
    if (payload.updates.certifications !== undefined) {
      updatedProfile.certifications = payload.updates.certifications;
    }

    // Handle projects array
    if (payload.updates.projects !== undefined) {
      updatedProfile.projects = payload.updates.projects;
    }

    const saved = await masterProfileRepo.save(updatedProfile);
    return { success: true, data: saved };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// AI-powered profile update - analyze input and either ask questions, show error, or preview
async function handleProcessProfileUpdate(payload: {
  profileId: string;
  context: string;
  updateType?: string;
}): Promise<MessageResponse> {
  try {
    const profile = await masterProfileRepo.getById(payload.profileId);
    if (!profile) {
      return { success: false, error: 'Profile not found' };
    }

    const settings = await getSettingsWithMigrations();
    if (!settings?.ai?.provider) {
      return {
        success: false,
        error: 'AI provider not configured. Please configure AI settings first.',
      };
    }

    const aiService = new AIService(settings.ai);

    // Define required fields and validation rules per update type
    const updateTypeRequirements: Record<string, { required: string[]; hint: string }> = {
      company: {
        required: ['company name', 'job title', 'start date', 'what you do'],
        hint: 'Please include: Company Name, Job Title, Start Date, and what you do (domain/tech/responsibilities)',
      },
      timeline: {
        required: ['company name', 'what to fix'],
        hint: 'Please specify: Company Name and what to fix (e.g., "TeamCal AI ended Dec 2024" or "Remove duplicate Kroger entry")',
      },
      achievement: {
        required: ['which company/role', 'achievement description', 'impact'],
        hint: 'Please mention which company, what you achieved, and the impact (e.g., "At Kroger: Reduced API latency by 60%")',
      },
      skills: {
        required: ['skill or technology names'],
        hint: 'Please list the skills you want to add (e.g., "Rust, WebAssembly, gRPC")',
      },
      certification: {
        required: ['certification name', 'issuing organization'],
        hint: 'Please include: Certification Name and Issuing Organization (e.g., "AWS Solutions Architect Professional from Amazon")',
      },
      links: {
        required: ['type of link', 'URL'],
        hint: 'Please specify the link type and URL (e.g., "LinkedIn: linkedin.com/in/myname")',
      },
      project: {
        required: ['project name', 'description', 'technologies'],
        hint: 'Please include: Project Name, Description, and Technologies used',
      },
    };

    const updateType = payload.updateType || 'unknown';
    const requirements = updateTypeRequirements[updateType];

    // Get existing companies for context
    const existingCompanies =
      profile.experience?.map((e) => ({
        company: e.company,
        title: e.title || '(no title)',
        startDate: e.startDate || '(no date)',
        isCurrent: e.isCurrent,
        hasAchievements: (e.achievements?.length || 0) > 0,
      })) || [];

    const prompt = `You are a profile update assistant. Analyze the user's request for a "${updateType}" update.

EXISTING WORK EXPERIENCE (IMPORTANT - check if user is updating an existing entry):
${
  existingCompanies.length > 0
    ? existingCompanies
        .map(
          (c) =>
            `- ${c.company}: ${c.title}, ${c.startDate}${c.isCurrent ? ' (Current)' : ''}, ${c.hasAchievements ? 'has achievements' : 'NO achievements yet'}`
        )
        .join('\n')
    : '- No work experience entries yet'
}

Current Profile:
- Name: ${profile.personal?.fullName || 'Unknown'}
- Years of Experience: ${profile.careerContext?.yearsOfExperience || 0}
- Skills: ${
      profile.skills?.technical
        ?.slice(0, 10)
        .map((s) => s.name)
        .join(', ') || 'None'
    }

User's Input:
"${payload.context}"

${requirements ? `REQUIRED INFORMATION: ${requirements.required.join(', ')}` : ''}

IMPORTANT RULES:
1. If user mentions a company that ALREADY EXISTS in their profile, this is an UPDATE to that entry, not a new entry.
2. For "company" updates: If user provides role details (tech stack, domain, responsibilities), you should GENERATE 2-3 achievement bullet points based on that context.
3. Be helpful - if user says "Java, retail sector", generate relevant achievements like "Developed Java-based inventory management APIs" or "Built backend services for retail operations".

Respond with ONLY valid JSON:

If ANY required information is MISSING:
{
  "status": "error",
  "error": "Not enough information. ${requirements?.hint || 'Please provide all required details.'}"
}

If ALL required information is present:
{
  "status": "ready",
  "preview": "[Explain what will be updated. If updating existing company, say 'I'll UPDATE your [Company] entry with...'. If generating achievements, list them.]",
  "isUpdate": true/false,
  "existingCompany": "company name if updating existing"
}

Return ONLY valid JSON.`;

    const response = await aiService.chat([{ role: 'user', content: prompt }], {
      temperature: 0.3,
      maxTokens: 600,
    });

    // Parse the AI response
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return { success: true, data: result };
      }
    } catch (error) {
      // If JSON parsing fails, treat the raw AI response as a preview
      console.debug(
        '[MessageHandler] AI response JSON parse failed, using as preview:',
        (error as Error).message
      );
      return {
        success: true,
        data: {
          status: 'ready',
          preview: response.content.trim(),
        },
      };
    }

    return {
      success: true,
      data: {
        status: 'error',
        error: 'Could not process your request. Please try again with more details.',
      },
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// AI-powered profile update - actually apply the changes
async function handleApplyProfileUpdate(payload: {
  profileId: string;
  context: string;
}): Promise<MessageResponse> {
  try {
    const profile = await masterProfileRepo.getById(payload.profileId);
    if (!profile) {
      return { success: false, error: 'Profile not found' };
    }

    const settings = await getSettingsWithMigrations();
    if (!settings?.ai?.provider) {
      return { success: false, error: 'AI provider not configured' };
    }

    const aiService = new AIService(settings.ai);

    // Get existing companies for context
    const existingCompanies =
      profile.experience?.map((e, idx) => ({
        index: idx,
        company: e.company,
        title: e.title || '',
        startDate: e.startDate || '',
        isCurrent: e.isCurrent,
        achievementCount: e.achievements?.length || 0,
      })) || [];

    const prompt = `You are a profile update assistant. Parse the user's update request and return a JSON object with the changes to apply.

EXISTING WORK EXPERIENCE (check if user is updating one of these):
${
  existingCompanies.length > 0
    ? existingCompanies
        .map(
          (c) =>
            `[${c.index}] ${c.company}: ${c.title || '(no title)'}, ${c.startDate || '(no date)'}${c.isCurrent ? ' (Current)' : ''}, ${c.achievementCount} achievements`
        )
        .join('\n')
    : 'None'
}

Current Profile Summary:
- Skills: ${
      profile.skills?.technical
        ?.slice(0, 10)
        .map((s) => s.name)
        .join(', ') || 'None'
    }
- Certifications: ${profile.certifications?.map((c) => c.name).join(', ') || 'None'}
- Projects: ${profile.projects?.map((p) => p.name).join(', ') || 'None'}

User's Update Request:
"${payload.context}"

IMPORTANT RULES:
1. If user mentions a company that ALREADY EXISTS above, use "updateExistingExperience" to UPDATE that entry (match by company name, case-insensitive).
2. Only use "newExperience" if it's a truly NEW company not in the list above.
3. GENERATE 2-4 professional achievement bullet points based on context (tech stack, domain, responsibilities mentioned).
   - Make them specific and impactful
   - Include metrics/scale where reasonable (e.g., "for 500+ stores", "reduced by 40%")
   - Use strong action verbs (Built, Developed, Led, Optimized, Implemented)
4. Extract skills from the context and add to "newSkills".

Return ONLY valid JSON. Include ONLY the categories that need updating:

{
  "updateExistingExperience": {
    "companyName": "exact company name to match",
    "updates": {
      "title": "new or updated title",
      "startDate": "YYYY-MM or Month YYYY",
      "isCurrent": true/false,
      "description": "brief role description",
      "achievements": ["Generated achievement 1", "Generated achievement 2", "Generated achievement 3"]
    }
  },
  "setEndDate": {
    "companyName": "company to update",
    "endDate": "YYYY-MM or Month YYYY",
    "isCurrent": false
  },
  "removeDuplicate": {
    "companyName": "company with duplicates",
    "keepIndex": 0
  },
  "newExperience": {
    "company": "string (only if NEW company)",
    "title": "string",
    "location": "string or null",
    "startDate": "YYYY-MM or Month YYYY",
    "isCurrent": true/false,
    "description": "string or null",
    "achievements": ["Generated achievement 1", "Generated achievement 2"]
  },
  "addAchievementsToCompany": {
    "companyName": "which company",
    "achievements": ["new achievement 1", "new achievement 2"]
  },
  "newSkills": ["skill1", "skill2"],
  "newCertification": {
    "name": "string",
    "issuer": "string",
    "dateObtained": "string or null"
  },
  "newProject": {
    "name": "string",
    "description": "string",
    "technologies": ["tech1", "tech2"],
    "url": "string or null"
  },
  "personalUpdates": {
    "linkedInUrl": "string or null",
    "githubUrl": "string or null",
    "portfolioUrl": "string or null",
    "phone": "string or null",
    "location": "city, state or null"
  }
}

For timeline fixes:
- Use "setEndDate" to add an end date and mark job as not current
- Use "removeDuplicate" to remove a duplicate company entry (keepIndex 0 = keep first, 1 = keep second)

Only include fields that apply. Omit categories with no changes.
Return ONLY valid JSON, no explanations.`;

    const response = await aiService.chat([{ role: 'user', content: prompt }], {
      temperature: 0.1,
      maxTokens: 2000,
    });

    // Parse the AI response
    let updates;
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        updates = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (error) {
      console.debug('[MessageHandler] AI profile update parse failed:', (error as Error).message);
      return { success: false, error: 'Failed to parse AI response. Please try again.' };
    }

    // Apply the updates
    const updatedProfile = { ...profile, updatedAt: new Date() };

    // Update existing experience (same company, update details)
    if (updates.updateExistingExperience) {
      const companyToUpdate = updates.updateExistingExperience.companyName?.toLowerCase();
      const existingIndex = profile.experience?.findIndex(
        (e) => e.company?.toLowerCase() === companyToUpdate
      );

      if (existingIndex !== undefined && existingIndex >= 0 && updatedProfile.experience) {
        const existing = updatedProfile.experience[existingIndex];
        const updateData = updates.updateExistingExperience.updates;

        // Merge achievements (existing + new)
        const newAchievements = (updateData.achievements || []).map((a: string) => ({
          statement: a,
          isQuantified: /\d/.test(a),
          keywords: [],
        }));

        updatedProfile.experience[existingIndex] = {
          ...existing,
          title: updateData.title || existing.title,
          normalizedTitle: updateData.title || existing.normalizedTitle,
          startDate: updateData.startDate || existing.startDate,
          isCurrent: updateData.isCurrent !== undefined ? updateData.isCurrent : existing.isCurrent,
          description: updateData.description || existing.description,
          achievements: [...(existing.achievements || []), ...newAchievements],
        };

        console.log('[ProfileUpdate] Updated existing company:', companyToUpdate);
      }
    }

    // Add achievements to a specific company
    if (updates.addAchievementsToCompany) {
      const companyToUpdate = updates.addAchievementsToCompany.companyName?.toLowerCase();
      const existingIndex = profile.experience?.findIndex(
        (e) => e.company?.toLowerCase() === companyToUpdate
      );

      if (existingIndex !== undefined && existingIndex >= 0 && updatedProfile.experience) {
        const existing = updatedProfile.experience[existingIndex];
        const newAchievements = (updates.addAchievementsToCompany.achievements || []).map(
          (a: string) => ({
            statement: a,
            isQuantified: /\d/.test(a),
            keywords: [],
          })
        );

        updatedProfile.experience[existingIndex] = {
          ...existing,
          achievements: [...(existing.achievements || []), ...newAchievements],
        };

        console.log('[ProfileUpdate] Added achievements to:', companyToUpdate);
      }
    }

    // Set end date for a company (timeline fix)
    if (updates.setEndDate) {
      const companyToUpdate = updates.setEndDate.companyName?.toLowerCase();
      const existingIndex = updatedProfile.experience?.findIndex(
        (e) => e.company?.toLowerCase() === companyToUpdate
      );

      if (existingIndex !== undefined && existingIndex >= 0 && updatedProfile.experience) {
        updatedProfile.experience[existingIndex] = {
          ...updatedProfile.experience[existingIndex],
          endDate: updates.setEndDate.endDate,
          isCurrent: false,
        };
        console.log(
          '[ProfileUpdate] Set end date for:',
          companyToUpdate,
          'to',
          updates.setEndDate.endDate
        );
      }
    }

    // Remove duplicate company entry (timeline fix)
    if (updates.removeDuplicate) {
      const companyToFix = updates.removeDuplicate.companyName?.toLowerCase();
      const keepIndex = updates.removeDuplicate.keepIndex || 0;

      // Find all entries for this company
      const duplicateIndices: number[] = [];
      updatedProfile.experience?.forEach((exp, idx) => {
        if (exp.company?.toLowerCase() === companyToFix) {
          duplicateIndices.push(idx);
        }
      });

      if (duplicateIndices.length > 1) {
        // Remove all except the one to keep
        const indexToKeep = duplicateIndices[keepIndex] ?? duplicateIndices[0];
        updatedProfile.experience = updatedProfile.experience?.filter((_, idx) => {
          if (idx === indexToKeep) return true; // Keep this one
          return !duplicateIndices.includes(idx); // Remove other duplicates
        });
        console.log(
          '[ProfileUpdate] Removed duplicate entries for:',
          companyToFix,
          'kept index:',
          keepIndex
        );
      }
    }

    // Add new experience (truly new company)
    if (updates.newExperience) {
      const newExp = {
        id: crypto.randomUUID(),
        company: updates.newExperience.company,
        title: updates.newExperience.title,
        normalizedTitle: updates.newExperience.title,
        location: updates.newExperience.location || '',
        employmentType: 'full-time' as const,
        startDate: updates.newExperience.startDate,
        endDate: updates.newExperience.isCurrent ? undefined : updates.newExperience.endDate,
        isCurrent: updates.newExperience.isCurrent || false,
        durationMonths: 0,
        description: updates.newExperience.description || '',
        achievements: (updates.newExperience.achievements || []).map((a: string) => ({
          statement: a,
          isQuantified: /\d/.test(a),
          keywords: [],
        })),
        responsibilities: [],
        technologiesUsed: [],
        skillsGained: [],
        relevanceMap: {},
      };
      // Mark previous current job as not current
      if (newExp.isCurrent && profile.experience?.[0]?.isCurrent) {
        updatedProfile.experience = profile.experience.map((exp, i) =>
          i === 0 ? { ...exp, isCurrent: false, endDate: newExp.startDate } : exp
        );
      }
      updatedProfile.experience = [
        newExp,
        ...(updatedProfile.experience || profile.experience || []),
      ];
    }

    // Add achievements to current job
    if (updates.addAchievementsToCurrentJob && updates.addAchievementsToCurrentJob.length > 0) {
      if (updatedProfile.experience && updatedProfile.experience.length > 0) {
        const currentJob = updatedProfile.experience[0];
        const newAchievements = updates.addAchievementsToCurrentJob.map((a: string) => ({
          statement: a,
          isQuantified: /\d/.test(a),
          keywords: [],
        }));
        updatedProfile.experience[0] = {
          ...currentJob,
          achievements: [...(currentJob.achievements || []), ...newAchievements],
        };
      }
    }

    // Add new skills
    if (updates.newSkills && updates.newSkills.length > 0) {
      const existingSkillNames = new Set(
        (profile.skills?.technical || []).map((s) => s.name.toLowerCase())
      );
      const newTechnicalSkills = updates.newSkills
        .filter((s: string) => !existingSkillNames.has(s.toLowerCase()))
        .map((s: string) => ({
          name: s,
          normalizedName: s,
          category: 'other' as const,
          yearsOfExperience: 1,
          proficiency: 'intermediate' as const,
          lastUsed: 'current',
          evidenceFrom: [],
          aliases: [],
        }));

      updatedProfile.skills = {
        ...profile.skills,
        technical: [...(profile.skills?.technical || []), ...newTechnicalSkills],
      };
    }

    // Add new certification
    if (updates.newCertification) {
      const newCert = {
        name: updates.newCertification.name,
        issuer: updates.newCertification.issuer || '',
        dateObtained: updates.newCertification.dateObtained,
        isValid: true,
        relevanceMap: {},
      };
      updatedProfile.certifications = [...(profile.certifications || []), newCert];
    }

    // Add new project
    if (updates.newProject) {
      const newProj = {
        id: crypto.randomUUID(),
        name: updates.newProject.name,
        description: updates.newProject.description || '',
        role: updates.newProject.role || 'Developer',
        technologies: updates.newProject.technologies || [],
        url: updates.newProject.url,
        highlights: updates.newProject.highlights || [],
        impact: updates.newProject.impact || '',
        dateRange: updates.newProject.dateRange,
        relevanceMap: {},
      };
      updatedProfile.projects = [...(profile.projects || []), newProj];
    }

    // Apply personal updates
    if (updates.personalUpdates) {
      const pu = updates.personalUpdates;
      updatedProfile.personal = {
        ...profile.personal,
        ...(pu.linkedInUrl && { linkedInUrl: pu.linkedInUrl }),
        ...(pu.githubUrl && { githubUrl: pu.githubUrl }),
        ...(pu.portfolioUrl && { portfolioUrl: pu.portfolioUrl }),
        ...(pu.phone && { phone: pu.phone }),
        ...(pu.location && {
          location: {
            ...profile.personal?.location,
            formatted: pu.location,
            city: pu.location.split(',')[0]?.trim() || '',
            state: pu.location.split(',')[1]?.trim() || '',
          },
        }),
      };
    }

    // Recalculate years of experience if experience was updated
    if (updates.newExperience && updatedProfile.experience) {
      const yearsOfExp = calculateYearsFromExperience(updatedProfile.experience);
      updatedProfile.careerContext = {
        ...profile.careerContext,
        yearsOfExperience: yearsOfExp,
        // Update seniority level based on years
        seniorityLevel:
          yearsOfExp > 12
            ? 'principal'
            : yearsOfExp > 8
              ? 'lead'
              : yearsOfExp > 5
                ? 'senior'
                : yearsOfExp > 2
                  ? 'mid'
                  : 'entry',
      };
    }

    const saved = await masterProfileRepo.save(updatedProfile);
    return { success: true, data: saved };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// Calculate years of experience from experience array
function calculateYearsFromExperience(
  experiences: { startDate?: string; endDate?: string; isCurrent?: boolean }[]
): number {
  if (!experiences || experiences.length === 0) return 0;

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

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

  const parseDate = (dateStr: string | undefined): { year: number; month: number } | null => {
    if (!dateStr) return null;
    const lower = dateStr.toLowerCase().trim();
    if (lower === 'present' || lower === 'current' || lower === 'now') {
      return { year: currentYear, month: currentMonth };
    }

    // "2024-01" format
    const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})$/);
    if (isoMatch) {
      return { year: parseInt(isoMatch[1]), month: parseInt(isoMatch[2]) };
    }

    // "January 2024" or "Jan 2024" format
    const monthYearMatch = dateStr.match(/^([A-Za-z]+)\s*(\d{4})$/);
    if (monthYearMatch) {
      const monthKey = monthYearMatch[1].toLowerCase().substring(0, 3);
      const month = monthMap[monthKey] || 1;
      return { year: parseInt(monthYearMatch[2]), month };
    }

    // Just year "2024"
    if (/^\d{4}$/.test(dateStr)) {
      return { year: parseInt(dateStr), month: 1 };
    }

    return null;
  };

  interface DateRange {
    startMonths: number;
    endMonths: number;
  }
  const ranges: DateRange[] = [];

  for (const exp of experiences) {
    const start = parseDate(exp.startDate);
    const end = exp.isCurrent ? { year: currentYear, month: currentMonth } : parseDate(exp.endDate);

    if (start && end) {
      ranges.push({
        startMonths: start.year * 12 + start.month,
        endMonths: end.year * 12 + end.month,
      });
    }
  }

  // Sort and merge overlapping ranges
  ranges.sort((a, b) => a.startMonths - b.startMonths);
  const merged: DateRange[] = [];

  for (const range of ranges) {
    if (merged.length === 0) {
      merged.push(range);
    } else {
      const last = merged[merged.length - 1];
      if (range.startMonths <= last.endMonths + 1) {
        last.endMonths = Math.max(last.endMonths, range.endMonths);
      } else {
        merged.push(range);
      }
    }
  }

  // Calculate total months
  let totalMonths = 0;
  for (const range of merged) {
    totalMonths += range.endMonths - range.startMonths + 1;
  }

  return Math.round(totalMonths / 12);
}

async function handleGenerateRoleProfile(payload: {
  masterProfileId: string;
  targetRole: string;
}): Promise<MessageResponse> {
  try {
    const masterProfile = await masterProfileRepo.getById(payload.masterProfileId);
    if (!masterProfile) {
      return { success: false, error: 'Master profile not found' };
    }

    // Get settings for AI provider (with migrations applied)
    const settings = await getSettingsWithMigrations();
    if (!settings?.ai?.provider) {
      return { success: false, error: 'AI provider not configured' };
    }

    // Initialize AI service (static import)
    const aiService = new AIService(settings.ai);

    // Run career context engine (static import)
    const engine = new CareerContextEngine(aiService);

    const generatedProfile = await engine.generateRoleProfile(masterProfile, payload.targetRole);
    if (!generatedProfile) {
      return { success: false, error: 'Failed to generate profile' };
    }

    // Add to master profile
    await masterProfileRepo.addGeneratedProfile(payload.masterProfileId, generatedProfile);

    return { success: true, data: generatedProfile };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleDeleteRoleProfile(payload: {
  masterProfileId: string;
  roleProfileId: string;
}): Promise<MessageResponse> {
  try {
    const updated = await masterProfileRepo.removeGeneratedProfile(
      payload.masterProfileId,
      payload.roleProfileId
    );
    if (!updated) {
      return { success: false, error: 'Failed to delete role profile' };
    }
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleSetActiveRoleProfile(payload: {
  masterProfileId: string;
  roleProfileId: string;
}): Promise<MessageResponse> {
  try {
    const profile = await masterProfileRepo.getById(payload.masterProfileId);
    if (!profile) {
      return { success: false, error: 'Master profile not found' };
    }

    // Update all generated profiles, setting only the selected one as active
    const updatedProfiles =
      profile.generatedProfiles?.map((gp) => ({
        ...gp,
        isActive: gp.id === payload.roleProfileId,
      })) || [];

    const updated = await masterProfileRepo.update(payload.masterProfileId, {
      generatedProfiles: updatedProfiles,
    });

    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// ANALYZE_JD_FOR_RESUME Handler
// Strategic JD Analysis following chrome-agent.md philosophy:
// - Parse INTENT, not just keywords
// - Identify HIDDEN requirements
// - Provide WEIGHTED scoring (Skills 40%, Experience 30%, Seniority 20%, Culture 10%)
// - Categorize gaps by severity (Critical, Addressable, Minor)
// ============================================================================
async function handleAnalyzeJDForResume(payload: {
  masterProfileId: string;
  jobDescription: string;
}): Promise<MessageResponse> {
  try {
    const masterProfile = await masterProfileRepo.getById(payload.masterProfileId);
    if (!masterProfile) {
      return { success: false, error: 'Master profile not found' };
    }

    // Get settings for AI provider (with migrations applied)
    const settings = await getSettingsWithMigrations();
    if (!settings?.ai?.provider) {
      // Fall back to local analysis if no AI configured
      return { success: false, error: 'AI provider not configured - using local analysis' };
    }

    // Initialize AI service
    const aiService = new AIService(settings.ai);
    const isAvailable = await aiService.isAvailable();
    if (!isAvailable) {
      return { success: false, error: 'AI provider is not available' };
    }

    // Strip HR/EEO boilerplate before any analysis
    const cleanedJD = stripBoilerplate(payload.jobDescription);
    const jdLower = cleanedJD.toLowerCase();

    // =========================================================================
    // STEP 1: Deep JD Analysis - Parse INTENT, not just words
    // Following chrome-agent.md Layer 1: "Parse the Intent, Not Just the Words"
    // =========================================================================
    const analysisPrompt = `${PROMPT_SAFETY_PREAMBLE}

You are a senior hiring manager who has reviewed 10,000 resumes. Analyze this job description DEEPLY.

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

Return ONLY valid JSON.`;

    let jdAnalysis = {
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
      const response = await aiService.chat([{ role: 'user', content: analysisPrompt }], {
        temperature: 0.2,
        maxTokens: 1500,
      });
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        jdAnalysis = { ...jdAnalysis, ...parsed };
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
    const keywordFrequency: Map<string, number> = new Map();

    // Programming Languages
    const languagePatterns = [
      /\bjava\b/gi,
      /\bjavascript\b/gi,
      /\btypescript\b/gi,
      /\bpython\b/gi,
      /\bc#\b/gi,
      /\bc\+\+/gi,
      /\bgolang\b/gi,
      /\bgo\b(?!\s+to)/gi,
      /\brust\b/gi,
      /\bscala\b/gi,
      /\bruby\b/gi,
      /\bphp\b/gi,
      /\bswift\b/gi,
      /\bkotlin\b/gi,
      /\bhtml\b/gi,
      /\bcss\b/gi,
      /\bsql\b/gi,
      /\bbash\b/gi,
    ];

    // Frameworks & Libraries
    const frameworkPatterns = [
      /\breact\b/gi,
      /\bangular\b/gi,
      /\bvue\.?js?\b/gi,
      /\bsvelte\b/gi,
      /\bnode\.?js?\b/gi,
      /\bexpress\.?js?\b/gi,
      /\bnext\.?js?\b/gi,
      /\bspring\b/gi,
      /\bspring\s*boot\b/gi,
      /\b\.net\b/gi,
      /\bdjango\b/gi,
      /\bflask\b/gi,
      /\bfastapi\b/gi,
      /\bgraphql\b/gi,
      /\brest\s*api\b/gi,
    ];

    // Cloud & DevOps
    const cloudPatterns = [
      /\baws\b/gi,
      /\bazure\b/gi,
      /\bgcp\b/gi,
      /\bdocker\b/gi,
      /\bkubernetes\b/gi,
      /\bterraform\b/gi,
      /\bjenkins\b/gi,
      /\bci\/cd\b/gi,
      /\bdevops\b/gi,
      /\bcloud\b/gi,
      /\bmicroservices\b/gi,
      /\bgit\b/gi,
      /\blinux\b/gi,
    ];

    // Databases
    const dbPatterns = [
      /\bmongodb\b/gi,
      /\bpostgresql\b/gi,
      /\bmysql\b/gi,
      /\bredis\b/gi,
      /\bnosql\b/gi,
      /\boracle\b/gi,
      /\bfirebase\b/gi,
      /\belasticsearch\b/gi,
    ];

    // AI/ML Keywords
    const aiPatterns = [
      /\bgen\s*ai\b/gi,
      /\bmachine\s*learning\b/gi,
      /\bml\b/gi,
      /\bdeep\s*learning\b/gi,
      /\bai\b/gi,
      /\bllm\b/gi,
      /\bnlp\b/gi,
      /\btensorflow\b/gi,
      /\bpytorch\b/gi,
    ];

    const allPatterns = [
      ...languagePatterns,
      ...frameworkPatterns,
      ...cloudPatterns,
      ...dbPatterns,
      ...aiPatterns,
    ];

    allPatterns.forEach((pattern) => {
      const matches = jdLower.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          const normalized = match.toLowerCase().trim().replace(/\s+/g, ' ');
          if (normalized && normalized.length > 1) {
            keywordFrequency.set(normalized, (keywordFrequency.get(normalized) || 0) + 1);
          }
        });
      }
    });

    // Add AI-extracted skills to keywords (only short, keyword-like items)
    [...jdAnalysis.requiredSkills, ...jdAnalysis.preferredSkills].forEach((skill) => {
      const normalized = skill.toLowerCase().trim();
      // Skip verbose phrases (>4 words) — these are descriptions, not keywords
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
    // Following chrome-agent.md: Skills 40%, Experience 30%, Seniority 20%, Culture 10%
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
    const hasIndustryMatch = profileIndustries.length > 0; // Simplified - could be enhanced
    const cultureScore = hasIndustryMatch ? 80 : 60;

    // WEIGHTED TOTAL SCORE
    const matchScore = Math.round(
      skillScore * 0.4 + experienceScore * 0.3 + seniorityScore * 0.2 + cultureScore * 0.1
    );

    // =========================================================================
    // STEP 5: Gap Severity Analysis
    // Following chrome-agent.md: Critical, Addressable, Minor
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
      critical: [] as string[], // Missing must-haves with no transferable experience
      addressable: [] as string[], // Skills present but not highlighted, or concepts exist
      minor: [] as string[], // Nice-to-haves, slight years gap
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
// Adds missing keywords to the profile's skills/ATS keywords
// ============================================================================
async function handleUpdateAnswerBank(payload: {
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

async function handleOptimizeResumeForJD(payload: {
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
    // Get settings for AI provider (with migrations applied)
    const settings = await getSettingsWithMigrations();
    if (!settings?.ai?.provider) {
      return { success: false, error: 'AI provider not configured' };
    }

    // Initialize AI service
    const aiService = new AIService(settings.ai);
    const isAvailable = await aiService.isAvailable();
    if (!isAvailable) {
      return { success: false, error: 'AI provider is not available' };
    }

    // =========================================================================
    // STEP 1: Deep JD Analysis - Understand what they REALLY need
    // =========================================================================
    const jdAnalysisPrompt = `${PROMPT_SAFETY_PREAMBLE}

You are a senior hiring manager reviewing this job description. Analyze it deeply.

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

Think like a hiring manager, not a keyword matcher. Return ONLY valid JSON.`;

    let jdAnalysis = {
      coreNeed: '',
      mustHaves: [] as string[],
      niceToHaves: [] as string[],
      hiddenPriorities: [] as string[],
      teamContext: '',
      impactExpected: '',
    };

    try {
      const jdResponse = await aiService.chat([{ role: 'user', content: jdAnalysisPrompt }], {
        temperature: 0.3,
        maxTokens: 800,
      });
      const jsonMatch = jdResponse.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jdAnalysis = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
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

    const summaryPrompt = `${PROMPT_SAFETY_PREAMBLE}

You are a career strategist helping a candidate position themselves for a specific role.

THE EMPLOYER'S REAL NEED:
${jdAnalysis.coreNeed || 'Based on the job description keywords'}

WHAT THEY MUST SEE:
${jdAnalysis.mustHaves.length > 0 ? jdAnalysis.mustHaves.join(', ') : payload.missingKeywords.slice(0, 5).join(', ')}

CANDIDATE'S PROVEN STRENGTHS (mention these prominently - they have deep experience):
${strengthKeywordsText}

HIDDEN PRIORITIES (read between the lines):
${jdAnalysis.hiddenPriorities.length > 0 ? jdAnalysis.hiddenPriorities.join(', ') : 'Reliability, ownership, impact'}

CANDIDATE'S CURRENT SUMMARY:
<current_summary>
${payload.currentSummary}
</current_summary>

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
      [{ role: 'user', content: summaryPrompt }],
      { temperature: 0.6, maxTokens: 500 }
    );
    const optimizedSummary = optimizedSummaryResponse.content.trim();

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
        return `[${exp.expId}] (${durationLabel} tenure → Generate ${exp.expectedCount || 5} bullets)\nExisting bullets:\n${exp.bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}`;
      })
      .join('\n\n');

    const bulletsPrompt = `${PROMPT_SAFETY_PREAMBLE}

You are a resume coach who transforms generic bullets into compelling stories.

WHAT THIS EMPLOYER VALUES:
- Core need: ${jdAnalysis.coreNeed || 'Technical excellence and ownership'}
- Must-haves: ${jdAnalysis.mustHaves.join(', ') || payload.missingKeywords.slice(0, 3).join(', ')}
- Impact expected: ${jdAnalysis.impactExpected || 'Measurable business results'}

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
11. If existing bullets are fewer than required, CREATE new ones based on typical responsibilities for that role
12. Ensure bullets are diverse - cover different aspects: technical work, leadership, collaboration, impact

EXAMPLE TRANSFORMATION (if JavaScript has high count):
Before: "Built responsive web application for e-commerce"
After: "Architected responsive JavaScript e-commerce platform using React and Node.js, implementing real-time inventory updates via WebSocket, reducing cart abandonment by 23%"

Return in this exact JSON format (IMPORTANT: generate the exact bullet count specified for each expId):
[{"expId": "id", "bullets": ["bullet 1", "bullet 2", ... up to the required count]}]`;

    let enhancedBullets: Array<{ expId: string; bullets: string[] }> = payload.keyBulletPoints;

    try {
      const bulletsResponse = await aiService.chat(
        [{ role: 'user', content: bulletsPrompt }],
        { temperature: 0.5, maxTokens: 4000 } // Increased for more bullets per role
      );
      // Parse JSON response
      const jsonMatch = bulletsResponse.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Validate structure before using
        if (
          Array.isArray(parsed) &&
          parsed.every((item) => item.expId && Array.isArray(item.bullets))
        ) {
          enhancedBullets = parsed;
        }
      }
    } catch (parseError) {
      // If parsing fails, keep original bullets
      console.warn('[OptimizeResume] Failed to parse enhanced bullets:', parseError);
    }

    console.log('[OptimizeResume] JD Analysis:', {
      coreNeed: jdAnalysis.coreNeed,
      mustHaves: jdAnalysis.mustHaves,
      hiddenPriorities: jdAnalysis.hiddenPriorities,
    });

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

    // Extract all keywords from the original JD - comprehensive patterns
    const jdLower = payload.jobDescription.toLowerCase();

    // Programming Languages
    const languagePatterns = [
      /\bjava\b/gi,
      /\bjavascript\b/gi,
      /\btypescript\b/gi,
      /\bpython\b/gi,
      /\bc#\b/gi,
      /\bc\+\+/gi,
      /\bgolang\b/gi,
      /\brust\b/gi,
      /\bscala\b/gi,
      /\bruby\b/gi,
      /\bphp\b/gi,
      /\bswift\b/gi,
      /\bkotlin\b/gi,
      /\bhtml\b/gi,
      /\bcss\b/gi,
      /\bsql\b/gi,
      /\bplsql\b/gi,
      /\bt-sql\b/gi,
      /\bbash\b/gi,
    ];

    // Frameworks & Tools
    const frameworkPatterns = [
      /\breact\b/gi,
      /\bangular\b/gi,
      /\bvue\.?js?\b/gi,
      /\bnode\.?js?\b/gi,
      /\bspring\b/gi,
      /\b\.net\b/gi,
      /\basp\.net\b/gi,
      /\bdjango\b/gi,
      /\bflask\b/gi,
      /\bfastapi\b/gi,
      /\bgraphql\b/gi,
      /\brest\s*api\b/gi,
      /\bapi\s*development\b/gi,
      /\bapi\b/gi,
      /\bweb\s*api\b/gi,
    ];

    // Cloud & DevOps
    const cloudPatterns = [
      /\baws\b/gi,
      /\bazure\b/gi,
      /\bgcp\b/gi,
      /\bdocker\b/gi,
      /\bkubernetes\b/gi,
      /\bterraform\b/gi,
      /\bjenkins\b/gi,
      /\bci\/cd\b/gi,
      /\bdevops\b/gi,
      /\bcloud\b/gi,
      /\bmicroservices\b/gi,
      /\bgit\b/gi,
      /\blinux\b/gi,
    ];

    // Databases
    const dbPatterns = [
      /\bmongodb\b/gi,
      /\bpostgresql\b/gi,
      /\bmysql\b/gi,
      /\bredis\b/gi,
      /\bnosql\b/gi,
      /\boracle\b/gi,
      /\bsql\s*server\b/gi,
      /\bfirebase\b/gi,
    ];

    // AI/ML Keywords
    const aiPatterns = [
      /\bgen\s*ai\b/gi,
      /\bgenerative\s*ai\b/gi,
      /\bmachine\s*learning\b/gi,
      /\bml\b/gi,
      /\bdeep\s*learning\b/gi,
      /\bai\b/gi,
      /\bllm\b/gi,
      /\bnlp\b/gi,
      /\btensorflow\b/gi,
      /\bpytorch\b/gi,
      /\bopenai\b/gi,
    ];

    // Soft Skills
    const softSkillPatterns = [
      /\bproblem[\s-]*solving\b/gi,
      /\bcommunication\s*skills?\b/gi,
      /\bcollaborat(ion|ive)\b/gi,
      /\bteamwork\b/gi,
      /\bleadership\b/gi,
      /\banalytical\b/gi,
      /\bagile\b/gi,
      /\bscrum\b/gi,
      /\bsoftware\s*engineering\b/gi,
      /\bdeductive\s*reasoning\b/gi,
      /\bunit\s*test/gi,
    ];

    // Other
    const otherPatterns = [
      /\bfrontend\b/gi,
      /\bbackend\b/gi,
      /\bfull[\s-]*stack\b/gi,
      /\bscripting\b/gi,
      /\bautomation\b/gi,
      /\bweb[\s-]*based\b/gi,
      /\boop\b/gi,
      /\bdesign\s*patterns\b/gi,
      /\brestful\b/gi,
      /\bjson\b/gi,
    ];

    const allPatterns = [
      ...languagePatterns,
      ...frameworkPatterns,
      ...cloudPatterns,
      ...dbPatterns,
      ...aiPatterns,
      ...softSkillPatterns,
      ...otherPatterns,
    ];

    // Count total JD keywords and matched keywords
    const jdKeywords: string[] = [];
    allPatterns.forEach((pattern) => {
      const matches = jdLower.match(pattern);
      if (matches) {
        matches.forEach((m) => {
          const normalized = m.toLowerCase().trim().replace(/\s+/g, ' ');
          if (normalized && normalized.length > 1 && !jdKeywords.includes(normalized)) {
            jdKeywords.push(normalized);
          }
        });
      }
    });

    // Add the explicitly identified missing keywords
    payload.missingKeywords.forEach((kw) => {
      if (!jdKeywords.includes(kw.toLowerCase())) {
        jdKeywords.push(kw.toLowerCase());
      }
    });

    // Count how many JD keywords are now in optimized content
    const matchedInOptimized = jdKeywords.filter((kw) => optimizedContent.includes(kw)).length;

    // Calculate REAL score - no artificial inflation
    const totalJdKeywords = Math.max(jdKeywords.length, 1);
    const realScore = Math.round((matchedInOptimized / totalJdKeywords) * 100);

    // Cap at 95% max (no resume is perfect)
    const newScore = Math.min(realScore, 95);

    console.log('[OptimizeResume] Score calculation:', {
      totalJdKeywords,
      matchedInOptimized,
      addedKeywords: addedKeywords.length,
      originalMissing: payload.missingKeywords.length,
      realScore,
      finalScore: newScore,
    });

    return {
      success: true,
      data: {
        optimizedSummary,
        enhancedBullets,
        addedKeywords,
        newScore,
      },
    };
  } catch (error) {
    console.error('[OptimizeResume] Error:', error);
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// Learning & Self-Improvement Handlers
// ============================================================================

interface TrackApplicationPayload {
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

async function handleTrackApplication(payload: TrackApplicationPayload): Promise<MessageResponse> {
  try {
    const applicationId = await learningService.trackApplication(payload);
    return { success: true, data: { applicationId } };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleRecordOutcome(payload: {
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

async function handleGetLearningInsights(): Promise<MessageResponse> {
  try {
    const insights = await learningService.getInsights();
    return { success: true, data: insights };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleGetApplicationStats(): Promise<MessageResponse> {
  try {
    const stats = await learningService.getStats();
    return { success: true, data: stats };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleGetImprovements(): Promise<MessageResponse> {
  try {
    const improvements = learningService.getImprovements();
    return { success: true, data: improvements };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleGetKeywordRecommendations(payload: {
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

async function handleRunLearningAnalysis(): Promise<MessageResponse> {
  try {
    const improvements = await learningService.runAnalysis();
    return { success: true, data: improvements };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================
// ANSWER BANK HANDLERS
// ============================================================

import {
  findMatchingAnswer,
  addAnswerToBank,
  classifyQuestion,
  generateDefaultAnswerBank,
} from '@core/autofill/answer-bank';

async function handleSaveAnswer(payload: {
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

async function handleGetAnswerSuggestion(payload: {
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

async function handleGenerateAIAnswer(payload: {
  questionText: string;
  companyName?: string;
  jobTitle?: string;
  jobDescription?: string;
}): Promise<MessageResponse> {
  try {
    const { questionText, companyName, jobTitle, jobDescription } = payload;

    // Get AI service
    const settings = await settingsRepo.get();
    if (!settings?.ai) {
      return { success: false, error: 'AI not configured' };
    }

    const aiService = new AIService(settings.ai);

    // Check if AI is available
    const isAvailable = await aiService.isAvailable();
    if (!isAvailable) {
      return { success: false, error: 'AI service not available' };
    }

    // Get active master profile for context
    const masterProfile = await masterProfileRepo.getActive();
    if (!masterProfile) {
      return { success: false, error: 'No active profile found' };
    }

    const profileContext = {
      name: masterProfile.personal?.fullName || 'the candidate',
      title: masterProfile.experience?.[0]?.title || 'Software Professional',
      yearsExperience: masterProfile.careerContext?.yearsOfExperience || 5,
      skills:
        masterProfile.skills?.technical
          ?.map((s) => s.name)
          .slice(0, 10)
          .join(', ') || '',
      summary: masterProfile.careerContext?.summary || '',
      recentCompany: masterProfile.experience?.[0]?.company || '',
    };

    const targetRole = jobTitle || 'this role';
    const targetCompany = companyName || 'the company';

    const prompt = `${PROMPT_SAFETY_PREAMBLE}

You are helping a job applicant answer an application question.
Generate a professional, authentic answer based on their profile.

CANDIDATE PROFILE:
- Name: ${profileContext.name}
- Current/Recent Title: ${profileContext.title}
- Years of Experience: ${profileContext.yearsExperience}
- Key Skills: ${profileContext.skills}
- Recent Company: ${profileContext.recentCompany}
${profileContext.summary ? `- Summary: ${profileContext.summary}` : ''}

TARGET COMPANY: ${targetCompany}
TARGET ROLE: ${targetRole}
${jobDescription ? sanitizePromptInput(jobDescription.substring(0, 500), 'job_description') : ''}

QUESTION TO ANSWER:
<question>
${questionText}
</question>

INSTRUCTIONS:
1. Write a professional, first-person answer (use "I")
2. Be specific and authentic - reference real experience where relevant
3. Keep it concise (2-4 sentences for short questions, 4-6 for longer ones)
4. If it's a "why this company" question, mention something specific about them
5. Avoid generic platitudes - be genuine

Write ONLY the answer, no explanations or formatting:`;

    const response = await aiService.chat([{ role: 'user', content: prompt }], {
      temperature: 0.6,
      maxTokens: 500,
    });

    if (!response?.content) {
      return { success: false, error: 'Failed to generate answer' };
    }

    const generatedAnswer = response.content.trim();

    // Optionally save to answer bank
    let answerBank = masterProfile.answerBank || {
      commonQuestions: [],
      patterns: [],
      customAnswers: {},
    };
    answerBank = addAnswerToBank(questionText, generatedAnswer, answerBank);
    await masterProfileRepo.update(masterProfile.id, { answerBank });

    return {
      success: true,
      data: {
        answer: generatedAnswer,
        source: 'ai',
        saved: true,
      },
    };
  } catch (error) {
    console.error('[MessageHandler] Error generating AI answer:', error);
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// Cover Letter Generation Handler
// ============================================================================

async function handleGenerateCoverLetter(payload: {
  jobDescription: string;
  companyName: string;
  jobTitle: string;
  tone?: 'professional' | 'conversational' | 'formal';
}): Promise<MessageResponse> {
  try {
    const tone = payload.tone || 'professional';

    // Get settings for AI provider (with migrations applied)
    const settings = await getSettingsWithMigrations();
    if (!settings?.ai?.provider) {
      return { success: false, error: 'AI provider not configured' };
    }

    // Initialize AI service
    const aiService = new AIService(settings.ai);
    const isAvailable = await aiService.isAvailable();
    if (!isAvailable) {
      return { success: false, error: 'AI provider is not available' };
    }

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
    const jdAnalysisPrompt = `${PROMPT_SAFETY_PREAMBLE}

You are a senior hiring manager reviewing this job description. Analyze it deeply.

${sanitizePromptInput(payload.jobDescription, 'job_description')}

Analyze and return a JSON object with:
{
  "coreNeed": "What is the PRIMARY business problem they're trying to solve? (1 sentence)",
  "companyMission": "What is the company's mission or what do they do? (1 sentence)",
  "teamContext": "What can you infer about the team size, stage, culture?",
  "impactExpected": "What kind of impact will this person need to deliver?"
}

Think like a hiring manager, not a keyword matcher. Return ONLY valid JSON.`;

    let jdAnalysis = {
      coreNeed: '',
      companyMission: '',
      teamContext: '',
      impactExpected: '',
    };

    try {
      const jdResponse = await aiService.chat([{ role: 'user', content: jdAnalysisPrompt }], {
        temperature: 0.3,
        maxTokens: 600,
      });
      const parsed = extractJSONFromResponse<typeof jdAnalysis>(jdResponse.content);
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

    const coverLetterPrompt = `${PROMPT_SAFETY_PREAMBLE}

You are an expert career coach writing a cover letter.

COMPANY: ${sanitizePromptInput(payload.companyName, 'company_name')}
ROLE: ${sanitizePromptInput(payload.jobTitle, 'job_title')}
TONE: ${tone}

EMPLOYER'S CORE NEED: ${jdAnalysis.coreNeed || 'Based on the job description'}
COMPANY CONTEXT: ${jdAnalysis.companyMission || jdAnalysis.teamContext || 'Not specified'}
IMPACT EXPECTED: ${jdAnalysis.impactExpected || 'Measurable business results'}

CANDIDATE'S BACKGROUND:
${candidateSummary || 'Experienced professional'}
Key skills: ${topSkills || 'Not specified'}
Recent experience: ${recentExperience || 'Not specified'}

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
      [{ role: 'user', content: coverLetterPrompt }],
      { temperature: 0.65, maxTokens: 1000 }
    );

    if (!coverLetterResponse?.content) {
      return { success: false, error: 'Cover letter generation failed: empty response from AI' };
    }

    const generatedText = coverLetterResponse.content.trim();
    const wordCount = generatedText.split(/\s+/).length;

    console.log('[CoverLetter] Generated successfully:', {
      wordCount,
      tone,
      companyName: payload.companyName,
      jobTitle: payload.jobTitle,
      hadJdAnalysis: !!jdAnalysis.coreNeed,
    });

    return {
      success: true,
      data: {
        coverLetter: generatedText,
        wordCount,
        tone,
      },
    };
  } catch (error) {
    console.error('[CoverLetter] Error:', error);
    return { success: false, error: `Cover letter generation failed: ${(error as Error).message}` };
  }
}

// ============================================================================
// APPLICATION MANAGEMENT HANDLERS
// ============================================================================

async function handleGetApplications(): Promise<MessageResponse> {
  try {
    const applications = await applicationRepo.getAll();
    return { success: true, data: applications };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleGetApplication(id: string): Promise<MessageResponse> {
  try {
    const application = await applicationRepo.getById(id);
    if (!application) {
      return { success: false, error: 'Application not found' };
    }
    return { success: true, data: application };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleGetApplicationsWithJobs(): Promise<MessageResponse> {
  try {
    const applications = await applicationRepo.getAll();
    const enriched = await Promise.all(
      applications.map(async (app) => {
        const job = await jobRepo.getById(app.jobId).catch(() => undefined);
        return { ...app, job: job || null };
      })
    );
    return { success: true, data: enriched };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleCreateApplication(
  payload: Parameters<typeof applicationRepo.create>[0]
): Promise<MessageResponse> {
  try {
    const application = await applicationRepo.create(payload);
    return { success: true, data: application };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// Status mapping from applicationRepo statuses to OutcomeTracker statuses
const STATUS_TO_OUTCOME_MAP: Record<string, string> = {
  saved: 'applied',
  in_progress: 'applied',
  submitted: 'applied',
  under_review: 'under_review',
  interview: 'interview',
  offer: 'offer',
  rejected: 'rejected',
  withdrawn: 'withdrawn',
  expired: 'no_response',
};

async function handleUpdateApplicationStatus(payload: {
  id: string;
  status: import('@shared/types/application.types').ApplicationStatus;
  note?: string;
}): Promise<MessageResponse> {
  try {
    const updated = await applicationRepo.updateStatus(payload.id, payload.status, payload.note);
    if (!updated) {
      return { success: false, error: 'Application not found' };
    }

    // Propagate to OutcomeTracker (best-effort, non-blocking)
    try {
      const outcomeStatus = STATUS_TO_OUTCOME_MAP[payload.status] as
        | 'viewed'
        | 'rejected'
        | 'interview'
        | 'offer'
        | 'no_response'
        | undefined;
      if (
        outcomeStatus &&
        ['viewed', 'rejected', 'interview', 'offer', 'no_response'].includes(outcomeStatus)
      ) {
        await learningService.recordOutcome(
          payload.id,
          outcomeStatus as 'viewed' | 'rejected' | 'interview' | 'offer' | 'no_response',
          payload.note
        );
      }
    } catch {
      // Non-blocking: learning system failure shouldn't break status update
    }

    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleUpdateApplication(payload: {
  id: string;
  updates: Partial<import('@shared/types/application.types').Application>;
}): Promise<MessageResponse> {
  try {
    const updated = await applicationRepo.update(payload.id, payload.updates);
    if (!updated) {
      return { success: false, error: 'Application not found' };
    }
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleDeleteApplication(id: string): Promise<MessageResponse> {
  try {
    const deleted = await applicationRepo.delete(id);
    if (!deleted) {
      return { success: false, error: 'Application not found' };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleBulkArchiveApplications(payload: {
  olderThanDays: number;
}): Promise<MessageResponse> {
  try {
    const all = await applicationRepo.getAll();
    const cutoff = Date.now() - payload.olderThanDays * 24 * 60 * 60 * 1000;
    const toArchive = all.filter(
      (app) => new Date(app.createdAt).getTime() < cutoff && app.status !== 'expired'
    );

    let archived = 0;
    for (const app of toArchive) {
      await applicationRepo.updateStatus(
        app.id,
        'expired',
        `Bulk archived (older than ${payload.olderThanDays} days)`
      );
      archived++;
    }

    return { success: true, data: { archived } };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleGetApplicationCounts(): Promise<MessageResponse> {
  try {
    const counts = await applicationRepo.countByStatus();
    return { success: true, data: counts };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// RESUME VERSION HANDLERS
// ============================================================================

async function handleSaveResumeVersion(
  payload: Parameters<typeof resumeVersionRepo.create>[0]
): Promise<MessageResponse> {
  try {
    const version = await resumeVersionRepo.create(payload);
    return { success: true, data: version };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleGetResumeVersions(payload?: { profileId?: string }): Promise<MessageResponse> {
  try {
    let versions;
    if (payload?.profileId) {
      versions = await resumeVersionRepo.getByProfileId(payload.profileId);
    } else {
      versions = await resumeVersionRepo.getAll();
    }
    return { success: true, data: versions };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleGetResumeVersion(id: string): Promise<MessageResponse> {
  try {
    const version = await resumeVersionRepo.getById(id);
    if (!version) {
      return { success: false, error: 'Resume version not found' };
    }
    return { success: true, data: version };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleDeleteResumeVersion(id: string): Promise<MessageResponse> {
  try {
    const deleted = await resumeVersionRepo.delete(id);
    if (!deleted) {
      return { success: false, error: 'Resume version not found' };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ── ATS Score Handler ───────────────────────────────────────────────────

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

async function handleScoreResumeATS(payload: {
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
        // Keyword scoring failed — not critical
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

    // 6. Red flag scan (always available — profile-based, no JD needed)
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

function parseResumeContentFromText(
  rawText: string,
  targetPages: number
): import('@core/ats/format-validator').ResumeContent {
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

async function handleScoreResumeFileATS(payload: {
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

    // 2. Bullet validation — group all bullets under a single "Uploaded Resume" role
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

    // 3. Compute overall (no keyword scoring for file-only — no profile context)
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

// ── Interview Prep ─────────────────────────────────────────────────────

async function handleGenerateInterviewPrep(payload: {
  jobDescription: string;
  companyName: string;
  jobTitle: string;
}): Promise<MessageResponse> {
  try {
    const { jobDescription, companyName, jobTitle } = payload;

    if (!jobDescription?.trim()) {
      return { success: false, error: 'Job description is required' };
    }

    const settings = await settingsRepo.get();
    if (!settings?.ai) {
      return { success: false, error: 'AI not configured. Set up an AI provider in AI Settings.' };
    }

    const aiService = new AIService(settings.ai);
    const isAvailable = await aiService.isAvailable();
    if (!isAvailable) {
      return { success: false, error: 'AI service not available. Check your provider settings.' };
    }

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

// ── Email Templates ──────────────────────────────────────────────────

async function handleGenerateEmailTemplate(
  payload: EmailGenerationPayload
): Promise<MessageResponse> {
  try {
    if (!payload?.emailType) {
      return { success: false, error: 'Email type is required' };
    }

    const settings = await settingsRepo.get();
    if (!settings?.ai) {
      return { success: false, error: 'AI not configured. Set up an AI provider in AI Settings.' };
    }

    const aiService = new AIService(settings.ai);
    const isAvailable = await aiService.isAvailable();
    if (!isAvailable) {
      return { success: false, error: 'AI service not available. Check your provider settings.' };
    }

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

// ── Data Export / Import ───────────────────────────────────────────────

async function handleExportAllData(): Promise<MessageResponse> {
  try {
    const data = await exportAllData();
    return { success: true, data };
  } catch (error) {
    console.error('[ApplySharp] Export failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

async function handleImportData(payload: { data: ExportData }): Promise<MessageResponse> {
  try {
    if (!payload?.data) {
      return { success: false, error: 'No import data provided' };
    }
    const result = await importData(payload.data);
    return { success: result.success, data: result };
  } catch (error) {
    console.error('[ApplySharp] Import failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

async function handleExportApplicationsCSV(): Promise<MessageResponse> {
  try {
    const csv = await exportApplicationsCSV();
    return { success: true, data: csv };
  } catch (error) {
    console.error('[ApplySharp] CSV export failed:', error);
    return { success: false, error: (error as Error).message };
  }
}
