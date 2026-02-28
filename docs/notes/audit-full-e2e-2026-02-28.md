# Full End-to-End Audit — 2026-02-28

**Scope:** Every file in the codebase, audited by 3 parallel agents
**Total findings:** 148 (after dedup: ~130 unique)

---

## CRITICAL (6)

| #   | File                                 | Line(s)     | Issue                                                                                                           |
| --- | ------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------- |
| C1  | `content/detectors/generic.ts`       | 19          | `btoa(url)` throws on Unicode URLs — crashes detector                                                           |
| C2  | `core/ats/hybrid-scorer.ts`          | ~159        | Global RegExp `lastIndex` corruption — `pattern.test()` after `.match()` skips keywords in requirements section |
| C3  | `core/ats/layered-scorer.ts`         | ~631        | Same global RegExp `lastIndex` bug in `detectSkillAreas()` — skill area weights miscalculated                   |
| C4  | `core/learning/outcome-tracker.ts`   | constructor | Async `initialize()` not awaited — race condition, data loss                                                    |
| C5  | `core/learning/adaptive-keywords.ts` | constructor | Same async constructor race — empty recommendations                                                             |
| C6  | `core/learning/auto-improver.ts`     | constructor | Same async constructor race — empty improvements                                                                |

---

## HIGH (36)

