/**
 * Job Feed page.
 *
 * A daily driver queue: every job lead Sai is tracking, ranked by visa
 * sponsor status + stack score, with one-click filtering. First iteration
 * imports from CSV paste (the HN scraper output) and supports manual add
 * by URL. Later iterations wire this to scheduled scrapers (Dice,
 * BuiltIn, direct careers pages), the Sponsor Badge data, and the
 * "Prepare application" autofill pipeline.
 *
 * Data stored in chrome.storage.local under 'jobFeed.entries'. No backend
 * messages yet — pure frontend + local storage. When the scraper backend
 * lands we move writes to IndexedDB through a repo layer.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';

export type SponsorStatus = 'friendly' | 'unfriendly' | 'unknown';
export type EntryStatus =
  | 'new'
  | 'seen'
  | 'applied'
  | 'interviewing'
  | 'rejected'
  | 'offer'
  | 'skipped';
export type EntrySource = 'hn' | 'linkedin' | 'dice' | 'builtin' | 'manual' | 'other';

export interface JobFeedEntry {
  id: string;
  company: string;
  title?: string;
  location?: string;
  url?: string;
  sponsorStatus: SponsorStatus;
  stackScore?: number;
  monthsActive?: number;
  matched?: string[];
  source: EntrySource;
  sourceRef?: string;
  excerpt?: string;
  notes?: string;
  addedAt: number;
  status: EntryStatus;
  appliedAt?: number;
}

const STORAGE_KEY = 'jobFeed.entries';

interface FilterState {
  sponsorStatus: SponsorStatus | 'all';
  status: EntryStatus | 'all' | 'open';
  source: EntrySource | 'all';
  minScore: number;
  search: string;
}

const DEFAULT_FILTER: FilterState = {
  sponsorStatus: 'all',
  status: 'open',
  source: 'all',
  minScore: 0,
  search: '',
};

type SortField = 'score' | 'addedAt' | 'monthsActive' | 'company';
type SortDirection = 'asc' | 'desc';

async function loadEntries(): Promise<JobFeedEntry[]> {
  try {
    const res = await chrome.storage.local.get(STORAGE_KEY);
    const raw = res?.[STORAGE_KEY];
    return Array.isArray(raw) ? (raw as JobFeedEntry[]) : [];
  } catch {
    return [];
  }
}

async function saveEntries(entries: JobFeedEntry[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: entries });
  } catch {
    // Storage quota or extension context — surface via UI in a later iteration
  }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Parse CSV in the shape the HN scraper produces
 * (threadDate, commentId, company, location, visa, stackScore,
 *  monthsActive, matched, hnLink, allLinks, excerpt).
 * Also accepts a minimal shape (company, url) for manual batches.
 */
function parseHnCsv(text: string): JobFeedEntry[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const iCompany = col('company');
  const iLocation = col('location');
  const iVisa = col('visa');
  const iScore = col('stackscore');
  const iMonths = col('monthsactive');
  const iMatched = col('matched');
  const iLink = col('hnlink');
  const iExcerpt = col('excerpt');
  const iTitle = col('title');
  const iUrl = col('url');

  const now = Date.now();
  const out: JobFeedEntry[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvLine(lines[li]);
    const company = (iCompany >= 0 ? cells[iCompany] : cells[0] || '').trim();
    if (!company) continue;
    const visaRaw = iVisa >= 0 ? (cells[iVisa] || '').toLowerCase() : 'unknown';
    const sponsorStatus: SponsorStatus =
      visaRaw === 'friendly' || visaRaw === 'unfriendly' ? (visaRaw as SponsorStatus) : 'unknown';
    const url = (iLink >= 0 ? cells[iLink] : iUrl >= 0 ? cells[iUrl] : '').trim();
    const source: EntrySource = iLink >= 0 ? 'hn' : 'manual';
    out.push({
      id: `${source}-${(url || company).replace(/\s+/g, '-')}-${li}`,
      company,
      title: iTitle >= 0 ? cells[iTitle]?.trim() : undefined,
      location: iLocation >= 0 ? cells[iLocation]?.trim() : undefined,
      url: url || undefined,
      sponsorStatus,
      stackScore: iScore >= 0 ? Number(cells[iScore]) || 0 : undefined,
      monthsActive: iMonths >= 0 ? Number(cells[iMonths]) || undefined : undefined,
      matched:
        iMatched >= 0 && cells[iMatched] ? cells[iMatched].split(';').filter(Boolean) : undefined,
      source,
      sourceRef: url || undefined,
      excerpt: iExcerpt >= 0 ? cells[iExcerpt]?.trim() : undefined,
      addedAt: now,
      status: 'new',
    });
  }
  return out;
}

