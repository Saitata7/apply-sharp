# SaasCode Kit — Bug Report

**Date**: 2026-02-13
**Project**: ApplySharp (Chrome Extension, Manifest V3)
**Kit Version**: github:Saitata7/saascode-kit (latest, updated 2026-02-13)

---

## Review Results

| Metric | Count |
|--------|-------|
| Files scanned | 95 (81 .ts + 14 .tsx) |
| Critical | 40 |
| Warnings | 206 |

### Breakdown

| Category | Type | Count | Notes |
|----------|------|-------|-------|
| innerHTML XSS | Critical | 40 | Still flags reads as writes |
| console.log() | Warning | 175 | Flags every individual statement |
| console.debug() | Warning | 23 | Flags every individual statement |
| switch without default | Warning | 4 | |
| Hardcoded model names | Warning | 4 | Only `ml-ai.ts` keyword file |

### Audit Results

0 critical, 1 warning (npm audit), 12 passed.

---

## New Bugs Found

### Bug 1: `review --changed-only` Scans Kit Scripts, Not Just Source

**Severity**: MEDIUM

`review --changed-only` uses `git diff --name-only HEAD~1` to find changed files, but doesn't filter to `src/` only. When kit scripts are updated (e.g., `.saascode/scripts/ast-review.ts`), they get scanned and flagged for `console.log` warnings (32 warnings from the kit's own review script).

The `--changed-only` flag should only scan files under `src/` to match the full review behavior.

### Bug 2: `predeploy` Uses Wrong Build Commands for Non-Monorepo Projects

**Severity**: HIGH

Pre-deploy gates 2/3/4 run:
- `npm --prefix src/background run build` (fails — no `package.json` in `src/background/`)
- `npm --prefix src/options run build` (fails — no `package.json` in `src/options/`)
- `npm --prefix src/background run test` (fails — same)

For this project the correct commands are `npm run build` and `npm test` at the root. The predeploy reads the manifest paths but uses them as `--prefix` subdirectories instead of recognizing this is a single-package project.

### Bug 3: AST Review Flags Every `console.log` Individually (198 Warnings)

**Severity**: MEDIUM

The review flags every single `console.log()` and `console.debug()` statement as a separate WARNING — 198 total (96% of all warnings). This buries the 8 meaningful warnings (4 switch-without-default, 4 hardcoded model names).

Previous behavior (>10 per file threshold) was more useful.

### Bug 4: `update --full` Fails to Regenerate Templates

**Severity**: HIGH

Running `npx github:Saitata7/saascode-kit update --full` exits with code 1. The `[Templates]` section prints but is completely empty — no files are regenerated (CLAUDE.md, .cursorrules, .windsurfrules, etc.). The command also appears to run twice (duplicate output). Only the hooks file (`.claude/settings.json`) is synced successfully.

**Observed**: 2026-02-27

### Bug 5: `docs --prd` Generates Template Instead of Actual PRD

**Severity**: MEDIUM

Running `npx github:Saitata7/saascode-kit docs --prd` outputs a template file with instructions (e.g., "Analyze this project's codebase and generate the Product Brief") instead of actually analyzing the codebase and producing a real PRD. The output is just a prompt skeleton, not a product brief.

**Observed**: 2026-02-27

---

## Summary

| Severity | Count |
|----------|-------|
| HIGH | 2 |
| MEDIUM | 3 |
| **Total** | **5 bugs** |

### What's Fixed Since Last Report

- `report` command works on paths with spaces (Bug 2: fixed)
- `lib.sh` export errors on dotted variable names (Bug 3: fixed)
- `init` no longer fails from lib.sh export error (Bug 4: fixed)
- `echo "\n"` in audit summary now renders correctly (Bug 6: fixed)
- Cloak script updated (Bug 1: not re-tested — too destructive to test again)
