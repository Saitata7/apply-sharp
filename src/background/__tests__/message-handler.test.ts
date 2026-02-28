import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (available before vi.mock factories run) ────────────

const {
  mockProfileRepo,
  mockMasterProfileRepo,
  mockJobRepo,
  mockSettingsRepo,
  mockApplicationRepo,
  mockResumeVersionRepo,
  mockLearningService,
  mockExportAllData,
  mockImportData,
  mockExportApplicationsCSV,
} = vi.hoisted(() => ({
  mockProfileRepo: {
    getAll: vi.fn(),
    getDefault: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setDefault: vi.fn(),
  },
  mockMasterProfileRepo: {
    getAll: vi.fn(),
    getActive: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setActive: vi.fn(),
    save: vi.fn(),
  },
  mockJobRepo: {
    upsertByUrl: vi.fn(),
    getById: vi.fn(),
    getRecent: vi.fn(),
    update: vi.fn(),
  },
  mockSettingsRepo: {
    get: vi.fn(),
    update: vi.fn(),
  },
  mockApplicationRepo: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    countByStatus: vi.fn(),
  },
  mockResumeVersionRepo: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getByProfileId: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  mockLearningService: {
    trackApplication: vi.fn(),
    recordOutcome: vi.fn(),
    getInsights: vi.fn(),
    getStats: vi.fn(),
    getImprovements: vi.fn(),
    getRecommendations: vi.fn(),
    runAnalysis: vi.fn(),
  },
  mockExportAllData: vi.fn(),
  mockImportData: vi.fn(),
  mockExportApplicationsCSV: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────

vi.mock('@storage/index', () => ({
  profileRepo: mockProfileRepo,
  masterProfileRepo: mockMasterProfileRepo,
  jobRepo: mockJobRepo,
  settingsRepo: mockSettingsRepo,
  applicationRepo: mockApplicationRepo,
  resumeVersionRepo: mockResumeVersionRepo,
}));

vi.mock('@core/learning', () => ({
  learningService: mockLearningService,
}));

vi.mock('@/ai', () => ({
  AIService: vi.fn().mockImplementation(() => ({
    chat: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock('@core/profile/context-engine', () => ({
  CareerContextEngine: vi.fn().mockImplementation(() => ({
    buildContext: vi.fn(),
    analyzeResumeText: vi.fn(),
  })),
}));

vi.mock('@core/ats/matcher', () => ({
  getKeywordsToAdd: vi.fn().mockReturnValue([]),
}));

vi.mock('@core/ats/hybrid-scorer', () => ({
  calculateQuickATSScore: vi.fn().mockReturnValue({
    score: 50,
    matchPercentage: 50,
    seniorityMatch: true,
    yearsRequired: null,
    backgroundMismatch: false,
    backgroundMismatchMessage: null,
    detectedJobBackground: null,
  }),
  getQuickRecommendations: vi.fn().mockReturnValue([]),
  stripBoilerplate: vi.fn((text: string) => text),
}));

vi.mock('@core/ats/layered-scorer', () => ({
  calculateLayeredATSScore: vi.fn().mockReturnValue({
    overallScore: 50,
    backgroundMatch: null,
    roleMatch: null,
    skillAreaScores: [],
    criticalMissing: [],
    recommendations: [],
  }),
}));

vi.mock('@core/ats/format-validator', () => ({
  validateATSFormat: vi.fn().mockReturnValue({ score: 100, issues: [] }),
  extractResumeContent: vi.fn().mockReturnValue(''),
}));

vi.mock('@core/resume/bullet-validator', () => ({
  validateAllBullets: vi.fn().mockReturnValue({ score: 100, issues: [] }),
}));

vi.mock('@core/ats/gap-analyzer', () => ({
  analyzeSkillGaps: vi.fn().mockReturnValue({ gaps: [] }),
}));

vi.mock('@core/resume/red-flag-scanner', () => ({
  scanRedFlags: vi.fn().mockReturnValue({ score: 100, flags: [] }),
}));

vi.mock('@core/interview/question-generator', () => ({
  generateInterviewPrep: vi.fn().mockResolvedValue({ questions: [] }),
}));

vi.mock('@core/communication/email-templates', () => ({
  generateEmailTemplate: vi.fn().mockResolvedValue({ subject: '', body: '' }),
}));

vi.mock('@storage/export-import', () => ({
  exportAllData: mockExportAllData,
  importData: mockImportData,
  exportApplicationsCSV: mockExportApplicationsCSV,
}));

vi.mock('@core/autofill/answer-bank', () => ({
  findMatchingAnswer: vi.fn(),
  addAnswerToBank: vi.fn((_q: string, _a: string, bank: unknown) => bank),
  classifyQuestion: vi.fn().mockReturnValue('general'),
  generateDefaultAnswerBank: vi.fn().mockReturnValue({
    commonQuestions: [],
    patterns: [],
    customAnswers: {},
  }),
}));

vi.mock('@shared/utils/prompt-safety', () => ({
  sanitizePromptInput: (input: string) => input,
  PROMPT_SAFETY_PREAMBLE: '',
}));

vi.mock('@shared/utils/json-utils', () => ({
  extractJSONFromResponse: vi.fn(),
}));

vi.mock('@shared/constants/models', () => ({
  DEPRECATED_GROQ_MODELS: {} as Record<string, string>,
}));

// ── Chrome API globals ────────────────────────────────────────────────

const mockChrome = {
  runtime: {
    openOptionsPage: vi.fn().mockResolvedValue(undefined),
  },
  tabs: {
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
  },
  storage: {
    local: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({}),
    },
  },
  alarms: {
    create: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(true),
  },
  notifications: {
    create: vi.fn().mockResolvedValue('notif-id'),
  },
};
(globalThis as Record<string, unknown>).chrome = mockChrome;

// ── Import after mocks ───────────────────────────────────────────────

import { handleMessage } from '../message-handler';
import type { Message } from '@shared/utils/messaging';
import { AIService } from '@/ai';
import { CareerContextEngine } from '@core/profile/context-engine';

// ── Helpers ──────────────────────────────────────────────────────────

function makeMessage(type: string, payload?: unknown): Message {
  return { type: type as Message['type'], payload };
}

function makeSender(tabId?: number): chrome.runtime.MessageSender {
  return {
    tab: tabId ? ({ id: tabId } as chrome.tabs.Tab) : undefined,
  } as chrome.runtime.MessageSender;
}

// ── Reset mocks ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default settings response for handlers that call getSettingsWithMigrations
  mockSettingsRepo.get.mockResolvedValue({
    ai: { provider: 'ollama', ollama: { baseUrl: 'http://localhost:11434' } },
  });
});

// =====================================================================
// TESTS
// =====================================================================

describe('handleMessage', () => {
  // ── Group 1: Dispatch & Unknown Types ─────────────────────────────

  describe('dispatch', () => {
    it('returns error for unknown message type', async () => {
      const res = await handleMessage(makeMessage('UNKNOWN_TYPE'), makeSender());
      expect(res.success).toBe(false);
      expect(res.error).toBe('Unknown message type: UNKNOWN_TYPE');
    });

    it('handles JOB_DETECTED as no-op', async () => {
      const res = await handleMessage(
        makeMessage('JOB_DETECTED', { title: 'Engineer' }),
        makeSender()
      );
      expect(res.success).toBe(true);
    });
  });

  // ── Group 2: Profile Management ───────────────────────────────────

  describe('profile management', () => {
    it('GET_PROFILES returns all profiles', async () => {
      const profiles = [{ id: 'p1', name: 'Test' }];
      mockProfileRepo.getAll.mockResolvedValue(profiles);

      const res = await handleMessage(makeMessage('GET_PROFILES'), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(profiles);
      expect(mockProfileRepo.getAll).toHaveBeenCalledOnce();
    });

    it('GET_CURRENT_PROFILE returns master profile converted to resume profile', async () => {
      const master = {
        id: 'mp1',
        personal: {
          fullName: 'Jane',
          email: 'j@test.com',
          phone: '555',
          location: { formatted: 'NYC' },
        },
        experience: [],
        education: [],
        skills: { technical: [], tools: [], frameworks: [], soft: [] },
        careerContext: { summary: 'Engineer' },
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
        sourceDocument: {},
      };
      mockMasterProfileRepo.getActive.mockResolvedValue(master);

      const res = await handleMessage(makeMessage('GET_CURRENT_PROFILE'), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect((res.data as Record<string, unknown>).id).toBe('mp1');
    });

    it('GET_ACTIVE_PROFILE aliases to GET_CURRENT_PROFILE', async () => {
      mockMasterProfileRepo.getActive.mockResolvedValue(null);
      mockProfileRepo.getDefault.mockResolvedValue({ id: 'p1', name: 'Old' });

      const res = await handleMessage(makeMessage('GET_ACTIVE_PROFILE'), makeSender());
      expect(res.success).toBe(true);
      expect((res.data as Record<string, unknown>).id).toBe('p1');
    });

    it('SET_CURRENT_PROFILE calls profileRepo.setDefault', async () => {
      const profile = { id: 'p2', name: 'Updated' };
      mockProfileRepo.setDefault.mockResolvedValue(profile);

      const res = await handleMessage(makeMessage('SET_CURRENT_PROFILE', 'p2'), makeSender());
      expect(res.success).toBe(true);
      expect(mockProfileRepo.setDefault).toHaveBeenCalledWith('p2');
    });

    it('CREATE_PROFILE calls profileRepo.create', async () => {
      const newProfile = { name: 'New', personal: {} };
      const created = { id: 'p3', ...newProfile };
      mockProfileRepo.create.mockResolvedValue(created);

      const res = await handleMessage(makeMessage('CREATE_PROFILE', newProfile), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(created);
    });

    it('DELETE_PROFILE calls profileRepo.delete', async () => {
      mockProfileRepo.delete.mockResolvedValue(true);

      const res = await handleMessage(makeMessage('DELETE_PROFILE', 'p1'), makeSender());
      expect(res.success).toBe(true);
      expect(mockProfileRepo.delete).toHaveBeenCalledWith('p1');
    });
  });

  // ── Group 3: Job Management ───────────────────────────────────────

  describe('job management', () => {
    it('SAVE_JOB transforms and saves job', async () => {
      const jobData = {
        url: 'https://example.com/job/1',
        platform: 'linkedin',
        title: 'Engineer',
        company: 'Acme',
        description: 'Build things',
        location: 'NYC',
      };
      const saved = { id: 'j1', ...jobData };
      mockJobRepo.upsertByUrl.mockResolvedValue(saved);

      const res = await handleMessage(makeMessage('SAVE_JOB', jobData), makeSender());
      expect(res.success).toBe(true);
      expect(mockJobRepo.upsertByUrl).toHaveBeenCalledOnce();
      // Verify transformed payload has required fields
      const callArg = mockJobRepo.upsertByUrl.mock.calls[0][0];
      expect(callArg.url).toBe('https://example.com/job/1');
      expect(callArg.title).toBe('Engineer');
    });

    it('GET_JOB returns job by ID', async () => {
      const job = { id: 'j1', title: 'Engineer' };
      mockJobRepo.getById.mockResolvedValue(job);

      const res = await handleMessage(makeMessage('GET_JOB', 'j1'), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(job);
    });

    it('GET_RECENT_JOBS defaults to limit 10', async () => {
      const jobs = [{ id: 'j1' }];
      mockJobRepo.getRecent.mockResolvedValue(jobs);

      const res = await handleMessage(makeMessage('GET_RECENT_JOBS'), makeSender());
      expect(res.success).toBe(true);
      expect(mockJobRepo.getRecent).toHaveBeenCalledWith(10);
    });

    it('GET_RECENT_JOBS uses provided limit', async () => {
      mockJobRepo.getRecent.mockResolvedValue([]);

      await handleMessage(makeMessage('GET_RECENT_JOBS', 5), makeSender());
      expect(mockJobRepo.getRecent).toHaveBeenCalledWith(5);
    });
  });

  // ── Group 4: Settings ─────────────────────────────────────────────

  describe('settings', () => {
    it('GET_SETTINGS returns settings with migration', async () => {
      const settings = { ai: { provider: 'ollama' } };
      mockSettingsRepo.get.mockResolvedValue(settings);

      const res = await handleMessage(makeMessage('GET_SETTINGS'), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(settings);
    });

    it('UPDATE_SETTINGS calls settingsRepo.update', async () => {
      const updates = { ai: { provider: 'openai' } };
      const updated = { ...updates };
      mockSettingsRepo.update.mockResolvedValue(updated);

      const res = await handleMessage(makeMessage('UPDATE_SETTINGS', updates), makeSender());
      expect(res.success).toBe(true);
      expect(mockSettingsRepo.update).toHaveBeenCalledWith(updates);
    });

    it('OPEN_OPTIONS calls chrome.runtime.openOptionsPage', async () => {
      const res = await handleMessage(makeMessage('OPEN_OPTIONS'), makeSender());
      expect(res.success).toBe(true);
      expect(mockChrome.runtime.openOptionsPage).toHaveBeenCalledOnce();
    });

    it('OPEN_OPTIONS with tab stores tab in chrome.storage', async () => {
      await handleMessage(makeMessage('OPEN_OPTIONS', { tab: 'ats' }), makeSender());
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({ optionsTab: 'ats' });
    });
  });

  // ── Group 5: Application Management ───────────────────────────────

  describe('application management', () => {
    it('GET_APPLICATIONS returns all applications', async () => {
      const apps = [{ id: 'a1', jobId: 'j1', status: 'saved' }];
      mockApplicationRepo.getAll.mockResolvedValue(apps);

      const res = await handleMessage(makeMessage('GET_APPLICATIONS'), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(apps);
    });

    it('GET_APPLICATION returns by ID', async () => {
      const app = { id: 'a1', status: 'saved' };
      mockApplicationRepo.getById.mockResolvedValue(app);

      const res = await handleMessage(makeMessage('GET_APPLICATION', 'a1'), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(app);
    });

    it('GET_APPLICATION returns error if not found', async () => {
      mockApplicationRepo.getById.mockResolvedValue(null);

      const res = await handleMessage(makeMessage('GET_APPLICATION', 'missing'), makeSender());
      expect(res.success).toBe(false);
      expect(res.error).toBe('Application not found');
    });

    it('GET_APPLICATIONS_WITH_JOBS enriches with job data', async () => {
      const apps = [{ id: 'a1', jobId: 'j1' }];
      const job = { id: 'j1', title: 'Engineer' };
      mockApplicationRepo.getAll.mockResolvedValue(apps);
      mockJobRepo.getById.mockResolvedValue(job);

      const res = await handleMessage(makeMessage('GET_APPLICATIONS_WITH_JOBS'), makeSender());
      expect(res.success).toBe(true);
      const data = res.data as Array<{ id: string; job: unknown }>;
      expect(data[0].job).toEqual(job);
    });

    it('CREATE_APPLICATION calls applicationRepo.create', async () => {
      const payload = { jobId: 'j1', status: 'saved' as const, resumeVersion: 'v1' };
      const created = { id: 'a1', ...payload };
      mockApplicationRepo.create.mockResolvedValue(created);

      const res = await handleMessage(makeMessage('CREATE_APPLICATION', payload), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(created);
    });

    it('UPDATE_APPLICATION_STATUS updates and propagates to learning', async () => {
      const updated = { id: 'a1', status: 'interview' };
      mockApplicationRepo.updateStatus.mockResolvedValue(updated);

      const res = await handleMessage(
        makeMessage('UPDATE_APPLICATION_STATUS', {
          id: 'a1',
          status: 'interview',
          note: 'Phone screen',
        }),
        makeSender()
      );
      expect(res.success).toBe(true);
      expect(mockApplicationRepo.updateStatus).toHaveBeenCalledWith(
        'a1',
        'interview',
        'Phone screen'
      );
      // Learning propagation is best-effort
      expect(mockLearningService.recordOutcome).toHaveBeenCalledWith(
        'a1',
        'interview',
        'Phone screen'
      );
    });

    it('UPDATE_APPLICATION_STATUS returns error if not found', async () => {
      mockApplicationRepo.updateStatus.mockResolvedValue(null);

      const res = await handleMessage(
        makeMessage('UPDATE_APPLICATION_STATUS', { id: 'missing', status: 'interview' }),
        makeSender()
      );
      expect(res.success).toBe(false);
      expect(res.error).toBe('Application not found');
    });

    it('UPDATE_APPLICATION returns error if not found', async () => {
      mockApplicationRepo.update.mockResolvedValue(null);

      const res = await handleMessage(
        makeMessage('UPDATE_APPLICATION', { id: 'missing', updates: { status: 'saved' } }),
        makeSender()
      );
      expect(res.success).toBe(false);
      expect(res.error).toBe('Application not found');
    });

    it('DELETE_APPLICATION returns error if not found', async () => {
      mockApplicationRepo.delete.mockResolvedValue(false);

      const res = await handleMessage(makeMessage('DELETE_APPLICATION', 'missing'), makeSender());
      expect(res.success).toBe(false);
      expect(res.error).toBe('Application not found');
    });

    it('DELETE_APPLICATION succeeds when found', async () => {
      mockApplicationRepo.delete.mockResolvedValue(true);

      const res = await handleMessage(makeMessage('DELETE_APPLICATION', 'a1'), makeSender());
      expect(res.success).toBe(true);
    });

    it('BULK_ARCHIVE_APPLICATIONS archives old applications', async () => {
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      const apps = [
        { id: 'a1', status: 'saved', createdAt: oldDate },
        { id: 'a2', status: 'expired', createdAt: oldDate }, // already expired, skip
      ];
      mockApplicationRepo.getAll.mockResolvedValue(apps);
      mockApplicationRepo.updateStatus.mockResolvedValue({});

      const res = await handleMessage(
        makeMessage('BULK_ARCHIVE_APPLICATIONS', { olderThanDays: 90 }),
        makeSender()
      );
      expect(res.success).toBe(true);
      expect((res.data as { archived: number }).archived).toBe(1);
      expect(mockApplicationRepo.updateStatus).toHaveBeenCalledWith(
        'a1',
        'expired',
        expect.stringContaining('Bulk archived')
      );
    });

    it('GET_APPLICATION_COUNTS returns counts by status', async () => {
      const counts = { saved: 3, submitted: 2, interview: 1 };
      mockApplicationRepo.countByStatus.mockResolvedValue(counts);

      const res = await handleMessage(makeMessage('GET_APPLICATION_COUNTS'), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(counts);
    });
  });

  // ── Group 6: Resume Versions ──────────────────────────────────────

  describe('resume versions', () => {
    it('SAVE_RESUME_VERSION calls create', async () => {
      const payload = { profileId: 'p1', content: 'resume text', format: 'pdf' };
      const created = { id: 'rv1', ...payload };
      mockResumeVersionRepo.create.mockResolvedValue(created);

      const res = await handleMessage(makeMessage('SAVE_RESUME_VERSION', payload), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(created);
    });

    it('GET_RESUME_VERSIONS returns all when no profileId', async () => {
      const versions = [{ id: 'rv1' }];
      mockResumeVersionRepo.getAll.mockResolvedValue(versions);

      const res = await handleMessage(makeMessage('GET_RESUME_VERSIONS'), makeSender());
      expect(res.success).toBe(true);
      expect(mockResumeVersionRepo.getAll).toHaveBeenCalledOnce();
    });

    it('GET_RESUME_VERSIONS filters by profileId', async () => {
      const versions = [{ id: 'rv1', profileId: 'p1' }];
      mockResumeVersionRepo.getByProfileId.mockResolvedValue(versions);

      const res = await handleMessage(
        makeMessage('GET_RESUME_VERSIONS', { profileId: 'p1' }),
        makeSender()
      );
      expect(res.success).toBe(true);
      expect(mockResumeVersionRepo.getByProfileId).toHaveBeenCalledWith('p1');
    });

    it('GET_RESUME_VERSION returns by ID or error if not found', async () => {
      mockResumeVersionRepo.getById.mockResolvedValue(null);

      const res = await handleMessage(makeMessage('GET_RESUME_VERSION', 'missing'), makeSender());
      expect(res.success).toBe(false);
      expect(res.error).toBe('Resume version not found');
    });

    it('DELETE_RESUME_VERSION returns error if not found', async () => {
      mockResumeVersionRepo.delete.mockResolvedValue(false);

      const res = await handleMessage(
        makeMessage('DELETE_RESUME_VERSION', 'missing'),
        makeSender()
      );
      expect(res.success).toBe(false);
      expect(res.error).toBe('Resume version not found');
    });

    it('DELETE_RESUME_VERSION succeeds when found', async () => {
      mockResumeVersionRepo.delete.mockResolvedValue(true);

      const res = await handleMessage(makeMessage('DELETE_RESUME_VERSION', 'rv1'), makeSender());
      expect(res.success).toBe(true);
    });
  });

  // ── Group 7: Master Profile ───────────────────────────────────────

  describe('master profile', () => {
    it('GET_MASTER_PROFILES returns all master profiles', async () => {
      const profiles = [{ id: 'mp1', personal: { fullName: 'Jane' } }];
      mockMasterProfileRepo.getAll.mockResolvedValue(profiles);

      const res = await handleMessage(makeMessage('GET_MASTER_PROFILES'), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(profiles);
    });

    it('GET_ACTIVE_MASTER_PROFILE returns active profile', async () => {
      const profile = { id: 'mp1', personal: { fullName: 'Jane' } };
      mockMasterProfileRepo.getActive.mockResolvedValue(profile);

      const res = await handleMessage(makeMessage('GET_ACTIVE_MASTER_PROFILE'), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(profile);
    });

    it('SET_ACTIVE_MASTER_PROFILE sets active and returns profile', async () => {
      const profile = { id: 'mp1', personal: { fullName: 'Jane' } };
      mockMasterProfileRepo.setActive.mockResolvedValue(undefined);
      mockMasterProfileRepo.getById.mockResolvedValue(profile);

      const res = await handleMessage(
        makeMessage('SET_ACTIVE_MASTER_PROFILE', 'mp1'),
        makeSender()
      );
      expect(res.success).toBe(true);
      expect(mockMasterProfileRepo.setActive).toHaveBeenCalledWith('mp1');
      expect(res.data).toEqual(profile);
    });

    it('DELETE_MASTER_PROFILE returns error if not found', async () => {
      mockMasterProfileRepo.delete.mockResolvedValue(false);

      const res = await handleMessage(
        makeMessage('DELETE_MASTER_PROFILE', 'missing'),
        makeSender()
      );
      expect(res.success).toBe(false);
      expect(res.error).toBe('Profile not found');
    });

    it('DELETE_MASTER_PROFILE returns success when deleted', async () => {
      mockMasterProfileRepo.delete.mockResolvedValue(true);

      const res = await handleMessage(makeMessage('DELETE_MASTER_PROFILE', 'mp1'), makeSender());
      expect(res.success).toBe(true);
      expect((res.data as { deleted: boolean }).deleted).toBe(true);
    });

    it('UPDATE_MASTER_PROFILE returns error if profile not found', async () => {
      mockMasterProfileRepo.getById.mockResolvedValue(null);

      const res = await handleMessage(
        makeMessage('UPDATE_MASTER_PROFILE', { id: 'missing', updates: { personal: {} } }),
        makeSender()
      );
      expect(res.success).toBe(false);
      expect(res.error).toBe('Profile not found');
    });
  });

  // ── Group 8: Learning System ──────────────────────────────────────

  describe('learning system', () => {
    it('TRACK_APPLICATION calls learningService.trackApplication', async () => {
      mockLearningService.trackApplication.mockResolvedValue('app-123');

      const payload = {
        jobId: 'j1',
        jobTitle: 'Engineer',
        company: 'Acme',
        platform: 'linkedin',
        profileId: 'p1',
        keywordsUsed: ['python', 'react'],
      };
      const res = await handleMessage(makeMessage('TRACK_APPLICATION', payload), makeSender());
      expect(res.success).toBe(true);
      expect((res.data as { applicationId: string }).applicationId).toBe('app-123');
    });

    it('RECORD_OUTCOME validates status and records', async () => {
      mockLearningService.recordOutcome.mockResolvedValue(undefined);

      const res = await handleMessage(
        makeMessage('RECORD_OUTCOME', {
          applicationId: 'app-1',
          status: 'interview',
          notes: 'Phone screen',
        }),
        makeSender()
      );
      expect(res.success).toBe(true);
      expect(mockLearningService.recordOutcome).toHaveBeenCalledWith(
        'app-1',
        'interview',
        'Phone screen'
      );
    });

    it('RECORD_OUTCOME rejects invalid status', async () => {
      const res = await handleMessage(
        makeMessage('RECORD_OUTCOME', { applicationId: 'app-1', status: 'invalid_status' }),
        makeSender()
      );
      expect(res.success).toBe(false);
      expect(res.error).toContain('Invalid status');
    });

    it('GET_LEARNING_INSIGHTS calls learningService.getInsights', async () => {
      const insights = { totalApplications: 10, responseRate: 0.3 };
      mockLearningService.getInsights.mockResolvedValue(insights);

      const res = await handleMessage(makeMessage('GET_LEARNING_INSIGHTS'), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(insights);
    });

    it('GET_APPLICATION_STATS calls learningService.getStats', async () => {
      const stats = { total: 5, pending: 2 };
      mockLearningService.getStats.mockResolvedValue(stats);

      const res = await handleMessage(makeMessage('GET_APPLICATION_STATS'), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(stats);
    });

    it('GET_IMPROVEMENTS calls learningService.getImprovements', async () => {
      const improvements = [{ type: 'keyword', suggestion: 'Add Docker' }];
      mockLearningService.getImprovements.mockReturnValue(improvements);

      const res = await handleMessage(makeMessage('GET_IMPROVEMENTS'), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(improvements);
    });

    it('GET_KEYWORD_RECOMMENDATIONS calls learningService.getRecommendations', async () => {
      const recommendations = [{ keyword: 'docker', priority: 'high' }];
      mockLearningService.getRecommendations.mockResolvedValue(recommendations);

      const res = await handleMessage(
        makeMessage('GET_KEYWORD_RECOMMENDATIONS', {
          jobKeywords: ['docker'],
          resumeKeywords: [],
          platform: 'linkedin',
        }),
        makeSender()
      );
      expect(res.success).toBe(true);
      expect(res.data).toEqual(recommendations);
    });

    it('RUN_LEARNING_ANALYSIS calls learningService.runAnalysis', async () => {
      const analysis = { improvements: [] };
      mockLearningService.runAnalysis.mockResolvedValue(analysis);

      const res = await handleMessage(makeMessage('RUN_LEARNING_ANALYSIS'), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(analysis);
    });
  });

  // ── Group 9: Data Export/Import ───────────────────────────────────

  describe('data export/import', () => {
    it('EXPORT_ALL_DATA calls exportAllData', async () => {
      const data = { profiles: [], jobs: [] };
      mockExportAllData.mockResolvedValue(data);

      const res = await handleMessage(makeMessage('EXPORT_ALL_DATA'), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(data);
    });

    it('IMPORT_DATA calls importData with validation', async () => {
      const importResult = { success: true, imported: 5 };
      mockImportData.mockResolvedValue(importResult);

      const res = await handleMessage(
        makeMessage('IMPORT_DATA', { data: { version: '1', profiles: [] } }),
        makeSender()
      );
      expect(res.success).toBe(true);
    });

    it('IMPORT_DATA returns error when no data provided', async () => {
      const res = await handleMessage(makeMessage('IMPORT_DATA', {}), makeSender());
      expect(res.success).toBe(false);
      expect(res.error).toBe('No import data provided');
    });

    it('EXPORT_APPLICATIONS_CSV calls exportApplicationsCSV', async () => {
      mockExportApplicationsCSV.mockResolvedValue('id,title\n1,Eng');

      const res = await handleMessage(makeMessage('EXPORT_APPLICATIONS_CSV'), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toBe('id,title\n1,Eng');
    });
  });

  // ── Group 10: Error Handling ──────────────────────────────────────

  describe('error handling', () => {
    it('returns error response when repository throws', async () => {
      mockProfileRepo.getAll.mockRejectedValue(new Error('DB connection failed'));

      const res = await handleMessage(makeMessage('GET_PROFILES'), makeSender());
      expect(res.success).toBe(false);
      expect(res.error).toBe('DB connection failed');
    });

    it('returns error response when applicationRepo throws', async () => {
      mockApplicationRepo.getAll.mockRejectedValue(new Error('Storage full'));

      const res = await handleMessage(makeMessage('GET_APPLICATIONS'), makeSender());
      expect(res.success).toBe(false);
      expect(res.error).toBe('Storage full');
    });

    it('returns error response when learning service throws', async () => {
      mockLearningService.getInsights.mockRejectedValue(new Error('Analysis failed'));

      const res = await handleMessage(makeMessage('GET_LEARNING_INSIGHTS'), makeSender());
      expect(res.success).toBe(false);
      expect(res.error).toBe('Analysis failed');
    });

    it('all responses have consistent shape (success + optional data/error)', async () => {
      // Success path
      mockProfileRepo.getAll.mockResolvedValue([]);
      const successRes = await handleMessage(makeMessage('GET_PROFILES'), makeSender());
      expect(successRes).toHaveProperty('success');
      expect(successRes).toHaveProperty('data');

      // Error path
      mockProfileRepo.getAll.mockRejectedValue(new Error('fail'));
      const errorRes = await handleMessage(makeMessage('GET_PROFILES'), makeSender());
      expect(errorRes).toHaveProperty('success');
      expect(errorRes).toHaveProperty('error');
    });
  });

  // ── Group 11: Autofill & Tab Communication ────────────────────────

  describe('autofill', () => {
    it('START_AUTOFILL returns error when no tab ID', async () => {
      const res = await handleMessage(makeMessage('START_AUTOFILL'), makeSender());
      expect(res.success).toBe(false);
      expect(res.error).toBe('No active tab');
    });

    it('START_AUTOFILL sends message to tab when tab ID present', async () => {
      mockChrome.tabs.sendMessage.mockResolvedValue({ success: true });

      const res = await handleMessage(makeMessage('START_AUTOFILL'), makeSender(42));
      expect(res.success).toBe(true);
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
        type: 'START_AUTOFILL',
        payload: { showPreview: true },
      });
    });
  });

  // ── Group 12: E2E Journey — Resume Upload → Profile Creation ──────

  describe('E2E: Resume Upload → Profile Creation', () => {
    const sampleProfile = {
      id: 'mp-new',
      name: 'John Doe',
      isActive: true,
      personal: { name: 'John Doe', email: 'john@test.com' },
      experience: [],
      education: [],
      skills: { technical: [], tools: [], frameworks: [] },
      careerContext: {
        trajectory: 'upward',
        seniority: 'mid',
        yearsOfExperience: 5,
      },
      generatedProfiles: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('analyzes resume text and creates master profile', async () => {
      // Wire the mock chain: AIService → CareerContextEngine → save → return
      const mockEngine = {
        analyzeResumeText: vi.fn().mockResolvedValue(sampleProfile),
        buildContext: vi.fn(),
      };
      (CareerContextEngine as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        () => mockEngine
      );

      mockMasterProfileRepo.save.mockResolvedValue(sampleProfile);
      mockMasterProfileRepo.getActive.mockResolvedValue(sampleProfile);
      mockProfileRepo.getAll.mockResolvedValue([]);
      mockProfileRepo.create.mockResolvedValue({ id: 'p1' });

      const res = await handleMessage(
        makeMessage('ANALYZE_RESUME', {
          fileName: 'resume.pdf',
          rawText: 'John Doe\nSenior Software Engineer\n5 years experience with React, Node.js',
          basicInfo: { name: 'John Doe', email: 'john@test.com', skills: ['React', 'Node.js'] },
          confidence: 0.95,
        }),
        makeSender()
      );

      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(mockEngine.analyzeResumeText).toHaveBeenCalledOnce();
      expect(mockMasterProfileRepo.save).toHaveBeenCalledWith(sampleProfile);
    });

    it('retrieves created profile via GET_ACTIVE_MASTER_PROFILE', async () => {
      mockMasterProfileRepo.getActive.mockResolvedValue(sampleProfile);

      const res = await handleMessage(makeMessage('GET_ACTIVE_MASTER_PROFILE'), makeSender());
      expect(res.success).toBe(true);
      expect(res.data).toEqual(sampleProfile);
    });

    it('returns error when AI service is unavailable', async () => {
      const mockAI = { chat: vi.fn(), isAvailable: vi.fn().mockResolvedValue(false) };
      (AIService as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockAI);

      const res = await handleMessage(
        makeMessage('ANALYZE_RESUME', {
          fileName: 'resume.pdf',
          rawText: 'Some resume text',
          basicInfo: { skills: [] },
          confidence: 0.5,
        }),
        makeSender()
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('not available');
    });
  });

  // ── Group 13: E2E Journey — Job Detection → ATS Score ────────────

  describe('E2E: Job Detection → ATS Score', () => {
    const sampleMasterProfile = {
      id: 'mp1',
      name: 'Test User',
      isActive: true,
      personal: { name: 'Test User' },
      experience: [
        {
          company: 'Acme Corp',
          normalizedTitle: 'software_engineer',
          title: 'Software Engineer',
          achievements: ['Built React apps'],
          technologies: ['React', 'TypeScript'],
        },
      ],
      education: [],
      skills: {
        technical: [{ name: 'React', proficiency: 'expert', yearsUsed: 3 }],
        tools: [],
        frameworks: [],
      },
      careerContext: { seniority: 'mid', yearsOfExperience: 5 },
      generatedProfiles: [],
    };

    it('scores a job against active profile (quick score, no AI)', async () => {
      mockMasterProfileRepo.getActive.mockResolvedValue(sampleMasterProfile);

      const res = await handleMessage(
        makeMessage('ANALYZE_JOB', {
          job: {
            title: 'Senior Frontend Engineer',
            company: 'Tech Co',
            description: 'We need a React expert with TypeScript experience for our web platform.',
          },
          platform: 'linkedin',
          useAI: false,
        }),
        makeSender()
      );

      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty('overallScore');
      expect(res.data).toHaveProperty('matchedKeywords');
      expect(res.data).toHaveProperty('missingKeywords');
      expect(res.data).toHaveProperty('suggestions');
    });

    it('returns error when no active profile exists', async () => {
      mockMasterProfileRepo.getActive.mockResolvedValue(null);

      const res = await handleMessage(
        makeMessage('ANALYZE_JOB', {
          job: {
            title: 'Engineer',
            company: 'Co',
            description: 'Some job description',
          },
          useAI: false,
        }),
        makeSender()
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('No active profile');
    });

    it('returns error when job description is empty', async () => {
      mockMasterProfileRepo.getActive.mockResolvedValue(sampleMasterProfile);

      const res = await handleMessage(
        makeMessage('ANALYZE_JOB', {
          job: { title: 'Engineer', company: 'Co', description: '' },
          useAI: false,
        }),
        makeSender()
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('No job description');
    });
  });

  // ── Group 14: E2E Journey — Resume Tailoring with JD ─────────────

  describe('E2E: Resume Tailoring with JD', () => {
    it('runs 3-step optimization pipeline and returns enhanced content', async () => {
      const jdAnalysis = {
        coreNeed: 'Build scalable React applications',
        mustHaves: ['React', 'TypeScript', 'AWS'],
        niceToHaves: ['GraphQL'],
        hiddenPriorities: ['Team leadership'],
        teamContext: 'Small startup team',
        impactExpected: 'Ship features fast',
      };

      const enhancedBullets = [
        { expId: 'exp1', bullets: ['Built React TypeScript microservices serving 10K users'] },
      ];

      // Mock 3 sequential AI calls
      const mockChat = vi
        .fn()
        .mockResolvedValueOnce({ content: JSON.stringify(jdAnalysis) }) // Step 1: JD analysis
        .mockResolvedValueOnce({
          content:
            'Experienced React engineer with 5 years building scalable TypeScript applications on AWS.',
        }) // Step 2: Summary
        .mockResolvedValueOnce({ content: JSON.stringify(enhancedBullets) }); // Step 3: Bullets

      const mockAI = { chat: mockChat, isAvailable: vi.fn().mockResolvedValue(true) };
      (AIService as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockAI);

      const res = await handleMessage(
        makeMessage('OPTIMIZE_RESUME_FOR_JD', {
          masterProfileId: 'mp1',
          roleId: 'role1',
          jobDescription: 'We need a Senior React Engineer with TypeScript and AWS experience.',
          missingKeywords: ['AWS', 'GraphQL'],
          strengthKeywords: [
            { keyword: 'React', count: 5 },
            { keyword: 'TypeScript', count: 3 },
          ],
          currentSummary: 'Software engineer with React experience.',
          keyBulletPoints: [{ expId: 'exp1', bullets: ['Built web applications'] }],
        }),
        makeSender()
      );

      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty('optimizedSummary');
      expect(res.data).toHaveProperty('enhancedBullets');
      expect(res.data).toHaveProperty('addedKeywords');
      expect(res.data).toHaveProperty('newScore');
      expect(mockChat).toHaveBeenCalledTimes(3);
    });

    it('returns error when AI service is unavailable', async () => {
      const mockAI = { chat: vi.fn(), isAvailable: vi.fn().mockResolvedValue(false) };
      (AIService as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockAI);

      const res = await handleMessage(
        makeMessage('OPTIMIZE_RESUME_FOR_JD', {
          masterProfileId: 'mp1',
          roleId: 'role1',
          jobDescription: 'Some JD',
          missingKeywords: [],
          currentSummary: 'Summary',
          keyBulletPoints: [],
        }),
        makeSender()
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('not available');
    });

    it('handles AI returning malformed JSON gracefully', async () => {
      const mockChat = vi
        .fn()
        .mockResolvedValueOnce({ content: 'not valid json at all' }) // Step 1: bad JSON
        .mockResolvedValueOnce({ content: 'A valid optimized summary.' }) // Step 2: plain text (OK)
        .mockResolvedValueOnce({ content: 'also not valid json' }); // Step 3: bad JSON

      const mockAI = { chat: mockChat, isAvailable: vi.fn().mockResolvedValue(true) };
      (AIService as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockAI);

      const res = await handleMessage(
        makeMessage('OPTIMIZE_RESUME_FOR_JD', {
          masterProfileId: 'mp1',
          roleId: 'role1',
          jobDescription: 'We need a React engineer.',
          missingKeywords: ['React'],
          currentSummary: 'Original summary.',
          keyBulletPoints: [{ expId: 'exp1', bullets: ['Original bullet'] }],
        }),
        makeSender()
      );

      // Should still succeed — it falls back to defaults when JSON parse fails
      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty('optimizedSummary');
      // Enhanced bullets should fall back to original
      expect((res.data as Record<string, unknown>).enhancedBullets).toEqual([
        { expId: 'exp1', bullets: ['Original bullet'] },
      ]);
    });
  });
});
