/**
 * Manifest safety invariants.
 *
 * These tests verify that the production-built manifest at dist/manifest.json
 * does NOT expose any surface that LinkedIn's BrowserGate fingerprinter
 * (AED + Spectroscopy, active since Feb 2026) can probe to detect ApplySharp.
 *
 * If you ever see one of these tests fail, your users on LinkedIn are at risk
 * of an account restriction. Investigate immediately.
 *
 * Run: npm test -- manifest.invariants
 *
 * Prerequisite: `npm run build` must have produced dist/manifest.json. The test
 * builds it on demand if missing.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

interface BuiltManifest {
  manifest_version: number;
  permissions: string[];
  host_permissions: string[];
  content_scripts: Array<{
    matches: string[];
    js: string[];
    css?: string[];
  }>;
  web_accessible_resources?: Array<{
    matches: string[];
    resources: string[];
  }>;
}

const DIST_MANIFEST = resolve(__dirname, '../dist/manifest.json');

function loadBuiltManifest(): BuiltManifest {
  if (!existsSync(DIST_MANIFEST)) {
    execSync('npm run build', { stdio: 'inherit', cwd: resolve(__dirname, '..') });
  }
  return JSON.parse(readFileSync(DIST_MANIFEST, 'utf-8'));
}

describe('manifest invariants (LinkedIn safety)', () => {
  let manifest: BuiltManifest;

  beforeAll(() => {
    manifest = loadBuiltManifest();
  });

  it('has no content script that matches linkedin.com', () => {
    for (const cs of manifest.content_scripts) {
      for (const match of cs.matches) {
        expect(
          match,
          `content_script entry leaks to LinkedIn: ${JSON.stringify(cs.js)}`
        ).not.toMatch(/linkedin\.com/);
      }
    }
  });

  it('has no web_accessible_resources entry that matches linkedin.com', () => {
    if (!manifest.web_accessible_resources) return;
    for (const war of manifest.web_accessible_resources) {
      for (const match of war.matches) {
        expect(
          match,
          `web_accessible_resources leaks to LinkedIn: ${JSON.stringify(war.resources)}`
        ).not.toMatch(/linkedin\.com/);
      }
    }
  });

  it('does NOT request unlimitedStorage (Chrome Web Store reviewer flag)', () => {
    expect(manifest.permissions).not.toContain('unlimitedStorage');
  });

  it('requests scripting permission (needed for click-driven LinkedIn capture)', () => {
    expect(manifest.permissions).toContain('scripting');
  });

  it('requests activeTab permission (needed for popup-triggered access)', () => {
    expect(manifest.permissions).toContain('activeTab');
  });

  it('still has linkedin host_permissions for click-driven extraction (this is safe, not a fingerprinting surface)', () => {
    // host_permissions is NOT a fingerprinting surface. BrowserGate detects via
    // (a) probing chrome-extension://{id}/{file} URLs (web_accessible_resources)
    // and (b) DOM mutations made by extension JS (content scripts). It does not
    // read the install's permission list. We need linkedin.com here so the popup
    // can call chrome.scripting.executeScript without re-prompting.
    const hasLinkedIn = manifest.host_permissions.some((h) => h.includes('linkedin.com'));
    expect(hasLinkedIn).toBe(true);
  });

  it('content scripts target the expected ATS hosts (regression check)', () => {
    const allMatches = manifest.content_scripts.flatMap((cs) => cs.matches).join(' ');
    // Spot-check a few hosts that should still be in there.
    expect(allMatches).toMatch(/wellfound\.com/);
    expect(allMatches).toMatch(/greenhouse\.io/);
    expect(allMatches).toMatch(/lever\.co/);
    expect(allMatches).toMatch(/myworkdayjobs\.com/);
    expect(allMatches).toMatch(/ashbyhq\.com/);
  });
});
