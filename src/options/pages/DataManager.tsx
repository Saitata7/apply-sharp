import { useState } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import type { ExportData, ImportResult } from '@storage/export-import';
import { validateExportData } from '@storage/export-import';

// ── Download helpers ────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadText(content: string, filename: string, mimeType: string) {
  downloadBlob(new Blob([content], { type: mimeType }), filename);
}

// ── Component ───────────────────────────────────────────────────────────

export default function DataManager() {
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ExportData | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const clearMessages = () => {
    setError(null);
    setSuccessMessage(null);
    setImportResult(null);
  };

  // ── Export JSON ─────────────────────────────────────────────────────

  const handleExportJSON = async () => {
    clearMessages();
    setIsExporting(true);

    try {
      const response = await sendMessage<undefined, ExportData>({
        type: 'EXPORT_ALL_DATA',
      });

      if (response.success && response.data) {
        const json = JSON.stringify(response.data, null, 2);
        const date = new Date().toISOString().split('T')[0];
        downloadText(json, `applysharp-backup-${date}.json`, 'application/json');
        setSuccessMessage('Data exported successfully');
      } else {
        setError(response.error || 'Failed to export data');
      }
    } catch (err) {
      setError(`Export failed: ${(err as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // ── Export CSV ──────────────────────────────────────────────────────

  const handleExportCSV = async () => {
    clearMessages();
    setIsExportingCSV(true);

    const response = await sendMessage<undefined, string>({
      type: 'EXPORT_APPLICATIONS_CSV',
    });

    setIsExportingCSV(false);

    if (response.success && response.data) {
      const date = new Date().toISOString().split('T')[0];
      downloadText(response.data, `applysharp-applications-${date}.csv`, 'text/csv');
      setSuccessMessage('Applications exported as CSV');
    } else {
      setError(response.error || 'Failed to export applications');
    }
  };

  // ── Import: file selection + preview ────────────────────────────────

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    clearMessages();
    setImportPreview(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setError('Please select a .json file');
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validation = validateExportData(parsed);

      if (!validation.valid) {
        setError(`Invalid backup file: ${validation.errors.join(', ')}`);
        return;
      }

      setImportFile(file);
      setImportPreview(parsed as ExportData);
    } catch {
      setError('Failed to read file. Ensure it is a valid JSON backup.');
    }
  };

  // ── Import: execute ─────────────────────────────────────────────────

  const handleImport = async () => {
    if (!importPreview) return;
    clearMessages();
    setIsImporting(true);

    try {
      const response = await sendMessage<{ data: ExportData }, ImportResult>({
        type: 'IMPORT_DATA',
        payload: { data: importPreview },
      });

      if (response.success && response.data) {
        setImportResult(response.data);
        setImportPreview(null);
        setImportFile(null);
      } else {
        setError(response.error || 'Import failed');
      }
    } catch (err) {
      setError(`Import failed: ${(err as Error).message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const cancelImport = () => {
    setImportFile(null);
    setImportPreview(null);
    clearMessages();
  };

  return (
    <div className="page-container" style={{ maxWidth: 900, padding: '32px 24px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: '#e8ecf4', margin: '0 0 4px' }}>
        Data Manager
      </h1>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 24px' }}>
        Export your data for backup or transfer to another machine. All data stays local.
      </p>

      {/* ── Success / Error messages ───────────────────────────────────── */}
      {successMessage && (
        <div
          className="settings-section"
          style={{ padding: 14, marginBottom: 16, borderColor: '#10b981' }}
        >
          <p style={{ color: '#10b981', fontSize: 13, margin: 0 }}>{successMessage}</p>
        </div>
      )}
      {error && (
        <div
          className="settings-section"
          style={{ padding: 14, marginBottom: 16, borderColor: '#ef4444' }}
        >
          <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>
        </div>
      )}

      {/* ── Export Section ─────────────────────────────────────────────── */}
      <div className="settings-section" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e8ecf4', margin: '0 0 4px' }}>
          Export
        </h2>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
          Download a backup of all your data or export application history as a spreadsheet.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={handleExportJSON}
            disabled={isExporting}
            style={{ flex: '1 1 200px' }}
          >
            {isExporting ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />
                Exporting...
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
                  style={{ marginRight: 8 }}
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export All Data (JSON)
              </>
            )}
          </button>

          <button
            className="btn"
            onClick={handleExportCSV}
            disabled={isExportingCSV}
            style={{
              flex: '1 1 200px',
              background: '#1a1f2b',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#e8ecf4',
            }}
          >
            {isExportingCSV ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />
                Exporting...
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
                  style={{ marginRight: 8 }}
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="3" y1="15" x2="21" y2="15" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
                Export Applications (CSV)
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Import Section ─────────────────────────────────────────────── */}
      <div className="settings-section" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e8ecf4', margin: '0 0 4px' }}>
          Import
        </h2>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
          Restore from a previously exported JSON backup. Existing data with the same ID will be
          skipped (not overwritten).
        </p>

        {!importPreview ? (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
              border: '2px dashed #334155',
              borderRadius: 8,
              cursor: 'pointer',
              color: '#94a3b8',
              fontSize: 13,
              transition: 'border-color 0.2s',
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ marginRight: 10 }}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Choose a backup file (.json)
            <input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </label>
        ) : (
          <div>
            {/* Preview */}
            <div
              style={{
                background: '#0a0d13',
                borderRadius: 8,
                padding: 16,
                border: '1px solid rgba(255,255,255,0.06)',
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#e8ecf4',
                  marginBottom: 10,
                }}
              >
                Import Preview: {importFile?.name}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: 8,
                }}
              >
                <CountBadge label="Profiles" count={importPreview.data.masterProfiles.length} />
                <CountBadge label="Applications" count={importPreview.data.applications.length} />
                <CountBadge label="Jobs" count={importPreview.data.jobs.length} />
                <CountBadge
                  label="Resume Versions"
                  count={importPreview.data.resumeVersions.length}
                />
                <CountBadge label="Settings" count={importPreview.data.settings ? 1 : 0} />
              </div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 10 }}>
                Exported on {new Date(importPreview.exportedAt).toLocaleDateString()} (v
                {importPreview.version})
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={isImporting}
                style={{ flex: 1 }}
              >
                {isImporting ? (
                  <>
                    <span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />
                    Importing...
                  </>
                ) : (
                  'Import Data'
                )}
              </button>
              <button
                className="btn"
                onClick={cancelImport}
                style={{ background: '#1a1f2b', border: '1px solid #334155', color: '#94a3b8' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Import Result ──────────────────────────────────────────────── */}
      {importResult && (
        <div className="settings-section" style={{ padding: 20, marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#10b981', margin: '0 0 12px' }}>
            Import Complete
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 8,
              marginBottom: importResult.errors.length > 0 ? 12 : 0,
            }}
          >
            <CountBadge
              label="Profiles"
              count={importResult.imported.masterProfiles}
              color="#10b981"
            />
            <CountBadge
              label="Applications"
              count={importResult.imported.applications}
              color="#10b981"
            />
            <CountBadge label="Jobs" count={importResult.imported.jobs} color="#10b981" />
            <CountBadge
              label="Resume Versions"
              count={importResult.imported.resumeVersions}
              color="#10b981"
            />
            <CountBadge label="Skipped" count={importResult.skipped} color="#f59e0b" />
          </div>
          {importResult.errors.length > 0 && (
            <div style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>
              {importResult.errors.map((err, i) => (
                <div key={i}>{err}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function CountBadge({
  label,
  count,
  color = '#94a3b8',
}: {
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <div
      style={{
        padding: '8px 12px',
        background: '#1a1f2b',
        borderRadius: 6,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{count}</div>
      <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
    </div>
  );
}
