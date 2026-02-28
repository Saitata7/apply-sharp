import { useState, useRef, useEffect } from 'react';
import { useProfile } from '../context/ProfileContext';

export default function WorkspaceSwitcher() {
  const { profile, allProfiles, switchWorkspace, isLoading } = useProfile();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSwitch = async (profileId: string) => {
    if (profileId !== profile?.id) {
      await switchWorkspace(profileId);
    }
    setIsOpen(false);
  };

  // Get initials for avatar
  const getInitials = (name?: string) => {
    if (!name) return '?';
    return (
      name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || '?'
    );
  };

  // Get color for workspace
  const getWorkspaceColor = (index: number) => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    return colors[index % colors.length];
  };

  if (allProfiles.length === 0) {
    return (
      <div className="workspace-switcher empty">
        <div className="workspace-empty-icon">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <span className="workspace-empty-text">No workspaces yet</span>
      </div>
    );
  }

  return (
    <div className="workspace-switcher" ref={dropdownRef}>
      <button
        className={`workspace-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
      >
        <div
          className="workspace-avatar"
          style={{
            backgroundColor: getWorkspaceColor(allProfiles.findIndex((p) => p.id === profile?.id)),
          }}
        >
          {getInitials(profile?.personal?.fullName)}
        </div>
        <div className="workspace-info">
          <span className="workspace-name">
            {profile?.personal?.fullName || 'Select Workspace'}
          </span>
          <span className="workspace-role">
            {profile?.careerContext?.primaryDomain || 'No domain'}
          </span>
        </div>
        <svg
          className={`workspace-chevron ${isOpen ? 'open' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className="workspace-dropdown">
          <div className="workspace-dropdown-header">
            <span>Workspaces ({allProfiles.length})</span>
          </div>
          <div className="workspace-list">
            {allProfiles.map((p, index) => (
              <button
                key={p.id}
                className={`workspace-item ${p.id === profile?.id ? 'active' : ''}`}
                onClick={() => handleSwitch(p.id)}
              >
                <div
                  className="workspace-item-avatar"
                  style={{ backgroundColor: getWorkspaceColor(index) }}
                >
                  {getInitials(p.personal?.fullName)}
                </div>
                <div className="workspace-item-info">
                  <span className="workspace-item-name">{p.personal?.fullName || 'Unnamed'}</span>
                  <span className="workspace-item-meta">
                    {p.generatedProfiles?.length || 0} roles • {p.skills?.technical?.length || 0}{' '}
                    skills
                  </span>
                </div>
                {p.id === profile?.id && (
                  <svg
                    className="workspace-check"
                    width="16"
                    height="16"
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
          <div className="workspace-dropdown-footer">
            <span className="workspace-hint">Upload a new resume to create another workspace</span>
          </div>
        </div>
      )}
    </div>
  );
}
