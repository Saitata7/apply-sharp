import { getDB } from '../idb-client';
import type { Application, ApplicationStatus, StatusChange } from '@shared/types/application.types';
import type { UserSettings } from '@shared/types/settings.types';

function generateId(): string {
  return crypto.randomUUID();
}

export const applicationRepo = {
  async getAll(): Promise<Application[]> {
    const db = await getDB();
    return db.getAll('applications');
  },

  async getById(id: string): Promise<Application | undefined> {
    const db = await getDB();
    return db.get('applications', id);
  },

  async getByJobId(jobId: string): Promise<Application | undefined> {
    const db = await getDB();
    const apps = await db.getAllFromIndex('applications', 'by-job', jobId);
    return apps[0];
  },

  async getByProfileId(profileId: string): Promise<Application[]> {
    const db = await getDB();
    return db.getAllFromIndex('applications', 'by-profile', profileId);
  },

  async getByStatus(status: ApplicationStatus): Promise<Application[]> {
    const db = await getDB();
    return db.getAllFromIndex('applications', 'by-status', status);
  },

  async getRecent(limit: number = 10): Promise<Application[]> {
    const db = await getDB();
    const all = await db.getAllFromIndex('applications', 'by-created');
    return all.reverse().slice(0, limit);
  },

  async create(
    application: Omit<Application, 'id' | 'createdAt' | 'updatedAt' | 'statusHistory'>
  ): Promise<Application> {
    const db = await getDB();
    const now = new Date();

    const newApp: Application = {
      ...application,
      id: generateId(),
      statusHistory: [],
      createdAt: now,
      updatedAt: now,
    };

    await db.put('applications', newApp);
    return newApp;
  },

  async update(id: string, updates: Partial<Application>): Promise<Application | undefined> {
    const db = await getDB();
    const existing = await db.get('applications', id);

    if (!existing) {
      return undefined;
    }

    const updated: Application = {
      ...existing,
      ...updates,
      id,
      updatedAt: new Date(),
    };

    await db.put('applications', updated);
    return updated;
  },

  async updateStatus(
    id: string,
    newStatus: ApplicationStatus,
    note?: string
  ): Promise<Application | undefined> {
    const db = await getDB();
    const existing = await db.get('applications', id);

    if (!existing) {
      return undefined;
    }

    const statusChange: StatusChange = {
      from: existing.status,
      to: newStatus,
      changedAt: new Date(),
      note,
    };

    const updated: Application = {
      ...existing,
      status: newStatus,
      statusHistory: [...existing.statusHistory, statusChange],
      updatedAt: new Date(),
    };

    if (newStatus === 'submitted' && !existing.appliedAt) {
      updated.appliedAt = new Date();
    }

    await db.put('applications', updated);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    const db = await getDB();
    const existing = await db.get('applications', id);

    if (!existing) {
      return false;
    }

    await db.delete('applications', id);
    return true;
  },

  async count(): Promise<number> {
    const db = await getDB();
    return db.count('applications');
  },

  async countByStatus(): Promise<Record<ApplicationStatus, number>> {
    const all = await this.getAll();
    const counts: Record<ApplicationStatus, number> = {
      saved: 0,
      in_progress: 0,
      submitted: 0,
      under_review: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
      withdrawn: 0,
      ghosted: 0,
      expired: 0,
    };

    for (const app of all) {
      counts[app.status]++;
    }

    return counts;
  },

  // ── Workstream 4 extensions ────────────────────────────────────────────

  /** Mark an application as archived without deleting it. */
  async archive(id: string): Promise<Application | undefined> {
    return this.update(id, { archived: true });
  },

  /**
   * Workstream 8: find prior applications matching a normalized (company,
   * title) pair. Used by the ghost-job scorer's reposting signal to detect
   * "this same listing has been put up before by the same company".
   *
   * Composes via getAll() + filter rather than a new IDB index because the
   * tracker is small (typically <500 rows). The normalize functions live in
   * src/core/ghost-job-detector/reposting-normalizer.ts and are imported by
   * the caller, so this method takes already-normalized strings.
   *
   * Returns the FULL Application objects (not just JD snapshots) so the
   * caller can render dates and links if needed.
   */
  async findByCompanyAndTitle(
    normalizedCompany: string,
    normalizedTitle: string,
    matchFn: (
      a: { company: string; title: string },
      b: { company: string; title: string }
    ) => boolean
  ): Promise<Application[]> {
    if (!normalizedCompany || !normalizedTitle) return [];
    const all = await this.getAll();
    return all.filter((app) => {
      const snap = app.jdSnapshot;
      if (!snap?.company || !snap?.title) return false;
      // Caller passes a match function (takes (a,b) and returns boolean) so
      // the normalization rules live in the ghost-job-detector module, not
      // duplicated here.
      return matchFn(
        { company: normalizedCompany, title: normalizedTitle },
        { company: snap.company, title: snap.title }
      );
    });
  },

  /** Find applications submitted more than `daysThreshold` ago that are still
   *  in 'submitted' status with no statusHistory entry beyond the initial submit.
   *  Used by the ghost detector cron. */
  async findGhostCandidates(daysThreshold: number = 30): Promise<Application[]> {
    const all = await this.getAll();
    const cutoff = Date.now() - daysThreshold * 86_400_000;
    return all.filter((app) => {
      if (app.status !== 'submitted') return false;
      if (!app.appliedAt || new Date(app.appliedAt).getTime() > cutoff) return false;
      // Has the user manually moved this past submitted? statusHistory will
      // have an entry where `to !== 'submitted'`. If so, skip.
      const moved = (app.statusHistory ?? []).some((s) => s.to !== 'submitted');
      return !moved;
    });
  },

  /** Find applications with at least one follow-up due before `now`. */
  async findNeedingFollowUp(now: Date = new Date()): Promise<Application[]> {
    const all = await this.getAll();
    return all.filter((app) =>
      (app.followUps ?? []).some((f) => !f.done && new Date(f.dueDate).getTime() <= now.getTime())
    );
  },

  /** Bulk-apply the same patch to multiple applications. Used by the tracker
   *  bulk action bar. */
  async bulkUpdate(ids: string[], patch: Partial<Application>): Promise<number> {
    let count = 0;
    for (const id of ids) {
      const updated = await this.update(id, patch);
      if (updated) count++;
    }
    return count;
  },

  /**
   * Atomic read-modify-write that appends a follow-up to an application.
   * Used by the follow-up scheduler to avoid clobbering concurrent
   * status updates from the ghost detector cron (which calls updateStatus
   * and then immediately schedules a follow-up; without this helper the
   * two writes race and one wins, dropping either the new status or the
   * new follow-up).
   *
   * Reads the current row, appends the follow-up to the existing array,
   * and writes back inside a single IDB transaction. Other writes that
   * happen between the read and write will see the latest data because
   * IDB serializes transactions per object store.
   */
  async appendFollowUp(
    id: string,
    followUp: import('@shared/types/application.types').FollowUp
  ): Promise<Application | undefined> {
    const db = await getDB();
    const tx = db.transaction('applications', 'readwrite');
    const existing = await tx.store.get(id);
    if (!existing) {
      await tx.done;
      return undefined;
    }
    const updated: Application = {
      ...existing,
      followUps: [...(existing.followUps ?? []), followUp],
      updatedAt: new Date(),
    };
    await tx.store.put(updated);
    await tx.done;
    return updated;
  },

  /** Pre-filtered query for the analytics dashboard. */
  async getForAnalytics(opts?: {
    from?: Date;
    to?: Date;
    source?: string;
    resumeVersionId?: string;
  }): Promise<Application[]> {
    const all = await this.getAll();
    return all.filter((app) => {
      if (opts?.from && app.appliedAt && new Date(app.appliedAt) < opts.from) return false;
      if (opts?.to && app.appliedAt && new Date(app.appliedAt) > opts.to) return false;
      if (opts?.source && app.source !== opts.source) return false;
      if (opts?.resumeVersionId && app.resumeVersionId !== opts.resumeVersionId) return false;
      if (app.archived) return false;
      return true;
    });
  },
};

