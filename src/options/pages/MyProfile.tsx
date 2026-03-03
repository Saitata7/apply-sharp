import { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  MasterProfile,
  GeneratedProfile,
  Certification,
} from '@shared/types/master-profile.types';
import { useProfile } from '../context/ProfileContext';
import { sendMessage } from '@shared/utils/messaging';
import BackgroundConfig from '../components/BackgroundConfig';
import AutofillSettings from '../components/AutofillSettings';

type ProfileTab = 'overview' | 'skills' | 'answers' | 'profiles' | 'recommendations' | 'autofill';
type EditSection = 'personal' | 'links' | 'certifications' | 'experience' | null;

export default function MyProfile() {
  const { profile, isLoading, error, deleteWorkspace, updateProfile, refreshProfile } =
    useProfile();
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showStoragePath, setShowStoragePath] = useState(false);

  // Edit mode state
  const [editSection, setEditSection] = useState<EditSection>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editFormData, setEditFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    linkedInUrl: '',
    githubUrl: '',
    portfolioUrl: '',
    city: '',
    state: '',
    country: '',
  });
  const [editCertifications, setEditCertifications] = useState<Certification[]>([]);
  const [newCertification, setNewCertification] = useState({ name: '', issuer: '', date: '' });
  const [saveError, setSaveError] = useState<string | null>(null);

  // AI-powered update state
  const [updateContext, setUpdateContext] = useState('');
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [selectedUpdateType, setSelectedUpdateType] = useState<string | null>(null);

  // Close modals on Escape key
  useEffect(() => {
    if (!showDeleteModal && !editSection) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting && !isSaving && !isProcessingAI) {
        if (editSection) setEditSection(null);
        else if (showDeleteModal) setShowDeleteModal(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showDeleteModal, editSection, isDeleting, isSaving, isProcessingAI]);

  // Update type configurations with required fields
  const updateTypeConfigs: Record<
    string,
    { icon: string; title: string; required: string[]; example: string; description?: string }
  > = {
    company: {
      icon: '💼',
      title: 'Company / Role',
      description: 'Update current job, add new company, or fix incomplete entries',
      required: [
        'Company Name',
        'Job Title',
        'Start Date',
        'What you do (domain/tech/responsibilities)',
      ],
      example:
        'Software Engineer at Kroger since Jan 2025. Working on Java backend for retail inventory systems. Building APIs for store operations, optimizing database queries for 2000+ stores.',
    },
    timeline: {
      icon: '📅',
      title: 'Fix Timeline',
      description: 'Add end dates, fix duplicates, correct date issues',
      required: ['Company name', 'What to fix (end date, remove duplicate, correct dates)'],
      example:
        'TeamCal AI ended Dec 2024 when I joined Kroger. Remove duplicate Kroger entry (keep the one with Jan 2025 start date).',
    },
    achievement: {
      icon: '🏆',
      title: 'Achievement',
      description: 'Add accomplishments to your current or past roles',
      required: ['Which company/role', 'What you achieved', 'Impact or result'],
      example:
        'At Kroger: Reduced API response time by 60% by implementing Redis caching. Led migration of legacy system serving 500+ stores.',
    },
    skills: {
      icon: '🛠️',
      title: 'Tech Stack / Skills',
      required: ['Skill or technology name(s)'],
      example: 'Rust, WebAssembly, gRPC - used in production for 6 months',
    },
    certification: {
      icon: '📜',
      title: 'Certification',
      required: ['Certification Name', 'Issuing Organization'],
      example:
        'AWS Solutions Architect Professional from Amazon Web Services, obtained December 2024',
    },
    links: {
      icon: '🔗',
      title: 'Links & Contact',
      required: ['Type of link (LinkedIn, GitHub, Portfolio)', 'URL'],
      example: 'LinkedIn: linkedin.com/in/myname, GitHub: github.com/myname',
    },
    project: {
      icon: '📁',
      title: 'Project',
      required: ['Project Name', 'Description', 'Technologies used'],
      example:
        'AI Resume Builder - open source tool using React, TypeScript, and OpenAI API. 500+ GitHub stars.',
    },
  };

  const handleDeleteWorkspace = async () => {
    if (!profile) return;
    setIsDeleting(true);
    try {
      const success = await deleteWorkspace(profile.id);
      if (success) {
        setShowDeleteModal(false);
      } else {
        setSaveError('Failed to delete workspace. Please try again.');
      }
    } catch {
      setSaveError('Failed to delete workspace. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Open edit modal with current data
  const openEditModal = (section: EditSection) => {
    if (!profile) return;

    if (section === 'personal' || section === 'links') {
      setEditFormData({
        fullName: profile.personal?.fullName || '',
        email: profile.personal?.email || '',
        phone: profile.personal?.phone || '',
        linkedInUrl: profile.personal?.linkedInUrl || '',
        githubUrl: profile.personal?.githubUrl || '',
        portfolioUrl: profile.personal?.portfolioUrl || '',
        city: profile.personal?.location?.city || '',
        state: profile.personal?.location?.state || '',
        country: profile.personal?.location?.country || '',
      });
    }

    if (section === 'certifications') {
      setEditCertifications(profile.certifications || []);
      setNewCertification({ name: '', issuer: '', date: '' });
    }

    if (section === 'experience') {
      setUpdateContext('');
      setAiPreview(null);
      setAiError(null);
      setSelectedUpdateType(null);
    }

    setSaveError(null);
    setEditSection(section);
  };

  // Save personal info edits
  const handleSavePersonalInfo = async () => {
    if (!profile) return;
    setIsSaving(true);

    try {
      const success = await updateProfile({
        personal: {
          ...profile.personal,
          fullName: editFormData.fullName,
          firstName: editFormData.fullName.split(' ')[0],
          lastName: editFormData.fullName.split(' ').slice(1).join(' '),
          email: editFormData.email,
          phone: editFormData.phone,
          linkedInUrl: editFormData.linkedInUrl || undefined,
          githubUrl: editFormData.githubUrl || undefined,
          portfolioUrl: editFormData.portfolioUrl || undefined,
          location: {
            city: editFormData.city,
            state: editFormData.state,
            country: editFormData.country,
            formatted: [editFormData.city, editFormData.state, editFormData.country]
              .filter(Boolean)
              .join(', '),
          },
        },
      });

      if (success) {
        setEditSection(null);
      } else {
        setSaveError('Failed to save personal info. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Add a new certification
  const handleAddCertification = () => {
    if (!newCertification.name.trim()) return;

    const cert: Certification = {
      name: newCertification.name,
      issuer: newCertification.issuer || '',
      dateObtained: newCertification.date || undefined,
      isValid: true,
      relevanceMap: {},
    };

    setEditCertifications([...editCertifications, cert]);
    setNewCertification({ name: '', issuer: '', date: '' });
  };

  // Remove a certification by index
  const handleRemoveCertification = (index: number) => {
    setEditCertifications(editCertifications.filter((_, i) => i !== index));
  };

  // Save certifications
  const handleSaveCertifications = async () => {
    if (!profile) return;
    setIsSaving(true);

    try {
      const success = await updateProfile({
        certifications: editCertifications,
      });

      if (success) {
        setEditSection(null);
      } else {
        setSaveError('Failed to save certifications. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Process context update with AI
  const handleProcessContext = async () => {
    if (!profile || !updateContext.trim() || !selectedUpdateType) return;
    setIsProcessingAI(true);
    setAiPreview(null);
    setAiError(null);

    // Include the update type in the context for better parsing
    const fullContext = `[Update Type: ${selectedUpdateType}]\n${updateContext}`;

    try {
      const response = await sendMessage<
        { profileId: string; context: string; updateType: string },
        { status: 'ready' | 'error'; preview?: string; error?: string }
      >({
        type: 'PROCESS_PROFILE_UPDATE',
        payload: { profileId: profile.id, context: fullContext, updateType: selectedUpdateType },
      });

      if (response.success && response.data) {
        if (response.data.status === 'ready' && response.data.preview) {
          setAiPreview(response.data.preview);
        } else if (response.data.status === 'error') {
          setAiError(
            response.data.error ||
              'Missing required information. Please follow the instructions above.'
          );
        }
      } else {
        setAiError(response.error || 'Failed to process update. Please try again.');
      }
    } catch (error) {
      console.debug('[MyProfile] AI update processing failed:', (error as Error).message);
      setAiError('Error processing your update. Please try again.');
    } finally {
      setIsProcessingAI(false);
    }
  };

  // Apply the AI-processed update
  const handleApplyAIUpdate = async () => {
    if (!profile || !updateContext.trim()) return;
    setIsSaving(true);

    try {
      const response = await sendMessage<{ profileId: string; context: string }, MasterProfile>({
        type: 'APPLY_PROFILE_UPDATE',
        payload: { profileId: profile.id, context: updateContext },
      });

      if (response.success && response.data) {
        // Refresh profile from context
        await refreshProfile();
        setEditSection(null);
        setUpdateContext('');
        setAiPreview(null);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <div className="error-state">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-container">
        <div className="empty-state-large">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <h2>No Profile Yet</h2>
          <p>Upload your resume to create your profile</p>
          <p className="hint">Go to &ldquo;Upload Resume&rdquo; in the sidebar to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="header-with-actions">
          <div className="header-info">
            <h1>{profile.personal?.fullName || 'Your Profile'}</h1>
            <p className="page-description">
              {profile.careerContext?.primaryDomain || 'Professional'} •{' '}
              {profile.careerContext?.yearsOfExperience || 0} years experience •{' '}
              {profile.careerContext?.seniorityLevel || 'mid'} level
            </p>
            <p className="profile-meta">
              <span className="meta-item">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Last updated:{' '}
                {(() => {
                  try {
                    const d = new Date(profile.updatedAt);
                    return isNaN(d.getTime()) ? 'Unknown' : d.toLocaleDateString();
                  } catch {
                    return 'Unknown';
                  }
                })()}
              </span>
              {profile.personal?.email && (
                <span className="meta-item">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  {profile.personal.email}
                </span>
              )}
              {profile.personal?.phone && (
                <span className="meta-item">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72" />
                  </svg>
                  {profile.personal.phone}
                </span>
              )}
            </p>
          </div>
          <div className="header-buttons">
            <button className="btn btn-primary btn-sm" onClick={() => openEditModal('experience')}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Update Profile
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => setShowDeleteModal(true)}>
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
          </div>
        </div>
      </div>

      {profile.careerContext?.summary && (
        <div className="profile-summary-card">
          <h3>Professional Summary</h3>
          <p>{profile.careerContext.summary}</p>
        </div>
      )}

      <div className="profile-tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'skills' ? 'active' : ''}`}
          onClick={() => setActiveTab('skills')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          Skills ({profile.skills?.technical?.length || 0})
        </button>
        <button
          className={`tab ${activeTab === 'answers' ? 'active' : ''}`}
          onClick={() => setActiveTab('answers')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Answer Bank ({profile.answerBank?.commonQuestions?.length || 0})
        </button>
        <button
          className={`tab ${activeTab === 'profiles' ? 'active' : ''}`}
          onClick={() => setActiveTab('profiles')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Role Profiles ({profile.generatedProfiles?.length || 0})
        </button>
        <button
          className={`tab ${activeTab === 'recommendations' ? 'active' : ''}`}
          onClick={() => setActiveTab('recommendations')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          Recommendations
        </button>
        <button
          className={`tab ${activeTab === 'autofill' ? 'active' : ''}`}
          onClick={() => setActiveTab('autofill')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Autofill
        </button>
      </div>

      {activeTab === 'overview' && <ProfileOverview profile={profile} onSave={updateProfile} />}
      {activeTab === 'skills' && <ProfileSkills profile={profile} />}
      {activeTab === 'answers' && <ProfileAnswers profile={profile} />}
      {activeTab === 'profiles' && <GeneratedProfiles profile={profile} />}
      {activeTab === 'recommendations' && (
        <ProfileRecommendations profile={profile} onAddItem={openEditModal} />
      )}
      {activeTab === 'autofill' && <AutofillSettings profile={profile} onSave={updateProfile} />}

      {/* Delete Workspace Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => !isDeleting && setShowDeleteModal(false)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Workspace</h2>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
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
              <div className="warning-message">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <p>
                    <strong>Are you sure you want to delete this workspace?</strong>
                  </p>
                  <p className="text-muted">
                    This will permanently delete{' '}
                    <strong>{profile.personal?.fullName || 'this profile'}</strong> and all
                    associated role profiles. This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="storage-info">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowStoragePath(!showStoragePath)}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  {showStoragePath ? 'Hide' : 'Show'} storage info
                </button>

                {showStoragePath && (
                  <div className="storage-path-info">
                    <p className="text-muted">
                      <strong>Storage:</strong> Chrome Extension Local Storage
                    </p>
                    <p className="text-muted">
                      Data is stored in <code>chrome.storage.local</code> - a sandboxed storage area
                      specific to this extension. It is NOT stored on your filesystem.
                    </p>
                    <div className="storage-options">
                      <p className="text-muted">
                        <strong>To manually clear all data:</strong>
                      </p>
                      <ol className="storage-steps">
                        <li>
                          Go to <code>chrome://extensions</code>
                        </li>
                        <li>Find &ldquo;ApplySharp&rdquo; and click &ldquo;Details&rdquo;</li>
                        <li>
                          Scroll down and click &ldquo;Clear data&rdquo; under &ldquo;Site
                          settings&rdquo;
                        </li>
                      </ol>
                      <p className="text-muted hint">
                        Or simply remove and reinstall the extension.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-ghost"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDeleteWorkspace}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <div className="spinner-sm"></div>
                    Deleting...
                  </>
                ) : (
                  'Delete Workspace'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {editSection && (
        <div className="modal-overlay" onClick={() => !isSaving && setEditSection(null)}>
          <div className="modal modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {editSection === 'personal' && 'Edit Personal Information'}
                {editSection === 'links' && 'Edit Links'}
                {editSection === 'certifications' && 'Manage Certifications'}
                {editSection === 'experience' && 'Update Profile with AI'}
              </h2>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setEditSection(null)}
                disabled={isSaving}
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
              {saveError && (
                <div
                  style={{
                    padding: '8px 12px',
                    marginBottom: 12,
                    background: '#3b1219',
                    border: '1px solid #ef4444',
                    borderRadius: 6,
                    color: '#ef4444',
                    fontSize: 13,
                  }}
                >
                  {saveError}
                </div>
              )}
              {(editSection === 'personal' || editSection === 'links') && (
                <div className="edit-form">
                  <div className="form-section">
                    <h4>Basic Information</h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Full Name</label>
                        <input
                          type="text"
                          value={editFormData.fullName}
                          onChange={(e) =>
                            setEditFormData({ ...editFormData, fullName: e.target.value })
                          }
                          placeholder="John Doe"
                        />
                      </div>
                    </div>
                    <div className="form-row two-col">
                      <div className="form-group">
                        <label>Email</label>
                        <input
                          type="email"
                          value={editFormData.email}
                          onChange={(e) =>
                            setEditFormData({ ...editFormData, email: e.target.value })
                          }
                          placeholder="john@example.com"
                        />
                      </div>
                      <div className="form-group">
                        <label>Phone</label>
                        <input
                          type="tel"
                          value={editFormData.phone}
                          onChange={(e) =>
                            setEditFormData({ ...editFormData, phone: e.target.value })
                          }
                          placeholder="+1 (555) 123-4567"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-section">
                    <h4>Location</h4>
                    <div className="form-row three-col">
                      <div className="form-group">
                        <label>City</label>
                        <input
                          type="text"
                          value={editFormData.city}
                          onChange={(e) =>
                            setEditFormData({ ...editFormData, city: e.target.value })
                          }
                          placeholder="San Francisco"
                        />
                      </div>
                      <div className="form-group">
                        <label>State</label>
                        <input
                          type="text"
                          value={editFormData.state}
                          onChange={(e) =>
                            setEditFormData({ ...editFormData, state: e.target.value })
                          }
                          placeholder="CA"
                        />
                      </div>
                      <div className="form-group">
                        <label>Country</label>
                        <input
                          type="text"
                          value={editFormData.country}
                          onChange={(e) =>
                            setEditFormData({ ...editFormData, country: e.target.value })
                          }
                          placeholder="USA"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-section">
                    <h4>Links</h4>
                    <div className="form-group">
                      <label>LinkedIn URL</label>
                      <input
                        type="url"
                        value={editFormData.linkedInUrl}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, linkedInUrl: e.target.value })
                        }
                        placeholder="https://linkedin.com/in/johndoe"
                      />
                    </div>
                    <div className="form-group">
                      <label>GitHub URL</label>
                      <input
                        type="url"
                        value={editFormData.githubUrl}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, githubUrl: e.target.value })
                        }
                        placeholder="https://github.com/johndoe"
                      />
                    </div>
                    <div className="form-group">
                      <label>Portfolio URL</label>
                      <input
                        type="url"
                        value={editFormData.portfolioUrl}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, portfolioUrl: e.target.value })
                        }
                        placeholder="https://johndoe.com"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editSection === 'certifications' && (
                <div className="edit-form">
                  <div className="form-section">
                    <h4>Add New Certification</h4>
                    <div className="form-row three-col">
                      <div className="form-group">
                        <label>Certification Name *</label>
                        <input
                          type="text"
                          value={newCertification.name}
                          onChange={(e) =>
                            setNewCertification({ ...newCertification, name: e.target.value })
                          }
                          placeholder="AWS Solutions Architect"
                        />
                      </div>
                      <div className="form-group">
                        <label>Issuing Organization</label>
                        <input
                          type="text"
                          value={newCertification.issuer}
                          onChange={(e) =>
                            setNewCertification({ ...newCertification, issuer: e.target.value })
                          }
                          placeholder="Amazon Web Services"
                        />
                      </div>
                      <div className="form-group">
                        <label>Date Obtained</label>
                        <input
                          type="text"
                          value={newCertification.date}
                          onChange={(e) =>
                            setNewCertification({ ...newCertification, date: e.target.value })
                          }
                          placeholder="2024"
                        />
                      </div>
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleAddCertification}
                      disabled={!newCertification.name.trim()}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Add Certification
                    </button>
                  </div>

                  {editCertifications.length > 0 && (
                    <div className="form-section">
                      <h4>Current Certifications</h4>
                      <div className="cert-list">
                        {editCertifications.map((cert, index) => (
                          <div key={`${cert.name}-${index}`} className="cert-item">
                            <div className="cert-info">
                              <span className="cert-name">{cert.name}</span>
                              {cert.issuer && <span className="cert-issuer">{cert.issuer}</span>}
                              {cert.dateObtained && (
                                <span className="cert-date">{cert.dateObtained}</span>
                              )}
                            </div>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleRemoveCertification(index)}
                            >
                              <svg
                                width="16"
                                height="16"
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
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {editSection === 'experience' && (
                <div className="edit-form">
                  {/* Step 1: Category Selection */}
                  {!selectedUpdateType && !aiPreview && (
                    <div className="form-section">
                      <h4>What would you like to add or update?</h4>
                      <p className="section-hint">Click on a category below to get started.</p>
                      <div className="update-type-grid">
                        {Object.entries(updateTypeConfigs).map(([key, config]) => (
                          <button
                            key={key}
                            className="update-type-card"
                            onClick={() => {
                              setSelectedUpdateType(key);
                              setUpdateContext('');
                              setAiError(null);
                            }}
                          >
                            <span className="category-icon">{config.icon}</span>
                            <span className="category-title">{config.title}</span>
                            {config.description && (
                              <span className="category-desc">{config.description}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Step 2: Required Information Input */}
                  {selectedUpdateType && !aiPreview && (
                    <div className="form-section">
                      <div className="selected-type-header">
                        <button
                          className="btn btn-ghost btn-sm back-btn"
                          onClick={() => {
                            setSelectedUpdateType(null);
                            setUpdateContext('');
                            setAiError(null);
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
                            <polyline points="15 18 9 12 15 6" />
                          </svg>
                          Back
                        </button>
                        <h4>
                          <span className="category-icon">
                            {updateTypeConfigs[selectedUpdateType].icon}
                          </span>
                          {updateTypeConfigs[selectedUpdateType].title}
                        </h4>
                      </div>

                      {/* Required Information Box */}
                      <div className="required-info-box">
                        <div className="required-header">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                          </svg>
                          <span>Required Information:</span>
                        </div>
                        <ul className="required-list">
                          {updateTypeConfigs[selectedUpdateType].required.map((req, i) => (
                            <li key={i}>{req}</li>
                          ))}
                        </ul>
                        <div className="example-box">
                          <span className="example-label">Example:</span>
                          <span className="example-text">
                            {updateTypeConfigs[selectedUpdateType].example}
                          </span>
                        </div>
                      </div>

                      {/* Error message */}
                      {aiError && (
                        <div className="ai-error">
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                          </svg>
                          <span>{aiError}</span>
                        </div>
                      )}

                      <div className="form-group">
                        <label>Enter your information:</label>
                        <textarea
                          value={updateContext}
                          onChange={(e) => {
                            setUpdateContext(e.target.value);
                            setAiError(null);
                          }}
                          placeholder={updateTypeConfigs[selectedUpdateType].example}
                          rows={4}
                          disabled={isProcessingAI}
                          autoFocus
                        />
                      </div>

                      <div className="form-actions">
                        <button
                          className="btn btn-secondary"
                          onClick={handleProcessContext}
                          disabled={!updateContext.trim() || isProcessingAI}
                        >
                          {isProcessingAI ? (
                            <>
                              <div className="spinner-sm"></div>
                              Validating...
                            </>
                          ) : (
                            <>
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                              </svg>
                              Preview Changes
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Preview and Apply */}
                  {aiPreview && (
                    <div className="form-section">
                      <h4>
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="9 11 12 14 22 4" />
                          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                        Preview Changes
                      </h4>
                      <div className="ai-preview-box">
                        <p>{aiPreview}</p>
                      </div>
                      <div className="preview-actions">
                        <button
                          className="btn btn-ghost"
                          onClick={() => {
                            setAiPreview(null);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={handleApplyAIUpdate}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <>
                              <div className="spinner-sm"></div>
                              Applying...
                            </>
                          ) : (
                            'Apply Changes'
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {editSection !== 'experience' && (
              <div className="modal-footer">
                <button
                  className="btn btn-ghost"
                  onClick={() => setEditSection(null)}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={
                    editSection === 'certifications'
                      ? handleSaveCertifications
                      : handleSavePersonalInfo
                  }
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <div className="spinner-sm"></div>
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            )}
            {editSection === 'experience' && !aiPreview && (
              <div className="modal-footer">
                <button
                  className="btn btn-ghost"
                  onClick={() => setEditSection(null)}
                  disabled={isProcessingAI}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileOverview({
  profile,
  onSave,
}: {
  profile: MasterProfile;
  onSave: (config: Partial<MasterProfile>) => Promise<boolean>;
}) {
  const [editingExpIdx, setEditingExpIdx] = useState<number | null>(null);
  const [editExp, setEditExp] = useState({
    title: '',
    company: '',
    location: '',
    startDate: '',
    endDate: '',
    isCurrent: false,
  });
  const [savingExp, setSavingExp] = useState(false);

  const startEditExp = (idx: number) => {
    const exp = profile.experience![idx];
    setEditExp({
      title: exp.title || '',
      company: exp.company || '',
      location: exp.location || '',
      startDate: exp.startDate || '',
      endDate: exp.endDate || '',
      isCurrent: exp.isCurrent || false,
    });
    setEditingExpIdx(idx);
  };

  const saveExp = async () => {
    if (editingExpIdx === null || !profile.experience) return;
    setSavingExp(true);
    const updated = [...profile.experience];
    updated[editingExpIdx] = { ...updated[editingExpIdx], ...editExp };
    await onSave({ experience: updated });
    setSavingExp(false);
    setEditingExpIdx(null);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const lower = dateStr.toLowerCase().trim();
    if (lower === 'present' || lower === 'current' || lower === 'now') return 'Present';

    // Try to parse various formats
    // Format: "2024-01" or "2024-1"
    const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})$/);
    if (isoMatch) {
      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      const monthIndex = parseInt(isoMatch[2], 10) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        return `${months[monthIndex]} ${isoMatch[1]}`;
      }
    }

    // Format: "January 2024" or "Jan 2024"
    const monthYearMatch = dateStr.match(/^([A-Za-z]+)\s*(\d{4})$/);
    if (monthYearMatch) {
      const monthStr = monthYearMatch[1].substring(0, 3);
      const monthMap: Record<string, string> = {
        jan: 'Jan',
        feb: 'Feb',
        mar: 'Mar',
        apr: 'Apr',
        may: 'May',
        jun: 'Jun',
        jul: 'Jul',
        aug: 'Aug',
        sep: 'Sep',
        oct: 'Oct',
        nov: 'Nov',
        dec: 'Dec',
      };
      const month = monthMap[monthStr.toLowerCase()] || monthStr;
      return `${month} ${monthYearMatch[2]}`;
    }

    // Format: Just year "2024"
    if (/^\d{4}$/.test(dateStr)) {
      return dateStr;
    }

    // Try standard date parsing
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }
    } catch {
      // Ignore parse errors
    }

    // Return as-is if nothing works
    return dateStr;
  };

  return (
    <div className="resume-preview">
      {/* Background & Skill Areas Configuration */}
      <BackgroundConfig profile={profile} onSave={onSave} />

      {/* Work Experience */}
      {profile.experience && profile.experience.length > 0 && (
        <div className="resume-section">
          <h3 className="resume-section-title">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            Work Experience ({profile.experience.length})
          </h3>
          <div className="experience-timeline">
            {profile.experience.map((exp, i) => (
              <div key={exp.id || i} className="exp-card">
                {editingExpIdx === i ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input
                      type="text"
                      value={editExp.title}
                      onChange={(e) => setEditExp({ ...editExp, title: e.target.value })}
                      placeholder="Job Title"
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                      }}
                    />
                    <input
                      type="text"
                      value={editExp.company}
                      onChange={(e) => setEditExp({ ...editExp, company: e.target.value })}
                      placeholder="Company"
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        fontSize: '0.85rem',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={editExp.location}
                        onChange={(e) => setEditExp({ ...editExp, location: e.target.value })}
                        placeholder="Location"
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          fontSize: '0.8rem',
                        }}
                      />
                      <input
                        type="text"
                        value={editExp.startDate}
                        onChange={(e) => setEditExp({ ...editExp, startDate: e.target.value })}
                        placeholder="Start Date"
                        style={{
                          width: '100px',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          fontSize: '0.8rem',
                        }}
                      />
                      <input
                        type="text"
                        value={editExp.isCurrent ? '' : editExp.endDate}
                        onChange={(e) =>
                          setEditExp({ ...editExp, endDate: e.target.value, isCurrent: false })
                        }
                        placeholder={editExp.isCurrent ? 'Present' : 'End Date'}
                        disabled={editExp.isCurrent}
                        style={{
                          width: '100px',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          fontSize: '0.8rem',
                        }}
                      />
                    </div>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.8rem',
                        color: '#64748b',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={editExp.isCurrent}
                        onChange={(e) =>
                          setEditExp({
                            ...editExp,
                            isCurrent: e.target.checked,
                            endDate: e.target.checked ? '' : editExp.endDate,
                          })
                        }
                      />
                      Current position
                    </label>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditingExpIdx(null)}
                        disabled={savingExp}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={saveExp}
                        disabled={savingExp}
                      >
                        {savingExp ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className="exp-header"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div>
                        <div className="exp-title">{exp.title}</div>
                        <div className="exp-company">{exp.company}</div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => startEditExp(i)}
                        title="Edit experience"
                        style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                      >
                        Edit
                      </button>
                    </div>
                    <div className="exp-details">
                      {exp.location && <span className="exp-location">{exp.location}</span>}
                      <span className="exp-dates">
                        {formatDate(exp.startDate)} -{' '}
                        {exp.isCurrent ? 'Present' : formatDate(exp.endDate)}
                      </span>
                    </div>
                    {exp.achievements && exp.achievements.length > 0 && (
                      <ul className="exp-achievements">
                        {exp.achievements.slice(0, 4).map((achievement, j) => (
                          <li key={j}>
                            {typeof achievement === 'string' ? achievement : achievement.statement}
                          </li>
                        ))}
                      </ul>
                    )}
                    {exp.technologiesUsed && exp.technologiesUsed.length > 0 && (
                      <div className="exp-tech">
                        {exp.technologiesUsed.slice(0, 6).map((tech, j) => (
                          <span key={j} className="tag tag-sm">
                            {typeof tech === 'string' ? tech : tech.skill}
                          </span>
                        ))}
                        {exp.technologiesUsed.length > 6 && (
                          <span className="tag tag-sm tag-more">
                            +{exp.technologiesUsed.length - 6} more
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {profile.education && profile.education.length > 0 && (
        <div className="resume-section">
          <h3 className="resume-section-title">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
            Education
          </h3>
          <div className="education-list">
            {profile.education.map((edu, i) => (
              <div key={edu.id || i} className="edu-card">
                <div className="edu-header">
                  <div className="edu-institution">{edu.institution}</div>
                </div>
                <div className="edu-details">
                  <span className="edu-degree">
                    {edu.degree}
                    {edu.field ? `, ${edu.field}` : ''}
                  </span>
                  {(edu.startDate || edu.endDate) &&
                    edu.startDate !== 'null' &&
                    edu.endDate !== 'null' && (
                      <span className="edu-dates">
                        {edu.startDate && edu.startDate !== 'null' ? edu.startDate : ''}
                        {edu.startDate &&
                        edu.endDate &&
                        edu.startDate !== 'null' &&
                        edu.endDate !== 'null'
                          ? ' - '
                          : ''}
                        {edu.endDate && edu.endDate !== 'null' ? edu.endDate : ''}
                      </span>
                    )}
                  {edu.gpa && <span className="edu-gpa">GPA: {edu.gpa}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects */}
      {profile.projects && profile.projects.length > 0 && (
        <div className="resume-section">
          <h3 className="resume-section-title">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Projects
          </h3>
          <div className="projects-list">
            {profile.projects.map((project, i) => (
              <div key={project.id || i} className="project-card">
                <div className="project-header">
                  <div className="project-name">{project.name}</div>
                </div>
                {project.description && (
                  <p className="project-description">{project.description}</p>
                )}
                {project.technologies && project.technologies.length > 0 && (
                  <div className="project-tech">
                    {project.technologies.map((tech, j) => (
                      <span key={j} className="tag tag-sm">
                        {tech}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Certifications */}
      {profile.certifications && profile.certifications.length > 0 && (
        <div className="resume-section">
          <h3 className="resume-section-title">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="8" r="7" />
              <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
            </svg>
            Certifications
          </h3>
          <div className="certifications-list">
            {profile.certifications.map((cert, i) => (
              <div key={`${cert.name}-${i}`} className="cert-card">
                <div className="cert-header">
                  <span className="cert-name">{cert.name}</span>
                  {cert.issuer && <span className="cert-issuer">{cert.issuer}</span>}
                </div>
                {cert.dateObtained && <span className="cert-date">{cert.dateObtained}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Links */}
      {(profile.personal?.linkedInUrl ||
        profile.personal?.githubUrl ||
        profile.personal?.portfolioUrl) && (
        <div className="resume-section">
          <h3 className="resume-section-title">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Links
          </h3>
          <div className="links-grid">
            {profile.personal?.linkedInUrl && (
              <a
                href={profile.personal.linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="link-card"
              >
                <span className="link-label">LinkedIn</span>
                <span className="link-url">{profile.personal.linkedInUrl}</span>
              </a>
            )}
            {profile.personal?.githubUrl && (
              <a
                href={profile.personal.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="link-card"
              >
                <span className="link-label">GitHub</span>
                <span className="link-url">{profile.personal.githubUrl}</span>
              </a>
            )}
            {profile.personal?.portfolioUrl && (
              <a
                href={profile.personal.portfolioUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="link-card"
              >
                <span className="link-label">Portfolio</span>
                <span className="link-url">{profile.personal.portfolioUrl}</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Quick Skills Overview */}
      {profile.skills && (
        <div className="resume-section">
          <h3 className="resume-section-title">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Top Skills
          </h3>
          <div className="skills-tags">
            {profile.skills.technical?.slice(0, 12).map((skill, i) => (
              <span key={i} className="tag skill-tag">
                {skill.name}
              </span>
            ))}
            {(profile.skills.technical?.length || 0) > 12 && (
              <span className="tag tag-more">
                +{(profile.skills.technical?.length || 0) - 12} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileSkills({ profile }: { profile: MasterProfile }) {
  // Calculate skill mention counts from ALL sources
  const skillMentionCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    // Helper to count keyword in text
    const countInText = (text: string, keyword: string): number => {
      if (!text || !keyword || keyword.length < 2) return 0;
      const textLower = text.toLowerCase();
      const keywordLower = keyword.toLowerCase();
      let count = 0;
      let pos = 0;
      while ((pos = textLower.indexOf(keywordLower, pos)) !== -1) {
        count++;
        pos += keywordLower.length;
      }
      return count;
    };

    // Collect all text for searching
    const allText: string[] = [];

    // Count from experience technologiesUsed
    profile.experience?.forEach((exp) => {
      if (exp.technologiesUsed && Array.isArray(exp.technologiesUsed)) {
        exp.technologiesUsed.forEach((tech) => {
          const skillName = typeof tech === 'string' ? tech : tech?.skill || '';
          if (skillName) {
            const normalized = skillName.toLowerCase().trim();
            counts[normalized] = (counts[normalized] || 0) + 1;
          }
        });
      }

      // Collect achievement text and count explicit keywords
      if (exp.achievements && Array.isArray(exp.achievements)) {
        exp.achievements.forEach((achievement) => {
          const statement = typeof achievement === 'string' ? achievement : achievement?.statement;
          if (statement) allText.push(statement);
          const keywords = typeof achievement === 'string' ? [] : achievement?.keywords || [];
          if (Array.isArray(keywords)) {
            keywords.forEach((kw) => {
              if (kw) {
                const normalized = kw.toLowerCase().trim();
                counts[normalized] = (counts[normalized] || 0) + 1;
              }
            });
          }
        });
      }

      // Collect other text
      if (exp.responsibilities && Array.isArray(exp.responsibilities)) {
        exp.responsibilities.forEach((r) => {
          if (r) allText.push(r);
        });
      }
      if (exp.description) allText.push(exp.description);
    });

    // Count from ALL skill categories with evidenceFrom
    const skillCategories = [
      profile.skills?.technical,
      profile.skills?.frameworks,
      profile.skills?.tools,
      profile.skills?.programmingLanguages,
    ];

    skillCategories.forEach((category) => {
      if (category && Array.isArray(category)) {
        category.forEach((skill) => {
          if (skill?.name) {
            const normalized = skill.name.toLowerCase().trim();
            const evidenceCount = skill.evidenceFrom?.length || 1;
            counts[normalized] = (counts[normalized] || 0) + evidenceCount;
          }
        });
      }
    });

    // Count mentions in achievement/responsibility text for each skill
    const fullText = allText.join(' ');
    Object.keys(counts).forEach((skillKey) => {
      const textMentions = countInText(fullText, skillKey);
      if (textMentions > 0) {
        counts[skillKey] = counts[skillKey] + textMentions;
      }
    });

    return counts;
  }, [profile.experience, profile.skills]);

  // Get count for a skill
  const getSkillCount = useCallback(
    (skillName: string): number => {
      const normalized = skillName.toLowerCase().trim();
      return skillMentionCounts[normalized] || 1;
    },
    [skillMentionCounts]
  );

  // Sort skills by count (descending)
  const sortedTechnical = useMemo(() => {
    if (!profile.skills?.technical) return [];
    return [...profile.skills.technical].sort(
      (a, b) => getSkillCount(b.name) - getSkillCount(a.name)
    );
  }, [profile.skills?.technical, getSkillCount]);

  const sortedFrameworks = useMemo(() => {
    if (!profile.skills?.frameworks) return [];
    return [...profile.skills.frameworks].sort(
      (a, b) => getSkillCount(b.name) - getSkillCount(a.name)
    );
  }, [profile.skills?.frameworks, getSkillCount]);

  const sortedTools = useMemo(() => {
    if (!profile.skills?.tools) return [];
    return [...profile.skills.tools].sort((a, b) => getSkillCount(b.name) - getSkillCount(a.name));
  }, [profile.skills?.tools, getSkillCount]);

  if (
    !profile.skills?.technical?.length &&
    !profile.skills?.frameworks?.length &&
    !profile.skills?.tools?.length
  ) {
    return (
      <div className="empty-state">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <p>Skills analysis not available</p>
        <p className="hint">This may be due to rate limiting. Try re-uploading your resume.</p>
      </div>
    );
  }

  return (
    <div className="profile-skills">
      <p className="skills-intro">
        Skills are sorted by frequency of use across your experience. Higher counts indicate
        stronger evidence.
      </p>

      {sortedTechnical.length > 0 && (
        <div className="skills-section">
          <h3>Technical Skills ({sortedTechnical.length})</h3>
          <div className="skills-grid">
            {sortedTechnical.map((skill, i) => {
              const count = getSkillCount(skill.name);
              return (
                <div key={i} className="skill-item">
                  <div className="skill-header">
                    <span className="skill-name">
                      {skill.name}
                      <span className="skill-count">({count})</span>
                    </span>
                    <span className={`skill-level ${skill.proficiency}`}>{skill.proficiency}</span>
                  </div>
                  <div className="skill-meta">
                    {skill.yearsOfExperience > 0 && `${skill.yearsOfExperience} yrs`}
                    {skill.category && ` • ${skill.category}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sortedFrameworks.length > 0 && (
        <div className="skills-section">
          <h3>Frameworks & Libraries ({sortedFrameworks.length})</h3>
          <div className="tags">
            {sortedFrameworks.map((skill, i) => {
              const count = getSkillCount(skill.name);
              return (
                <span key={i} className="tag skill-tag-with-count">
                  {skill.name}
                  <span className="tag-count">({count})</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {sortedTools.length > 0 && (
        <div className="skills-section">
          <h3>Tools ({sortedTools.length})</h3>
          <div className="tags">
            {sortedTools.map((skill, i) => {
              const count = getSkillCount(skill.name);
              return (
                <span key={i} className="tag tag-outline skill-tag-with-count">
                  {skill.name}
                  <span className="tag-count">({count})</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {profile.skills?.clusters && profile.skills.clusters.length > 0 && (
        <div className="skills-section">
          <h3>Skill Clusters</h3>
          <div className="clusters-list">
            {profile.skills.clusters.map((cluster, i) => (
              <div key={i} className="cluster-card">
                <div className="cluster-header">
                  <span className="cluster-name">{cluster.name}</span>
                  <span className="cluster-strength">{cluster.strength}% strength</span>
                </div>
                <div className="cluster-skills">
                  {cluster.skills.map((skill, j) => (
                    <span key={j} className="tag tag-sm">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileAnswers({ profile }: { profile: MasterProfile }) {
  const [expandedAnswer, setExpandedAnswer] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!profile.answerBank?.commonQuestions?.length) {
    return (
      <div className="empty-state">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <p>Answer bank not available</p>
        <p className="hint">This may be due to rate limiting. Try re-uploading your resume.</p>
      </div>
    );
  }

  return (
    <div className="profile-answers">
      <p className="section-description">
        Pre-generated answers for common application questions based on your experience.
      </p>

      <div className="answers-list">
        {profile.answerBank.commonQuestions.map((qa, i) => (
          <div
            key={i}
            className={`answer-card ${expandedAnswer === qa.questionType ? 'expanded' : ''}`}
            onClick={() =>
              setExpandedAnswer(expandedAnswer === qa.questionType ? null : qa.questionType)
            }
          >
            <div className="answer-header">
              <span className="question-type">{formatQuestionType(qa.questionType)}</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`chevron ${expandedAnswer === qa.questionType ? 'rotated' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <p className="question-text">{qa.question}</p>
            {expandedAnswer === qa.questionType && (
              <div className="answer-content">
                <p>{qa.answer}</p>
                {qa.shortAnswer && (
                  <div className="short-answer">
                    <strong>Short version:</strong> {qa.shortAnswer}
                  </div>
                )}
                <button
                  className={`btn btn-sm ${copiedId === qa.questionType ? 'btn-success' : 'btn-ghost'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(qa.answer, qa.questionType);
                  }}
                >
                  {copiedId === qa.questionType ? 'Copied!' : 'Copy Answer'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function GeneratedProfiles({ profile }: { profile: MasterProfile }) {
  const { refreshProfile } = useProfile();
  const [selectedProfile, setSelectedProfile] = useState<GeneratedProfile | null>(
    profile.generatedProfiles?.[0] || null
  );

  if (!profile.generatedProfiles?.length) {
    return (
      <div className="empty-state">
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
        <p>Role-specific profiles not available</p>
        <p className="hint">This may be due to rate limiting. Try re-uploading your resume.</p>
      </div>
    );
  }

  return (
    <div className="generated-profiles">
      <div className="profiles-sidebar">
        {profile.generatedProfiles.map((gp) => (
          <div
            key={gp.id}
            className={`profile-card ${selectedProfile?.id === gp.id ? 'selected' : ''}`}
            onClick={() => setSelectedProfile(gp)}
          >
            <div className="profile-card-name">{gp.name}</div>
            <div className="profile-card-meta">{gp.targetRole}</div>
          </div>
        ))}
      </div>

      <div className="profile-detail">
        {selectedProfile ? (
          <>
            <div className="profile-detail-header">
              <h2>{selectedProfile.name}</h2>
              <span className="target-role">{selectedProfile.targetRole}</span>
            </div>

            <div className="detail-section">
              <h4>Tailored Summary</h4>
              <p>{selectedProfile.tailoredSummary}</p>
            </div>

            {selectedProfile.highlightedSkills?.length > 0 && (
              <div className="detail-section">
                <h4>Highlighted Skills</h4>
                <div className="tags">
                  {selectedProfile.highlightedSkills.map((skill, i) => (
                    <span key={i} className="tag">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedProfile.atsKeywords?.length > 0 && (
              <div className="detail-section">
                <h4>ATS Keywords</h4>
                <div className="tags">
                  {selectedProfile.atsKeywords.map((kw, i) => (
                    <span key={i} className="tag tag-outline">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="profile-actions">
              <button
                className="btn btn-primary"
                onClick={async () => {
                  if (!profile || !selectedProfile) return;
                  await sendMessage({
                    type: 'SET_ACTIVE_ROLE_PROFILE',
                    payload: { masterProfileId: profile.id, roleProfileId: selectedProfile.id },
                  });
                  await refreshProfile();
                }}
              >
                Use This Profile
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  // Navigate to resume generator page (handled by parent App)
                  window.dispatchEvent(
                    new CustomEvent('applysharp-navigate', { detail: 'profiles' })
                  );
                }}
              >
                Export Resume
              </button>
            </div>
          </>
        ) : (
          <div className="empty-detail">
            <p>Select a profile to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatQuestionType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Recommendation {
  id: string;
  type: 'warning' | 'suggestion';
  icon: string;
  title: string;
  description: string;
  action?: 'links' | 'experience' | 'certifications' | 'personal';
  updateHint?: string; // Hint for which Update Profile option to use
}

interface CompletedItem {
  id: string;
  icon: string;
  title: string;
}

function ProfileRecommendations({
  profile,
  onAddItem,
}: {
  profile: MasterProfile;
  onAddItem: (section: 'personal' | 'links' | 'certifications' | 'experience') => void;
}) {
  // Generate recommendations based on profile analysis
  const recommendations: Recommendation[] = [];
  const completedItems: CompletedItem[] = [];
  const totalChecks = 11;

  // Check for incomplete work experience entries
  const incompleteExperiences: string[] = [];
  profile.experience?.forEach((exp) => {
    const issues: string[] = [];
    if (!exp.title || exp.title.trim() === '') issues.push('missing job title');
    if (!exp.startDate || exp.startDate.trim() === '') issues.push('missing start date');
    if (!exp.achievements || exp.achievements.length === 0) issues.push('no achievements');

    if (issues.length > 0) {
      incompleteExperiences.push(`${exp.company || 'Unknown Company'}: ${issues.join(', ')}`);
    }
  });

  if (incompleteExperiences.length > 0) {
    recommendations.push({
      id: 'incomplete-experience',
      type: 'warning',
      icon: '💼',
      title: `Incomplete Work Experience (${incompleteExperiences.length})`,
      description:
        incompleteExperiences.slice(0, 2).join(' | ') +
        (incompleteExperiences.length > 2 ? ` (+${incompleteExperiences.length - 2} more)` : ''),
      action: 'experience',
      updateHint:
        'Use "Company / Role" to add job title, dates & responsibilities. Or "Achievement" to add accomplishments.',
    });
  } else if (profile.experience && profile.experience.length > 0) {
    completedItems.push({ id: 'experience', icon: '💼', title: 'Work Experience Complete' });
  }

  // Check for duplicate companies
  const companyNames = profile.experience?.map((e) => e.company?.toLowerCase().trim()) || [];
  const duplicateCompanies = companyNames.filter(
    (name, idx) => name && companyNames.indexOf(name) !== idx
  );
  const uniqueDuplicates = [...new Set(duplicateCompanies)];

  if (uniqueDuplicates.length > 0) {
    recommendations.push({
      id: 'duplicate-companies',
      type: 'warning',
      icon: '⚠️',
      title: `Duplicate Company Entries`,
      description: `"${uniqueDuplicates.map((d) => profile.experience?.find((e) => e.company?.toLowerCase() === d)?.company).join('", "')}" appears multiple times. Merge or remove duplicates.`,
      action: 'experience',
      updateHint:
        'Delete the duplicate entry and update the correct one with complete information.',
    });
  } else if (profile.experience && profile.experience.length > 1) {
    completedItems.push({ id: 'no-duplicates', icon: '✓', title: 'No Duplicate Companies' });
  }

  // Check for timeline issues (missing end dates, overlaps)
  const timelineIssues: string[] = [];
  const currentJobs = profile.experience?.filter((e) => e.isCurrent) || [];

  // Multiple current jobs
  if (currentJobs.length > 1) {
    timelineIssues.push(
      `${currentJobs.length} jobs marked as "Present" - only one should be current`
    );
  }

  // Jobs without end dates that aren't current (and there's a newer job)
  profile.experience?.forEach((exp, idx) => {
    if (!exp.isCurrent && !exp.endDate && idx > 0) {
      // There's a job before this one (newer), so this should have an end date
      timelineIssues.push(`${exp.company}: missing end date`);
    }
  });

  // Check for jobs that should have ended (older jobs still showing no end date)
  if (currentJobs.length === 1) {
    profile.experience?.forEach((exp) => {
      if (!exp.isCurrent && !exp.endDate && exp.startDate) {
        // This job has no end date but isn't marked current
        timelineIssues.push(`${exp.company}: needs end date (started ${exp.startDate})`);
      }
    });
  }

  if (timelineIssues.length > 0) {
    recommendations.push({
      id: 'timeline-issues',
      type: 'warning',
      icon: '📅',
      title: `Timeline Issues (${timelineIssues.length})`,
      description:
        timelineIssues.slice(0, 2).join(' | ') +
        (timelineIssues.length > 2 ? ` (+${timelineIssues.length - 2} more)` : ''),
      action: 'experience',
      updateHint:
        'Use "Company / Role" to fix dates. Previous jobs need end dates when you start a new role.',
    });
  } else if (profile.experience && profile.experience.length > 0) {
    completedItems.push({ id: 'timeline-ok', icon: '📅', title: 'Timeline Consistent' });
  }

  // Check LinkedIn
  if (!profile.personal?.linkedInUrl) {
    recommendations.push({
      id: 'linkedin',
      type: 'warning',
      icon: '🔗',
      title: 'Add LinkedIn URL',
      description:
        'Required by 80% of applications. Adds credibility and makes it easy for recruiters to find you.',
      action: 'links',
    });
  } else {
    completedItems.push({ id: 'linkedin', icon: '🔗', title: 'LinkedIn URL' });
  }

  // Check GitHub (for tech roles)
  const isTechRole =
    profile.careerContext?.primaryDomain?.toLowerCase().includes('engineer') ||
    profile.careerContext?.primaryDomain?.toLowerCase().includes('developer') ||
    profile.skills?.technical?.some((s) =>
      ['javascript', 'python', 'java', 'react', 'node', 'typescript'].includes(s.name.toLowerCase())
    );

  if (isTechRole && !profile.personal?.githubUrl) {
    recommendations.push({
      id: 'github',
      type: 'suggestion',
      icon: '💻',
      title: 'Add GitHub Profile',
      description:
        'Highly recommended for engineering roles. Showcase your code, contributions, and open source work.',
      action: 'links',
    });
  } else if (isTechRole) {
    completedItems.push({ id: 'github', icon: '💻', title: 'GitHub Profile' });
  } else {
    completedItems.push({ id: 'github', icon: '💻', title: 'GitHub (N/A)' });
  }

  // Check Portfolio
  if (!profile.personal?.portfolioUrl) {
    recommendations.push({
      id: 'portfolio',
      type: 'suggestion',
      icon: '🌐',
      title: 'Add Portfolio Website',
      description:
        'A portfolio helps you stand out and showcase your best work, projects, and case studies.',
      action: 'links',
    });
  } else {
    completedItems.push({ id: 'portfolio', icon: '🌐', title: 'Portfolio Website' });
  }

  // Check Projects
  const projectCount = profile.projects?.length || 0;
  if (projectCount < 2) {
    recommendations.push({
      id: 'projects',
      type: 'suggestion',
      icon: '📁',
      title: projectCount === 0 ? 'Add Projects' : 'Add More Projects',
      description:
        'Include 2-3 projects to demonstrate practical experience. Describe impact, technologies, and your role.',
      action: 'experience',
    });
  } else {
    completedItems.push({ id: 'projects', icon: '📁', title: `${projectCount} Projects` });
  }

  // Check Certifications
  const certCount = profile.certifications?.length || 0;
  if (certCount === 0) {
    recommendations.push({
      id: 'certifications',
      type: 'suggestion',
      icon: '📜',
      title: 'Add Certifications',
      description:
        'Certifications validate your skills and can be requirements for certain roles (AWS, Google Cloud, etc.).',
      action: 'certifications',
    });
  } else {
    completedItems.push({
      id: 'certifications',
      icon: '📜',
      title: `${certCount} Certification${certCount > 1 ? 's' : ''}`,
    });
  }

  // Check for achievements with metrics
  const allAchievements = profile.experience?.flatMap((e) => e.achievements || []) || [];
  const achievementsWithNumbers = allAchievements.filter((a) => {
    const text = typeof a === 'string' ? a : a.statement;
    return /\d+%|\d+x|\$\d+|\d+ (users|customers|engineers|team|million|thousand)/i.test(text);
  });

  if (allAchievements.length > 0 && achievementsWithNumbers.length < allAchievements.length * 0.5) {
    recommendations.push({
      id: 'metrics',
      type: 'suggestion',
      icon: '📊',
      title: 'Add Metrics to Achievements',
      description:
        'Quantify your impact with numbers, percentages, or scale. "Improved performance by 40%" is stronger than "Improved performance".',
      action: 'experience',
    });
  } else {
    completedItems.push({ id: 'metrics', icon: '📊', title: 'Quantified Achievements' });
  }

  // Check Answer Bank
  const answerCount = profile.answerBank?.commonQuestions?.length || 0;
  if (answerCount < 3) {
    recommendations.push({
      id: 'answers',
      type: 'suggestion',
      icon: '💬',
      title: 'Build Answer Bank',
      description:
        'Pre-generated answers for common questions speed up applications and ensure consistent, polished responses.',
    });
  } else {
    completedItems.push({ id: 'answers', icon: '💬', title: `${answerCount} Answer Templates` });
  }

  // Check contact info
  if (!profile.personal?.phone || !profile.personal?.email) {
    recommendations.push({
      id: 'contact',
      type: 'warning',
      icon: '📱',
      title: 'Complete Contact Info',
      description:
        'Ensure both phone and email are filled in. Missing contact info can disqualify your application.',
      action: 'personal',
    });
  } else {
    completedItems.push({ id: 'contact', icon: '📱', title: 'Contact Info Complete' });
  }

  // Calculate strength percentage
  const strengthPercent =
    totalChecks > 0 ? Math.round((completedItems.length / totalChecks) * 100) : 0;

  // Separate warnings and suggestions
  const warnings = recommendations.filter((r) => r.type === 'warning');
  const suggestions = recommendations.filter((r) => r.type === 'suggestion');

  return (
    <div className="recommendations-tab">
      {/* Profile Strength Header */}
      <div className="strength-header">
        <div className="strength-circle-container">
          <div
            className={`strength-circle ${strengthPercent >= 80 ? 'strength-high' : strengthPercent >= 50 ? 'strength-medium' : 'strength-low'}`}
          >
            <span className="strength-number">{strengthPercent}%</span>
            <span className="strength-label">Complete</span>
          </div>
        </div>
        <div className="strength-info">
          <h3>Profile Strength</h3>
          <p>
            {strengthPercent === 100
              ? 'Your profile is fully optimized for job applications!'
              : strengthPercent >= 80
                ? 'Great progress! A few more additions will maximize your profile.'
                : strengthPercent >= 50
                  ? 'Good start! Complete the recommendations below to improve your chances.'
                  : 'Your profile needs attention. Complete the items below to stand out.'}
          </p>
          <div className="strength-bar-large">
            <div
              className={`strength-fill ${strengthPercent >= 80 ? 'strength-high' : strengthPercent >= 50 ? 'strength-medium' : 'strength-low'}`}
              style={{ width: `${strengthPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Completed Items */}
      {completedItems.length > 0 && (
        <div className="completed-section">
          <h4>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Completed ({completedItems.length}/{totalChecks})
          </h4>
          <div className="completed-grid">
            {completedItems.map((item) => (
              <div key={item.id} className="completed-item">
                <span className="completed-icon">{item.icon}</span>
                <span className="completed-title">{item.title}</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="check-icon"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings - Required Items */}
      {warnings.length > 0 && (
        <div className="recommendations-section">
          <h4>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Required ({warnings.length})
          </h4>
          <div className="recommendations-list">
            {warnings.map((rec) => (
              <div key={rec.id} className="recommendation-item rec-warning">
                <span className="rec-item-icon">{rec.icon}</span>
                <div className="rec-content">
                  <div className="rec-item-title">{rec.title}</div>
                  <div className="rec-item-desc">{rec.description}</div>
                  {rec.updateHint && (
                    <div className="rec-hint">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 2L2 7l10 5 10-5-10-5z" />
                        <path d="M2 17l10 5 10-5" />
                        <path d="M2 12l10 5 10-5" />
                      </svg>
                      {rec.updateHint}
                    </div>
                  )}
                </div>
                {rec.action && (
                  <button
                    className="btn btn-primary btn-sm rec-action"
                    onClick={() => onAddItem(rec.action!)}
                  >
                    + Fix
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="recommendations-section">
          <h4>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            Suggestions ({suggestions.length})
          </h4>
          <div className="recommendations-list">
            {suggestions.map((rec) => (
              <div key={rec.id} className="recommendation-item rec-suggestion">
                <span className="rec-item-icon">{rec.icon}</span>
                <div className="rec-content">
                  <div className="rec-item-title">{rec.title}</div>
                  <div className="rec-item-desc">{rec.description}</div>
                  {rec.updateHint && (
                    <div className="rec-hint">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 2L2 7l10 5 10-5-10-5z" />
                        <path d="M2 17l10 5 10-5" />
                        <path d="M2 12l10 5 10-5" />
                      </svg>
                      {rec.updateHint}
                    </div>
                  )}
                </div>
                {rec.action && (
                  <button
                    className="btn btn-secondary btn-sm rec-action"
                    onClick={() => onAddItem(rec.action!)}
                  >
                    + Add
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Complete State */}
      {recommendations.length === 0 && (
        <div className="all-complete-message">
          <div className="complete-icon">🎉</div>
          <h3>Profile Complete!</h3>
          <p>
            Your profile is well-optimized for job applications. You can still add more details
            using the Update Profile button above.
          </p>
        </div>
      )}

      {/* Update Profile CTA */}
      {recommendations.length > 0 && (
        <div className="recommendations-cta">
          <p>
            Use the <strong>Update Profile</strong> button above to add any of these items quickly.
          </p>
        </div>
      )}
    </div>
  );
}
