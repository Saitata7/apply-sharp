/**
 * Portal recommender (Workstream 9, pure function).
 *
 * Given a discovery profile, returns a ranked list of job sources from the
 * portal map. Wildcards in the map allow generic sources (LinkedIn, Indeed)
 * to participate in every recommendation while role-specific sources rank
 * higher when their role matches.
 *
 * Algorithm:
 *   1. Filter PORTAL_MAP entries that match the profile (with wildcard
 *      support on every dimension).
 *   2. De-duplicate by sourceName, keeping the lowest-rank entry per name.
 *   3. Sort ascending by rank.
 *   4. Cap at 7 results (the user does not need 30 - top 7 is the readable
 *      threshold per the WS9 plan).
 *
 * Pure function. No AI. No fetches. Tested against fixture profiles in
 * portal-recommender.test.ts.
 */

import type { DiscoveryProfile, PortalMapEntry, PortalRecommendation } from './types';
import { VALIDATED_PORTAL_MAP } from './portal-map';

const MAX_RESULTS = 7;

function dimensionMatches<T extends string>(value: T | '*', target: T): boolean {
  return value === '*' || value === target;
}

function entryMatches(entry: PortalMapEntry, profile: DiscoveryProfile): boolean {
  return (
    dimensionMatches(entry.role, profile.role) &&
    dimensionMatches(entry.seniority, profile.seniority) &&
    dimensionMatches(entry.geo, profile.geo) &&
    dimensionMatches(entry.workType, profile.workType)
  );
}

export function recommendPortals(profile: DiscoveryProfile): PortalRecommendation[] {
  if (!profile?.role || !profile?.seniority || !profile?.geo || !profile?.workType) {
    return [];
  }

  const matched = VALIDATED_PORTAL_MAP.filter((e) => entryMatches(e, profile));

  // Dedupe by sourceName: when both a wildcard entry and a specific entry
  // match, keep the lower-rank (more specific) one.
  const byName = new Map<string, PortalMapEntry>();
  for (const e of matched) {
    const existing = byName.get(e.sourceName);
    if (!existing || e.rank < existing.rank) {
      byName.set(e.sourceName, e);
    }
  }

  return Array.from(byName.values())
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_RESULTS)
    .map(
      (e): PortalRecommendation => ({
        sourceName: e.sourceName,
        sourceUrl: e.sourceUrl,
        rank: e.rank,
        notes: e.notes,
      })
    );
}
