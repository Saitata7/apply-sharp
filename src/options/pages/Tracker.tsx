/**
 * Tracker page (Workstream 4 UI).
 *
 * Wraps the new application tracker on top of the Workstream 4 backend
 * (extended Application type, analytics, ghost detector, follow-up
 * scheduler). Default view is a list because heavy users with 100+ apps
 * live in lists; kanban is a toggle for the visual-progress view.
 *
 * Pulls applications via the existing GET_APPLICATIONS message handler.
 * Uses the new applicationRepo.archive and updateStatus paths via
 * UPDATE_APPLICATION_STATUS / ARCHIVE_APPLICATION message types.
 */

import { useEffect, useState, useCallback } from 'react';
import type { Application, ApplicationStatus } from '@shared/types/application.types';
import { sendMessage } from '@shared/utils/messaging';
import TrackerFilters, {
  DEFAULT_FILTERS,
  type TrackerFilterState,
} from '../components/tracker/TrackerFilters';
import TrackerList from '../components/tracker/TrackerList';
import TrackerKanban from '../components/tracker/TrackerKanban';
import JDSnapshotModal from '../components/tracker/JDSnapshotModal';
import ResponseRateByResume from '../components/tracker/ResponseRateByResume';

type View = 'list' | 'kanban';

function applyFilters(apps: Application[], filters: TrackerFilterState): Application[] {
  return apps.filter((app) => {
    if (filters.hideArchived && app.archived) return false;
    if (filters.status !== 'all' && app.status !== filters.status) return false;
    if (filters.source !== 'all' && app.source !== filters.source) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const company = app.jdSnapshot?.company?.toLowerCase() ?? '';
      const title = app.jdSnapshot?.title?.toLowerCase() ?? '';
      if (!company.includes(q) && !title.includes(q)) return false;
    }
    return true;
  });
}

export default function Tracker() {
  const [view, setView] = useState<View>('list');
  const [applications, setApplications] = useState<Application[]>([]);
  const [filters, setFilters] = useState<TrackerFilterState>(DEFAULT_FILTERS);
  const [snapshotApp, setSnapshotApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await sendMessage<void, Application[]>({ type: 'GET_APPLICATIONS' });
      if (res?.success && res.data) {
        setApplications(res.data);
      } else {
        setError(res?.error ?? 'Failed to load applications');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleArchive = useCallback(
    async (id: string) => {
      try {
        // UPDATE_APPLICATION accepts a partial Application patch.
        // Build the payload with the typed shape so the archived field
        // is preserved through the validator (the previous version cast
        // away the `archived: true` and silently no-op'd archive in the
        // background handler).
        await sendMessage<{ id: string; updates: Partial<Application> }, Application>({
          type: 'UPDATE_APPLICATION',
          payload: { id, updates: { archived: true } },
        });
        await reload();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [reload]
  );

  const handleChangeStatus = useCallback(
    async (id: string, status: ApplicationStatus) => {
      try {
        await sendMessage<{ id: string; status: ApplicationStatus }, Application>({
          type: 'UPDATE_APPLICATION_STATUS',
          payload: { id, status },
        });
        await reload();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [reload]
  );

  const filtered = applyFilters(applications, filters);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Application Tracker</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
            Auto-detected applications, ghost detector, follow-up reminders, and the response rate
            by resume version chart no other tool can show you.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: view === 'list' ? '#0f1419' : '#fff',
              color: view === 'list' ? '#fff' : '#0f1419',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            List
          </button>
          <button
            onClick={() => setView('kanban')}
            aria-pressed={view === 'kanban'}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: view === 'kanban' ? '#0f1419' : '#fff',
              color: view === 'kanban' ? '#fff' : '#0f1419',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Kanban
          </button>
        </div>
      </header>

      <div style={{ marginBottom: 16 }}>
        <ResponseRateByResume applications={applications} />
      </div>

      <TrackerFilters
        filters={filters}
        onChange={setFilters}
        totalCount={applications.length}
        filteredCount={filtered.length}
      />

      {error && (
        <div
          role="alert"
          style={{
            padding: 12,
            marginBottom: 12,
            background: '#fef2f2',
            color: '#b91c1c',
            border: '1px solid #fecaca',
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div
          style={{
            padding: 48,
            textAlign: 'center',
            color: 'var(--tx-secondary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div className="spinner" aria-hidden="true" />
          <span>Loading…</span>
        </div>
      )}

      {!loading && view === 'list' && (
        <TrackerList
          applications={filtered}
          onArchive={handleArchive}
          onChangeStatus={handleChangeStatus}
          onViewSnapshot={(app) => setSnapshotApp(app)}
          hasAnyData={applications.length > 0}
          onClearFilters={() => setFilters(DEFAULT_FILTERS)}
        />
      )}

      {!loading && view === 'kanban' && (
        <TrackerKanban applications={filtered} onChangeStatus={handleChangeStatus} />
      )}

      <JDSnapshotModal application={snapshotApp} onClose={() => setSnapshotApp(null)} />
    </div>
  );
}
