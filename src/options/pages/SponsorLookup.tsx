/**
 * Sponsor Lookup page (Feature #15 first iteration).
 *
 * Foundation for the Sponsor Badge content-script overlay that will show
 * on every job page. This page is the data-loading + manual-query interface:
 *
 *  1. User imports the JSON produced by tools/job-search/dol-process.py
 *     (paste or file upload). Stored in chrome.storage.local under
 *     'sponsorIndex'.
 *  2. Search box lets the user query any company by name (normalized
 *     match + substring fallback). Returns the same record the on-page
 *     overlay will eventually show.
 *  3. "Apply to Job Feed" button auto-classifies entries in the Job
 *     Feed CSV that were marked 'unknown' — turning the 232 unknown HN
 *     companies into real friendly/unfriendly classifications.
 *
 * The on-page badge content script (later iteration) will read from the
 * same 'sponsorIndex' storage key, so this page is also the operational
 * setup screen for the badge.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

interface SponsorRecord {
  displayName: string;
  filings: number;
  avgWage: number | null;
  topJobTitles: string[];
  topLocations: string[];
  certifiedCount: number;
  deniedCount: number;
  withdrawnCount: number;
}

type SponsorIndex = Record<string, SponsorRecord>;

interface JobFeedEntry {
  id: string;
  company: string;
  sponsorStatus: 'friendly' | 'unfriendly' | 'unknown';
  [k: string]: unknown;
}

const SPONSOR_INDEX_KEY = 'sponsorIndex';
const SPONSOR_INDEX_META_KEY = 'sponsorIndexMeta';
const JOB_FEED_KEY = 'jobFeed.entries';

interface IndexMeta {
  importedAt: number;
  recordCount: number;
  sourceLabel?: string;
}

function normalize(name: string): string {
  if (!name) return '';
  let s = name.toLowerCase().trim();
  s = s.replace(
    /\b(inc|incorporated|llc|l\.l\.c\.|corp|corporation|co|company|ltd|limited|plc|n\.a\.|na|lp|l\.p\.|services|usa|us|holdings|group)\b\.?/g,
    ''
  );
  s = s.replace(/[^\w\s]/g, ' ');
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

function lookupCompany(query: string, index: SponsorIndex): SponsorRecord[] {
  const qn = normalize(query);
  if (!qn) return [];
  const exact = index[qn];
  if (exact) return [exact];
  const hits: SponsorRecord[] = [];
  for (const [k, v] of Object.entries(index)) {
    if (k.includes(qn) || normalize(v.displayName).includes(qn)) {
      hits.push(v);
    }
  }
  hits.sort((a, b) => b.filings - a.filings);
  return hits.slice(0, 8);
}

function classifyByFilings(filings: number): 'friendly' | 'unfriendly' | 'unknown' {
  if (filings >= 50) return 'friendly';
  if (filings >= 10) return 'friendly';
  if (filings === 0) return 'unfriendly';
  return 'unknown';
}

function badgeColor(filings: number | null): { bg: string; fg: string; label: string } {
  if (filings === null) return { bg: '#f1f5f9', fg: '#64748b', label: 'No data' };
  if (filings >= 50) return { bg: '#dcfce7', fg: '#166534', label: '🟢 Strong sponsor' };
  if (filings >= 10) return { bg: '#fef3c7', fg: '#92400e', label: '🟡 Moderate sponsor' };
  if (filings >= 1) return { bg: '#fee2e2', fg: '#991b1b', label: '🔴 Light sponsor' };
  return { bg: '#fee2e2', fg: '#991b1b', label: '🔴 Not in DOL index' };
}

export default function SponsorLookup() {
  const [index, setIndex] = useState<SponsorIndex | null>(null);
  const [meta, setMeta] = useState<IndexMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [importJson, setImportJson] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [classifyResult, setClassifyResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await chrome.storage.local.get([SPONSOR_INDEX_KEY, SPONSOR_INDEX_META_KEY]);
        if (res[SPONSOR_INDEX_KEY]) setIndex(res[SPONSOR_INDEX_KEY] as SponsorIndex);
        if (res[SPONSOR_INDEX_META_KEY]) setMeta(res[SPONSOR_INDEX_META_KEY] as IndexMeta);
      } catch {
        // chrome.storage may be unavailable in test envs
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleImport = useCallback(async () => {
    setImportError(null);
    let parsed: SponsorIndex;
    try {
      parsed = JSON.parse(importJson);
    } catch (err) {
      setImportError(`Could not parse JSON: ${(err as Error).message}`);
      return;
    }
    if (!parsed || typeof parsed !== 'object') {
      setImportError('Imported value is not an object.');
      return;
    }
    const recordCount = Object.keys(parsed).length;
    if (recordCount === 0) {
      setImportError('JSON is empty.');
      return;
    }
    const newMeta: IndexMeta = {
      importedAt: Date.now(),
      recordCount,
      sourceLabel: 'DOL LCA disclosure (manual import)',
    };
    try {
      await chrome.storage.local.set({
        [SPONSOR_INDEX_KEY]: parsed,
        [SPONSOR_INDEX_META_KEY]: newMeta,
      });
      setIndex(parsed);
      setMeta(newMeta);
      setShowImport(false);
      setImportJson('');
    } catch (err) {
      setImportError(`Storage write failed: ${(err as Error).message}`);
    }
  }, [importJson]);

  const handleClear = useCallback(async () => {
    if (!confirm('Clear sponsor index? You will need to re-import.')) return;
    try {
      await chrome.storage.local.remove([SPONSOR_INDEX_KEY, SPONSOR_INDEX_META_KEY]);
      setIndex(null);
      setMeta(null);
    } catch {
      // ignore
    }
  }, []);

  const handleApplyToJobFeed = useCallback(async () => {
    if (!index) return;
    setClassifyResult(null);
    try {
      const res = await chrome.storage.local.get(JOB_FEED_KEY);
      const entries = (res[JOB_FEED_KEY] as JobFeedEntry[] | undefined) ?? [];
      if (entries.length === 0) {
        setClassifyResult('Job Feed is empty. Import the HN CSV first.');
        return;
      }
      let upgraded = 0;
      let unchanged = 0;
      const updated = entries.map((e) => {
        if (e.sponsorStatus !== 'unknown') {
          unchanged++;
          return e;
        }
        const hits = lookupCompany(e.company, index);
        if (hits.length === 0) {
          unchanged++;
          return e;
        }
        const top = hits[0];
        const newStatus = classifyByFilings(top.filings);
        if (newStatus !== 'unknown') {
          upgraded++;
          return { ...e, sponsorStatus: newStatus };
        }
        unchanged++;
        return e;
      });
      await chrome.storage.local.set({ [JOB_FEED_KEY]: updated });
      setClassifyResult(
        `Re-classified ${upgraded} of ${entries.length} feed entries. ${unchanged} unchanged.`
      );
    } catch (err) {
      setClassifyResult(`Failed: ${(err as Error).message}`);
    }
  }, [index]);

  const results = useMemo(() => (index ? lookupCompany(query, index) : []), [query, index]);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Sponsor Lookup</h1>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
          H-1B sponsor data sourced from DOL LCA disclosures. Look up any company before you apply,
          or auto-classify your Job Feed in one click.
        </p>
      </header>

      {loading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: 'var(--tx-secondary)',
            padding: 16,
          }}
        >
          <div className="spinner-sm" aria-hidden="true" />
          <span>Loading…</span>
        </div>
      )}

      {!loading && !index && (
        <div
          style={{
            padding: 24,
            border: '1px dashed #cbd5e1',
            borderRadius: 6,
            background: '#f8fafc',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>No sponsor data loaded</h2>
          <ol style={{ margin: '12px 0', paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
            <li>
              Download the latest DOL LCA disclosure XLSX from{' '}
              <a
                href="https://www.dol.gov/agencies/eta/foreign-labor/performance"
                target="_blank"
                rel="noopener noreferrer"
              >
                the DOL Performance Data page
              </a>
              .
            </li>
            <li>
              Save it to <code>tools/job-search/data/</code>.
            </li>
            <li>
              Run the processor:
              <pre
                style={{
                  background: '#0f1419',
                  color: '#e2e8f0',
                  padding: 10,
                  borderRadius: 4,
                  marginTop: 6,
                  fontSize: 12,
                  overflowX: 'auto',
                }}
              >{`python3 tools/job-search/dol-process.py \\
  --input tools/job-search/data/LCA_Disclosure_Data_FY2025_Q4.xlsx`}</pre>
            </li>
            <li>
              Open <code>tools/job-search/data/sponsors-index.json</code>, copy all, and click
              Import below.
            </li>
          </ol>
          <button
            onClick={() => setShowImport(true)}
            style={{
              padding: '8px 16px',
              border: 0,
              borderRadius: 6,
              background: '#0f1419',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              marginTop: 8,
            }}
          >
            Import sponsor JSON
          </button>
        </div>
      )}

      {!loading && index && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <StatCard label="Companies indexed" value={meta?.recordCount.toLocaleString() ?? '?'} />
            <StatCard
              label="Last imported"
              value={meta?.importedAt ? new Date(meta.importedAt).toLocaleDateString() : '?'}
            />
            <StatCard label="Source" value="DOL LCA" />
          </div>

          <div style={{ marginBottom: 20 }}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a company name (e.g., 'Bank of America', 'Stripe', 'Anthropic')"
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 16,
                border: '1px solid #cbd5e1',
                borderRadius: 6,
              }}
            />
          </div>

          {query && results.length === 0 && (
            <div
              style={{
                padding: 16,
                background: '#fef2f2',
                color: '#991b1b',
                border: '1px solid #fecaca',
                borderRadius: 6,
                fontSize: 14,
              }}
            >
              No matches in the DOL index. This usually means: (a) the company filed zero LCAs in
              this quarter, (b) they file under a different legal name, or (c) they don&apos;t
              sponsor H-1B at all. Treat as 🔴 unfriendly until proven otherwise.
            </div>
          )}

          {results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {results.map((r) => {
                const badge = badgeColor(r.filings);
                return (
                  <div
                    key={r.displayName}
                    style={{
                      padding: 16,
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 8,
                      }}
                    >
                      <h3 style={{ margin: 0, fontSize: 16 }}>{r.displayName}</h3>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 500,
                          background: badge.bg,
                          color: badge.fg,
                        }}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 16,
                        fontSize: 13,
                        color: '#475569',
                      }}
                    >
                      <div>
                        <div style={statLabelStyle}>LCA filings</div>
                        <div style={{ fontSize: 18, fontWeight: 600, color: '#0f1419' }}>
                          {r.filings.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div style={statLabelStyle}>Avg wage</div>
                        <div style={{ fontSize: 18, fontWeight: 600, color: '#0f1419' }}>
                          {r.avgWage ? `$${r.avgWage.toLocaleString()}` : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={statLabelStyle}>Certified</div>
                        <div style={{ fontSize: 18, fontWeight: 600, color: '#166534' }}>
                          {r.certifiedCount.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div style={statLabelStyle}>Denied</div>
                        <div style={{ fontSize: 18, fontWeight: 600, color: '#991b1b' }}>
                          {r.deniedCount.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    {r.topJobTitles.length > 0 && (
                      <div style={{ marginTop: 12, fontSize: 13, color: '#475569' }}>
                        <strong>Top titles sponsored:</strong>{' '}
                        {r.topJobTitles.slice(0, 5).join(' · ')}
                      </div>
                    )}
                    {r.topLocations.length > 0 && (
                      <div style={{ marginTop: 4, fontSize: 13, color: '#475569' }}>
                        <strong>Locations:</strong> {r.topLocations.slice(0, 5).join(' · ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div
            style={{
              marginTop: 32,
              padding: 16,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16 }}>Auto-classify Job Feed</h3>
            <p style={{ margin: '4px 0 12px', color: '#64748b', fontSize: 13 }}>
              For every entry in your Job Feed currently marked &quot;unknown&quot;, re-run the
              sponsor classification using this DOL data. Friendly/unfriendly determinations stay
              as-is.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={handleApplyToJobFeed}
                style={{
                  padding: '8px 16px',
                  border: 0,
                  borderRadius: 6,
                  background: '#0f1419',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Re-classify Job Feed entries
              </button>
              {classifyResult && (
                <span style={{ fontSize: 13, color: '#475569' }}>{classifyResult}</span>
              )}
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              padding: 12,
              fontSize: 13,
              color: '#94a3b8',
              display: 'flex',
              gap: 12,
            }}
          >
            <button
              onClick={() => setShowImport(true)}
              style={{
                background: 'transparent',
                border: 0,
                color: '#475569',
                cursor: 'pointer',
                fontSize: 13,
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              Re-import sponsor JSON
            </button>
            <button
              onClick={handleClear}
              style={{
                background: 'transparent',
                border: 0,
                color: '#991b1b',
                cursor: 'pointer',
                fontSize: 13,
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              Clear index
            </button>
          </div>
        </>
      )}

      {showImport && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 20, 25, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowImport(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              padding: 24,
              borderRadius: 8,
              width: 760,
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>Import sponsor JSON</h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
              Paste the contents of <code>tools/job-search/data/sponsors-index.json</code>. Replaces
              any existing data.
            </p>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='{"bank of america": { "displayName": "Bank of America Corporation", ... }, ... }'
              style={{
                flex: 1,
                minHeight: 320,
                padding: 12,
                fontFamily: 'Menlo, Monaco, monospace',
                fontSize: 12,
                border: '1px solid #cbd5e1',
                borderRadius: 4,
                resize: 'vertical',
              }}
            />
            {importError && (
              <div
                role="alert"
                style={{
                  padding: 8,
                  background: '#fef2f2',
                  color: '#991b1b',
                  border: '1px solid #fecaca',
                  borderRadius: 4,
                  fontSize: 13,
                }}
              >
                {importError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowImport(false)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #cbd5e1',
                  borderRadius: 4,
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                disabled={!importJson.trim()}
                onClick={handleImport}
                style={{
                  padding: '8px 16px',
                  border: 0,
                  borderRadius: 4,
                  background: importJson.trim() ? '#0f1419' : '#94a3b8',
                  color: '#fff',
                  cursor: importJson.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        padding: 16,
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 6,
      }}
    >
      <div style={statLabelStyle}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: '#0f1419', marginTop: 4 }}>{value}</div>
    </div>
  );
}

const statLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  fontWeight: 500,
};