function mergeEntries(
  existing: JobFeedEntry[],
  incoming: JobFeedEntry[]
): { entries: JobFeedEntry[]; added: number; duplicates: number } {
  const byKey = new Map<string, JobFeedEntry>();
  for (const e of existing) {
    byKey.set(keyOf(e), e);
  }
  let added = 0;
  let duplicates = 0;
  for (const e of incoming) {
    const k = keyOf(e);
    if (byKey.has(k)) {
      duplicates++;
      continue;
    }
    byKey.set(k, e);
    added++;
  }
  return { entries: [...byKey.values()], added, duplicates };
}

function keyOf(e: JobFeedEntry): string {
  if (e.url) return `url:${e.url.toLowerCase()}`;
  return `co:${e.company.toLowerCase().trim()}::${(e.title || '').toLowerCase().trim()}`;
}

function applyFilter(entries: JobFeedEntry[], f: FilterState): JobFeedEntry[] {
  return entries.filter((e) => {
    if (f.sponsorStatus !== 'all' && e.sponsorStatus !== f.sponsorStatus) return false;
    if (f.status === 'open') {
      if (e.status === 'applied' || e.status === 'rejected' || e.status === 'skipped') return false;
    } else if (f.status !== 'all' && e.status !== f.status) return false;
    if (f.source !== 'all' && e.source !== f.source) return false;
    if (f.minScore > 0 && (e.stackScore ?? 0) < f.minScore) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const hit =
        e.company.toLowerCase().includes(q) ||
        (e.title?.toLowerCase().includes(q) ?? false) ||
        (e.location?.toLowerCase().includes(q) ?? false) ||
        (e.excerpt?.toLowerCase().includes(q) ?? false);
      if (!hit) return false;
    }
    return true;
  });
}

function sortEntries(
  entries: JobFeedEntry[],
  field: SortField,
  dir: SortDirection
): JobFeedEntry[] {
  const mult = dir === 'asc' ? 1 : -1;
  const copy = [...entries];
  copy.sort((a, b) => {
    const rank = { friendly: 2, unknown: 1, unfriendly: 0 };
    const visaCmp = rank[b.sponsorStatus] - rank[a.sponsorStatus];
    if (visaCmp !== 0) return visaCmp;
    let av: number | string;
    let bv: number | string;
    switch (field) {
      case 'score':
        av = a.stackScore ?? 0;
        bv = b.stackScore ?? 0;
        break;
      case 'monthsActive':
        av = a.monthsActive ?? 0;
        bv = b.monthsActive ?? 0;
        break;
      case 'addedAt':
        av = a.addedAt;
        bv = b.addedAt;
        break;
      case 'company':
        av = a.company.toLowerCase();
        bv = b.company.toLowerCase();
        break;
    }
    if (av < bv) return -1 * mult;
    if (av > bv) return 1 * mult;
    return 0;
  });
  return copy;
}

function statusBadgeStyle(s: EntryStatus): React.CSSProperties {
  const styles: Record<EntryStatus, React.CSSProperties> = {
    new: { background: 'var(--cl-blue-glow)', color: 'var(--cl-blue)' },
    seen: { background: 'var(--sf-overlay)', color: 'var(--tx-secondary)' },
    applied: { background: 'var(--cl-emerald-glow)', color: 'var(--cl-emerald)' },
    interviewing: { background: 'var(--cl-orange-glow)', color: 'var(--cl-orange)' },
    rejected: { background: 'var(--cl-rose-glow)', color: 'var(--cl-rose)' },
    offer: { background: 'var(--cl-emerald-glow)', color: 'var(--cl-emerald)' },
    skipped: { background: 'var(--sf-overlay)', color: 'var(--tx-muted)' },
  };
  return {
    ...styles[s],
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
    textTransform: 'capitalize',
  };
}

