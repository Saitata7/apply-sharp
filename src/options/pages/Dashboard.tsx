import { useState, useEffect, useMemo } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import type { ApplicationStatus } from '@shared/types/application.types';
import type { ApplicationWithJob } from '../components/applications/ApplicationCard';
import type { Job } from '@shared/types/job.types';
import { useProfile } from '../context/ProfileContext';
import StatsSummary from '../components/analytics/StatsSummary';
import FunnelChart from '../components/analytics/FunnelChart';
import TopKeywords from '../components/analytics/TopKeywords';

interface DashboardProps {
  onNavigate: (tab: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { profile, allProfiles } = useProfile();
  const [applications, setApplications] = useState<ApplicationWithJob[]>([]);
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [learningInsights, setLearningInsights] = useState<{
    topKeywords?: { keyword: string; score: number }[];
  } | null>(null);
  const [improvements, setImprovements] = useState<
    Array<{ type: string; title: string; description: string; priority: string }>
  >([]);

  useEffect(() => {
    Promise.all([loadApplications(), loadInsights(), loadSavedJobs(), loadImprovements()]).finally(
      () => setLoading(false)
    );
  }, []);

  async function loadApplications() {
    try {
      const response = await sendMessage<void, ApplicationWithJob[]>({
        type: 'GET_APPLICATIONS_WITH_JOBS',
      });
      if (response.success && response.data) {
        setApplications(response.data);
      }
    } catch (error) {
      console.error('[Dashboard] Failed to load applications:', error);
    }
  }

  async function loadInsights() {
    try {
      const response = await sendMessage<
        void,
        { topKeywords?: { keyword: string; score: number }[] }
      >({
        type: 'GET_LEARNING_INSIGHTS',
      });
      if (response.success && response.data) {
        setLearningInsights(response.data);
      }
    } catch {
      // Learning insights are optional
    }
  }

  async function loadImprovements() {
    try {
      const response = await sendMessage<
        void,
        Array<{ type: string; title: string; description: string; priority: string }>
      >({
        type: 'GET_IMPROVEMENTS',
      });
      if (response.success && response.data) {
        setImprovements(response.data.slice(0, 3));
      }
    } catch {
      // Non-critical
    }
  }

  async function loadSavedJobs() {
    try {
      const response = await sendMessage<number, Job[]>({
        type: 'GET_RECENT_JOBS',
        payload: 50,
      });
      if (response.success && response.data) {
        setSavedJobs(response.data);
      }
    } catch {
      // Non-critical
    }
  }

  const stats = useMemo(() => {
    const total = applications.length;
    if (total === 0) return { total: 0, responseRate: 0, interviewRate: 0, offerRate: 0 };

    const responded = applications.filter((a) =>
      ['under_review', 'interview', 'offer', 'rejected'].includes(a.status)
    ).length;
    const interviewed = applications.filter((a) =>
      ['interview', 'offer'].includes(a.status)
    ).length;
    const offers = applications.filter((a) => a.status === 'offer').length;

    return {
      total,
      responseRate: total > 0 ? Math.round((responded / total) * 100) : 0,
      interviewRate: total > 0 ? Math.round((interviewed / total) * 100) : 0,
      offerRate: total > 0 ? Math.round((offers / total) * 100) : 0,
    };
  }, [applications]);

  const funnelStages = useMemo(() => {
    const countByStatus = (statuses: ApplicationStatus[]) =>
      applications.filter((a) => statuses.includes(a.status)).length;

    return [
      { label: 'Saved', count: countByStatus(['saved', 'in_progress']), color: 'slate' },
      { label: 'Submitted', count: countByStatus(['submitted', 'under_review']), color: 'blue' },
      { label: 'Interview', count: countByStatus(['interview']), color: 'cyan' },
      { label: 'Offer', count: countByStatus(['offer']), color: 'green' },
      { label: 'Rejected', count: countByStatus(['rejected']), color: 'red' },
    ];
  }, [applications]);

  const topKeywords = useMemo(() => {
    return learningInsights?.topKeywords || [];
  }, [learningInsights]);

  const recentApps = useMemo(() => {
    return [...applications]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [applications]);

  const [aiConfigured, setAiConfigured] = useState(false);

  useEffect(() => {
    sendMessage<void, { provider?: string }>({ type: 'GET_SETTINGS' })
      .then((res) => {
        if (res?.success && res.data?.provider) {
          setAiConfigured(true);
        }
      })
      .catch(() => {
        /* non-critical */
      });
  }, []);

  const profileCompleteness = useMemo(() => {
    if (!profile) return { score: 0, items: [] as { label: string; done: boolean }[] };
    const items = [
      { label: 'Resume uploaded', done: (profile.experience?.length ?? 0) > 0 },
      { label: 'Skills extracted', done: (profile.skills?.technical?.length ?? 0) > 0 },
      {
        label: 'Role profiles created',
        done: (profile.generatedProfiles?.length ?? 0) > 0,
      },
      {
        label: 'AI provider configured',
        done: aiConfigured,
      },
    ];
    const done = items.filter((i) => i.done).length;
    return { score: Math.round((done / items.length) * 100), items };
  }, [profile, aiConfigured]);

  if (loading) {
    return (
      <div className="page-loading" role="status">
        Loading dashboard...
      </div>
    );
  }

  const name = profile?.personal?.fullName?.split(' ')[0] || 'there';
  const roleCount = profile?.generatedProfiles?.length ?? 0;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Welcome back, {name}</h1>
        <p className="page-description">
          {allProfiles.length} workspace{allProfiles.length !== 1 ? 's' : ''}
          {roleCount > 0 && ` \u00B7 ${roleCount} role profile${roleCount !== 1 ? 's' : ''}`}
          {profile?.careerContext?.yearsOfExperience != null &&
            ` \u00B7 ${profile.careerContext.yearsOfExperience}+ years experience`}
        </p>
      </div>

      <StatsSummary
        total={stats.total}
        responseRate={stats.responseRate}
        interviewRate={stats.interviewRate}
        offerRate={stats.offerRate}
      />

      <div className="analytics-grid">
        <FunnelChart stages={funnelStages} />

        <div className="analytics-card">
          <h3 className="analytics-card-title">Recent Applications</h3>
          {recentApps.length === 0 ? (
            <div className="analytics-empty">
              No applications yet. Start applying to track progress.
            </div>
          ) : (
            <div className="dashboard-recent-list">
              {recentApps.map((app) => (
                <div key={app.id} className="dashboard-recent-item">
                  <div className="dashboard-recent-info">
                    <span className="dashboard-recent-title">
                      {app.job?.title || 'Unknown Role'}
                    </span>
                    <span className="dashboard-recent-company">
                      {app.job?.company || 'Unknown Company'}
                    </span>
                  </div>
                  <span className={`dashboard-status dashboard-status--${app.status}`}>
                    {app.status.replaceAll('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {savedJobs.length > 0 && (
        <div className="analytics-card" style={{ marginBottom: '1.5rem' }}>
          <h3 className="analytics-card-title">Saved Jobs ({savedJobs.length})</h3>
          <div className="dashboard-recent-list">
            {savedJobs.slice(0, 10).map((job) => (
              <div key={job.id} className="dashboard-recent-item">
                <div className="dashboard-recent-info">
                  <span className="dashboard-recent-title">{job.title}</span>
                  <span className="dashboard-recent-company">
                    {job.company} {job.location ? `\u00B7 ${job.location}` : ''}
                  </span>
                </div>
                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dashboard-status"
                    style={{ textDecoration: 'none', fontSize: '0.75rem' }}
                  >
                    View
                  </a>
                )}
              </div>
            ))}
            {savedJobs.length > 10 && (
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                ...and {savedJobs.length - 10} more
              </p>
            )}
          </div>
        </div>
      )}

      {improvements.length > 0 && (
        <div className="analytics-card" style={{ marginBottom: '1.5rem' }}>
          <h3 className="analytics-card-title">Learning Suggestions</h3>
          <div className="dashboard-recent-list">
            {improvements.map((imp) => (
              <div key={`${imp.type}-${imp.title}`} className="dashboard-recent-item">
                <div className="dashboard-recent-info">
                  <span className="dashboard-recent-title">{imp.title}</span>
                  <span className="dashboard-recent-company">{imp.description}</span>
                </div>
                <span
                  className={`dashboard-status dashboard-status--${imp.priority === 'high' ? 'interview' : 'submitted'}`}
                >
                  {imp.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="analytics-grid">
        <TopKeywords keywords={topKeywords.slice(0, 5)} />

        <div className="analytics-card">
          <h3 className="analytics-card-title">Quick Actions</h3>
          <div className="dashboard-actions">
            <button className="dashboard-action-btn" onClick={() => onNavigate('resume')}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
              Upload Resume
            </button>
            <button className="dashboard-action-btn" onClick={() => onNavigate('atsscore')}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              ATS Score
            </button>
            <button className="dashboard-action-btn" onClick={() => onNavigate('profiles')}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Generate Resume
            </button>
            <button className="dashboard-action-btn" onClick={() => onNavigate('analytics')}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              Full Analytics
            </button>
          </div>

          {profileCompleteness.score < 100 && (
            <div className="dashboard-completeness">
              <h4 className="dashboard-completeness-title">
                Profile Setup — {profileCompleteness.score}%
              </h4>
              <div
                className="dashboard-progress-bar"
                role="progressbar"
                aria-valuenow={profileCompleteness.score}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Profile setup ${profileCompleteness.score}% complete`}
              >
                <div
                  className="dashboard-progress-fill"
                  style={{ width: `${profileCompleteness.score}%` }}
                />
              </div>
              <ul className="dashboard-checklist">
                {profileCompleteness.items.map((item) => (
                  <li key={item.label} className={item.done ? 'done' : ''}>
                    {item.done ? '\u2713' : '\u2022'} {item.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
