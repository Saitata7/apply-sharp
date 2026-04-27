import type { MessageResponse } from '@shared/utils/messaging';
import type { Job, ExtractedJob } from '@shared/types/job.types';
import type { ApplicationStatus, Application } from '@shared/types/application.types';
import { jobRepo, applicationRepo, resumeVersionRepo } from '@storage/index';
import { scheduleDeadlineAlarm, clearDeadlineAlarm } from '../deadline-alarms';
import { learningService } from '@core/learning';
import { exportAllData, importData, exportApplicationsCSV } from '@storage/export-import';
import type { ExportData } from '@storage/export-import';

// ============================================================================
// Job Handlers
// ============================================================================

export async function handleSaveJob(
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
      applicationDeadline: (() => {
        if (!jobData.applicationDeadline) return undefined;
        const d = new Date(jobData.applicationDeadline);
        return isNaN(d.getTime()) ? undefined : d;
      })(),
      sponsorshipStatus: jobData.sponsorshipStatus,
    };

    const saved = await jobRepo.upsertByUrl(job);

    // Schedule deadline reminder if deadline is set
    if (saved.applicationDeadline) {
      await scheduleDeadlineAlarm(
        saved.id,
        new Date(saved.applicationDeadline),
        saved.title,
        saved.company
      );
    }

    return { success: true, data: saved };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleSetJobDeadline(payload: {
  jobId: string;
  deadline: string | null;
}): Promise<MessageResponse> {
  try {
    const job = await jobRepo.getById(payload.jobId);
    if (!job) return { success: false, error: 'Job not found' };

    const deadline = payload.deadline ? new Date(payload.deadline) : undefined;
    await jobRepo.update(payload.jobId, { applicationDeadline: deadline });

    if (deadline) {
      await scheduleDeadlineAlarm(payload.jobId, deadline, job.title, job.company);
    } else {
      await clearDeadlineAlarm(payload.jobId);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleGetJob(jobId: string): Promise<MessageResponse> {
  try {
    const job = await jobRepo.getById(jobId);
    return { success: true, data: job };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleGetRecentJobs(limit?: number): Promise<MessageResponse> {
  try {
    const jobs = await jobRepo.getRecent(limit || 10);
    return { success: true, data: jobs };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// Application Management Handlers
// ============================================================================

export async function handleGetApplications(): Promise<MessageResponse> {
  try {
    const applications = await applicationRepo.getAll();
    return { success: true, data: applications };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleGetApplication(id: string): Promise<MessageResponse> {
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

export async function handleGetApplicationsWithJobs(): Promise<MessageResponse> {
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

export async function handleCreateApplication(
  payload: Parameters<typeof applicationRepo.create>[0]
): Promise<MessageResponse> {
  try {
    const application = await applicationRepo.create(payload);

    // Bridge to learning system so OutcomeTracker can track this application
    try {
      // Look up job details for learning system
      const job = application.jobId ? await jobRepo.getById(application.jobId) : null;
      await learningService.trackApplication({
        jobId: application.jobId || application.id,
        jobTitle: job?.title || '',
        company: job?.company || '',
        platform: job?.platform || 'unknown',
        profileId: application.profileId || '',
        keywordsUsed: [],
      });
    } catch {
      // Non-blocking: learning system failure shouldn't break app creation
    }

    return { success: true, data: application };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Workstream 4 auto-detection handler. Receives APPLICATION_SUBMIT_DETECTED
 * from either the v2 autofill bootstrap (Tier 1, after a successful fill +
 * submit) or from the passive submit watcher (Tier 2, after a confirmation
 * page renders + form interaction). Reads the cached jobContext from
 * chrome.storage.session and creates an Application with autoDetected
 * metadata so the user can see how the row got there.
 *
 * Idempotent per session: if a row for the same jobId already exists in
 * 'submitted' state we update its statusHistory rather than creating a
 * duplicate. Without this, refreshing a confirmation page would spam the
 * tracker.
 */
export async function handleApplicationSubmitDetected(payload: {
  tier: 1 | 2 | 3;
  platform: string;
  signal: string;
  url: string;
}): Promise<MessageResponse> {
  try {
    const session = await chrome.storage.session.get('lastJobContext');
    const ctx = (session?.lastJobContext ?? {}) as {
      jobTitle?: string;
      companyName?: string;
      jobDescription?: string;
      url?: string;
    };

    // Resolve a stable id for de-dup. Prefer the cached job url, fall back
    // to the page url.
    const stableUrl = ctx.url ?? payload.url;

    // Per-session in-memory cache: short-circuit the full table scan when
    // the same URL is detected twice in a row (e.g. user refreshes the
    // confirmation page). The full IDB query is the fallback when the
    // cache misses.
    const seenKey = `seen:${stableUrl}`;
    try {
      const cached = await chrome.storage.session.get(seenKey);
      if (cached?.[seenKey]) {
        return { success: true, data: { id: cached[seenKey] } };
      }
    } catch {
      // session storage may be unavailable; fall through to full scan
    }

    const all = await applicationRepo.getAll();
    const existing = all.find((a) => a.jdSnapshot?.url === stableUrl && a.status === 'submitted');
    if (existing) {
      // Already saved this session. Just refresh updatedAt and prime the cache.
      await applicationRepo.update(existing.id, {});
      try {
        await chrome.storage.session.set({ [seenKey]: existing.id });
      } catch {
        // best effort
      }
      return { success: true, data: existing };
    }

    const now = new Date();
    const created = await applicationRepo.create({
      jobId: `auto-${Date.now()}`,
      profileId: '',
      status: 'submitted',
      autofillUsed: payload.tier === 1,
      submittedVia: payload.tier === 1 ? 'autofill' : 'manual',
      appliedAt: now,
      jdSnapshot: {
        title: ctx.jobTitle ?? '(unknown role)',
        company: ctx.companyName ?? '(unknown company)',
        jdText: ctx.jobDescription ?? '',
        url: stableUrl,
        capturedAt: now,
      },
      source: payload.platform as Parameters<typeof applicationRepo.create>[0]['source'],
      autoDetected: {
        tier: payload.tier,
        signal: payload.signal,
        detectedAt: now,
      },
    });
    // Prime the per-session cache so subsequent detections of the same URL
    // short-circuit instead of re-scanning the application table. Reuses
    // the seenKey computed at the top of the function instead of shadowing.
    try {
      await chrome.storage.session.set({ [seenKey]: created.id });
    } catch {
      // best effort
    }
    return { success: true, data: created };
  } catch (err) {
    console.error('[Application] auto-detect failed:', err);
    return { success: false, error: (err as Error).message };
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

export async function handleUpdateApplicationStatus(payload: {
  id: string;
  status: ApplicationStatus;
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

export async function handleUpdateApplication(payload: {
  id: string;
  updates: Partial<Application>;
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

export async function handleDeleteApplication(id: string): Promise<MessageResponse> {
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

export async function handleBulkArchiveApplications(payload: {
  olderThanDays: number;
}): Promise<MessageResponse> {
  try {
    const all = await applicationRepo.getAll();
    const cutoff = Date.now() - payload.olderThanDays * 24 * 60 * 60 * 1000;
    const PROTECTED_STATUSES = ['expired', 'offer', 'interview'];
    const toArchive = all.filter(
      (app) =>
        new Date(app.createdAt).getTime() < cutoff && !PROTECTED_STATUSES.includes(app.status)
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

export async function handleGetApplicationCounts(): Promise<MessageResponse> {
  try {
    const counts = await applicationRepo.countByStatus();
    return { success: true, data: counts };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// Resume Version Handlers
// ============================================================================

export async function handleSaveResumeVersion(
  payload: Parameters<typeof resumeVersionRepo.create>[0]
): Promise<MessageResponse> {
  try {
    const version = await resumeVersionRepo.create(payload);
    return { success: true, data: version };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleGetResumeVersions(payload?: {
  profileId?: string;
}): Promise<MessageResponse> {
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

export async function handleGetResumeVersion(id: string): Promise<MessageResponse> {
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

export async function handleDeleteResumeVersion(id: string): Promise<MessageResponse> {
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

// ============================================================================
// Data Export / Import Handlers
// ============================================================================

export async function handleExportAllData(): Promise<MessageResponse> {
  try {
    const data = await exportAllData();
    return { success: true, data };
  } catch (error) {
    console.error('[ApplySharp] Export failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function handleImportData(payload: { data: ExportData }): Promise<MessageResponse> {
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

export async function handleExportApplicationsCSV(): Promise<MessageResponse> {
  try {
    const csv = await exportApplicationsCSV();
    return { success: true, data: csv };
  } catch (error) {
    console.error('[ApplySharp] CSV export failed:', error);
    return { success: false, error: (error as Error).message };
  }
}