function sponsorBadgeStyle(s: SponsorStatus): React.CSSProperties {
  const styles: Record<SponsorStatus, React.CSSProperties> = {
    friendly: {
      background: 'var(--cl-emerald-glow)',
      color: 'var(--cl-emerald)',
      borderColor: 'var(--cl-emerald-glow)',
    },
    unfriendly: {
      background: 'var(--cl-rose-glow)',
      color: 'var(--cl-rose)',
      borderColor: 'var(--cl-rose-glow)',
    },
    unknown: {
      background: 'var(--sf-overlay)',
      color: 'var(--tx-secondary)',
      borderColor: 'var(--bd-default)',
    },
  };
  return {
    ...styles[s],
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
    border: '1px solid',
  };
}

interface ImportModalProps {
  onImport: (text: string) => void;
  onClose: () => void;
}

function ImportModal({ onImport, onClose }: ImportModalProps) {
  const [text, setText] = useState('');
  return (
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
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--sf-raised)',
          padding: 24,
          borderRadius: 8,
          width: 720,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>Import jobs from CSV</h2>
        <p style={{ margin: 0, color: 'var(--tx-secondary)', fontSize: 13, lineHeight: 1.5 }}>
          Paste the content of your HN scraper CSV (or any CSV with at least a <code>company</code>{' '}
          column). Duplicates are detected by URL or company+title and skipped automatically.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="threadDate,commentId,company,location,visa,stackScore,monthsActive,..."
          style={{
            flex: 1,
            minHeight: 300,
            padding: 12,
            fontFamily: 'Menlo, Monaco, monospace',
            fontSize: 12,
            border: '1px solid var(--bd-default)',
            borderRadius: 4,
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--bd-default)',
              borderRadius: 4,
              background: 'var(--sf-raised)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            disabled={!text.trim()}
            onClick={() => {
              onImport(text);
              onClose();
            }}
            style={{
              padding: '8px 16px',
              border: 0,
              borderRadius: 4,
              background: text.trim() ? 'var(--brand)' : 'var(--tx-muted)',
              color: '#fff',
              cursor: text.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

interface AddManualModalProps {
  onAdd: (entry: JobFeedEntry) => void;
  onClose: () => void;
}

function AddManualModal({ onAdd, onClose }: AddManualModalProps) {
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const canSubmit = company.trim().length > 0;
  return (
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
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--sf-raised)',
          padding: 24,
          borderRadius: 8,
          width: 520,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>Add a job manually</h2>
        <input
          autoFocus
          placeholder="Company (required)"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          style={{
            padding: 8,
            fontSize: 14,
            border: '1px solid var(--bd-default)',
            borderRadius: 4,
          }}
        />
        <input
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            padding: 8,
            fontSize: 14,
            border: '1px solid var(--bd-default)',
            borderRadius: 4,
          }}
        />
        <input
          placeholder="URL to job post"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{
            padding: 8,
            fontSize: 14,
            border: '1px solid var(--bd-default)',
            borderRadius: 4,
          }}
        />
        <textarea
          placeholder="Notes (why it's a fit, contacts found, etc.)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{
            padding: 8,
            fontSize: 14,
            border: '1px solid var(--bd-default)',
            borderRadius: 4,
            minHeight: 80,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--bd-default)',
              borderRadius: 4,
              background: 'var(--sf-raised)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit}
            onClick={() => {
              const id = `manual-${Date.now()}`;
              onAdd({
                id,
                company: company.trim(),
                title: title.trim() || undefined,
                url: url.trim() || undefined,
                sponsorStatus: 'unknown',
                source: 'manual',
                notes: notes.trim() || undefined,
                addedAt: Date.now(),
                status: 'new',
              });
              onClose();
            }}
            style={{
              padding: '8px 16px',
              border: 0,
              borderRadius: 4,
              background: canSubmit ? 'var(--brand)' : 'var(--tx-muted)',
              color: '#fff',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

export default function JobFeed() {
  const [entries, setEntries] = useState<JobFeedEntry[]>([]);
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [showImport, setShowImport] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const loaded = await loadEntries();
      setEntries(loaded);
      setLoading(false);
    })();
  }, []);

  const persist = useCallback(async (next: JobFeedEntry[]) => {
    setEntries(next);
    await saveEntries(next);
  }, []);

  const handleImport = useCallback(
    async (text: string) => {
      const parsed = parseHnCsv(text);
      if (parsed.length === 0) {
        setToast('Could not parse any rows. Check the CSV has a "company" header.');
        return;
      }
      const { entries: merged, added, duplicates } = mergeEntries(entries, parsed);
      await persist(merged);
      setToast(`Imported ${added} new (${duplicates} duplicates skipped).`);
    },
    [entries, persist]
  );

  const handleAddManual = useCallback(
    async (entry: JobFeedEntry) => {
      const { entries: merged, added, duplicates } = mergeEntries(entries, [entry]);
      await persist(merged);
      setToast(
        added === 1
          ? 'Added to feed.'
          : duplicates === 1
            ? 'Already in feed, no duplicate added.'
            : ''
      );
    },
    [entries, persist]
  );

  const updateStatus = useCallback(
    async (id: string, status: EntryStatus) => {
      const next = entries.map((e) =>
        e.id === id
          ? {
              ...e,
              status,
              appliedAt: status === 'applied' && !e.appliedAt ? Date.now() : e.appliedAt,
            }
          : e
      );
      await persist(next);
    },
    [entries, persist]
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      const next = entries.filter((e) => e.id !== id);
      await persist(next);
    },
    [entries, persist]
  );

  const toggleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'company' ? 'asc' : 'desc');
    }
  };

  const filtered = useMemo(() => applyFilter(entries, filter), [entries, filter]);
  const sorted = useMemo(
    () => sortEntries(filtered, sortField, sortDir),
    [filtered, sortField, sortDir]
  );

  const stats = useMemo(() => {
    const total = entries.length;
    const friendly = entries.filter((e) => e.sponsorStatus === 'friendly').length;
    const unfriendly = entries.filter((e) => e.sponsorStatus === 'unfriendly').length;
    const applied = entries.filter((e) => e.status === 'applied').length;
    const open = entries.filter(
      (e) => e.status !== 'applied' && e.status !== 'rejected' && e.status !== 'skipped'
    ).length;
    const appliedToday = entries.filter((e) => {
      if (!e.appliedAt) return false;
      const ageH = (Date.now() - e.appliedAt) / 1000 / 60 / 60;
      return ageH < 24;
    }).length;
    return { total, friendly, unfriendly, open, applied, appliedToday };
  }, [entries]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Job Feed</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--tx-secondary)', fontSize: 14 }}>
            Every lead you&apos;re tracking, ranked by sponsor status and stack match. Import from
            the HN scraper CSV or add jobs by URL.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowImport(true)}
            style={{
              padding: '8px 14px',
              border: '1px solid var(--bd-default)',
              borderRadius: 6,
              background: 'var(--sf-raised)',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Import CSV
          </button>
          <button
            onClick={() => setShowManualAdd(true)}
            style={{
              padding: '8px 14px',
              border: 0,
              borderRadius: 6,
              background: 'var(--brand)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            + Add job
          </button>
        </div>
      </header>

      {/* Stats strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <StatCard label="Total leads" value={stats.total} />
        <StatCard label="Open" value={stats.open} />
        <StatCard label="Visa-friendly" value={stats.friendly} accent="#065f46" />
        <StatCard label="Applied" value={stats.applied} />
        <StatCard label="Applied today" value={stats.appliedToday} accent="#1e40af" />
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 12,
          padding: 12,
          background: 'var(--sf-overlay)',
          border: '1px solid var(--bd-default)',
          borderRadius: 6,
        }}
      >
        <input
          placeholder="Search company, title, location..."
          value={filter.search}
          onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          style={{
            flex: '1 1 220px',
            padding: '6px 10px',
            fontSize: 14,
            border: '1px solid var(--bd-default)',
            borderRadius: 4,
          }}
        />
        <select
          value={filter.sponsorStatus}
          onChange={(e) =>
            setFilter((f) => ({
              ...f,
              sponsorStatus: e.target.value as FilterState['sponsorStatus'],
            }))
          }
          style={filterSelectStyle}
        >
          <option value="all">All sponsor status</option>
          <option value="friendly">Friendly only</option>
          <option value="unknown">Unknown only</option>
          <option value="unfriendly">Unfriendly only</option>
        </select>
        <select
          value={filter.status}
          onChange={(e) =>
            setFilter((f) => ({ ...f, status: e.target.value as FilterState['status'] }))
          }
          style={filterSelectStyle}
        >
          <option value="open">Open (not closed)</option>
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="seen">Seen</option>
          <option value="applied">Applied</option>
          <option value="interviewing">Interviewing</option>
          <option value="rejected">Rejected</option>
          <option value="offer">Offer</option>
          <option value="skipped">Skipped</option>
        </select>
        <select
          value={filter.source}
          onChange={(e) =>
            setFilter((f) => ({ ...f, source: e.target.value as FilterState['source'] }))
          }
          style={filterSelectStyle}
        >
          <option value="all">All sources</option>
          <option value="hn">HN</option>
          <option value="linkedin">LinkedIn</option>
          <option value="dice">Dice</option>
          <option value="builtin">BuiltIn</option>
          <option value="manual">Manual</option>
          <option value="other">Other</option>
        </select>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--tx-secondary)',
          }}
        >
          Min score
          <input
            type="number"
            min={0}
            max={40}
            value={filter.minScore}
            onChange={(e) => setFilter((f) => ({ ...f, minScore: Number(e.target.value) || 0 }))}
            style={{
              width: 60,
              padding: '4px 8px',
              fontSize: 14,
              border: '1px solid var(--bd-default)',
              borderRadius: 4,
            }}
          />
        </label>
        <button
          onClick={() => setFilter(DEFAULT_FILTER)}
          style={{
            padding: '6px 12px',
            border: '1px solid var(--bd-default)',
            borderRadius: 4,
            background: 'var(--sf-raised)',
            cursor: 'pointer',
            fontSize: 13,
            color: 'var(--tx-secondary)',
          }}
        >
          Reset
        </button>
        <div
          style={{
            marginLeft: 'auto',
            alignSelf: 'center',
            fontSize: 13,
            color: 'var(--tx-secondary)',
          }}
        >
          Showing {sorted.length} / {entries.length}
        </div>
      </div>

      {loading && (
        <div
          style={{
            padding: 48,
            textAlign: 'center',
            color: 'var(--tx-secondary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div className="spinner" aria-hidden="true" />
          <span>Loading…</span>
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div
          style={{
            padding: 48,
            textAlign: 'center',
            border: '1px dashed #cbd5e1',
            borderRadius: 6,
            color: 'var(--tx-secondary)',
          }}
        >
          <p style={{ margin: 0, fontSize: 16 }}>No jobs in your feed yet.</p>
          <p style={{ margin: '8px 0 0', fontSize: 13 }}>
            Click <strong>Import CSV</strong> to paste your HN scraper output, or{' '}
            <strong>+ Add job</strong> to add one by URL.
          </p>
        </div>
      )}

      {!loading && entries.length > 0 && sorted.length === 0 && (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: 'var(--tx-secondary)',
            fontSize: 14,
          }}
        >
          No jobs match these filters.
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <div style={{ border: '1px solid var(--bd-default)', borderRadius: 6, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--sf-overlay)' }}>
                <SortHeader
                  label="Company"
                  field="company"
                  active={sortField}
                  dir={sortDir}
                  onClick={toggleSort}
                />
                <th style={thStyle}>Title / Location</th>
                <th style={thStyle}>Sponsor</th>
                <SortHeader
                  label="Score"
                  field="score"
                  active={sortField}
                  dir={sortDir}
                  onClick={toggleSort}
                />
                <SortHeader
                  label="Active"
                  field="monthsActive"
                  active={sortField}
                  dir={sortDir}
                  onClick={toggleSort}
                />
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{e.company}</div>
                    <div style={{ fontSize: 12, color: 'var(--tx-muted)' }}>{e.source}</div>
                  </td>
                  <td style={tdStyle}>
                    {e.title && <div style={{ fontSize: 13 }}>{e.title}</div>}
                    {e.location && (
                      <div style={{ fontSize: 12, color: 'var(--tx-secondary)' }}>{e.location}</div>
                    )}
                    {e.excerpt && (
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--tx-muted)',
                          marginTop: 4,
                          maxWidth: 400,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={e.excerpt}
                      >
                        {e.excerpt.slice(0, 120)}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={sponsorBadgeStyle(e.sponsorStatus)}>{e.sponsorStatus}</span>
                  </td>
                  <td style={tdStyle}>{e.stackScore ?? '-'}</td>
                  <td style={tdStyle}>{e.monthsActive ? `${e.monthsActive}mo` : '-'}</td>
                  <td style={tdStyle}>
                    <select
                      value={e.status}
                      onChange={(ev) => updateStatus(e.id, ev.target.value as EntryStatus)}
                      style={{
                        ...statusBadgeStyle(e.status),
                        border: 0,
                        cursor: 'pointer',
                      }}
                    >
                      <option value="new">New</option>
                      <option value="seen">Seen</option>
                      <option value="applied">Applied</option>
                      <option value="interviewing">Interviewing</option>
                      <option value="rejected">Rejected</option>
                      <option value="offer">Offer</option>
                      <option value="skipped">Skipped</option>
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {e.url && (
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={actionLinkStyle}
                          onClick={() => {
                            if (e.status === 'new') {
                              void updateStatus(e.id, 'seen');
                            }
                          }}
                        >
                          Open
                        </a>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${e.company} from feed?`)) void deleteEntry(e.id);
                        }}
                        style={{
                          padding: '4px 10px',
                          border: '1px solid #fecaca',
                          borderRadius: 4,
                          background: 'var(--sf-raised)',
                          color: 'var(--cl-rose)',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showImport && <ImportModal onImport={handleImport} onClose={() => setShowImport(false)} />}
      {showManualAdd && (
        <AddManualModal onAdd={handleAddManual} onClose={() => setShowManualAdd(false)} />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            padding: '12px 20px',
            background: 'var(--brand)',
            color: '#fff',
            borderRadius: 6,
            fontSize: 14,
            boxShadow: '0 10px 25px rgba(15, 20, 25, 0.25)',
            zIndex: 1001,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div
      style={{
        padding: 16,
        background: 'var(--sf-raised)',
        border: '1px solid var(--bd-default)',
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: 'var(--tx-secondary)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          color: accent ?? 'var(--tx-primary)',
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SortHeader({
  label,
  field,
  active,
  dir,
  onClick,
}: {
  label: string;
  field: SortField;
  active: SortField;
  dir: SortDirection;
  onClick: (f: SortField) => void;
}) {
  const isActive = active === field;
  return (
    <th
      style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onClick(field)}
    >
      {label}
      {isActive && <span style={{ marginLeft: 4, fontSize: 11 }}>{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 12,
  color: 'var(--tx-secondary)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'top',
};

const filterSelectStyle: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 14,
  border: '1px solid var(--bd-default)',
  borderRadius: 4,
  background: 'var(--sf-raised)',
};

const actionLinkStyle: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid var(--bd-default)',
  borderRadius: 4,
  background: 'var(--sf-raised)',
  color: 'var(--tx-primary)',
  fontSize: 12,
  textDecoration: 'none',
  display: 'inline-block',
};
