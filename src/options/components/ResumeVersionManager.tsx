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
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);

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

  // Close modal on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleDelete(id: string) {
    try {
      const response = await sendMessage({ type: 'DELETE_RESUME_VERSION', payload: id });
      if (response.success) {
        setVersions((prev) => prev.filter((v) => v.id !== id));
      }
    } catch (error) {
      console.error('[ResumeVersions] Delete failed:', error);
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
          ) : compareIds ? (
            <VersionDiff
              a={versions.find((v) => v.id === compareIds[0])!}
              b={versions.find((v) => v.id === compareIds[1])!}
              onBack={() => setCompareIds(null)}
            />
          ) : (
            <>
              {versions.length >= 2 && (
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '12px' }}>
                  Select two versions to compare side by side.
                </p>
              )}
              <div className="rv-list">
                {versions.map((v) => (
                  <ResumeVersionCard
                    key={v.id}
                    version={v}
                    onDelete={handleDelete}
                    canCompare={versions.length >= 2}
                    onCompare={(id) => {
                      const other = versions.find((vv) => vv.id !== id);
                      if (other) setCompareIds([id, other.id]);
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function VersionDiff({ a, b, onBack }: { a: ResumeVersion; b: ResumeVersion; onBack: () => void }) {
  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const linesA = (a.contentSnapshot || '').split('\n');
  const linesB = (b.contentSnapshot || '').split('\n');
  const linesASet = new Set(linesA);
  const linesBSet = new Set(linesB);

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: '12px' }}>
        ← Back to versions
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>
            {a.name}
            {a.atsScore != null && (
              <span style={{ marginLeft: '8px', color: '#22c55e', fontWeight: 500 }}>
                ({a.atsScore}%)
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '8px' }}>
            {formatDate(a.createdAt)}
          </div>
          <pre
            style={{
              background: '#f8fafc',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '400px',
              overflowY: 'auto',
              border: '1px solid #e2e8f0',
            }}
          >
            {linesA.map((line, i) => {
              const inB = linesBSet.has(line);
              return (
                <div
                  key={i}
                  style={{
                    background: !line.trim() ? 'transparent' : inB ? 'transparent' : '#fef2f2',
                    padding: '1px 4px',
                    borderRadius: '2px',
                  }}
                >
                  {line || '\u00A0'}
                </div>
              );
            })}
          </pre>
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>
            {b.name}
            {b.atsScore != null && (
              <span style={{ marginLeft: '8px', color: '#22c55e', fontWeight: 500 }}>
                ({b.atsScore}%)
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '8px' }}>
            {formatDate(b.createdAt)}
          </div>
          <pre
            style={{
              background: '#f8fafc',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '400px',
              overflowY: 'auto',
              border: '1px solid #e2e8f0',
            }}
          >
            {linesB.map((line, i) => {
              const inA = linesASet.has(line);
              return (
                <div
                  key={i}
                  style={{
                    background: !line.trim() ? 'transparent' : inA ? 'transparent' : '#dcfce7',
                    padding: '1px 4px',
                    borderRadius: '2px',
                  }}
                >
                  {line || '\u00A0'}
                </div>
              );
            })}
          </pre>
        </div>
      </div>
    </div>
  );
}
