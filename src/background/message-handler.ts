import type { Message, MessageResponse } from '@shared/utils/messaging';
import { settingsRepo, applicationRepo, resumeVersionRepo } from '@storage/index';
import type { ExtractedJob } from '@shared/types/job.types';
import type { GetTabJobContextResponse, TabJobContext } from '@shared/types/sidepanel.types';
import { setTabJobContext, getTabJobContext } from './tab-context-store';
// Static imports required for service worker (dynamic import() is not allowed)
import { AIService, detectBestProvider } from '@/ai';
import type { MasterProfile } from '@shared/types/master-profile.types';
import type { ApplicationStatus, Application } from '@shared/types/application.types';
import type { EmailGenerationPayload } from '@core/communication/email-templates';
import type { ExportData } from '@storage/export-import';
import { DEPRECATED_GROQ_MODELS } from '@shared/constants/models';

// ── Handler module imports ──────────────────────────────────────────────
import {
  handleGetProfiles,
  handleGetCurrentProfile,
  handleSetCurrentProfile,
  handleCreateProfile,
  handleUpdateProfile,
  handleDeleteProfile,
  handleAnalyzeResume,
  handleGetMasterProfiles,
  handleGetActiveMasterProfile,
  handleSetActiveMasterProfile,
  handleDeleteMasterProfile,
  handleUpdateMasterProfile,
  handleProcessProfileUpdate,
  handleApplyProfileUpdate,
  handleGenerateRoleProfile,
  handleDeleteRoleProfile,
  handleSetActiveRoleProfile,
  handleCreateRoleProfile,
  handleGetRoleProfiles,
  handleValidateClaims,
  handleValidateSingleClaim,
  handleGetProfileHealth,
  handleGetProfileNextQuestion,
} from './handlers/profile-handlers';

import {
  handleOptimizeResume,
  handleAnalyzeJDForResume,
  handleUpdateAnswerBank,
  handleOptimizeResumeForJD,
  handleQuickTailor,
  handleGenerateCoverLetter,
} from './handlers/resume-handlers';

import {
  handleAnalyzeJob,
  handleScoreJob,
  handleScoreResumeATS,
  handleScoreResumeFileATS,
} from './handlers/ats-handlers';

import { handleScoreGhostJob } from './handlers/ghost-job-handlers';
import { handleScoreJobCardsBatch } from './handlers/feed-signal-handlers';
import {
  handleGetLeadList,
  handleDismissLead,
  handleClearLeadListCache,
} from './handlers/lead-list-handlers';
import {
  handleGetPortalRecommendations,
  handleFetchHNWhosHiring,
  handleGetYCATSLinks,
} from './handlers/discovery-handlers';

import {
  handleSaveContacts,
  handleGetContacts,
  handleGetContactsForJob,
  handleGetContactById,
  handleUpdateContact,
  handleArchiveContact,
  handleBulkDeleteContacts,
  handleExtractContactsForJob,
  handleExportContactsCSV,
  handleExportContactsVCard,
} from './handlers/contact-handlers';

import {
  handleSaveJob,
  handleSetJobDeadline,
  handleGetJob,
  handleGetRecentJobs,
  handleGetApplications,
  handleGetApplication,
  handleGetApplicationsWithJobs,
  handleCreateApplication,
  handleApplicationSubmitDetected,
  handleUpdateApplicationStatus,
  handleUpdateApplication,
  handleDeleteApplication,
  handleBulkArchiveApplications,
  handleGetApplicationCounts,
  handleSaveResumeVersion,
  handleGetResumeVersions,
  handleGetResumeVersion,
  handleDeleteResumeVersion,
  handleExportAllData,
  handleImportData,
  handleExportApplicationsCSV,
} from './handlers/application-handlers';

import {
  handleStartProfileConversation,
  handleSendConversationMessage,
  handleGetConversationState,
} from './handlers/conversation-handlers';

import {
  handleTrackApplication,
  handleRecordOutcome,
  handleGetLearningInsights,
  handleGetApplicationStats,
  handleGetImprovements,
  handleGetKeywordRecommendations,
  handleRunLearningAnalysis,
  handleSaveAnswer,
  handleGetAnswerSuggestion,
  handleGenerateInterviewPrep,
  handleGenerateEmailTemplate,
  handleAIExtractJob,
} from './handlers/learning-handlers';

