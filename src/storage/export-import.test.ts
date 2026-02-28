import { describe, it, expect } from 'vitest';
import { validateExportData, escapeCSV, formatCSVDate, EXPORT_VERSION } from './export-import';

/** Remove a key from an object without triggering unused-var lint. */
function omit<T extends Record<string, unknown>, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

// ── validateExportData ──────────────────────────────────────────────────

describe('validateExportData', () => {
  const validData = {
    version: EXPORT_VERSION,
    exportedAt: '2026-02-27T00:00:00.000Z',
    appVersion: '1.0.0',
    data: {
      masterProfiles: [],
      applications: [],
      jobs: [],
      resumeVersions: [],
      settings: { id: 'user_settings' },
    },
  };

  it('accepts valid export data', () => {
    const result = validateExportData(validData);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts export data with populated arrays', () => {
    const result = validateExportData({
      ...validData,
      data: {
        ...validData.data,
        masterProfiles: [{ id: 'p1' }],
        jobs: [{ id: 'j1' }, { id: 'j2' }],
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects null input', () => {
    const result = validateExportData(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('JSON object');
  });

  it('rejects string input', () => {
    const result = validateExportData('not an object');
    expect(result.valid).toBe(false);
  });

  it('rejects missing version', () => {
    const result = validateExportData(omit(validData, 'version'));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing or invalid "version" field');
  });

  it('rejects missing data field', () => {
    const result = validateExportData({ ...omit(validData, 'data'), version: 1 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing "data" field');
  });

  it('rejects missing data.masterProfiles', () => {
    const result = validateExportData({
      ...validData,
      data: omit(validData.data, 'masterProfiles'),
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing "data.masterProfiles" array');
  });

  it('rejects missing data.applications', () => {
    const result = validateExportData({ ...validData, data: omit(validData.data, 'applications') });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing "data.applications" array');
  });

  it('rejects missing data.jobs', () => {
    const result = validateExportData({ ...validData, data: omit(validData.data, 'jobs') });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing "data.jobs" array');
  });

  it('rejects missing data.resumeVersions', () => {
    const result = validateExportData({
      ...validData,
      data: omit(validData.data, 'resumeVersions'),
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing "data.resumeVersions" array');
  });

  it('rejects missing data.settings', () => {
    const result = validateExportData({ ...validData, data: omit(validData.data, 'settings') });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing "data.settings" object');
  });

  it('collects multiple errors', () => {
    const result = validateExportData({ data: { masterProfiles: 'not array' } });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

// ── escapeCSV ───────────────────────────────────────────────────────────

describe('escapeCSV', () => {
  it('returns plain text unchanged', () => {
    expect(escapeCSV('hello world')).toBe('hello world');
  });

  it('wraps value with commas in quotes', () => {
    expect(escapeCSV('San Francisco, CA')).toBe('"San Francisco, CA"');
  });

  it('escapes double quotes', () => {
    expect(escapeCSV('He said "yes"')).toBe('"He said ""yes"""');
  });

  it('wraps value with newlines in quotes', () => {
    expect(escapeCSV('line1\nline2')).toBe('"line1\nline2"');
  });

  it('handles empty string', () => {
    expect(escapeCSV('')).toBe('');
  });
});

// ── formatCSVDate ───────────────────────────────────────────────────────

describe('formatCSVDate', () => {
  it('formats Date object to ISO date string', () => {
    const date = new Date('2026-01-15T10:30:00Z');
    expect(formatCSVDate(date)).toBe('2026-01-15');
  });

  it('formats ISO string to date string', () => {
    expect(formatCSVDate('2026-03-20T14:00:00.000Z')).toBe('2026-03-20');
  });

  it('returns empty string for undefined', () => {
    expect(formatCSVDate(undefined)).toBe('');
  });

  it('returns empty string for invalid date', () => {
    expect(formatCSVDate('not-a-date')).toBe('');
  });
});
