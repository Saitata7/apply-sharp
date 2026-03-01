import { useState, useEffect, useMemo } from 'react';
import type { ApplicationStatus } from '@shared/types/application.types';
import { sendMessage } from '@shared/utils/messaging';
import ApplicationFilters from '../components/applications/ApplicationFilters';
import ApplicationListView from '../components/applications/ApplicationListView';
import ApplicationKanbanView from '../components/applications/ApplicationKanbanView';
import type { ApplicationWithJob } from '../components/applications/ApplicationCard';

type ViewMode = 'list' | 'board';

export default function ApplicationHistory() {
  const [applications, setApplications] = useState<ApplicationWithJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Filters
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [sponsorshipFilter, setSponsorshipFilter] = useState<'all' | 'available' | 'not_available'>(
    'all'
  );
  const [sortMode, setSortMode] = useState<'newest' | 'deadline'>('newest');

  useEffect(() => {
    loadApplications();
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
      console.error('[Applications] Failed to load:', error);
    } finally {
      setLoading(false);
    }
  }

  // Derive counts and platform list
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const app of applications) {
      c[app.status] = (c[app.status] || 0) + 1;
    }
    return c;
  }, [applications]);

  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const app of applications) {
      if (app.job?.platform) set.add(app.job.platform);
    }
    return Array.from(set).sort();
  }, [applications]);

  // Filter applications
  const filtered = useMemo(() => {
    let result = applications;

    if (statusFilter !== 'all') {
      result = result.filter((a) => a.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((a) => {
        const title = a.job?.title?.toLowerCase() || '';
        const company = a.job?.company?.toLowerCase() || '';
        return title.includes(q) || company.includes(q);
      });
    }

    if (platformFilter !== 'all') {
      result = result.filter((a) => a.job?.platform === platformFilter);
    }

    if (sponsorshipFilter !== 'all') {
      result = result.filter((a) => a.job?.sponsorshipStatus === sponsorshipFilter);
    }

    // Sort
    return [...result].sort((a, b) => {
      if (sortMode === 'deadline') {
        const da = a.job?.applicationDeadline
          ? new Date(a.job.applicationDeadline).getTime()
          : Infinity;
        const db = b.job?.applicationDeadline
          ? new Date(b.job.applicationDeadline).getTime()
          : Infinity;
        return da - db; // soonest deadline first
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [applications, statusFilter, searchQuery, platformFilter, sponsorshipFilter, sortMode]);

  // Handlers
  async function handleStatusChange(id: string, status: ApplicationStatus, note?: string) {
    try {
      const response = await sendMessage({
        type: 'UPDATE_APPLICATION_STATUS',
        payload: { id, status, note },
      });
      if (response.success) {
        setApplications((prev) =>
          prev.map((a) =>
            a.id === id
              ? {
                  ...a,
                  status,
                  statusHistory: [
                    ...(a.statusHistory || []),
                    { from: a.status, to: status, changedAt: new Date(), note },
                  ],
                  updatedAt: new Date(),
                }
              : a
          )
        );
      }
    } catch (error) {
      console.error('[ApplicationHistory] Status change failed:', error);
    }
  }

  async function handleDelete(id: string) {
    try {
      const response = await sendMessage({ type: 'DELETE_APPLICATION', payload: id });
      if (response.success) {
        setApplications((prev) => prev.filter((a) => a.id !== id));
      }
    } catch (error) {
      console.error('[ApplicationHistory] Delete failed:', error);
    }
  }

  // Bulk archive
  const oldAppsCount = useMemo(() => {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    return applications.filter(
      (a) => new Date(a.createdAt).getTime() < cutoff && a.status !== 'expired'
    ).length;
  }, [applications]);

  async function handleBulkArchive() {
    const response = await sendMessage({
      type: 'BULK_ARCHIVE_APPLICATIONS',
      payload: { olderThanDays: 90 },
    });
    if (response.success) {
      await loadApplications();
    }
  }

  if (loading) {
    return <div className="page-loading">Loading applications...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="header-with-actions">
          <div>
            <h1>Applications</h1>
            <p className="page-description">Track your job applications and their status</p>
          </div>
          <div className="view-toggle">
            <button
              className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
            <button
              className={`toggle-btn ${viewMode === 'board' ? 'active' : ''}`}
              onClick={() => setViewMode('board')}
              title="Board view"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <ApplicationFilters
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        platformFilter={platformFilter}
        onPlatformChange={setPlatformFilter}
        platforms={platforms}
        counts={counts}
        sponsorshipFilter={sponsorshipFilter}
        onSponsorshipChange={setSponsorshipFilter}
        sortMode={sortMode}
        onSortChange={setSortMode}
      />

      {oldAppsCount > 0 && (
        <div className="bulk-archive-bar">
          <span>
            {oldAppsCount} application{oldAppsCount !== 1 ? 's' : ''} older than 90 days
          </span>
          <button className="btn btn-ghost btn-sm" onClick={handleBulkArchive}>
            Archive All
          </button>
        </div>
      )}

      {applications.length === 0 ? (
        <div className="empty-state large">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M20 7h-4V4a2 2 0 0 0-2-2H10a2 2 0 0 0-2 2v3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM10 4h4v3h-4V4z" />
          </svg>
          <h3>No applications tracked yet</h3>
          <p>
            Visit a job posting and save it, or applications will appear here when you use the
            autofill feature.
          </p>
        </div>
      ) : viewMode === 'list' ? (
        <ApplicationListView
          applications={filtered}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
        />
      ) : (
        <ApplicationKanbanView applications={filtered} onStatusChange={handleStatusChange} />
      )}
    </div>
  );
}