| #   | File                                          | Line(s)               | Issue                                                                                     |
| --- | --------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------- |
| H1  | `background/index.ts`                         | 30-44                 | Race: messages processed before DB is ready (warns but doesn't guard)                     |
| H2  | `background/message-handler.ts`               | 855-923               | `handleAnalyzeResume` always creates duplicate `ResumeProfile` on re-upload               |
| H3  | `ai/index.ts`                                 | 122-126               | `generateCoverLetterStream` missing `?.` on `skills.technical` — crashes on empty profile |
| H4  | `storage/master-profile.repo.ts`              | 263                   | Wrong 5MB quota display (actual is 10MB)                                                  |
| H5  | `shared/types/master-profile.types.ts`        | 47                    | `answerBank` required but undefined at runtime on old profiles                            |
| H6  | `shared/types/master-profile.types.ts`        | 307-373               | Required boolean consent fields (`workAuthorizationText`, etc.) never populated           |
| H7  | `content/autofill/form-detector.ts`           | waitForFormFields     | Observer not assigned before first `tryDetect()` — MutationObserver leak                  |
| H8  | `content/autofill/filler.ts`                  | fillForm return       | `success: false` when all fields intentionally skipped (`onlyEmpty: true`)                |
| H9  | `content/autofill/filler.ts`                  | getValueForField      | Hardcoded year `'2020'` corrupts years-of-experience calculation                          |
| H10 | `content/autofill/autofill-sidebar.ts`        | hideAutofillSidebar   | `currentJobContext` not cleared — stale job data leak                                     |
| H11 | `content/autofill/autofill-sidebar.ts`        | handleAIGenerate      | Stale button reference after sidebar closed during AI call                                |
| H12 | `content/ui/sidebar.ts`                       | showSidebar           | `scanAndShowRequirementGaps()` async fire-and-forget — unhandled rejection                |
| H13 | `core/ats/layered-scorer.ts`                  | getSkillAreasForRole  | Division by zero when `totalWeight === 0` → NaN propagates                                |
| H14 | `core/ats/format-validator.ts`                | validateDates         | Single bad date on sparse resume → score 0 (penalty = 100/1)                              |
| H15 | `core/profile/context-engine.ts`              | AI_CALL_DELAY_MS      | 15s delay between AI calls → 90+ second resume analysis                                   |
| H16 | `core/profile/context-engine.ts`              | fixCommonJSONIssues   | Regex corrupts valid JSON strings containing colons                                       |
| H17 | `core/resume/red-flag-scanner.ts`             | detectEmploymentGaps  | NaN from invalid `startDate` breaks sort comparator                                       |
| H18 | `core/interview/question-generator.ts`        | generateInterviewPrep | Second AI call failure loses first-call question results                                  |
| H19 | `options/pages/Dashboard.tsx`                 | 215                   | `status.replace('_', ' ')` only replaces first underscore                                 |
| H20 | `options/pages/MyProfile.tsx`                 | 168-201               | `handleSavePersonalInfo` — no error feedback on failure                                   |
| H21 | `options/pages/MyProfile.tsx`                 | 226-241               | `handleSaveCertifications` — same silent failure                                          |
| H22 | `options/pages/ATSScore.tsx`                  | 157-161               | `useEffect` suppressed exhaustive-deps — stale `runProfileScore`                          |
| H23 | `options/pages/ApplicationHistory.tsx`        | 102-131               | `handleStatusChange`/`handleDelete` — no error handling                                   |
| H24 | `options/pages/DataManager.tsx`               | 43-61                 | `handleExportJSON` no try/catch — `isExporting` stuck forever on throw                    |
| H25 | `options/components/ResumeGenerator.tsx`      | 805-919               | `calculateProfileCounts` stale closure risk                                               |
| H26 | `options/components/ResumeGenerator.tsx`      | 1391                  | `setTimeout(() => analyzeJobDescription(), 500)` stale closure race                       |
| H27 | `options/components/CoverLetterGenerator.tsx` | 86-87                 | `stepTimer` not cleared on unmount — state update after unmount                           |
| H28 | `options/components/OnboardingWizard.tsx`     | 92-102                | `handleDrop` useCallback stale closure over `validateAndSetFile`                          |
| H29 | `options/context/ProfileContext.tsx`          | 50-93                 | Recursive retry + concurrent calls race condition                                         |
| H30 | `options/context/ProfileContext.tsx`          | 120-123               | `refreshProfile` flashes loading state for ALL consumers                                  |
| H31 | `popup/App.tsx`                               | 49-61                 | `tab` can be undefined from empty `chrome.tabs.query` result                              |
| H32 | `content/detectors/generic.ts`                | many                  | Debug `console.log` left in production code                                               |
| H33 | `content/autofill/filler.ts`                  | undoFill              | Unsafe `HTMLElement` to `HTMLInputElement` cast                                           |
| H34 | `core/ats/layered-scorer.ts`                  | getTier               | Returns `'moderate'` but type expects `'fair'`                                            |
| H35 | `options/components/ResumeGenerator.tsx`      | 1574                  | `tailored` can be null passed to `generateDocx`                                           |
| H36 | `options/components/ResumeGenerator.tsx`      | 170                   | `getRecommendedPages` wrong — 10yr gets 1 page, spec says 1-2                             |

---

## MEDIUM (54)

| #   | File                                          | Line(s)                 | Issue                                                                    |
| --- | --------------------------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| M1  | `background/index.ts`                         | 17-27                   | `setTimeout` unreliable in service worker (use `chrome.alarms`)          |
| M2  | `background/message-handler.ts`               | 1874-1882               | Stale reference overwrites prior experience mutations                    |
| M3  | `background/message-handler.ts`               | 967                     | `handleAnalyzeJob` uses raw `settingsRepo.get()` without migrations      |
| M4  | `background/message-handler.ts`               | 3429,4207,4248          | 3 more handlers bypass Groq model migration                              |
| M5  | `background/message-handler.ts`               | 3040-3152               | Duplicate keyword pattern arrays (scoring divergence risk)               |
| M6  | `storage/master-profile.repo.ts`              | 78-86                   | `updatedAt` not stamped on new profile save                              |
| M7  | `storage/master-profile.repo.ts`              | 148-153                 | Deleted active profile not replaced with next                            |
| M8  | `storage/settings.repo.ts`                    | 8-19                    | `get()` failure on `save()` not gracefully handled                       |
| M9  | `storage/export-import.ts`                    | 177-185                 | Settings import destructive — overwrites API keys                        |
| M10 | `shared/utils/messaging.ts`                   | 23,25                   | `UPDATE_PROFILE` duplicated in `MessageType` union                       |
| M11 | `shared/types/master-profile.types.ts`        | 54                      | `generatedProfiles` required but guarded with `?.` everywhere            |
| M12 | `shared/constants/platforms.ts`               | 52-236                  | 17 platforms not in `JobPlatform` enum — stored as 'generic'             |
| M13 | `ai/index.ts`                                 | 30-33                   | Constructor throws for `anthropic` — brittle                             |
| M14 | `ai/providers/ollama.ts`                      | chatStream              | No retry logic (vs `chat()` which retries 3x)                            |
| M15 | `ai/providers/openai.ts`                      | chatStream              | Same — no retry logic                                                    |
| M16 | `ai/providers/groq.ts`                        | 122-181                 | Dead code path in stream retry guard                                     |
| M17 | `content/detectors/generic.ts`                | waitForDynamicContent   | Inconsistent settle delay (0ms vs 200ms)                                 |
| M18 | `content/autofill/form-detector.ts`           | findSubmitButton        | `:contains()` pseudo-selectors always fail (jQuery-only)                 |
| M19 | `content/autofill/autofill-sidebar.ts`        | showToast               | Duplicate `<style>` elements injected per toast                          |
| M20 | `content/autofill/autofill-sidebar.ts`        | attachSidebarListeners  | Stale closure over mutable module globals                                |
| M21 | `content/ui/sidebar.ts`                       | localStorage            | Panel position shared across all tabs                                    |
| M22 | `content/ui/sidebar.ts`                       | attachDeadlineListeners | Invalid Date from empty input → `.toISOString()` throws                  |
| M23 | `core/profile/context-engine.ts`              | buildCareerContext      | `'lead'` and `'principal'` seniority levels unreachable                  |
| M24 | `core/profile/context-engine.ts`              | analyzeResumeText       | Unsafe `as MasterProfile` cast before validation                         |
| M25 | `core/resume/bullet-validator.ts`             | analyzeBullet           | `-ing` verb form not recognized as valid action verb                     |
| M26 | `core/resume/authenticity-guard.ts`           | measureStructureVariety | `Math.max(...empty)` returns `-Infinity`                                 |
| M27 | `core/communication/email-templates.ts`       | getTypeInstructions     | Missing `default` case → `"undefined"` in prompt                         |
| M28 | `core/communication/email-templates.ts`       | generateEmailTemplate   | No guard for empty AI response                                           |
| M29 | `core/learning/outcome-tracker.ts`            | markStaleApplications   | Indirect recursive call chain                                            |
| M30 | `core/learning/auto-improver.ts`              | initialize              | Double `runFullAnalysis()` on startup                                    |
| M31 | `options/App.tsx`                             | 220                     | Blank screen during onboarding check (no spinner)                        |
| M32 | `options/App.tsx`                             | 163-176                 | Settings race: GET-then-full-WRITE can overwrite concurrent changes      |
| M33 | `options/pages/MyProfile.tsx`                 | 283-303                 | `handleApplyAIUpdate` sends `updateContext` without type prefix          |
| M34 | `options/pages/MyProfile.tsx`                 | 122-133                 | `handleDeleteWorkspace` no error on failure                              |
| M35 | `options/pages/ProfileManager.tsx`            | 192-212                 | `handleDeleteRole` no error shown to user                                |
| M36 | `options/pages/ProfileManager.tsx`            | 215-228                 | `handleSetActive` no error on failure                                    |
| M37 | `options/pages/ProfileManager.tsx`            | 122-125                 | Compare always picks first "other" version (no user selection)           |
| M38 | `options/pages/ResumeUpload.tsx`              | 100-164                 | Progress bar frozen at 30% during AI analysis                            |
| M39 | `options/pages/ATSScore.tsx`                  | 115-153                 | Duplicate `setIsParsing(false)` calls                                    |
| M40 | `options/pages/EmailTemplates.tsx`            | 97-104                  | `document.execCommand('copy')` deprecated                                |
| M41 | `options/pages/ApplicationHistory.tsx`        | 141-149                 | `handleBulkArchive` — `loadApplications()` not awaited                   |
| M42 | `options/pages/ApplicationHistory.tsx`        | 116                     | `changedAt: new Date()` should be ISO string                             |
| M43 | `options/pages/AISettings.tsx`                | 59-115                  | `saveSettings` fires on every keystroke (no debounce)                    |
| M44 | `options/pages/AISettings.tsx`                | 64-69                   | `ollama!` non-null assertion crashes if undefined                        |
| M45 | `options/pages/DataManager.tsx`               | 116-135                 | `handleImport` no try/catch — `isImporting` stuck                        |
| M46 | `options/components/ResumeGenerator.tsx`      | 646-658                 | Dead code — second `' and '` branch unreachable                          |
| M47 | `options/components/ResumeGenerator.tsx`      | computeBulletBudgets    | Duplicate company names produce same `expId`                             |
| M48 | `options/components/CoverLetterGenerator.tsx` | 186-188                 | `handleRegenerate` calls async without await                             |
| M49 | `options/components/ResumeVersionManager.tsx` | 53-57                   | `handleDelete` no try/catch                                              |
| M50 | `options/components/ResumeVersionManager.tsx` | 141-183                 | O(n^2) diff using `Array.includes`, false positives on duplicate lines   |
| M51 | `options/components/OnboardingWizard.tsx`     | 140-143                 | Auto-advance via `setTimeout(800ms)` — unmount risk                      |
| M52 | `options/components/ErrorBoundary.tsx`        | 31-38                   | "Try Again" causes immediate re-crash (no retry limit)                   |
| M53 | `options/components/Toast.tsx`                | 19                      | Module-level mutable `nextId` — should be `useRef`                       |
| M54 | `popup/App.tsx`                               | 63-70, 163-172          | `handleProfileChange` no try/catch; `job.url` can be undefined on anchor |

---

## LOW (52)

| #   | File                                          | Line(s)                    | Issue                                                            |
| --- | --------------------------------------------- | -------------------------- | ---------------------------------------------------------------- |
| L1  | `background/message-handler.ts`               | 2549-2552                  | Culture score hardcoded 80/60, no actual matching                |
| L2  | `background/message-handler.ts`               | 2527                       | Experience score uses only first mustHave entry                  |
| L3  | `background/message-handler.ts`               | 1835                       | `keepIndex` OOB not validated                                    |
| L4  | `background/message-handler.ts`               | 3840-3842                  | Bulk archive hits offer/interview applications                   |
| L5  | `background/message-handler.ts`               | 566-568                    | `applicationDeadline` Invalid Date not validated                 |
| L6  | `ai/index.ts`                                 | 76-89                      | Fallback score (50) not signaled as fallback                     |
| L7  | `ai/prompts/templates.ts`                     | 234-318                    | Unsanitized `{parsedData}` substitution points                   |
| L8  | `ai/prompts/templates.ts`                     | 121-122                    | Missing substitution produces literal `{title}`                  |
| L9  | `ai/providers/ollama.ts`                      | 132-135                    | Stream errors silently swallowed (incl. API errors)              |
| L10 | `ai/providers/openai.ts`                      | 158-162                    | Context length substring matching fragile                        |
| L11 | `ai/providers/groq.ts`                        | 218-222                    | Same fragile substring matching                                  |
| L12 | `storage/master-profile.repo.ts`              | 21-24                      | `getAll()` mutates returned objects; nested dates not rehydrated |
| L13 | `storage/application.repo.ts`                 | 35-39                      | `getRecent()` loads ALL records then slices                      |
| L14 | `storage/application.repo.ts`                 | 125-144                    | `countByStatus()` loads ALL records                              |
| L15 | `storage/export-import.ts`                    | 207                        | `app.status` not escaped in CSV                                  |
| L16 | `storage/export-import.ts`                    | 226-229                    | Version mismatch not validated on import                         |
| L17 | `shared/utils/messaging.ts`                   | 99-124                     | All errors collapsed — no distinguishable error types            |
| L18 | `shared/utils/json-utils.ts`                  | 12-15                      | `findBalancedJSON` can pick wrong `{` from AI text               |
| L19 | `shared/utils/json-utils.ts`                  | 98-105                     | Greedy regex catastrophic backtracking risk                      |
| L20 | `shared/types/job.types.ts`                   | 551                        | Invalid platform `as` cast without validation                    |
| L21 | `shared/constants/platforms.ts`               | 247                        | Wrong regex for `/vacancies/` URL detection                      |
| L22 | `content/detectors/generic.ts`                | findDescription            | Multiple expensive `document.body.innerText` calls               |
| L23 | `content/detectors/workday.ts`                | waitForContent             | Orphaned timeout callback after observer resolves                |
| L24 | `content/detectors/workday.ts`                | extractSalaryFromDOM       | Expensive `document.body.innerText` on complex pages             |
| L25 | `content/autofill/filler.ts`                  | skills mapping             | No type guard on skills array entries (object vs string)         |
| L26 | `core/ats/hybrid-scorer.ts`                   | checkBackgroundMismatch    | `'other'` key may not exist in `BackgroundType`                  |
| L27 | `core/ats/layered-scorer.ts`                  | extractRequirementsSection | Duplicated verbatim in both scorers                              |
| L28 | `core/learning/adaptive-keywords.ts`          | calculateTrend             | `daysSinceUpdate` always ~0 during active updates                |
| L29 | `options/App.tsx`                             | 222-228                    | Onboarding shown without `ErrorBoundary` wrapper                 |
| L30 | `options/App.tsx`                             | 183-184                    | Keyboard shortcut fires in `contenteditable` elements            |
| L31 | `options/pages/Dashboard.tsx`                 | 27-29                      | Two sequential GET_SETTINGS fetches on mount                     |
| L32 | `options/pages/Dashboard.tsx`                 | 263                        | Array index as React key                                         |
| L33 | `options/pages/MyProfile.tsx`                 | 48-58                      | Escape handler re-registers on every keystroke                   |
| L34 | `options/pages/ProfileManager.tsx`            | 37-42                      | `industries` state collected but never sent to backend           |
| L35 | `options/pages/ResumeUpload.tsx`              | 27-45                      | Stale closure risk in drag handlers                              |
| L36 | `options/pages/ATSScore.tsx`                  | 165-170                    | Dead `else` branch (unreachable)                                 |
| L37 | `options/pages/EmailTemplates.tsx`            | 61                         | Negative `daysSinceApplication` allowed                          |
| L38 | `options/pages/AnalyticsDashboard.tsx`        | 91-110                     | Weekly boundary timezone edge case                               |
| L39 | `options/pages/AISettings.tsx`                | 136-149                    | API key visible in React DevTools                                |
| L40 | `options/components/ResumeGenerator.tsx`      | 917                        | `console.log` in production                                      |
| L41 | `options/components/CoverLetterGenerator.tsx` | 129-133                    | `execCommand('copy')` deprecated                                 |
| L42 | `options/components/ResumeVersionCard.tsx`    | 79-99                      | Delete without confirmation dialog                               |
| L43 | `options/components/LinkedInChecker.tsx`      | 36-53                      | No try/catch around parse functions                              |
| L44 | `options/components/WorkspaceSwitcher.tsx`    | 29-37                      | `getInitials` crashes on double-space names                      |
| L45 | `options/components/WorkspaceSwitcher.tsx`    | 68                         | Colors shift when profile order changes                          |
| L46 | `options/components/Toast.tsx`                | 90-91                      | Literal 'x' instead of SVG close icon                            |
| L47 | `options/context/ProfileContext.tsx`          | many                       | Excessive console.log in production                              |
| L48 | `options/context/ProfileContext.tsx`          | 145-148                    | Stale closure in `deleteWorkspace`                               |
| L49 | `popup/main.tsx`                              | 6                          | Non-null assertion on `getElementById`                           |
| L50 | `options/pages/InterviewPrep.tsx`             | 43                         | Missing profile guard on `canGenerate`                           |
| L51 | `content/detectors/generic.ts`                | waitForDynamicContent      | Inconsistent 0ms vs 200ms settle delay                           |
| L52 | `options/pages/ApplicationHistory.tsx`        | 91-110                     | Weekly volume timezone boundary                                  |
