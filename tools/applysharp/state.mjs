/**
 * State file load/save + safe defaults for the ApplySharp CLI bridge.
 *
 * The state file is a valid `ExportData` JSON — same shape DataManager
 * Export produces and Import consumes. Mutations operate on
 * `data.masterProfiles[0]`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
export const STATE_PATH = path.join(HERE, 'state.json');

export function emptyState() {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  return {
    version: 1,
    exportedAt: now,
    data: {
      masterProfiles: [
        {
          id,
          createdAt: now,
          updatedAt: now,
          sourceDocument: {
            fileName: 'applysharp-cli',
            fileType: 'txt',
            uploadedAt: now,
            rawText: '',
            checksum: 'cli-seed',
          },
          personal: {
            fullName: '',
            firstName: '',
            lastName: '',
            email: '',
            phone: '',
            location: { city: '', state: '', country: 'USA', formatted: '' },
          },
          careerContext: {
            summary: '',
            careerTrajectory: 'ascending',
            yearsOfExperience: 0,
            seniorityLevel: 'mid',
            primaryDomain: '',
            secondaryDomains: [],
            industryExperience: [],
            bestFitRoles: [],
            strengthAreas: [],
            growthAreas: [],
            writingStyle: {
              tone: 'professional',
              complexity: 'moderate',
              preferredVoice: 'first-person',
            },
            topAccomplishments: [],
            uniqueValueProps: [],
          },
          experience: [],
          skills: {
            technical: [],
            tools: [],
            frameworks: [],
            soft: [],
            programmingLanguages: [],
            naturalLanguages: [],
            clusters: [],
          },
          education: [],
          projects: [],
          certifications: [],
          generatedProfiles: [],
          roleProfiles: [],
          autofillData: {
            workAuthorization: 'citizen',
            workAuthorizationText: 'I am authorized to work in the US',
            requiresSponsorship: false,
            willingToRelocate: false,
            remotePreference: 'flexible',
            currentlyEmployed: false,
            linkedInConsent: true,
            portfolioConsent: true,
            backgroundCheckConsent: true,
            drugTestConsent: true,
          },
        },
      ],
      applications: [],
      jobs: [],
      resumeVersions: [],
      settings: {},
    },
  };
}

export function loadState() {
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error(
      `No state at ${STATE_PATH}. Run \`npm run applysharp:init\` first.`
    );
  }
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

export function saveState(state) {
  state.exportedAt = new Date().toISOString();
  if (state.data?.masterProfiles?.[0]) {
    state.data.masterProfiles[0].updatedAt = new Date().toISOString();
  }
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function getProfile(state) {
  const p = state?.data?.masterProfiles?.[0];
  if (!p) throw new Error('State has no master profile. Run init first.');
  return p;
}
