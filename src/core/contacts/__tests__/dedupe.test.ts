import { describe, it, expect } from 'vitest';
import { contactIdFor, computeCanonical, mergeSighting, sha256Hex } from '../dedupe';
import type { ContactSighting } from '@shared/types/contact.types';

function makeSighting(overrides: Partial<ContactSighting> = {}): ContactSighting {
  return {
    capturedAt: new Date().toISOString(),
    sourceUrl: 'https://example.com',
    platform: 'wellfound',
    confidence: 'high',
    extractedFields: {},
    ...overrides,
  };
}

describe('contactIdFor', () => {
  it('uses email hash as primary key', () => {
    const id = contactIdFor({ email: 'sarah@acme.co' });
    expect(id).toMatch(/^email:[a-f0-9]{32}$/);
  });

  it('produces the same id for two different cases of the same email', () => {
    expect(contactIdFor({ email: 'Sarah@Acme.CO' })).toBe(contactIdFor({ email: 'sarah@acme.co' }));
  });

  it('strips +addressing for stable id', () => {
    expect(contactIdFor({ email: 'sarah+jobs@acme.co' })).toBe(
      contactIdFor({ email: 'sarah@acme.co' })
    );
  });

  it('falls back to phone when no email', () => {
    const id = contactIdFor({ phone: '+14155550100' });
    expect(id).toBe('phone:+14155550100');
  });

  it('falls back to name+company hash when no email or phone', () => {
    const id = contactIdFor({ name: 'Sarah Chen', company: 'Acme' });
    expect(id).toMatch(/^nc:[a-f0-9]{32}$/);
  });

  it('produces a stable nc id across runs', () => {
    expect(contactIdFor({ name: 'Sarah Chen', company: 'Acme' })).toBe(
      contactIdFor({ name: 'Sarah Chen', company: 'Acme' })
    );
  });

  it('falls back to unknown hash for empty fields', () => {
    const id = contactIdFor({});
    expect(id).toMatch(/^unknown:[a-f0-9]{32}$/);
  });
});

describe('computeCanonical', () => {
  it('returns empty for no sightings', () => {
    expect(computeCanonical([])).toEqual({});
  });

  it('picks the only value from a single sighting', () => {
    const c = computeCanonical([makeSighting({ extractedFields: { name: 'Sarah' } })]);
    expect(c.name).toBe('Sarah');
  });

  it('picks the highest-confidence value across sightings', () => {
    const c = computeCanonical([
      makeSighting({ confidence: 'low', extractedFields: { title: 'Engineer' } }),
      makeSighting({ confidence: 'high', extractedFields: { title: 'Head of Engineering' } }),
    ]);
    expect(c.title).toBe('Head of Engineering');
  });

  it('breaks ties in favor of newer sighting', () => {
    const older = new Date('2026-04-01').toISOString();
    const newer = new Date('2026-04-08').toISOString();
    const c = computeCanonical([
      makeSighting({
        capturedAt: older,
        confidence: 'medium',
        extractedFields: { name: 'Sarah Chen' },
      }),
      makeSighting({
        capturedAt: newer,
        confidence: 'medium',
        extractedFields: { name: 'Sarah C' },
      }),
    ]);
    expect(c.name).toBe('Sarah C');
  });

  it('combines fields from multiple sightings', () => {
    const c = computeCanonical([
      makeSighting({ extractedFields: { name: 'Sarah Chen' } }),
      makeSighting({ extractedFields: { title: 'Head of Eng' } }),
      makeSighting({ extractedFields: { email: 'sarah@acme.co' } }),
    ]);
    expect(c.name).toBe('Sarah Chen');
    expect(c.title).toBe('Head of Eng');
    expect(c.email).toBe('sarah@acme.co');
  });

  it('skips empty/null/undefined values', () => {
    const c = computeCanonical([
      makeSighting({ extractedFields: { name: undefined, title: 'Engineer' } }),
      makeSighting({ extractedFields: { name: '', title: 'Manager' } }),
    ]);
    expect(c.name).toBeUndefined();
    expect(c.title).toBe('Manager');
  });
});

describe('mergeSighting', () => {
  it('creates a new contact when existing is null', () => {
    const sighting = makeSighting({
      extractedFields: { email: 'sarah@acme.co', name: 'Sarah' },
    });
    const c = mergeSighting(null, sighting, 'job-1');
    expect(c.id).toMatch(/^email:/);
    expect(c.sightings).toHaveLength(1);
    expect(c.jobIds).toEqual(['job-1']);
    expect(c.canonical.name).toBe('Sarah');
  });

  it('appends a sighting to an existing contact', () => {
    const first = mergeSighting(
      null,
      makeSighting({ extractedFields: { email: 'sarah@acme.co', name: 'Sarah' } }),
      'job-1'
    );
    const second = mergeSighting(
      first,
      makeSighting({
        confidence: 'high',
        extractedFields: { email: 'sarah@acme.co', title: 'Head of Eng' },
      }),
      'job-2'
    );
    expect(second.sightings).toHaveLength(2);
    expect(second.jobIds).toEqual(['job-1', 'job-2']);
    expect(second.canonical.name).toBe('Sarah');
    expect(second.canonical.title).toBe('Head of Eng');
  });

  it('dedupes jobIds on repeat sighting in same job', () => {
    const first = mergeSighting(
      null,
      makeSighting({ extractedFields: { email: 'sarah@acme.co' } }),
      'job-1'
    );
    const second = mergeSighting(
      first,
      makeSighting({ extractedFields: { email: 'sarah@acme.co' } }),
      'job-1'
    );
    expect(second.jobIds).toEqual(['job-1']);
  });

  it('does not mutate the input contact', () => {
    const first = mergeSighting(
      null,
      makeSighting({ extractedFields: { email: 'sarah@acme.co' } }),
      'job-1'
    );
    const firstSightingCount = first.sightings.length;
    mergeSighting(first, makeSighting({ extractedFields: { email: 'sarah@acme.co' } }), 'job-2');
    expect(first.sightings.length).toBe(firstSightingCount);
    expect(first.jobIds).toEqual(['job-1']);
  });
});

describe('sha256Hex', () => {
  it('produces stable 32-char hex strings', () => {
    const h = sha256Hex('hello');
    expect(h).toMatch(/^[a-f0-9]{32}$/);
    expect(sha256Hex('hello')).toBe(h);
  });

  it('produces different hashes for different inputs', () => {
    expect(sha256Hex('hello')).not.toBe(sha256Hex('world'));
  });
});
