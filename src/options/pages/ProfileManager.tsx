import { useState } from 'react';
import type { GeneratedProfile } from '@shared/types/master-profile.types';
import { useProfile } from '../context/ProfileContext';
import { sendMessage } from '@shared/utils/messaging';
import ResumeGenerator from '../components/ResumeGenerator';
import CoverLetterGenerator from '../components/CoverLetterGenerator';
import ResumeVersionManager from '../components/ResumeVersionManager';

type ModalType =
  | 'create'
  | 'edit'
  | 'delete'
  | 'export'
  | 'generate-resume'
  | 'cover-letter'
  | 'resume-versions'
  | null;

interface CreateRoleState {
  targetRole: string;
  customRole: string;
  industries: string[];
  isGenerating: boolean;
  error: string | null;
}

export default function ProfileManager() {
  const { profile, isLoading, refreshProfile } = useProfile();
  const [selectedRole, setSelectedRole] = useState<GeneratedProfile | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>('summary');
  const [modalType, setModalType] = useState<ModalType>(null);
  const [editingRole, setEditingRole] = useState<GeneratedProfile | null>(null);

  const [createState, setCreateState] = useState<CreateRoleState>({
    targetRole: '',
    customRole: '',
    industries: [],
    isGenerating: false,
    error: null,
  });

  // Suggested roles based on career context
  const suggestedRoles = profile?.careerContext?.bestFitRoles?.map((r) => r.title) || [
    'Backend Developer',
    'Frontend Developer',
    'Full Stack Developer',
    'DevOps Engineer',
    'Software Engineer',
  ];

  // Common industries
  const commonIndustries = [
    'Fintech',
    'Healthcare',
    'E-commerce',
    'SaaS',
    'AI/ML',
    'Enterprise',
    'Startup',
    'Gaming',
    'EdTech',
    'Crypto',
  ];

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading roles...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1>Role Profiles</h1>
          <p className="page-description">Role-specific profiles generated from your main resume</p>
        </div>
        <div className="empty-state-large">
          <div className="empty-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h2>No Profile Found</h2>
          <p>Upload your resume first to generate role-specific profiles</p>
          <p className="text-muted">Go to &ldquo;Upload Resume&rdquo; to get started</p>
        </div>
      </div>
    );
  }

  const generatedProfiles = profile.generatedProfiles || [];
  const hasRoles = generatedProfiles.length > 0;

  // Get role icon based on role type
  const getRoleIcon = (role: string) => {
    const roleLower = role.toLowerCase();
    if (roleLower.includes('backend')) return '⚙️';
    if (roleLower.includes('frontend')) return '🎨';
    if (roleLower.includes('full') || roleLower.includes('stack')) return '🔄';
    if (roleLower.includes('devops') || roleLower.includes('sre')) return '🚀';
    if (roleLower.includes('data') || roleLower.includes('ml') || roleLower.includes('ai'))
      return '🧠';
    if (roleLower.includes('mobile')) return '📱';
    if (roleLower.includes('lead') || roleLower.includes('manager')) return '👔';
    return '💼';
  };

  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // Create new role profile
  const handleCreateRole = async () => {
    const targetRole = createState.customRole || createState.targetRole;
    if (!targetRole.trim()) {
      setCreateState((prev) => ({ ...prev, error: 'Please select or enter a role' }));
      return;
    }

    setCreateState((prev) => ({ ...prev, isGenerating: true, error: null }));

    try {
      const response = await sendMessage<
        { masterProfileId: string; targetRole: string },
        GeneratedProfile
      >({
        type: 'GENERATE_ROLE_PROFILE',
        payload: {
          masterProfileId: profile.id,
          targetRole: targetRole.trim(),
        },
      });

      if (response.success) {
        await refreshProfile();
        setModalType(null);
        setCreateState({
          targetRole: '',
          customRole: '',
          industries: [],
          isGenerating: false,
          error: null,
        });
      } else {
        setCreateState((prev) => ({
          ...prev,
          isGenerating: false,
          error: response.error || 'Failed to generate role profile',
        }));
      }
    } catch (error) {
      setCreateState((prev) => ({
        ...prev,
        isGenerating: false,
        error: error instanceof Error ? error.message : 'Failed to generate role profile',
      }));
    }
  };

  // Delete role profile
  const handleDeleteRole = async () => {
    if (!editingRole) return;

    try {
      await sendMessage({
        type: 'DELETE_ROLE_PROFILE',
        payload: {
          masterProfileId: profile.id,
          roleProfileId: editingRole.id,
        },
      });
      await refreshProfile();
      setModalType(null);
      setEditingRole(null);
      if (selectedRole?.id === editingRole.id) {
        setSelectedRole(null);
      }
    } catch (error) {
      console.error('Failed to delete role:', error);
    }
  };

  // Set role as active
  const handleSetActive = async (roleId: string) => {
    try {
      await sendMessage({
        type: 'SET_ACTIVE_ROLE_PROFILE',
        payload: {
          masterProfileId: profile.id,
          roleProfileId: roleId,
        },
      });
      await refreshProfile();
    } catch (error) {
      console.error('Failed to set active role:', error);
    }
  };

  // Toggle industry selection
  const toggleIndustry = (industry: string) => {
    setCreateState((prev) => ({
      ...prev,
      industries: prev.industries.includes(industry)
        ? prev.industries.filter((i) => i !== industry)
        : [...prev.industries, industry],
    }));
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="header-with-actions">
          <div>
            <h1>Role Profiles</h1>
            <p className="page-description">
              AI-generated profiles optimized for different roles, all linked to your main profile
            </p>
          </div>
          <div className="header-buttons">
            <button className="btn btn-secondary" onClick={() => setModalType('resume-versions')}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 8v4l3 3" />
                <circle cx="12" cy="12" r="10" />
              </svg>
              Resume Versions
            </button>
            <button className="btn btn-secondary" onClick={() => setModalType('cover-letter')}>
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
              Cover Letter
            </button>
            <button className="btn btn-secondary" onClick={() => setModalType('generate-resume')}>
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
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Generate Resume
            </button>
            <button className="btn btn-primary" onClick={() => setModalType('create')}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Role
            </button>
          </div>
        </div>
      </div>

      {/* Main Profile Link */}
      <div className="profile-tree">
        <div className="main-profile-node">
          <div className="node-connector">
            <div className="node-dot main"></div>
            <div className="node-line"></div>
          </div>
          <div className="main-profile-card">
            <div className="main-profile-header">
              <div className="main-profile-icon">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div className="main-profile-info">
                <h3>{profile.personal?.fullName || 'Your Profile'}</h3>
                <span className="main-profile-badge">Main Profile</span>
              </div>
            </div>
            <div className="main-profile-meta">
              <span>{profile.careerContext?.yearsOfExperience || 0}+ years experience</span>
              <span className="separator">•</span>
              <span>{profile.careerContext?.primaryDomain || 'Software Engineering'}</span>
              <span className="separator">•</span>
              <span>{profile.skills?.technical?.length || 0} skills</span>
            </div>
            <p className="main-profile-summary">
              {profile.careerContext?.summary?.slice(0, 150)}
              {(profile.careerContext?.summary?.length || 0) > 150 ? '...' : ''}
            </p>
          </div>
        </div>

        {/* Role Branches */}
        {hasRoles ? (
          <div className="role-branches">
            <div className="branch-header">
              <span className="branch-count">
                {generatedProfiles.length} ROLE PROFILE{generatedProfiles.length !== 1 ? 'S' : ''}
              </span>
              <span className="branch-separator">·</span>
              <span className="branch-hint">Click a role to view details</span>
            </div>
            <div className="roles-grid">
              {generatedProfiles.map((roleProfile) => (
                <div
                  key={roleProfile.id}
                  className={`role-card ${selectedRole?.id === roleProfile.id ? 'selected' : ''} ${roleProfile.isActive ? 'active' : ''}`}
                  onClick={() =>
                    setSelectedRole(selectedRole?.id === roleProfile.id ? null : roleProfile)
                  }
                >
                  <div className="role-connector">
                    <div className="connector-line"></div>
                    <div className="connector-dot"></div>
                  </div>
                  <div className="role-card-content">
                    <div className="role-card-header">
                      <span className="role-icon">{getRoleIcon(roleProfile.targetRole)}</span>
                      <div className="role-title-wrap">
                        <h4 className="role-title">{roleProfile.name}</h4>
                        <span className="role-target">{roleProfile.targetRole}</span>
                      </div>
                      {roleProfile.isActive && <span className="active-badge">Active</span>}
                      <button
                        className="role-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingRole(roleProfile);
                          setModalType('delete');
                        }}
                        title="Delete role"
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
                      </button>
                    </div>

                    {roleProfile.atsScore && (
                      <div className="ats-score">
                        <div className="ats-bar">
                          <div
                            className="ats-fill"
                            style={{ width: `${roleProfile.atsScore}%` }}
                          ></div>
                        </div>
                        <span className="ats-value">ATS: {roleProfile.atsScore}%</span>
                      </div>
                    )}

                    <div className="role-skills-preview">
                      {roleProfile.highlightedSkills?.slice(0, 4).map((skill) => (
                        <span key={skill} className="skill-chip">
                          {skill}
                        </span>
                      ))}
                      {(roleProfile.highlightedSkills?.length || 0) > 4 && (
                        <span className="skill-chip more">
                          +{roleProfile.highlightedSkills!.length - 4}
                        </span>
                      )}
                    </div>

                    <div className="role-meta">
                      <span className="usage-count">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        {roleProfile.applicationsUsed || 0} uses
                      </span>
                      {roleProfile.lastUsed && (
                        <span className="last-used">
                          Last: {new Date(roleProfile.lastUsed).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Add New Role Card */}
              <div className="role-card add-role-card" onClick={() => setModalType('create')}>
                <div className="role-connector">
                  <div className="connector-line dashed"></div>
                  <div className="connector-dot add"></div>
                </div>
                <div className="role-card-content add-content">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                  <span>Add New Role</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="no-roles-message">
            <div className="branch-line empty"></div>
            <div className="no-roles-content">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <p>No role profiles yet</p>
              <span className="text-muted">Create your first role-specific profile</span>
              <button className="btn btn-primary btn-sm" onClick={() => setModalType('create')}>
                Create Role Profile
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Selected Role Detail Panel */}
      {selectedRole && (
        <div className="role-detail-panel">
          <div className="role-detail-header">
            <div className="role-detail-title">
              <span className="role-icon-large">{getRoleIcon(selectedRole.targetRole)}</span>
              <div>
                <h2>{selectedRole.name}</h2>
                <span className="role-detail-target">Targeting: {selectedRole.targetRole}</span>
              </div>
            </div>
            <div className="role-detail-actions">
              {!selectedRole.isActive && (
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => handleSetActive(selectedRole.id)}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Set Active
                </button>
              )}
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setModalType('generate-resume')}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                Generate Resume
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  setEditingRole(selectedRole);
                  setModalType('delete');
                }}
              >
                <svg
                  width="16"
                  height="16"
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
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedRole(null)}>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Summary Section */}
          <div className="role-detail-section">
            <div className="section-header clickable" onClick={() => toggleSection('summary')}>
              <h3>
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
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                Tailored Summary
              </h3>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`chevron ${expandedSection === 'summary' ? 'expanded' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <div className={`section-content ${expandedSection === 'summary' ? 'expanded' : ''}`}>
              <p className="summary-text">{selectedRole.tailoredSummary}</p>
            </div>
          </div>

          {/* Highlighted Skills */}
          <div className="role-detail-section">
            <div className="section-header clickable" onClick={() => toggleSection('skills')}>
              <h3>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                Highlighted Skills ({selectedRole.highlightedSkills?.length || 0})
              </h3>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`chevron ${expandedSection === 'skills' ? 'expanded' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <div className={`section-content ${expandedSection === 'skills' ? 'expanded' : ''}`}>
              <div className="highlighted-skills">
                {selectedRole.highlightedSkills?.map((skill) => (
                  <span key={skill} className="highlighted-skill">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ATS Keywords */}
          <div className="role-detail-section">
            <div className="section-header clickable" onClick={() => toggleSection('ats')}>
              <h3>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                ATS Keywords ({selectedRole.atsKeywords?.length || 0})
              </h3>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`chevron ${expandedSection === 'ats' ? 'expanded' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <div className={`section-content ${expandedSection === 'ats' ? 'expanded' : ''}`}>
              <div className="ats-keywords">
                {selectedRole.atsKeywords?.map((keyword) => (
                  <span key={keyword} className="ats-keyword">
                    {keyword}
                  </span>
                ))}
              </div>
              {selectedRole.atsScore && (
                <div className="ats-score-detail">
                  <span className="ats-label">ATS Compatibility Score</span>
                  <div className="ats-score-bar">
                    <div
                      className="ats-score-fill"
                      style={{ width: `${selectedRole.atsScore}%` }}
                    ></div>
                  </div>
                  <span className="ats-score-value">{selectedRole.atsScore}%</span>
                </div>
              )}
            </div>
          </div>

          {/* Industries */}
          {selectedRole.targetIndustries && selectedRole.targetIndustries.length > 0 && (
            <div className="role-detail-section">
              <div className="section-header clickable" onClick={() => toggleSection('industries')}>
                <h3>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                  Target Industries
                </h3>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`chevron ${expandedSection === 'industries' ? 'expanded' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              <div
                className={`section-content ${expandedSection === 'industries' ? 'expanded' : ''}`}
              >
                <div className="industries-list">
                  {selectedRole.targetIndustries.map((industry) => (
                    <span key={industry} className="industry-tag">
                      {industry}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Usage Stats */}
          <div className="role-usage-stats">
            <div className="stat">
              <span className="stat-value">{selectedRole.applicationsUsed || 0}</span>
              <span className="stat-label">Applications</span>
            </div>
            <div className="stat">
              <span className="stat-value">
                {selectedRole.lastUsed
                  ? new Date(selectedRole.lastUsed).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'Never'}
              </span>
              <span className="stat-label">Last Used</span>
            </div>
            <div className="stat">
              <span className="stat-value">
                {new Date(selectedRole.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              <span className="stat-label">Created</span>
            </div>
          </div>
        </div>
      )}

      {/* Create Role Modal */}
      {modalType === 'create' && (
        <div
          className="modal-overlay"
          onClick={() => !createState.isGenerating && setModalType(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Role Profile</h2>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setModalType(null)}
                disabled={createState.isGenerating}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="modal-body">
              {createState.isGenerating ? (
                <div className="generating-state">
                  <div className="spinner"></div>
                  <h3>Generating Role Profile</h3>
                  <p>
                    AI is creating a tailored profile for{' '}
                    <strong>{createState.customRole || createState.targetRole}</strong>
                  </p>
                  <p className="hint">This may take a moment due to rate limiting...</p>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label>Target Role</label>
                    <div className="role-suggestions">
                      {suggestedRoles.slice(0, 6).map((role) => (
                        <button
                          key={role}
                          className={`suggestion-chip ${createState.targetRole === role ? 'selected' : ''}`}
                          onClick={() =>
                            setCreateState((prev) => ({
                              ...prev,
                              targetRole: role,
                              customRole: '',
                            }))
                          }
                        >
                          {getRoleIcon(role)} {role}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Or enter custom role</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g., Cloud Architect, Security Engineer..."
                      value={createState.customRole}
                      onChange={(e) =>
                        setCreateState((prev) => ({
                          ...prev,
                          customRole: e.target.value,
                          targetRole: '',
                        }))
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label>Target Industries (optional)</label>
                    <div className="industry-chips">
                      {commonIndustries.map((industry) => (
                        <button
                          key={industry}
                          className={`industry-chip ${createState.industries.includes(industry) ? 'selected' : ''}`}
                          onClick={() => toggleIndustry(industry)}
                        >
                          {industry}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="ai-will-do">
                    <h4>AI will:</h4>
                    <ul>
                      <li>Create a tailored professional summary</li>
                      <li>Select relevant skills to highlight</li>
                      <li>Generate ATS-optimized keywords</li>
                      <li>Pick best experiences to emphasize</li>
                    </ul>
                  </div>

                  {createState.error && (
                    <div className="error-message">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      {createState.error}
                    </div>
                  )}
                </>
              )}
            </div>

            {!createState.isGenerating && (
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setModalType(null)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleCreateRole}
                  disabled={!createState.targetRole && !createState.customRole}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Generate Role Profile
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {modalType === 'delete' && editingRole && (
        <div className="modal-overlay" onClick={() => setModalType(null)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Role Profile</h2>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to delete <strong>{editingRole.name}</strong>?
              </p>
              <p className="text-muted">This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModalType(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDeleteRole}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Resume Modal */}
      {modalType === 'generate-resume' && profile && (
        <ResumeGenerator
          profile={profile}
          selectedRole={selectedRole}
          onClose={() => setModalType(null)}
        />
      )}

      {/* Cover Letter Generator Modal */}
      {modalType === 'cover-letter' && <CoverLetterGenerator onClose={() => setModalType(null)} />}

      {/* Resume Version Manager Modal */}
      {modalType === 'resume-versions' && profile && (
        <ResumeVersionManager profileId={profile.id} onClose={() => setModalType(null)} />
      )}
    </div>
  );
}
