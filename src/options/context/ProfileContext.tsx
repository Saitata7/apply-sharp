import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { MasterProfile } from '@shared/types/master-profile.types';
import { sendMessage } from '@shared/utils/messaging';

interface ProfileContextType {
  // Current active workspace
  profile: MasterProfile | null;
  // All available workspaces
  allProfiles: MasterProfile[];
  isLoading: boolean;
  error: string | null;
  // Actions
  setProfile: (profile: MasterProfile | null) => void;
  switchWorkspace: (profileId: string) => Promise<void>;
  deleteWorkspace: (profileId: string) => Promise<boolean>;
  updateProfile: (updates: Partial<MasterProfile>) => Promise<boolean>;
  refreshProfile: () => Promise<void>;
  refreshAllProfiles: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<MasterProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = { current: false }; // Guard against concurrent loads

  // Load all workspaces
  const loadAllProfiles = useCallback(async () => {
    try {
      console.debug('[ProfileContext] Loading all workspaces...');
      const response = await sendMessage<void, MasterProfile[]>({
        type: 'GET_MASTER_PROFILES',
      });

      if (response.success && response.data) {
        console.debug('[ProfileContext] Found', response.data.length, 'workspaces');
        setAllProfiles(response.data);
        return response.data;
      }
      return [];
    } catch (err) {
      console.error('[ProfileContext] Error loading workspaces:', err);
      return [];
    }
  }, []);

  // Load active workspace (with concurrent call guard)
  const loadActiveProfile = useCallback(async () => {
    if (loadingRef.current) return; // Prevent concurrent loads
    loadingRef.current = true;

    let retryCount = 0;
    const maxRetries = 3;

    const attemptLoad = async (): Promise<void> => {
      try {
        const response = await sendMessage<void, MasterProfile | null>({
          type: 'GET_ACTIVE_MASTER_PROFILE',
        });

        if (response.success && response.data) {
          setProfile(response.data);
          setIsLoading(false);
          setError(null);
        } else if (retryCount < maxRetries) {
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, 300));
          return attemptLoad();
        } else {
          setProfile(null);
          setIsLoading(false);
          setError(null);
        }
      } catch (err) {
        console.error('[ProfileContext] Error loading workspace:', err);
        if (retryCount < maxRetries) {
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, 300));
          return attemptLoad();
        } else {
          setIsLoading(false);
          setError('Failed to load workspace');
        }
      }
    };

    try {
      await attemptLoad();
    } finally {
      loadingRef.current = false;
    }
  }, []);

  // Switch to a different workspace
  const switchWorkspace = useCallback(async (profileId: string) => {
    console.debug('[ProfileContext] Switching to workspace:', profileId);
    setIsLoading(true);

    try {
      const response = await sendMessage<string, MasterProfile>({
        type: 'SET_ACTIVE_MASTER_PROFILE',
        payload: profileId,
      });

      if (response.success && response.data) {
        console.debug('[ProfileContext] Switched to:', response.data.personal?.fullName);
        setProfile(response.data);
      }
    } catch (err) {
      console.error('[ProfileContext] Error switching workspace:', err);
      setError('Failed to switch workspace');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh current workspace (no loading flash — data stays visible during refresh)
  const refreshProfile = useCallback(async () => {
    await loadActiveProfile();
  }, [loadActiveProfile]);

  // Refresh all workspaces list
  const refreshAllProfiles = useCallback(async () => {
    await loadAllProfiles();
  }, [loadAllProfiles]);

  // Delete a workspace
  const deleteWorkspace = useCallback(
    async (profileId: string): Promise<boolean> => {
      console.debug('[ProfileContext] Deleting workspace:', profileId);

      try {
        const response = await sendMessage<string, { deleted: boolean }>({
          type: 'DELETE_MASTER_PROFILE',
          payload: profileId,
        });

        if (response.success) {
          console.debug('[ProfileContext] Workspace deleted successfully');
          // Refresh all profiles
          await loadAllProfiles();
          // If this was the active profile, clear it and load another
          if (profile?.id === profileId) {
            setProfile(null);
            await loadActiveProfile();
          }
          return true;
        } else {
          console.error('[ProfileContext] Failed to delete workspace:', response.error);
          return false;
        }
      } catch (err) {
        console.error('[ProfileContext] Error deleting workspace:', err);
        return false;
      }
    },
    [profile?.id, loadAllProfiles, loadActiveProfile]
  );

  // Update the current profile
  const updateProfile = useCallback(
    async (updates: Partial<MasterProfile>): Promise<boolean> => {
      if (!profile) {
        console.error('[ProfileContext] No active profile to update');
        return false;
      }

      console.log('[ProfileContext] Updating profile:', profile.id);

      try {
        const response = await sendMessage<
          { id: string; updates: Partial<MasterProfile> },
          MasterProfile
        >({
          type: 'UPDATE_MASTER_PROFILE',
          payload: { id: profile.id, updates },
        });

        if (response.success && response.data) {
          console.log('[ProfileContext] Profile updated successfully');
          setProfile(response.data);
          // Also refresh the all profiles list
          await loadAllProfiles();
          return true;
        } else {
          console.error('[ProfileContext] Failed to update profile:', response.error);
          return false;
        }
      } catch (err) {
        console.error('[ProfileContext] Error updating profile:', err);
        return false;
      }
    },
    [profile, loadAllProfiles]
  );

  // Initial load
  useEffect(() => {
    const initialize = async () => {
      await loadAllProfiles();
      await loadActiveProfile();
    };
    initialize();
  }, [loadAllProfiles, loadActiveProfile]);

  return (
    <ProfileContext.Provider
      value={{
        profile,
        allProfiles,
        isLoading,
        error,
        setProfile,
        switchWorkspace,
        deleteWorkspace,
        updateProfile,
        refreshProfile,
        refreshAllProfiles,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}
