import { openDB, deleteDB, DBSchema, IDBPDatabase } from 'idb';
import type { ResumeProfile } from '@shared/types/profile.types';
import type { Job, JobPlatform } from '@shared/types/job.types';
import type { Application, ApplicationStatus } from '@shared/types/application.types';
import type { UserSettings } from '@shared/types/settings.types';
import type { ResumeVersion } from '@shared/types/resume-version.types';
import type { Contact } from '@shared/types/contact.types';

const DB_NAME = 'applysharp-db';
const OLD_DB_NAME = 'jobs-pilot-db';
// v3 (Workstream 10): adds the contacts store with by-email-hash + by-job
// + by-created indexes. Migration is additive: only the contacts store is
// created. Existing applications/jobs/profiles/resume-versions are
// untouched. Idempotent: only runs when oldVersion < 3.
const DB_VERSION = 3;

export interface ApplySharpDB extends DBSchema {
  profiles: {
    key: string;
    value: ResumeProfile;
    indexes: {
      'by-name': string;
      'by-default': number;
      'by-updated': Date;
    };
  };
  jobs: {
    key: string;
    value: Job;
    indexes: {
      'by-platform': JobPlatform;
      'by-company': string;
      'by-url': string;
      'by-created': Date;
    };
  };
  applications: {
    key: string;
    value: Application;
    indexes: {
      'by-job': string;
      'by-profile': string;
      'by-status': ApplicationStatus;
      'by-created': Date;
    };
  };
  settings: {
    key: string;
    value: UserSettings;
  };
  'resume-versions': {
    key: string;
    value: ResumeVersion;
    indexes: {
      'by-profile': string;
      'by-job': string;
      'by-created': Date;
    };
  };
  contacts: {
    key: string;
    value: Contact;
    indexes: {
      'by-email-hash': string;
      'by-phone': string;
      'by-job': string;
      'by-created': string;
      'by-updated': string;
    };
  };
}

let dbInstance: IDBPDatabase<ApplySharpDB> | null = null;

async function migrateFromOldDB(newDb: IDBPDatabase<ApplySharpDB>): Promise<void> {
  try {
    const databases = await indexedDB.databases();
    const oldExists = databases.some((d) => d.name === OLD_DB_NAME);
    if (!oldExists) return;

    const oldDb = await openDB(OLD_DB_NAME, DB_VERSION);
    const storeNames = ['profiles', 'jobs', 'applications', 'settings'] as const;

    for (const storeName of storeNames) {
      if (!oldDb.objectStoreNames.contains(storeName)) continue;
      const records = await oldDb.getAll(storeName);
      for (const record of records) {
        await newDb.put(storeName, record);
      }
    }

    oldDb.close();
    await deleteDB(OLD_DB_NAME);
    console.log('[ApplySharp] Migrated data from old database');
  } catch (error) {
    console.warn('[ApplySharp] Migration from old DB failed:', error);
  }
}

export async function initDB(): Promise<IDBPDatabase<ApplySharpDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<ApplySharpDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Profiles store
      if (!db.objectStoreNames.contains('profiles')) {
        const profileStore = db.createObjectStore('profiles', { keyPath: 'id' });
        profileStore.createIndex('by-name', 'name');
        profileStore.createIndex('by-default', 'isDefault');
        profileStore.createIndex('by-updated', 'updatedAt');
      }

      // Jobs store
      if (!db.objectStoreNames.contains('jobs')) {
        const jobStore = db.createObjectStore('jobs', { keyPath: 'id' });
        jobStore.createIndex('by-platform', 'platform');
        jobStore.createIndex('by-company', 'company');
        jobStore.createIndex('by-url', 'url');
        jobStore.createIndex('by-created', 'createdAt');
      }

      // Applications store
      if (!db.objectStoreNames.contains('applications')) {
        const appStore = db.createObjectStore('applications', { keyPath: 'id' });
        appStore.createIndex('by-job', 'jobId');
        appStore.createIndex('by-profile', 'profileId');
        appStore.createIndex('by-status', 'status');
        appStore.createIndex('by-created', 'createdAt');
      }

      // Settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }

      // Resume versions store (added in v2)
      if (!db.objectStoreNames.contains('resume-versions')) {
        const rvStore = db.createObjectStore('resume-versions', { keyPath: 'id' });
        rvStore.createIndex('by-profile', 'profileId');
        rvStore.createIndex('by-job', 'jobId');
        rvStore.createIndex('by-created', 'createdAt');
      }

      // Contacts store (added in v3 by Workstream 10).
      // by-email-hash uses canonical.email which is computed from
      // sightings; by-job is multiEntry so a contact seen on multiple
      // job pages is queryable from any of them.
      if (!db.objectStoreNames.contains('contacts')) {
        const contactStore = db.createObjectStore('contacts', { keyPath: 'id' });
        contactStore.createIndex('by-email-hash', 'canonical.email');
        contactStore.createIndex('by-phone', 'canonical.phone');
        contactStore.createIndex('by-job', 'jobIds', { multiEntry: true });
        contactStore.createIndex('by-created', 'createdAt');
        contactStore.createIndex('by-updated', 'updatedAt');
      }
    },
  });

  await migrateFromOldDB(dbInstance);

  return dbInstance;
}

export async function getDB(): Promise<IDBPDatabase<ApplySharpDB>> {
  if (!dbInstance) {
    return initDB();
  }
  return dbInstance;
}

export const db = {
  init: initDB,
  get: getDB,
};
