# Post-Fix Audit — 2026-02-28

**Scope:** Every file in the codebase, audited by 3 parallel agents after fixing 148 bugs
**Previous audit:** 148 findings (6C, 36H, 54M, 52L) — all addressed
**This audit:** 42 findings (3C, 9H, 15M, 15L)

---

## CRITICAL (3)

| #   | File                                 | Line(s) | Issue                                                                                                                                                       |
| --- | ------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `options/context/ProfileContext.tsx` | 28      | `loadingRef` initialized as plain object `{ current: false }` outside hooks — recreated every render, defeating concurrent load guard. Should use `useRef`. |
| C2  | `content/index.ts`                   | 328     | Missing `await` on `autoAnalyzeIfReady()` in UPDATE_PROFILE handler — sidebar may display stale data                                                        |
| C3  | `storage/repositories/job.repo.ts`   | 104     | Non-null assertion `updated!` — if job deleted between check and update, uncaught crash                                                                     |

---

## HIGH (9)

| #   | File                                          | Line(s) | Issue                                                                                                                                                        |
| --- | --------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H1  | `content/ui/sidebar.ts`                       | 878-880 | Unhandled individual promise failure in `Promise.all([GET_MASTER_PROFILES, GET_ACTIVE_MASTER_PROFILE])` — accesses response properties without checking each |
| H2  | `content/autofill/form-detector.ts`           | 461-487 | Race condition in `waitForFormFields()` — observer continues firing after `resolved=true`, potential double-disconnect                                       |
| H3  | `content/detectors/generic.ts`                | 71-93   | MutationObserver in `waitForDynamicContent()` not guaranteed to disconnect if callback never resolves before timeout                                         |
| H4  | `content/index.ts`                            | 445-460 | URL watcher MutationObserver on `document.body` never disconnected — persists for page lifetime                                                              |
| H5  | `options/components/CoverLetterGenerator.tsx` | 94-97   | `stepTimer`/`stepTimer2` not cleared on early close — timers still fire after unmount                                                                        |
| H6  | `options/pages/ResumeUpload.tsx`              | 146-150 | If `refreshAllProfiles()` fails after `setProfile()`, workspace list not updated (silent failure)                                                            |
| H7  | `options/pages/Dashboard.tsx`                 | 137-147 | No error handler for GET_SETTINGS — `aiConfigured` stays false, corrupting completeness score                                                                |
| H8  | `background/message-handler.ts`               | 2874    | `parsed as typeof jdAnalysis` without shape validation — partial AI response causes undefined field access                                                   |
| H9  | `storage/repositories/master-profile.repo.ts` | 204     | `addGeneratedProfile` doesn't verify `update()` succeeded — silently loses generated profile                                                                 |

---

## MEDIUM (15)

| #   | File                                      | Line(s)   | Issue                                                                                            |
| --- | ----------------------------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| M1  | `content/autofill/filler.ts`              | 191       | `field.element` cast to `HTMLInputElement` without null check before `.value`                    |
| M2  | `content/autofill-content.ts`             | 91-98     | Race: parallel fetch from main script (500ms timeout) and stored context without synchronization |
| M3  | `content/ui/sidebar.ts`                   | 369-401   | Event listeners on deadline edit/save/cancel never removed when sidebar hidden                   |
| M4  | `content/autofill/autofill-sidebar.ts`    | 67-70     | Module-level `sidebarElement` never nulled after `remove()` — stale reference                    |
| M5  | `options/pages/AnalyticsDashboard.tsx`    | 19        | `Promise.all` in load — if one fails, page shows "loaded" with empty data                        |
| M6  | `options/pages/ApplicationHistory.tsx`    | 115-122   | `statusHistory` may be undefined — spread produces nothing, should default to `[]`               |
| M7  | `options/components/OnboardingWizard.tsx` | 94-107    | `validateAndSetFile` in callbacks but not in dependency array (stale closure)                    |
| M8  | `options/pages/AISettings.tsx`            | 121-179   | No debounce on `testConnection` — rapid clicks cause overlapping tests                           |
| M9  | `options/context/ProfileContext.tsx`      | 31-48     | No abort/cancel for `loadAllProfiles` — workspace switch during load overwrites new data         |
| M10 | `options/pages/ProfileManager.tsx`        | 192-213   | DELETE_ROLE_PROFILE doesn't check `response.success` before `refreshProfile()`                   |
| M11 | `storage/export-import.ts`                | 184       | Settings import spread may lose nested AI config properties — needs deep merge                   |
| M12 | `shared/utils/prompt-safety.ts`           | 26-34     | Incomplete injection defense — no XML escaping for `</resume_text>` in user input                |
| M13 | `content/autofill/filler.ts`              | 260-263   | `fullName.split(' ')` fragile for middle names / suffixes                                        |
| M14 | `content/autofill/filler.ts`              | 287-291   | `location.split(',')` fragile if no comma in location string                                     |
| M15 | `background/message-handler.ts`           | 1340-1356 | O(n²) skill matching with `.includes()` — no caching of normalized skills                        |

---

## LOW (15)

| #   | File                                                  | Line(s)  | Issue                                                                                        |
| --- | ----------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| L1  | `background/message-handler.ts`                       | 847-853  | Excessive profile ID logging in production — potential data exposure                         |
| L2  | `core/ats/hybrid-scorer.ts`                           | 123-129  | `hasEnoughKeywords` resets score to 0 for <3 keywords without user warning                   |
| L3  | `content/autofill/form-detector.ts`                   | 630      | `label.charAt(0)` crashes if label is empty string                                           |
| L4  | `content/autofill/autofill-sidebar.ts`                | 1001     | `innerHTML` read/write could introduce XSS if content was user-controlled                    |
| L5  | `content/autofill/filler.ts`                          | 814      | `querySelectorAll` inside loop — O(n²) for large forms with radio groups                     |
| L6  | `options/components/Toast.tsx`                        | 21       | `idCounter` is plain object instead of `useRef` — works but violates React patterns          |
| L7  | `options/pages/Dashboard.tsx`                         | 175      | `fullName?.split(' ')[0]` returns empty string for single-word name                          |
| L8  | `options/components/applications/ApplicationCard.tsx` | 27-29    | Timezone bug in `daysLeft` — `Date.now()` is UTC but `new Date(deadline)` parses as local    |
| L9  | `options/pages/ATSScore.tsx`                          | 100, 143 | setTimeout auto-clear may fire after unmount — should track mounted state                    |
| L10 | `options/components/WorkspaceSwitcher.tsx`            | 79       | Avatar color changes when profile order changes — should use ID hash                         |
| L11 | `background/message-handler.ts`                       | 1584     | Broad exception catch covers programming errors (TypeError) — should only catch parse errors |
| L12 | `storage/repositories/job.repo.ts`                    | 47-52    | Redundant null check — falls through to create on failed update without explicit error       |
| L13 | `content/detectors/generic.ts`                        | 103      | `console.debug` with multiple args — unclear in some DevTools                                |
| L14 | `background/message-handler.ts`                       | 837-845  | `convertMasterToResumeProfile` drops fields (fileName, confidence) — data loss in round-trip |
| L15 | `content/detectors/linkedin.ts`                       | 64-85    | `extractFromJsonLd` catches parse error and returns null — caller may not validate           |
