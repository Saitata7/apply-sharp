/**
 * Contact deduplication and merging (Workstream 10).
 *
 * Pure functions. No DOM, no fetches, no chrome.* references.
 *
 * Two responsibilities:
 *
 *   1. contactIdFor(): given a set of extracted fields, compute a stable
 *      id. Priority ladder: email hash > phone E.164 > sha256(name+company)
 *      > unknown hash. The id is the IDB primary key and the dedup boundary.
 *
 *   2. computeCanonical(): given a list of sightings, fold them into a
 *      single ContactExtractedFields where each field is the highest-
 *      confidence value (ties broken by most recent sighting). This is
 *      stateless and re-runnable; the IDB row caches the result for the
 *      by-email-hash index but the cache is always recomputed on save.
 *
 *   3. mergeSighting(): append a new sighting to an existing contact (or
 *      create a new one), dedupe jobIds, recompute canonical.
 *
 * Hashing uses a small synchronous SHA-256 helper from the standard library
 * (Web Crypto requires async; for stability across content/background/test
 * environments we use a tiny pure-JS SHA-256 implementation).
 */

import type {
  Contact,
  ContactExtractedFields,
  ContactSighting,
  ContactConfidence,
} from '@shared/types/contact.types';
import { normalizeEmail } from './email-regex';

/**
 * Map confidence to a numeric weight for canonical aggregation.
 * high=3, medium=2, low=1. Used by computeCanonical.
 */
const CONFIDENCE_WEIGHT: Record<ContactConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Compute a stable id for a contact based on extracted fields.
 * Priority ladder: email hash > phone E.164 > sha256(name+company).
 *
 * The prefix tells the caller (and the IDB index) which dedup key fired.
 */
export function contactIdFor(fields: ContactExtractedFields): string {
  if (fields.email) {
    const normalized = normalizeEmail(fields.email);
    if (normalized) {
      return `email:${sha256Hex(normalized)}`;
    }
  }
  if (fields.phone) {
    return `phone:${fields.phone}`;
  }
  if (fields.name && fields.company) {
    const key = `${fields.name.toLowerCase()}|${fields.company.toLowerCase()}`;
    return `nc:${sha256Hex(key)}`;
  }
  // Fallback: hash whatever we have
  return `unknown:${sha256Hex(JSON.stringify(fields))}`;
}

/**
 * Fold a list of sightings into a single canonical ContactExtractedFields.
 * For each field, picks the value with the highest aggregated confidence
 * weight; ties are broken by most recent sighting.
 *
 * Pure function: no side effects, no IDB, no chrome.*. Re-runnable.
 */
export function computeCanonical(sightings: ContactSighting[]): ContactExtractedFields {
  if (!sightings || sightings.length === 0) return {};
  // Iterate fields by name, accumulate value -> total weight
  type FieldKey = keyof ContactExtractedFields;
  const fieldKeys: FieldKey[] = [
    'name',
    'title',
    'company',
    'email',
    'emailKind',
    'phone',
    'linkedinUrl',
    'twitterHandle',
  ];
  const result: ContactExtractedFields = {};
  // Sightings sorted oldest -> newest so the same loop natually breaks
  // ties in favor of newer entries (since later writes overwrite earlier
  // ones in the value->weight map).
  const sorted = [...sightings].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  for (const key of fieldKeys) {
    const weights = new Map<string, number>();
    let bestValue: string | undefined;
    let bestWeight = 0;
    for (const s of sorted) {
      const v = s.extractedFields[key];
      if (v === undefined || v === null || v === '') continue;
      const value = String(v);
      const weight = (weights.get(value) ?? 0) + CONFIDENCE_WEIGHT[s.confidence];
      weights.set(value, weight);
      // >= so newer ties replace older, which the sort order ensures
      if (weight >= bestWeight) {
        bestWeight = weight;
        bestValue = value;
      }
    }
    if (bestValue !== undefined) {
      // emailKind needs explicit cast back to its enum type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[key] = bestValue;
    }
  }
  return result;
}

/**
 * Append a sighting to an existing contact (or create a new one) and
 * recompute canonical. Pure function: returns a new Contact, never
 * mutates the input.
 */
export function mergeSighting(
  existing: Contact | null,
  newSighting: ContactSighting,
  newJobId?: string
): Contact {
  const now = new Date().toISOString();
  if (existing) {
    const sightings = [...existing.sightings, newSighting];
    const jobIds = newJobId ? dedupeStrings([...existing.jobIds, newJobId]) : existing.jobIds;
    const canonical = computeCanonical(sightings);
    return {
      ...existing,
      sightings,
      jobIds,
      canonical,
      updatedAt: now,
    };
  }
  const jobIds = newJobId ? [newJobId] : [];
  const canonical = computeCanonical([newSighting]);
  return {
    id: contactIdFor(newSighting.extractedFields),
    sightings: [newSighting],
    jobIds,
    canonical,
    createdAt: now,
    updatedAt: now,
  };
}

function dedupeStrings(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

/**
 * Tiny synchronous SHA-256 using a pure JS implementation. Avoids the
 * async Web Crypto API so contactIdFor() can be synchronous (which the
 * caller side desperately wants - it would otherwise propagate async
 * through the entire extraction pipeline).
 *
 * Returns a 64-char hex string. Truncated to 32 chars at the call site
 * for shorter IDB keys; the truncated form is still 128 bits which is
 * comfortably more than enough collision resistance for a per-user
 * contacts table.
 */
export function sha256Hex(input: string): string {
  return sha256(input).slice(0, 32);
}

// Minimal SHA-256 implementation (FIPS 180-4). Synchronous.
// Adapted to return a hex string. Public domain.
function sha256(ascii: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let H0 = 0x6a09e667;
  let H1 = 0xbb67ae85;
  let H2 = 0x3c6ef372;
  let H3 = 0xa54ff53a;
  let H4 = 0x510e527f;
  let H5 = 0x9b05688c;
  let H6 = 0x1f83d9ab;
  let H7 = 0x5be0cd19;

  // Encode input as UTF-8 bytes
  const encoder = new TextEncoder();
  const bytes = encoder.encode(ascii);
  const bitLength = bytes.length * 8;

  // Padding
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  // Length as big-endian 64-bit
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLength >>> 0, false);
  dv.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000), false);

  const W = new Uint32Array(64);

  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] = dv.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let a = H0,
      b = H1,
      c = H2,
      d = H3,
      e = H4,
      f = H5,
      g = H6,
      h = H7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H0 = (H0 + a) >>> 0;
    H1 = (H1 + b) >>> 0;
    H2 = (H2 + c) >>> 0;
    H3 = (H3 + d) >>> 0;
    H4 = (H4 + e) >>> 0;
    H5 = (H5 + f) >>> 0;
    H6 = (H6 + g) >>> 0;
    H7 = (H7 + h) >>> 0;
  }
  return [H0, H1, H2, H3, H4, H5, H6, H7].map((n) => n.toString(16).padStart(8, '0')).join('');
}

function rotr(n: number, b: number): number {
  return ((n >>> b) | (n << (32 - b))) >>> 0;
}
