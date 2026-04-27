import type { ApplicationStatus, ApplicationSource } from '@shared/types/application.types';

export interface TrackerFilterState {
  status: ApplicationStatus | 'all';
  source: ApplicationSource | 'all';
  search: string;
  hideArchived: boolean;
}

export const DEFAULT_FILTERS: TrackerFilterState = {
  status: 'all',
  source: 'all',
  search: '',
  hideArchived: true,
};

const STATUS_OPTIONS: { value: ApplicationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'saved', label: 'Saved' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under review' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'ghosted', label: 'Ghosted' },
];

const SOURCE_OPTIONS: { value: ApplicationSource | 'all'; label: string }[] = [
  { value: 'all', label: 'All platforms' },
  { value: 'wellfound', label: 'Wellfound' },
  { value: 'workatastartup', label: 'YC Work at a Startup' },
  { value: 'himalayas', label: 'Himalayas' },
  { value: 'greenhouse', label: 'Greenhouse' },
  { value: 'lever', label: 'Lever' },
  { value: 'ashby', label: 'Ashby' },
  { value: 'workday', label: 'Workday' },
  { value: 'smartrecruiters', label: 'SmartRecruiters' },
  { value: 'workable', label: 'Workable' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'company_site', label: 'Company site' },
  { value: 'referral', label: 'Referral' },
  { value: 'other', label: 'Other' },
];

interface Props {
  filters: TrackerFilterState;
  onChange: (next: TrackerFilterState) => void;
  totalCount: number;
  filteredCount: number;
}

export default function TrackerFilters({ filters, onChange, totalCount, filteredCount }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'center',
        marginBottom: 16,
        padding: 12,
        background: 'var(--sf-overlay)',
        borderRadius: 8,
        border: '1px solid var(--bd-default)',
      }}
    >
      <input
        type="search"
        placeholder="Search company..."
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        aria-label="Search by company"
        style={{
          padding: '6px 10px',
          borderRadius: 6,
          border: '1px solid var(--bd-default)',
          fontSize: 14,
          minWidth: 200,
          background: 'var(--sf-raised)',
          color: 'var(--tx-primary)',
        }}
      />
      <select
        value={filters.status}
        onChange={(e) =>
          onChange({ ...filters, status: e.target.value as ApplicationStatus | 'all' })
        }
        aria-label="Filter by status"
        style={{
          padding: '6px 10px',
          borderRadius: 6,
          border: '1px solid var(--bd-default)',
          fontSize: 14,
          background: 'var(--sf-raised)',
          color: 'var(--tx-primary)',
        }}
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={filters.source}
        onChange={(e) =>
          onChange({ ...filters, source: e.target.value as ApplicationSource | 'all' })
        }
        aria-label="Filter by source platform"
        style={{
          padding: '6px 10px',
          borderRadius: 6,
          border: '1px solid var(--bd-default)',
          fontSize: 14,
          background: 'var(--sf-raised)',
          color: 'var(--tx-primary)',
        }}
      >
        {SOURCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 14,
          color: 'var(--tx-primary)',
        }}
      >
        <input
          type="checkbox"
          checked={filters.hideArchived}
          onChange={(e) => onChange({ ...filters, hideArchived: e.target.checked })}
        />
        Hide archived
      </label>
      <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--tx-secondary)' }}>
        {filteredCount} of {totalCount} applications
      </div>
    </div>
  );
}
