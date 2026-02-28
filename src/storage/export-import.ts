/**
 * Data Export / Import
 *
 * Full JSON backup of all ApplySharp data (MasterProfiles, applications,
 * jobs, resume versions, settings) and CSV export for application history.
 */

import type { MasterProfile } from '@shared/types/master-profile.types';
import type { Application } from '@shared/types/application.types';
import type { Job } from '@shared/types/job.types';
import type { ResumeVersion } from '@shared/types/resume-version.types';
import type { UserSettings } from '@shared/types/settings.types';
import {
  masterProfileRepo,
  applicationRepo,
  jobRepo,
  resumeVersionRepo,
  settingsRepo,
} from './index';
import { getDB } from './idb-client';

// ── Types ───────────────────────────────────────────────────────────────

export const EXPORT_VERSION = 1;

export interface ExportData {
  version: number;
  exportedAt: string;
  appVersion: string;
  data: {
    masterProfiles: MasterProfile[];
    applications: Application[];
    jobs: Job[];
    resumeVersions: ResumeVersion[];
    settings: UserSettings;
  };
}

export interface ImportResult {
  success: boolean;
  imported: {
    masterProfiles: number;
    applications: number;
    jobs: number;
    resumeVersions: number;
    settings: boolean;
  };
  skipped: number;
  errors: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Export ───────────────────────────────────────────────────────────────

export async function exportAllData(): Promise<ExportData> {
  const [masterProfiles, applications, jobs, resumeVersions, settings] = await Promise.all([
    masterProfileRepo.getAll(),
    applicationRepo.getAll(),
    jobRepo.getAll(),
    resumeVersionRepo.getAll(),
    settingsRepo.get(),
  ]);

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: '1.0.0',
    data: {
      masterProfiles,
      applications,
      jobs,
      resumeVersions,
      settings,
    },
  };
}

// ── Import ──────────────────────────────────────────────────────────────

export async function importData(exportData: ExportData): Promise<ImportResult> {
  const validation = validateExportData(exportData);
  if (!validation.valid) {
    return {
      success: false,
      imported: { masterProfiles: 0, applications: 0, jobs: 0, resumeVersions: 0, settings: false },
      skipped: 0,
      errors: validation.errors,
    };
  }

  const result: ImportResult = {
    success: true,
    imported: { masterProfiles: 0, applications: 0, jobs: 0, resumeVersions: 0, settings: false },
    skipped: 0,
    errors: [],
  };

  const { data } = exportData;

  // Import master profiles (merge — skip existing IDs)
  if (data.masterProfiles?.length) {
    const existing = await masterProfileRepo.getAll();
    const existingIds = new Set(existing.map((p) => p.id));

    for (const profile of data.masterProfiles) {
      if (existingIds.has(profile.id)) {
        result.skipped++;
        continue;
      }
      try {
        await masterProfileRepo.save(profile);
        result.imported.masterProfiles++;
      } catch (e) {
        result.errors.push(`Failed to import profile: ${(e as Error).message}`);
      }
    }
  }

  // Import jobs (use IDB put — upsert by ID)
  if (data.jobs?.length) {
    const db = await getDB();
    for (const job of data.jobs) {
      try {
        const existing = await db.get('jobs', job.id);
        if (existing) {
          result.skipped++;
          continue;
        }
        await db.put('jobs', job);
        result.imported.jobs++;
      } catch (e) {
        result.errors.push(`Failed to import job: ${(e as Error).message}`);
      }
    }
  }

  // Import applications
  if (data.applications?.length) {
    const db = await getDB();
    for (const app of data.applications) {
      try {
        const existing = await db.get('applications', app.id);
        if (existing) {
          result.skipped++;
          continue;
        }
        await db.put('applications', app);
        result.imported.applications++;
      } catch (e) {
        result.errors.push(`Failed to import application: ${(e as Error).message}`);
      }
    }
  }

  // Import resume versions
  if (data.resumeVersions?.length) {
    const db = await getDB();
    for (const rv of data.resumeVersions) {
      try {
        const existing = await db.get('resume-versions', rv.id);
        if (existing) {
          result.skipped++;
          continue;
        }
        await db.put('resume-versions', rv);
        result.imported.resumeVersions++;
      } catch (e) {
        result.errors.push(`Failed to import resume version: ${(e as Error).message}`);
      }
    }
  }

  // Import settings (overwrite)
  if (data.settings) {
    try {
      await settingsRepo.save(data.settings);
      result.imported.settings = true;
    } catch (e) {
      result.errors.push(`Failed to import settings: ${(e as Error).message}`);
    }
  }

  return result;
}

// ── CSV Export ───────────────────────────────────────────────────────────

export async function exportApplicationsCSV(): Promise<string> {
  const applications = await applicationRepo.getAll();
  const jobs = await jobRepo.getAll();
  const jobMap = new Map(jobs.map((j) => [j.id, j]));

  const headers = ['Date Applied', 'Company', 'Job Title', 'Status', 'URL', 'Platform', 'Notes'];
  const rows: string[][] = [headers];

  for (const app of applications) {
    const job = jobMap.get(app.jobId);
    rows.push([
      formatCSVDate(app.appliedAt || app.createdAt),
      escapeCSV(job?.company || ''),
      escapeCSV(job?.title || ''),
      app.status,
      escapeCSV(job?.url || ''),
      job?.platform || '',
      escapeCSV(app.userNotes || ''),
    ]);
  }

  return rows.map((row) => row.join(',')).join('\n');
}

// ── Validation ──────────────────────────────────────────────────────────

export function validateExportData(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Import data must be a JSON object'] };
  }

  const d = data as Record<string, unknown>;

  if (typeof d.version !== 'number') {
    errors.push('Missing or invalid "version" field');
  }

  if (!d.data || typeof d.data !== 'object') {
    errors.push('Missing "data" field');
  } else {
    const inner = d.data as Record<string, unknown>;
    if (!Array.isArray(inner.masterProfiles)) errors.push('Missing "data.masterProfiles" array');
    if (!Array.isArray(inner.applications)) errors.push('Missing "data.applications" array');
    if (!Array.isArray(inner.jobs)) errors.push('Missing "data.jobs" array');
    if (!Array.isArray(inner.resumeVersions)) errors.push('Missing "data.resumeVersions" array');
    if (!inner.settings || typeof inner.settings !== 'object')
      errors.push('Missing "data.settings" object');
  }

  return { valid: errors.length === 0, errors };
}

// ── Helpers ─────────────────────────────────────────────────────────────

export function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatCSVDate(date: Date | string | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}
