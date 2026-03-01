import type { Application } from '@shared/types/application.types';
import type { Job } from '@shared/types/job.types';
import StatusDropdown from './StatusDropdown';

export interface ApplicationWithJob extends Application {
  job: Job | null;
}

interface ApplicationCardProps {
  app: ApplicationWithJob;
  onStatusChange: (id: string, status: Application['status'], note?: string) => void;
  onClick?: () => void;
  compact?: boolean;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function getPlatformLabel(platform: string): string {
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function formatDeadlineShort(deadline: Date | string): string {
  const d = new Date(deadline);
  // Normalize both to midnight UTC to avoid timezone discrepancies
  const deadlineUTC = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const now = new Date();
  const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.ceil((deadlineUTC - nowUTC) / (24 * 60 * 60 * 1000));
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (daysLeft < 0) return `Due ${dateStr} (passed)`;
  if (daysLeft === 0) return `Due today!`;
  if (daysLeft === 1) return `Due tomorrow`;
  return `Due ${dateStr} (${daysLeft}d)`;
}

function getDeadlineClass(deadline: Date | string): string {
  const d = new Date(deadline);
  const deadlineUTC = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const now = new Date();
  const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.ceil((deadlineUTC - nowUTC) / (24 * 60 * 60 * 1000));
  if (daysLeft <= 1) return 'deadline-urgent';
  if (daysLeft <= 7) return 'deadline-soon';
  return '';
}

export default function ApplicationCard({
  app,
  onStatusChange,
  onClick,
  compact,
}: ApplicationCardProps) {
  const title = app.job?.title || 'Unknown Position';
  const company = app.job?.company || 'Unknown Company';
  const platform = app.job?.platform || 'manual';
  const url = app.job?.url;

  return (
    <div className={`application-card ${compact ? 'compact' : ''}`} onClick={onClick}>
      <div className="app-card-header">
        <div className="app-card-title">
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
          <span className="app-card-company">{company}</span>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <StatusDropdown
            currentStatus={app.status}
            onStatusChange={(status, note) => onStatusChange(app.id, status, note)}
          />
        </div>
      </div>

      {!compact && (
        <div className="app-card-meta">
          <span className="platform-tag">{getPlatformLabel(platform)}</span>
          <span className="app-card-date">{formatDate(app.createdAt)}</span>
          {app.appliedAt && (
            <span className="app-card-applied">Applied {formatDate(app.appliedAt)}</span>
          )}
          {app.job?.applicationDeadline && (
            <span className={`app-card-deadline ${getDeadlineClass(app.job.applicationDeadline)}`}>
              {formatDeadlineShort(app.job.applicationDeadline)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
