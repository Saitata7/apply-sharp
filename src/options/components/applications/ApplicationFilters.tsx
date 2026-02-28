import type { ApplicationStatus } from '@shared/types/application.types';

interface ApplicationFiltersProps {
  activeStatus: ApplicationStatus | 'all';
  onStatusChange: (status: ApplicationStatus | 'all') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  platformFilter: string;
  onPlatformChange: (platform: string) => void;
  platforms: string[];
  counts: Record<string, number>;
  sponsorshipFilter: 'all' | 'available' | 'not_available';
  onSponsorshipChange: (val: 'all' | 'available' | 'not_available') => void;
  sortMode: 'newest' | 'deadline';
  onSortChange: (val: 'newest' | 'deadline') => void;
}

const STATUS_OPTIONS: { value: ApplicationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'saved', label: 'Saved' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

export default function ApplicationFilters({
  activeStatus,
  onStatusChange,
  searchQuery,
  onSearchChange,
  platformFilter,
  onPlatformChange,
  platforms,
  counts,
  sponsorshipFilter,
  onSponsorshipChange,
  sortMode,
  onSortChange,
}: ApplicationFiltersProps) {
  return (
    <div className="app-filters">
      <div className="status-pills">
        {STATUS_OPTIONS.map(({ value, label }) => {
          const count =
            value === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[value] || 0;
          return (
            <button
              key={value}
              className={`status-pill status-pill--${value} ${activeStatus === value ? 'active' : ''}`}
              onClick={() => onStatusChange(value)}
            >
              {label}
              <span className="pill-count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="filter-row">
        <div className="search-input-wrap">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="filter-search"
            placeholder="Search by company or title..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {platforms.length > 1 && (
          <select
            className="filter-select"
            value={platformFilter}
            onChange={(e) => onPlatformChange(e.target.value)}
          >
            <option value="all">All Platforms</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        )}

        <select
          className="filter-select"
          value={sponsorshipFilter}
          onChange={(e) =>
            onSponsorshipChange(e.target.value as 'all' | 'available' | 'not_available')
          }
        >
          <option value="all">All Sponsorship</option>
          <option value="available">Sponsors Visa</option>
          <option value="not_available">No Sponsorship</option>
        </select>

        <select
          className="filter-select"
          value={sortMode}
          onChange={(e) => onSortChange(e.target.value as 'newest' | 'deadline')}
        >
          <option value="newest">Newest First</option>
          <option value="deadline">Deadline First</option>
        </select>
      </div>
    </div>
  );
}
