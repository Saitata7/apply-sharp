import { getDB } from '../idb-client';
import type { ResumeVersion } from '@shared/types/resume-version.types';

function generateId(): string {
  return crypto.randomUUID();
}

export const resumeVersionRepo = {
  async getAll(): Promise<ResumeVersion[]> {
    const db = await getDB();
    return db.getAll('resume-versions');
  },

  async getById(id: string): Promise<ResumeVersion | undefined> {
    const db = await getDB();
    return db.get('resume-versions', id);
  },

  async getByProfileId(profileId: string): Promise<ResumeVersion[]> {
    const db = await getDB();
    return db.getAllFromIndex('resume-versions', 'by-profile', profileId);
  },

  async getByJobId(jobId: string): Promise<ResumeVersion[]> {
    const db = await getDB();
    return db.getAllFromIndex('resume-versions', 'by-job', jobId);
  },

  async create(
    version: Omit<ResumeVersion, 'id' | 'createdAt' | 'updatedAt' | 'downloadCount'>
  ): Promise<ResumeVersion> {
    const db = await getDB();
    const now = new Date();

    const newVersion: ResumeVersion = {
      ...version,
      id: generateId(),
      downloadCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.put('resume-versions', newVersion);
    return newVersion;
  },

  async delete(id: string): Promise<boolean> {
    const db = await getDB();
    const existing = await db.get('resume-versions', id);
    if (!existing) return false;
    await db.delete('resume-versions', id);
    return true;
  },

  async count(): Promise<number> {
    const db = await getDB();
    return db.count('resume-versions');
  },
};
