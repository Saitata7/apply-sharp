/**
 * Master Profile Repository
 * Stores master profiles in chrome.storage.local
 * Using chrome.storage for simplicity - can migrate to IndexedDB later
 */

import type { MasterProfile, GeneratedProfile } from '@shared/types/master-profile.types';

const STORAGE_KEY = 'masterProfiles';
const ACTIVE_KEY = 'activeMasterProfile';

export const masterProfileRepo = {
  /**
   * Get all master profiles
   */
  async getAll(): Promise<MasterProfile[]> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const profiles = result[STORAGE_KEY] || [];
      // Rehydrate dates that become strings after chrome.storage round-trip
      for (const p of profiles) {
        if (p.createdAt && typeof p.createdAt === 'string') p.createdAt = new Date(p.createdAt);
        if (p.updatedAt && typeof p.updatedAt === 'string') p.updatedAt = new Date(p.updatedAt);
      }
      console.log('[MasterProfileRepo] getAll - found', profiles.length, 'profiles');
      return profiles;
    } catch (error) {
      console.error('[MasterProfileRepo] getAll failed:', error);
      return [];
    }
  },

  /**
   * Get master profile by ID
   */
  async getById(id: string): Promise<MasterProfile | undefined> {
    try {
      const profiles = await this.getAll();
      const found = profiles.find((p) => p.id === id);
      console.log('[MasterProfileRepo] getById', id, '- found:', !!found);
      return found;
    } catch (error) {
      console.error('[MasterProfileRepo] getById failed:', error);
      return undefined;
    }
  },

  /**
   * Get the active master profile
   */
  async getActive(): Promise<MasterProfile | undefined> {
    try {
      const result = await chrome.storage.local.get(ACTIVE_KEY);
      const activeId = result[ACTIVE_KEY];
      console.log('[MasterProfileRepo] getActive - activeId:', activeId);
      if (!activeId) {
        // Return first profile if no active set
        const profiles = await this.getAll();
        console.log(
          '[MasterProfileRepo] No activeId, returning first profile:',
          profiles[0]?.personal?.fullName
        );
        return profiles[0];
      }
      return this.getById(activeId);
    } catch (error) {
      console.error('[MasterProfileRepo] getActive failed:', error);
      return undefined;
    }
  },

  /**
   * Save a new master profile
   */
  async save(profile: MasterProfile): Promise<MasterProfile> {
    try {
      console.log('[MasterProfileRepo] Saving profile:', profile.id, profile.personal?.fullName);
      const profiles = await this.getAll();
      const existingIndex = profiles.findIndex((p) => p.id === profile.id);

      if (existingIndex >= 0) {
        profiles[existingIndex] = {
          ...profile,
          updatedAt: new Date(),
        };
        console.log('[MasterProfileRepo] Updated existing profile at index', existingIndex);
      } else {
        profiles.push({
          ...profile,
          updatedAt: profile.updatedAt || new Date(),
        });
        console.log('[MasterProfileRepo] Added new profile, total:', profiles.length);
      }

      await chrome.storage.local.set({ [STORAGE_KEY]: profiles });
      console.log('[MasterProfileRepo] Saved to chrome.storage.local');

      // Set as active if it's the only one
      if (profiles.length === 1) {
        console.log('[MasterProfileRepo] Setting as active (first profile)');
        await this.setActive(profile.id);
      }

      return profile;
    } catch (error) {
      console.error('[MasterProfileRepo] save failed:', error);
      throw new Error(`Failed to save profile: ${(error as Error).message}`);
    }
  },

  /**
   * Update a master profile
   */
  async update(id: string, updates: Partial<MasterProfile>): Promise<MasterProfile | undefined> {
    try {
      const profiles = await this.getAll();
      const index = profiles.findIndex((p) => p.id === id);

      if (index < 0) {
        return undefined;
      }

      const updated = {
        ...profiles[index],
        ...updates,
        id, // Prevent ID change
        updatedAt: new Date(),
      };

      profiles[index] = updated;
      await chrome.storage.local.set({ [STORAGE_KEY]: profiles });

      return updated;
    } catch (error) {
      console.error('[MasterProfileRepo] update failed:', error);
      return undefined;
    }
  },

  /**
   * Delete a master profile
   */
  async delete(id: string): Promise<boolean> {
    try {
      const profiles = await this.getAll();
      const filtered = profiles.filter((p) => p.id !== id);

      if (filtered.length === profiles.length) {
        return false;
      }

      await chrome.storage.local.set({ [STORAGE_KEY]: filtered });

      // If deleted profile was active, switch to next available
      const result = await chrome.storage.local.get(ACTIVE_KEY);
      if (result[ACTIVE_KEY] === id) {
        if (filtered.length > 0) {
          await this.setActive(filtered[0].id);
        } else {
          await chrome.storage.local.remove(ACTIVE_KEY);
        }
      }

      return true;
    } catch (error) {
      console.error('[MasterProfileRepo] delete failed:', error);
      return false;
    }
  },

  /**
   * Set active master profile
   */
  async setActive(id: string): Promise<void> {
    try {
      await chrome.storage.local.set({ [ACTIVE_KEY]: id });
    } catch (error) {
      console.error('[MasterProfileRepo] setActive failed:', error);
    }
  },

  /**
   * Add a generated profile to a master profile
   */
  async addGeneratedProfile(
    masterProfileId: string,
    generatedProfile: GeneratedProfile
  ): Promise<MasterProfile | undefined> {
    try {
      const profile = await this.getById(masterProfileId);
      if (!profile) {
        return undefined;
      }

      const existingIndex =
        profile.generatedProfiles?.findIndex((p) => p.id === generatedProfile.id) ?? -1;

      if (existingIndex >= 0) {
        profile.generatedProfiles![existingIndex] = generatedProfile;
      } else {
        profile.generatedProfiles = [...(profile.generatedProfiles || []), generatedProfile];
      }

      const updated = await this.update(masterProfileId, {
        generatedProfiles: profile.generatedProfiles,
      });
      if (!updated) {
        console.error('[MasterProfileRepo] addGeneratedProfile: update returned undefined');
      }
      return updated;
    } catch (error) {
      console.error('[MasterProfileRepo] addGeneratedProfile failed:', error);
      return undefined;
    }
  },

  /**
   * Remove a generated profile
   */
  async removeGeneratedProfile(
    masterProfileId: string,
    generatedProfileId: string
  ): Promise<MasterProfile | undefined> {
    try {
      const profile = await this.getById(masterProfileId);
      if (!profile) {
        return undefined;
      }

      profile.generatedProfiles = (profile.generatedProfiles || []).filter(
        (p) => p.id !== generatedProfileId
      );

      return this.update(masterProfileId, { generatedProfiles: profile.generatedProfiles });
    } catch (error) {
      console.error('[MasterProfileRepo] removeGeneratedProfile failed:', error);
      return undefined;
    }
  },

  /**
   * Update answer bank
   */
  async updateAnswerBank(
    masterProfileId: string,
    questionType: string,
    answer: string
  ): Promise<MasterProfile | undefined> {
    try {
      const profile = await this.getById(masterProfileId);
      if (!profile) {
        return undefined;
      }

      profile.answerBank = {
        commonQuestions: profile.answerBank?.commonQuestions || [],
        patterns: profile.answerBank?.patterns || [],
        ...profile.answerBank,
        customAnswers: {
          ...(profile.answerBank?.customAnswers || {}),
          [questionType]: answer,
        },
      };

      return this.update(masterProfileId, { answerBank: profile.answerBank });
    } catch (error) {
      console.error('[MasterProfileRepo] updateAnswerBank failed:', error);
      return undefined;
    }
  },

  /**
   * Get storage usage
   */
  async getStorageUsage(): Promise<{ used: number; total: number }> {
    try {
      const result = await chrome.storage.local.getBytesInUse(STORAGE_KEY);
      return {
        used: result,
        total: 10 * 1024 * 1024, // 10MB quota (QUOTA_BYTES for chrome.storage.local)
      };
    } catch (error) {
      console.error('[MasterProfileRepo] getStorageUsage failed:', error);
      return { used: 0, total: 5 * 1024 * 1024 };
    }
  },
};