import { handleRunAutofill, type RunAutofillPayload } from './handlers/autofill-handlers';
import {
  handleGenerateOutreach,
  handleCreateGmailDraft,
  type GenerateOutreachPayload,
  type CreateGmailDraftPayload,
} from './handlers/outreach-handlers';

import type { TrackApplicationPayload } from './handlers/learning-handlers';

// ============================================================================
// Shared AI Service Helper — eliminates boilerplate across all AI handlers
// ============================================================================

export async function getAIService(): Promise<
  { service: AIService; error: null } | { service: null; error: string }
> {
  const settings = await getSettingsWithMigrations();

  // Workstream 6: cost router fallback. If no provider is configured, or the
  // configured one is unavailable, probe Gemini Nano + Ollama + cloud BYOK
  // in priority order via detectBestProvider. This makes ApplySharp work
  // out of the box on Chrome 138+ with no setup.
  if (settings?.ai?.provider) {
    const service = new AIService(settings.ai);
    if (await service.isAvailable()) {
      return { service, error: null };
    }

    // Configured provider is broken; try the best available alternative.
    const fallback = await detectBestProvider(settings.ai);
    if (fallback && fallback !== settings.ai.provider) {
      const fallbackService = new AIService({ ...settings.ai, provider: fallback });
      if (await fallbackService.isAvailable()) {
        console.log(
          `[ApplySharp] Configured provider "${settings.ai.provider}" unavailable; falling back to "${fallback}"`
        );
        return { service: fallbackService, error: null };
      }
    }

    return {
      service: null,
      error: `AI provider "${settings.ai.provider}" is not available. Check your API key, or enable Gemini Nano in Chrome 138+ for free on-device AI.`,
    };
  }

  // No provider configured at all. Auto-detect.
  const detected = await detectBestProvider(settings?.ai);
  if (detected) {
    const service = new AIService({
      provider: detected,
      generation: { temperature: 0.7, maxTokens: 2048, streamResponses: false },
    });
    return { service, error: null };
  }

  return {
    service: null,
    error:
      'No AI provider available. Configure one in Settings, or use Chrome 138+ for free Gemini Nano.',
  };
}

// ============================================================================
// Settings with Migrations
// ============================================================================

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

