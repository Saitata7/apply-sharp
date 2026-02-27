import type { ApplicationStatus } from '@shared/types/application.types';
import ApplicationCard from './ApplicationCard';
import type { ApplicationWithJob } from './ApplicationCard';

interface ApplicationKanbanViewProps {
  applications: ApplicationWithJob[];
  onStatusChange: (id: string, status: ApplicationStatus, note?: string) => void;
}

const KANBAN_COLUMNS: { status: ApplicationStatus; label: string; color: string }[] = [
  { status: 'saved', label: 'Saved', color: 'slate' },
  { status: 'in_progress', label: 'In Progress', color: 'amber' },
  { status: 'submitted', label: 'Submitted', color: 'blue' },
  { status: 'under_review', label: 'Under Review', color: 'violet' },
  { status: 'interview', label: 'Interview', color: 'cyan' },
  { status: 'offer', label: 'Offer', color: 'green' },
  { status: 'rejected', label: 'Rejected', color: 'red' },
];

export default function ApplicationKanbanView({
  applications,
  onStatusChange,
}: ApplicationKanbanViewProps) {
  const grouped = KANBAN_COLUMNS.map((col) => ({
    ...col,
    apps: applications.filter((app) => app.status === col.status),
  }));

  return (
    <div className="kanban-board">
      {grouped.map((col) => (
        <div key={col.status} className="kanban-column">
          <div className={`kanban-column-header kanban-header--${col.color}`}>
            <span className="kanban-column-title">{col.label}</span>
            <span className="kanban-column-count">{col.apps.length}</span>
          </div>
          <div className="kanban-column-body">
            {col.apps.length === 0 ? (
              <div className="kanban-empty">No applications</div>
            ) : (
              col.apps.map((app) => (
                <ApplicationCard key={app.id} app={app} onStatusChange={onStatusChange} compact />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
