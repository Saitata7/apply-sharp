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
        </div>
      )}
    </div>
  );
}