// ============================================================================
// Settings & Options Handlers (kept here as they're small + shared)
// ============================================================================

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
    if (tab) {
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

// ============================================================================
// Message Router
// ============================================================================

export async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  // Validate sender origin — only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) {
    console.warn('[ApplySharp] Rejected message from unknown sender:', sender.id);
    return { success: false, error: 'Unauthorized sender' };
  }

  switch (message.type) {
    case 'GET_PROFILES':
      return handleGetProfiles();

    case 'GET_CURRENT_PROFILE':
    case 'GET_ACTIVE_PROFILE':
      return handleGetCurrentProfile();

    case 'SET_CURRENT_PROFILE':
      return handleSetCurrentProfile(message.payload as string);

    case 'CREATE_PROFILE':
      return handleCreateProfile(
        message.payload as Parameters<typeof import('@storage/index').profileRepo.create>[0]
      );

    case 'UPDATE_PROFILE':
      return handleUpdateProfile(
        message.payload as {
          id: string;
          updates: Parameters<typeof import('@storage/index').profileRepo.update>[1];
        }
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

    case 'JOB_DETECTED': {
      const payload = message.payload as
        | (ExtractedJob & { url?: string; platform?: string })
        | undefined;
      console.log('[ApplySharp] Job detected:', payload?.title);
      // Workstream 7: write the per-tab job context store so the side panel
      // can render insights for this tab. Only write if we know the sender
      // tab id; messages from the popup or options page have no tab id and
      // legitimately bypass the store.
      if (sender.tab?.id && payload?.title) {
        const ctx: TabJobContext = {
          jobId: payload.url ? `${payload.platform || 'unknown'}-${payload.url}` : payload.title,
          jobTitle: payload.title,
          companyName: payload.company || '',
          platform: payload.platform || 'unknown',
          url: payload.url || sender.tab.url || '',
          jobDescription: payload.description,
          postedDate:
            payload.postedDate instanceof Date
              ? payload.postedDate.toISOString()
              : (payload.postedDate as unknown as string | undefined),
          salary: payload.salary
            ? typeof payload.salary === 'string'
              ? payload.salary
              : JSON.stringify(payload.salary)
            : undefined,
          capturedAt: Date.now(),
        };
        setTabJobContext(sender.tab.id, ctx);
        // Workstream 10 race-free contact extraction trigger: now that the
        // job context is persisted, ask the same tab to run its lazy
        // contact extractor and send back any contact sightings. The
        // handler is gated on the contacts.passiveExtraction flag and
        // returns a no-op when disabled.
        void handleExtractContactsForJob({ tabId: sender.tab.id, jobId: ctx.jobId }).catch((err) =>
          console.warn('[ApplySharp] contact extraction trigger failed:', err)
        );
      }
      return { success: true };
    }

    case 'SCORE_GHOST_JOB':
      return handleScoreGhostJob(message.payload as Parameters<typeof handleScoreGhostJob>[0]);

    case 'SCORE_JOB_CARDS_BATCH':
      return handleScoreJobCardsBatch(
        message.payload as Parameters<typeof handleScoreJobCardsBatch>[0]
      );

    case 'GET_LEAD_LIST':
      return handleGetLeadList(message.payload as Parameters<typeof handleGetLeadList>[0]);

    case 'DISMISS_LEAD':
      return handleDismissLead(message.payload as Parameters<typeof handleDismissLead>[0]);

    case 'CLEAR_LEAD_LIST_CACHE':
      return handleClearLeadListCache();

    case 'GET_PORTAL_RECOMMENDATIONS':
      return handleGetPortalRecommendations(
        message.payload as Parameters<typeof handleGetPortalRecommendations>[0]
      );

    case 'FETCH_HN_WHOS_HIRING':
      return handleFetchHNWhosHiring(
        message.payload as Parameters<typeof handleFetchHNWhosHiring>[0]
      );

    case 'GET_YC_ATS_LINKS':
      return handleGetYCATSLinks(message.payload as Parameters<typeof handleGetYCATSLinks>[0]);

    case 'SAVE_CONTACTS':
      return handleSaveContacts(message.payload as Parameters<typeof handleSaveContacts>[0]);

    case 'GET_CONTACTS':
      return handleGetContacts(message.payload as Parameters<typeof handleGetContacts>[0]);

    case 'GET_CONTACTS_FOR_JOB':
      return handleGetContactsForJob(
        message.payload as Parameters<typeof handleGetContactsForJob>[0]
      );

    case 'GET_CONTACT_BY_ID':
      return handleGetContactById(message.payload as Parameters<typeof handleGetContactById>[0]);

    case 'UPDATE_CONTACT':
      return handleUpdateContact(message.payload as Parameters<typeof handleUpdateContact>[0]);

    case 'ARCHIVE_CONTACT':
      return handleArchiveContact(message.payload as Parameters<typeof handleArchiveContact>[0]);

    case 'BULK_DELETE_CONTACTS':
      return handleBulkDeleteContacts(
        message.payload as Parameters<typeof handleBulkDeleteContacts>[0]
      );

    case 'EXTRACT_CONTACTS_FOR_JOB':
      return handleExtractContactsForJob(
        message.payload as Parameters<typeof handleExtractContactsForJob>[0]
      );

    case 'EXPORT_CONTACTS_CSV':
      return handleExportContactsCSV();

    case 'EXPORT_CONTACTS_VCARD':
      return handleExportContactsVCard();

    case 'GET_TAB_JOB_CONTEXT': {
      // The side panel calls this on mount to fetch its initial context.
      //
      // CRITICAL: the side panel runs in chrome-extension://.../sidepanel/...
      // which is an extension page, NOT a tab, so sender.tab is undefined
      // for messages from the side panel. We have to resolve the active tab
      // via chrome.tabs.query instead. The popup hits the same case, also
      // via chrome.tabs.query, so this is the canonical resolution path.
      //
      // The previous version (sender.tab?.id ?? null) always returned null
      // for the side panel and made the panel look broken on first mount.
      let tabId: number | null = sender.tab?.id ?? null;
      if (tabId === null) {
        try {
          const [activeTab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true,
          });
          if (activeTab?.id !== undefined) tabId = activeTab.id;
        } catch {
          // chrome.tabs.query may be unavailable in tests; tabId stays null
        }
      }
      const context = tabId !== null ? getTabJobContext(tabId) : null;
      const response: GetTabJobContextResponse = { tabId, context };
      return { success: true, data: response };
    }

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
      return handleStartAutofill(sender.tab?.id);

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
          updates: Partial<MasterProfile>;
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

    // GENERATE_AI_ANSWER was removed in the cutover commit. Use RUN_AUTOFILL
    // instead, which sends the entire form to a single structured-output
    // call rather than firing one AI request per field.

    case 'RUN_AUTOFILL':
      return handleRunAutofill(message.payload as RunAutofillPayload);

    case 'GENERATE_OUTREACH':
      return handleGenerateOutreach(message.payload as GenerateOutreachPayload);

    case 'CREATE_GMAIL_DRAFT':
      return handleCreateGmailDraft(message.payload as CreateGmailDraftPayload);

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

    case 'APPLICATION_SUBMIT_DETECTED':
      return handleApplicationSubmitDetected(
        message.payload as {
          tier: 1 | 2 | 3;
          platform: string;
          signal: string;
          url: string;
          host: string;
        }
      );

    case 'UPDATE_APPLICATION_STATUS':
      return handleUpdateApplicationStatus(
        message.payload as {
          id: string;
          status: ApplicationStatus;
          note?: string;
        }
      );

    case 'UPDATE_APPLICATION':
      return handleUpdateApplication(
        message.payload as {
          id: string;
          updates: Partial<Application>;
        }
      );

    case 'DELETE_APPLICATION':
      return handleDeleteApplication(message.payload as string);

    case 'BULK_ARCHIVE_APPLICATIONS':
      return handleBulkArchiveApplications(message.payload as { olderThanDays: number });

    case 'GET_APPLICATION_COUNTS':
      return handleGetApplicationCounts();

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

    case 'SET_JOB_DEADLINE':
      return handleSetJobDeadline(message.payload as { jobId: string; deadline: string | null });

    case 'QUICK_TAILOR':
      return handleQuickTailor(
        message.payload as {
          masterProfileId: string;
          roleId: string;
          jobDescription: string;
          companyName?: string;
          jobTitle?: string;
          includeCoverLetter?: boolean;
        }
      );

    case 'START_PROFILE_CONVERSATION':
      return handleStartProfileConversation(
        message.payload as {
          masterProfileId?: string;
          resumeText?: string;
        }
      );

    case 'SEND_CONVERSATION_MESSAGE':
      return handleSendConversationMessage(
        message.payload as {
          conversationId: string;
          userMessage: string;
        }
      );

    case 'GET_CONVERSATION_STATE':
      return handleGetConversationState(
        message.payload as { conversationId?: string; masterProfileId?: string }
      );

    case 'CREATE_ROLE_PROFILE':
      return handleCreateRoleProfile(
        message.payload as {
          masterProfileId: string;
          targetRole: string;
          skillEmphasis?: string[];
        }
      );

    case 'GET_ROLE_PROFILES':
      return handleGetRoleProfiles(message.payload as { masterProfileId: string });

    case 'VALIDATE_CLAIMS':
      return handleValidateClaims(message.payload as { masterProfileId: string });

    case 'VALIDATE_SINGLE_CLAIM':
      return handleValidateSingleClaim(message.payload as { bulletText: string });

    case 'GET_PROFILE_HEALTH':
      return handleGetProfileHealth(message.payload as { masterProfileId: string });

    case 'GET_PROFILE_NEXT_QUESTION':
      return handleGetProfileNextQuestion(message.payload as { masterProfileId?: string });

    case 'AI_EXTRACT_JOB':
      return handleAIExtractJob(
        message.payload as {
          pageText: string;
          url: string;
          pageTitle: string;
          ogTitle?: string;
          ogDescription?: string;
          ogCompany?: string;
        }
      );

    default:
      return { success: false, error: `Unknown message type: ${message.type}` };
  }
}
