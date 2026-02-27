import { useState } from 'react';
import type { Application } from '@shared/types/application.types';
import type { ApplicationWithJob } from './ApplicationCard';
import StatusDropdown from './StatusDropdown';
import StatusTimeline from './StatusTimeline';

interface ApplicationListViewProps {
  applications: ApplicationWithJob[];
  onStatusChange: (id: string, status: Application['status'], note?: string) => void;
  onDelete: (id: string) => void;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getPlatformLabel(platform: string): string {
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

export default function ApplicationListView({
  applications,
  onStatusChange,
  onDelete,
}: ApplicationListViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (applications.length === 0) {
    return (
      <div className="empty-state">
        <p>No applications match your filters</p>
      </div>
    );
  }

  return (
    <div className="app-list-view">
      <table className="app-list-table">
        <thead>
          <tr>
            <th>Job Title</th>
            <th>Company</th>
            <th>Platform</th>
            <th>Status</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((app) => {
            const isExpanded = expandedId === app.id;
            const title = app.job?.title || 'Unknown Position';
            const company = app.job?.company || 'Unknown Company';
            const platform = app.job?.platform || 'manual';
            const url = app.job?.url;

            return (
              <tr key={app.id} className="app-list-item-wrapper">
                <td colSpan={6} style={{ padding: 0, border: 'none' }}>
                  <div
                    className={`app-list-row ${isExpanded ? 'expanded' : ''}`}
                    onClick={() => setExpandedId(isExpanded ? null : app.id)}
                  >
                    <div className="app-list-cell title-cell">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={`expand-chevron ${isExpanded ? 'open' : ''}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="app-card-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {title}
                        </a>
                      ) : (
                        <span>{title}</span>
                      )}
                    </div>
                    <div className="app-list-cell">{company}</div>
                    <div className="app-list-cell">
                      <span className="platform-tag">{getPlatformLabel(platform)}</span>
                    </div>
                    <div className="app-list-cell" onClick={(e) => e.stopPropagation()}>
                      <StatusDropdown
                        currentStatus={app.status}
                        onStatusChange={(status, note) => onStatusChange(app.id, status, note)}
                      />
                    </div>
                    <div className="app-list-cell">{formatDate(app.createdAt)}</div>
                    <div className="app-list-cell" onClick={(e) => e.stopPropagation()}>
                      <div className="app-list-actions">
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-ghost btn-xs"
                            title="Open job posting"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </a>
                        )}
                        <button
                          className="btn btn-ghost btn-xs btn-danger-text"
                          onClick={() => onDelete(app.id)}
                          title="Delete application"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="app-list-expanded">
                      <div className="expanded-grid">
                        <div className="expanded-section">
                          <h4>Status Timeline</h4>
                          <StatusTimeline
                            history={app.statusHistory}
                            currentStatus={app.status}
                            createdAt={app.createdAt}
                          />
                        </div>
                        <div className="expanded-section">
                          <h4>Details</h4>
                          <div className="detail-items">
                            {app.job?.location && (
                              <div className="detail-item">
                                <span className="detail-label">Location</span>
                                <span>{app.job.location}</span>
                              </div>
                            )}
                            {app.submittedVia && (
                              <div className="detail-item">
                                <span className="detail-label">Submitted via</span>
                                <span>{app.submittedVia.replace('_', ' ')}</span>
                              </div>
                            )}
                            {app.userNotes && (
                              <div className="detail-item">
                                <span className="detail-label">Notes</span>
                                <span>{app.userNotes}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
