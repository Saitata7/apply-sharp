import type { StatusChange } from '@shared/types/application.types';

interface StatusTimelineProps {
  history: StatusChange[];
  currentStatus: string;
  createdAt: Date;
}

const STATUS_LABELS: Record<string, string> = {
  saved: 'Saved',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  under_review: 'Under Review',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
};

function formatTimelineDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function StatusTimeline({ history, currentStatus, createdAt }: StatusTimelineProps) {
  return (
    <div className="status-timeline">
      <div className="timeline-item">
        <div className="timeline-dot timeline-dot--slate" />
        <div className="timeline-content">
          <span className="timeline-label">Created</span>
          <span className="timeline-date">{formatTimelineDate(createdAt)}</span>
        </div>
      </div>

      {history.map((change, i) => (
        <div key={i} className="timeline-item">
          <div className={`timeline-dot timeline-dot--${change.to}`} />
          <div className="timeline-content">
            <span className="timeline-label">
              {STATUS_LABELS[change.from] || change.from} &rarr;{' '}
              {STATUS_LABELS[change.to] || change.to}
            </span>
            {change.note && <span className="timeline-note">{change.note}</span>}
            <span className="timeline-date">{formatTimelineDate(change.changedAt)}</span>
          </div>
        </div>
      ))}

      {history.length === 0 && (
        <div className="timeline-item">
          <div className={`timeline-dot timeline-dot--${currentStatus}`} />
          <div className="timeline-content">
            <span className="timeline-label">
              Current: {STATUS_LABELS[currentStatus] || currentStatus}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
