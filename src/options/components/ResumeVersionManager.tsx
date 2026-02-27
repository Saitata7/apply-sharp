import { useState, useEffect, useCallback } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import type { ResumeVersion } from '@shared/types/resume-version.types';
import ResumeVersionCard from './ResumeVersionCard';

interface ResumeVersionManagerProps {
  profileId: string;
  onClose: () => void;
}

export default function ResumeVersionManager({ profileId, onClose }: ResumeVersionManagerProps) {
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [loading, setLoading] = useState(true);

  const loadVersions = useCallback(
    async function loadVersions() {
      try {
        const response = await sendMessage<{ profileId: string }, ResumeVersion[]>({
          type: 'GET_RESUME_VERSIONS',
          payload: { profileId },
        });
        if (response.success && response.data) {
          // Sort newest first
          setVersions(
            response.data.sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )
          );
        }
      } catch (error) {
        console.error('[ResumeVersions] Failed to load:', error);
      } finally {
        setLoading(false);
      }
    },
    [profileId]
  );

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  async function handleDelete(id: string) {
    const response = await sendMessage({ type: 'DELETE_RESUME_VERSION', payload: id });
    if (response.success) {
      setVersions((prev) => prev.filter((v) => v.id !== id));
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Resume Versions</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
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
          {loading ? (
            <div className="loading-state">
              <div className="spinner" />
              <p>Loading versions...</p>
            </div>
          ) : versions.length === 0 ? (
            <div className="empty-state">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <h3>No saved versions</h3>
              <p>Generate a resume and click &ldquo;Save as Version&rdquo; to track it here</p>
            </div>
          ) : (
            <div className="rv-list">
              {versions.map((v) => (
                <ResumeVersionCard key={v.id} version={v} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
