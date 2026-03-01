import { getDB } from '../idb-client';
import type { Job, JobPlatform } from '@shared/types/job.types';

function generateId(): string {
  return crypto.randomUUID();
}

export const jobRepo = {
  async getAll(): Promise<Job[]> {
    const db = await getDB();
    return db.getAll('jobs');
  },

  async getById(id: string): Promise<Job | undefined> {
    const db = await getDB();
    return db.get('jobs', id);
  },

  async getByUrl(url: string): Promise<Job | undefined> {
    const db = await getDB();
    const jobs = await db.getAllFromIndex('jobs', 'by-url', url);
    return jobs[0];
  },

  async getByPlatform(platform: JobPlatform): Promise<Job[]> {
    const db = await getDB();
    return db.getAllFromIndex('jobs', 'by-platform', platform);
  },

  async getByCompany(company: string): Promise<Job[]> {
    const db = await getDB();
    return db.getAllFromIndex('jobs', 'by-company', company);
  },

  async getRecent(limit: number = 10): Promise<Job[]> {
    const db = await getDB();
    const all = await db.getAllFromIndex('jobs', 'by-created');
    return all.reverse().slice(0, limit);
  },

  async create(job: Omit<Job, 'id' | 'createdAt' | 'firstSeenAt' | 'lastSeenAt'>): Promise<Job> {
    const db = await getDB();
    const now = new Date();

    // Check if job already exists by URL
    const existing = await this.getByUrl(job.url);
    if (existing) {
      // Update lastSeenAt
      const updated = await this.update(existing.id, { lastSeenAt: now });
      if (updated) return updated;
      // If update failed (job deleted between check and update), fall through to create
    }

    const newJob: Job = {
      ...job,
      id: generateId(),
      createdAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
    };

    await db.put('jobs', newJob);
    return newJob;
  },

  async update(id: string, updates: Partial<Job>): Promise<Job | undefined> {
    const db = await getDB();
    const existing = await db.get('jobs', id);

    if (!existing) {
      return undefined;
    }

    const updated: Job = {
      ...existing,
      ...updates,
      id, // Ensure ID can't be changed
    };

    await db.put('jobs', updated);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    const db = await getDB();
    const existing = await db.get('jobs', id);

    if (!existing) {
      return false;
    }

    await db.delete('jobs', id);
    return true;
  },

  async upsertByUrl(
    job: Omit<Job, 'id' | 'createdAt' | 'firstSeenAt' | 'lastSeenAt'>
  ): Promise<Job> {
    const existing = await this.getByUrl(job.url);

    if (existing) {
      const updated = await this.update(existing.id, {
        ...job,
        lastSeenAt: new Date(),
      });
      if (updated) return updated;
      // If update failed (job deleted between check and update), fall through to create
    }

    return this.create(job);
  },

  async count(): Promise<number> {
    const db = await getDB();
    return db.count('jobs');
  },
};
