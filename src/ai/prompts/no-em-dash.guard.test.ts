/**
 * Anti AI tells regression guard.
 *
 * The em-dash character (U+2014) is the single most recognizable AI fingerprint.
 * Recruiters skim resumes for 6 seconds and the em-dash flips a "ChatGPT slop"
 * heuristic in their head. We banned it from every AI-generated output via the
 * ANTI_AI_TELLS rule block in src/ai/prompts/system-rules.ts.
 *
 * This test enforces that the rule applies recursively to OUR OWN PROMPT FILES.
 * If a prompt template contains an em-dash, the model mirrors it back. We swept
 * the codebase once on 2026-04-08 (110 em-dashes across 28 files); this guard
 * makes sure no regression slips back in.
 *
 * SCOPE: applies to files inside src/ai/prompts, src/ai/autofill, and the
 * Workstream 7-9 surfaces that ship to users (side panel, ghost-job
 * detector, discovery). Does NOT apply to:
 *   - test files (which may contain em-dashes as test fixtures)
 *   - regex character classes that detect em-dashes (use \u2014 escape there)
 *   - markdown documentation outside src/
 *   - pre-existing src/options/styles or src/content/* code that predates
 *     the rule and is out of scope for the WS7-9 review iteration.
 *
 * Iteration 2 (WS7-9 review fixes) extended ROOTS to cover the new code so
 * a future em-dash regression in any sidepanel string, ghost-job reason
 * string, or discovery curation note fails CI fast instead of leaking to
 * users via the side panel.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT_DIRS = [
  resolve(__dirname),
  resolve(__dirname, '..', 'autofill'),
  resolve(__dirname, '..', '..', 'sidepanel'),
  resolve(__dirname, '..', '..', 'core', 'ghost-job-detector'),
  resolve(__dirname, '..', '..', 'core', 'discovery'),
  resolve(__dirname, '..', '..', 'background', 'research'),
  resolve(__dirname, '..', '..', 'core', 'contacts'),
];
const EXTRA_FILES = [
  resolve(__dirname, '..', '..', 'shared', 'feature-flags.ts'),
  resolve(__dirname, '..', '..', 'shared', 'types', 'sidepanel.types.ts'),
  resolve(__dirname, '..', '..', 'shared', 'types', 'contact.types.ts'),
  resolve(__dirname, '..', '..', 'storage', 'repositories', 'contact.repo.ts'),
  resolve(__dirname, '..', '..', 'background', 'handlers', 'contact-handlers.ts'),
  resolve(__dirname, '..', '..', 'content', 'detectors', 'contact-extractor.ts'),
  resolve(__dirname, '..', '..', 'options', 'pages', 'Contacts.tsx'),
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...walk(p));
    } else if (
      (entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.test.tsx') &&
      !entry.endsWith('.spec.ts') &&
      !entry.endsWith('.spec.tsx')
    ) {
      out.push(p);
    }
  }
  return out;
}

describe('em-dash regression guard', () => {
  const files: string[] = [];
  for (const root of ROOT_DIRS) {
    try {
      files.push(...walk(root));
    } catch {
      // Directory may not exist yet during early development
    }
  }
  for (const f of EXTRA_FILES) {
    try {
      if (statSync(f).isFile()) files.push(f);
    } catch {
      // File may not exist yet
    }
  }

  it.each(files)('contains no em-dash characters: %s', (file) => {
    const content = readFileSync(file, 'utf-8');
    const idx = content.indexOf('\u2014');
    if (idx >= 0) {
      // Find the line and show context for easier debugging.
      const line = content.slice(0, idx).split('\n').length;
      const lineContent = content.split('\n')[line - 1];
      throw new Error(
        `${file}:${line} contains an em-dash (U+2014).\n` +
          `  Line: ${lineContent}\n` +
          `  Replace with comma, period, parentheses, or " - " (spaced hyphen).\n` +
          `  See src/ai/prompts/system-rules.ts ANTI_AI_TELLS for the rule.`
      );
    }
    expect(idx).toBe(-1);
  });
});
