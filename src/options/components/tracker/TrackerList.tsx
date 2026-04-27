import type { Application, ApplicationStatus } from '@shared/types/application.types';
import { format, formatDistanceToNow } from 'date-fns';

interface Props {
  applications: Application[];
  onArchive: (id: string) => void;
  onChangeStatus: (id: string, status: ApplicationStatus) => void;
  onViewSnapshot: (app: Application) => void;
  /** Whether the empty state means "no data exists" vs "filters returned zero
   *  matches". Drives the empty-state copy. */
  hasAnyData?: boolean;
  onClearFilters?: () => void;
}

interface StatusColor {
  bg: string;
  fg: string;
}

// Status pills use CSS variables so light + dark themes adapt automatically.
// Each combo is a glow-tinted background paired with a strong foreground —
// readable in both modes without hand-tuning per theme.
const STATUS_COLORS: Record<ApplicationStatus, StatusColor> = {
  saved: { bg: 'var(--sf-overlay)', fg: 'var(--tx-secondary)' },
  in_progress: { bg: 'var(--cl-orange-glow)', fg: 'var(--cl-orange)' },
  submitted: { bg: 'var(--cl-blue-glow)', fg: 'var(--cl-blue)' },
  under_review: { bg: 'var(--cl-violet-glow)', fg: 'var(--cl-violet)' },
  interview: { bg: 'var(--cl-emerald-glow)', fg: 'var(--cl-emerald)' },
  offer: { bg: 'var(--cl-emerald-glow)', fg: 'var(--cl-emerald)' },
  rejected: { bg: 'var(--cl-rose-glow)', fg: 'var(--cl-rose)' },
  withdrawn: { bg: 'var(--sf-overlay)', fg: 'var(--tx-secondary)' },
  ghosted: { bg: 'var(--sf-overlay)', fg: 'var(--tx-muted)' },
  expired: { bg: 'var(--sf-overlay)', fg: 'var(--tx-muted)' },
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: 'Saved',
  in_progress: 'In progress',
  submitted: 'Submitted',
  under_review: 'Under review',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  ghosted: 'Ghosted',
  expired: 'Expired',
};

const NEXT_STATUS: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  saved: ['in_progress', 'submitted', 'withdrawn'],
  in_progress: ['submitted', 'withdrawn'],
  submitted: ['under_review', 'interview', 'rejected', 'ghosted'],
  under_review: ['interview', 'rejected', 'ghosted'],
  interview: ['offer', 'rejected'],
  offer: ['withdrawn'],
};

export default function TrackerList({
  applications,
  onArchive,
  onChangeStatus,
  onViewSnapshot,
  hasAnyData = true,
  onClearFilters,
}: Props) {
  if (applications.length === 0) {
    if (!hasAnyData) {
      return (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: 'var(--tx-secondary)',
            background: 'var(--sf-overlay)',
            borderRadius: 8,
            border: '1px dashed var(--bd-default)',
          }}
        >
          No applications saved yet. Apply on a supported ATS like Wellfound, Greenhouse, or Lever,
          and the confirmation-page detector will save them automatically. You can also click the
          autofill pill on any application page to start filling.
        </div>
      );
    }
    return (
      <div
        style={{
          padding: 32,
          textAlign: 'center',
          color: 'var(--tx-secondary)',
          background: 'var(--sf-overlay)',
          borderRadius: 8,
          border: '1px dashed var(--bd-default)',
        }}
      >
        <div style={{ marginBottom: 12 }}>
          No applications match the current filters. You have data, just not in this slice.
        </div>
        {onClearFilters && (
          <button
            onClick={onClearFilters}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid var(--bd-default)',
              background: 'var(--sf-raised)',
              color: 'var(--tx-primary)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--sf-raised)',
        border: '1px solid var(--bd-default)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 14,
          color: 'var(--tx-primary)',
        }}
      >
        <thead>
          <tr
            style={{ background: 'var(--sf-overlay)', borderBottom: '1px solid var(--bd-default)' }}
          >
            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>
              Company / Title
            </th>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Status</th>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Source</th>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Applied</th>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>
              Resume version
            </th>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>
              Next follow-up
            </th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((app) => {
            const company = app.jdSnapshot?.company ?? '(unknown company)';
            const title = app.jdSnapshot?.title ?? '';
            const appliedAt = app.appliedAt ? new Date(app.appliedAt) : null;
            const nextFollowUp = (app.followUps ?? [])
              .filter((f) => !f.done)
              .map((f) => new Date(f.dueDate))
              .sort((a, b) => a.getTime() - b.getTime())[0];
            const statusColor = STATUS_COLORS[app.status] ?? {
              bg: 'var(--sf-overlay)',
              fg: 'var(--tx-secondary)',
            };

            return (
              <tr key={app.id} style={{ borderBottom: '1px solid var(--bd-subtle)' }}>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600 }}>{company}</div>
                  <div style={{ color: 'var(--tx-secondary)', fontSize: 12 }}>{title}</div>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span
                    style={{
                      // Per-status fg/bg pairs hand-tuned to pass WCAG AA at
                      // 12px bold. Amber + light green use dark text; saturated
                      // colors use white. No textShadow trickery.
                      display: 'inline-block',
                      padding: '3px 10px',
                      borderRadius: 999,
                      background: statusColor.bg,
                      color: statusColor.fg,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {STATUS_LABELS[app.status]}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--tx-secondary)' }}>
                  {app.source ?? 'other'}
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--tx-secondary)', fontSize: 12 }}>
                  {appliedAt
                    ? `${format(appliedAt, 'MMM d')} (${formatDistanceToNow(appliedAt, {
                        addSuffix: true,
                      })})`
                    : '-'}
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--tx-secondary)', fontSize: 12 }}>
                  {app.resumeVersionId === '__legacy_default__'
                    ? 'Legacy'
                    : (app.resumeVersionId ?? '-').slice(0, 8)}
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--tx-secondary)', fontSize: 12 }}>
                  {nextFollowUp ? formatDistanceToNow(nextFollowUp, { addSuffix: true }) : '-'}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {NEXT_STATUS[app.status]?.map((next) => (
                      <button
                        key={next}
                        onClick={() => onChangeStatus(app.id, next)}
                        title={`Move to ${STATUS_LABELS[next]}`}
                        style={{
                          padding: '4px 8px',
                          fontSize: 11,
                          borderRadius: 4,
                          border: '1px solid var(--bd-default)',
                          background: 'var(--sf-raised)',
                          color: 'var(--tx-primary)',
                          cursor: 'pointer',
                        }}
                      >
                        {STATUS_LABELS[next]}
                      </button>
                    ))}
                    <button
                      onClick={() => onViewSnapshot(app)}
                      title="View frozen JD snapshot"
                      style={{
                        padding: '4px 8px',
                        fontSize: 11,
                        borderRadius: 4,
                        border: '1px solid var(--bd-default)',
                        background: 'var(--sf-raised)',
                        color: 'var(--tx-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      JD
                    </button>
                    <button
                      onClick={() => onArchive(app.id)}
                      title="Archive"
                      style={{
                        padding: '4px 8px',
                        fontSize: 11,
                        borderRadius: 4,
                        border: '1px solid var(--bd-default)',
                        background: 'var(--sf-raised)',
                        color: 'var(--tx-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      Archive
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