// ── Migration: Workstream 4 v2 schema ──────────────────────────────────

const MIGRATION_KEY = 'applicationV2';

/**
 * Idempotent one-time migration that extends every existing Application
 * record with the Workstream 4 fields and migrates the deprecated 'expired'
 * status to 'ghosted'. Gated by settings.migrations.applicationV2 so it
 * only runs once per profile, regardless of how many times it is called.
 *
 * Called from src/storage/idb-client.ts after initDB() resolves.
 */
export async function migrateApplicationsV2(): Promise<void> {
  const db = await getDB();

  // Settings repo schema may not have the migrations bucket yet; we read and
  // write defensively. Skip migration if the flag is already set.
  const settings = await db.get('settings', 'singleton');
  if ((settings as { migrations?: Record<string, boolean> })?.migrations?.[MIGRATION_KEY]) {
    return;
  }

  const tx = db.transaction('applications', 'readwrite');
  for await (const cursor of tx.store) {
    const app = cursor.value;
    const patched: Application = {
      ...app,
      status: app.status === 'expired' ? 'ghosted' : app.status,
      resumeVersionId: app.resumeVersionId ?? '__legacy_default__',
      source: app.source ?? 'other',
      followUps: app.followUps ?? [],
      archived: app.archived ?? false,
    };

    // Backfill jdSnapshot from the linked job if missing.
    if (!patched.jdSnapshot && app.jobId) {
      try {
        const job = await db.get('jobs', app.jobId);
        if (job) {
          patched.jdSnapshot = {
            title: job.title ?? '',
            company: job.company ?? '',
            jdText: job.description ?? '',
            url: job.url ?? '',
            capturedAt: job.createdAt ? new Date(job.createdAt) : new Date(),
          };
        }
      } catch {
        // job lookup failure is non-fatal; skip backfill
      }
    }

    await cursor.update(patched);
  }
  await tx.done;

  // Mark migration done so we never re-run. UserSettings does not yet have
  // a `migrations` field in its TS type (added in a follow-up commit). Cast
  // through unknown to bypass the type check at the IDB boundary; the runtime
  // representation just gains an extra property.
  const next = {
    ...((settings as unknown as Record<string, unknown>) ?? { id: 'singleton' }),
    migrations: {
      ...((settings as unknown as { migrations?: Record<string, boolean> })?.migrations ?? {}),
      [MIGRATION_KEY]: true,
    },
  };
  await db.put('settings', next as unknown as UserSettings);
}
