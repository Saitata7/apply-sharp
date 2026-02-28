import { useState, useEffect } from 'react';
import type { ResumeProfile } from '@shared/types/profile.types';
import type { Job } from '@shared/types/job.types';
import { sendMessage } from '@shared/utils/messaging';

interface CurrentJob {
  title: string;
  company: string;
  location?: string;
  platform: string;
}

export default function App() {
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<ResumeProfile | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [currentJob, setCurrentJob] = useState<CurrentJob | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    checkCurrentTab();
  }, []);

  async function loadData() {
    try {
      const [profilesRes, currentRes, jobsRes] = await Promise.all([
        sendMessage<void, ResumeProfile[]>({ type: 'GET_PROFILES' }),
        sendMessage<void, ResumeProfile>({ type: 'GET_CURRENT_PROFILE' }),
        sendMessage<number, Job[]>({ type: 'GET_RECENT_JOBS', payload: 5 }),
      ]);

      if (profilesRes.success && profilesRes.data) {
        setProfiles(profilesRes.data);
      }
      if (currentRes.success && currentRes.data) {
        setCurrentProfile(currentRes.data);
      }
      if (jobsRes.success && jobsRes.data) {
        setRecentJobs(jobsRes.data);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function checkCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_JOB' });
        if (response?.success && response.data) {
          setCurrentJob(response.data);
        }
      }
    } catch {
      // Content script not loaded on this page
    }
  }

  async function handleProfileChange(profileId: string) {
    try {
      const response = await sendMessage<string, ResumeProfile>({
        type: 'SET_CURRENT_PROFILE',
        payload: profileId,
      });
      if (response.success && response.data) {
        setCurrentProfile(response.data);
      }
    } catch (error) {
      console.error('[Popup] Failed to change profile:', error);
    }
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  if (loading) {
    return (
      <div className="popup-container">
        <div className="loading" role="status">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <header className="popup-header">
        <div className="header-title">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M20 7h-4V4a2 2 0 0 0-2-2H10a2 2 0 0 0-2 2v3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM10 4h4v3h-4V4z" />
          </svg>
          <span>ApplySharp</span>
        </div>
        <button
          className="icon-btn"
          onClick={openOptions}
          title="Settings"
          aria-label="Open settings"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v6m0 6v10M4.22 4.22l4.24 4.24m7.07 7.07l4.24 4.24M1 12h6m6 0h10M4.22 19.78l4.24-4.24m7.07-7.07l4.24-4.24" />
          </svg>
        </button>
      </header>

      {currentJob && (
        <section className="current-job">
          <div className="section-label">Current Job</div>
          <div className="job-card highlighted">
            <div className="job-title">{currentJob.title}</div>
            <div className="job-company">{currentJob.company}</div>
            {currentJob.location && <div className="job-location">{currentJob.location}</div>}
          </div>
        </section>
      )}

      <section className="profile-section">
        <div className="section-label">Active Profile</div>
        {profiles.length > 0 ? (
          <select
            className="profile-select"
            value={currentProfile?.id || ''}
            onChange={(e) => handleProfileChange(e.target.value)}
            aria-label="Active profile"
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        ) : (
          <button className="btn btn-primary full-width" onClick={openOptions}>
            Create Your First Profile
          </button>
        )}
      </section>

      {recentJobs.length > 0 && (
        <section className="recent-jobs">
          <div className="section-label">Recent Jobs</div>
          <div className="job-list">
            {recentJobs.map((job) => (
              <a
                key={job.id}
                href={job.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="job-card"
              >
                <div className="job-title">{job.title}</div>
                <div className="job-company">{job.company}</div>
              </a>
            ))}
          </div>
        </section>
      )}

      <footer className="popup-footer">
        <button className="btn btn-secondary" onClick={openOptions}>
          Manage Profiles
        </button>
      </footer>
    </div>
  );
}
