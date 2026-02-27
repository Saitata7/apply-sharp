import { useState } from 'react';
import type { ApplicationStatus } from '@shared/types/application.types';

interface StatusDropdownProps {
  currentStatus: ApplicationStatus;
  onStatusChange: (status: ApplicationStatus, note?: string) => void;
}

const STATUS_CONFIG: { value: ApplicationStatus; label: string; color: string }[] = [
  { value: 'saved', label: 'Saved', color: 'slate' },
  { value: 'in_progress', label: 'In Progress', color: 'amber' },
  { value: 'submitted', label: 'Submitted', color: 'blue' },
  { value: 'under_review', label: 'Under Review', color: 'violet' },
  { value: 'interview', label: 'Interview', color: 'cyan' },
  { value: 'offer', label: 'Offer', color: 'green' },
  { value: 'rejected', label: 'Rejected', color: 'red' },
  { value: 'withdrawn', label: 'Withdrawn', color: 'gray' },
  { value: 'expired', label: 'Expired', color: 'gray' },
];

export default function StatusDropdown({ currentStatus, onStatusChange }: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<ApplicationStatus | null>(null);
  const [note, setNote] = useState('');

  const current = STATUS_CONFIG.find((s) => s.value === currentStatus) || STATUS_CONFIG[0];

  const handleSelect = (status: ApplicationStatus) => {
    if (status === currentStatus) {
      setIsOpen(false);
      return;
    }
    setPendingStatus(status);
  };

  const handleConfirm = () => {
    if (pendingStatus) {
      onStatusChange(pendingStatus, note || undefined);
      setPendingStatus(null);
      setNote('');
      setIsOpen(false);
    }
  };

  const handleCancel = () => {
    setPendingStatus(null);
    setNote('');
  };

  return (
    <div className="status-dropdown-wrap">
      <button
        className={`status-badge status-badge--${current.color}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {current.label}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className="status-dropdown">
          {pendingStatus ? (
            <div className="status-note-input">
              <p className="status-change-label">
                {current.label} &rarr; {STATUS_CONFIG.find((s) => s.value === pendingStatus)?.label}
              </p>
              <input
                type="text"
                placeholder="Add a note (optional)..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                autoFocus
              />
              <div className="status-note-actions">
                <button className="btn btn-ghost btn-xs" onClick={handleCancel}>
                  Cancel
                </button>
                <button className="btn btn-primary btn-xs" onClick={handleConfirm}>
                  Update
                </button>
              </div>
            </div>
          ) : (
            <div className="status-options">
              {STATUS_CONFIG.map(({ value, label, color }) => (
                <button
                  key={value}
                  className={`status-option status-option--${color} ${value === currentStatus ? 'current' : ''}`}
                  onClick={() => handleSelect(value)}
                >
                  <span className={`status-dot status-dot--${color}`} />
                  {label}
                  {value === currentStatus && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isOpen && (
        <div
          className="status-dropdown-backdrop"
          onClick={() => {
            setIsOpen(false);
            setPendingStatus(null);
          }}
        />
      )}
    </div>
  );
}
