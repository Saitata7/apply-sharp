import type { ResumeVersion } from '@shared/types/resume-version.types';

interface ResumeVersionCardProps {
  version: ResumeVersion;
  onDelete: (id: string) => void;
  canCompare?: boolean;
  onCompare?: (id: string) => void;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const FORMAT_LABELS: Record<string, { label: string; color: string }> = {
  pdf: { label: 'PDF', color: 'red' },
  docx: { label: 'DOCX', color: 'blue' },
  txt: { label: 'TXT', color: 'slate' },
  json: { label: 'JSON', color: 'amber' },
};

export default function ResumeVersionCard({
  version,
  onDelete,
  canCompare,
  onCompare,
}: ResumeVersionCardProps) {
  const fmt = FORMAT_LABELS[version.format] || {
    label: version.format.toUpperCase(),
    color: 'slate',
  };

  return (
    <div className="rv-card">
      <div className="rv-card-header">
        <div className="rv-card-title">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>{version.name}</span>
        </div>
        <span className={`rv-format-badge rv-format--${fmt.color}`}>{fmt.label}</span>
      </div>

      <div className="rv-card-body">
        {version.atsScore != null && (
          <div className="rv-score">
            <span className="rv-score-label">ATS Score</span>
            <div className="rv-score-bar">
              <div className="rv-score-fill" style={{ width: `${version.atsScore}%` }} />
            </div>
            <span className="rv-score-value">{version.atsScore}%</span>
          </div>
        )}
        <div className="rv-card-meta">
          <span>{formatDate(version.createdAt)}</span>
        </div>
      </div>

      <div className="rv-card-actions">
        {canCompare && onCompare && (
          <button
            className="btn btn-ghost btn-xs"
            onClick={(e) => {
              e.stopPropagation();
              onCompare(version.id);
            }}
            title="Compare with another version"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            Compare
          </button>
        )}
        <button
          className="btn btn-ghost btn-xs btn-danger-text"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(version.id);
          }}
          title="Delete version"
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
          Delete
        </button>
      </div>
    </div>
  );
}
