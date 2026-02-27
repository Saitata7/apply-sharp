import { useState, useEffect } from 'react';
import type { Job } from '@shared/types/job.types';

export default function ApplicationHistory() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'saved' | 'applied'>('all');

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    const stored = await chrome.storage.local.get('jobs');
    if (stored.jobs) {
      setJobs(stored.jobs);
    }
    setLoading(false);
  }

  function formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function getPlatformIcon(platform: string): string {
    switch (platform) {
      case 'linkedin':
        return 'LinkedIn';
      case 'indeed':
        return 'Indeed';
      case 'greenhouse':
        return 'Greenhouse';
      case 'lever':
        return 'Lever';
      case 'workday':
        return 'Workday';
      default:
        return platform.charAt(0).toUpperCase() + platform.slice(1);
    }
  }

  if (loading) {
    return <div className="page-loading">Loading history...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Application History</h1>
        <p className="page-description">
          Track your job applications and their status
        </p>
      </div>

      <div className="history-filters">
        <button
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({jobs.length})
        </button>
        <button
          className={`filter-btn ${filter === 'saved' ? 'active' : ''}`}
          onClick={() => setFilter('saved')}
        >
          Saved
        </button>
        <button
          className={`filter-btn ${filter === 'applied' ? 'active' : ''}`}
          onClick={() => setFilter('applied')}
        >
          Applied
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="empty-state large">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M20 7h-4V4a2 2 0 0 0-2-2H10a2 2 0 0 0-2 2v3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM10 4h4v3h-4V4z"/>
          </svg>
          <h3>No jobs saved yet</h3>
          <p>
            Visit a job posting on LinkedIn, Indeed, Greenhouse, or Lever
            and ApplySharp will automatically detect it.
          </p>
        </div>
      ) : (
        <div className="history-table-container">
          <table className="history-table">
            <thead>
              <tr>
                <th>Job Title</th>
                <th>Company</th>
                <th>Platform</th>
                <th>Date Saved</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <a href={job.url} target="_blank" rel="noopener noreferrer" className="job-link">
                      {job.title}
                    </a>
                  </td>
                  <td>{job.company}</td>
                  <td>
                    <span className="platform-badge">{getPlatformIcon(job.platform)}</span>
                  </td>
                  <td>{formatDate(job.createdAt)}</td>
                  <td>
                    <div className="action-buttons">
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-secondary"
                      >
                        View
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="history-stats">
        <div className="stat-card">
          <div className="stat-value">{jobs.length}</div>
          <div className="stat-label">Total Jobs Saved</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {new Set(jobs.map((j) => j.company)).size}
          </div>
          <div className="stat-label">Unique Companies</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {new Set(jobs.map((j) => j.platform)).size}
          </div>
          <div className="stat-label">Platforms Used</div>
        </div>
      </div>
    </div>
  );
}
