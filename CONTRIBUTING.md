# Contributing to ApplySharp

Thanks for your interest. ApplySharp is built by job seekers, for job seekers, and contributions of every size are welcome.

## Quick links

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)
- [Roadmap](ROADMAP.md)
- [Open issues](https://github.com/saitata7/apply-sharp/issues)

## Ways to contribute

- **Report bugs** with the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md)
- **Request features** with the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md)
- **Improve docs** (README, JSDoc, this file). Doc PRs are auto-priority.
- **Add platform support** for ATS systems we don't yet detect (see `src/content/detectors/`)
- **Fix bugs** flagged in issues marked `good-first-issue` or `help-wanted`
- **Add tests** for the bullet validator, ATS scorer, autofill prompt, or any uncovered branch

## Development setup

```bash
# 1. Fork on GitHub, then clone your fork
git clone https://github.com/YOUR-USERNAME/apply-sharp.git
cd apply-sharp

# 2. Install dependencies
npm install

# 3. Build the extension
npm run build

# 4. Load dist/ as an unpacked extension in chrome://extensions

# 5. Start the dev server (HMR enabled)
npm run dev
```

## Coding standards

- **TypeScript strict mode.** No `any` unless you can defend why in PR review.
- **Run before pushing:**
  ```bash
  npm run typecheck
  npm run lint
  npm test
  npm run build
  ```
- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/) with **lowercase** subject:
  - `feat(autofill): add ashby workflow support`
  - `fix(sidebar): handle empty job description without warning`
  - `docs(readme): add ollama install instructions`
  - `test(ats): cover the layered scorer fallback path`
  - `refactor(profile): extract role profile branch logic`
- **No em-dashes** in user-facing text or comments. Use commas, periods, colons, or parentheses instead.
- **Comments** explain the WHY (subtle invariants, hidden constraints), not the WHAT. Don't comment what well-named code already says.

## Pull request process

1. Open an issue first if the change is non-trivial. Saves rework.
2. Branch from `main` with a descriptive name: `feat/ashby-detector`, `fix/workday-multi-page`.
3. Make your change. Add tests. Update relevant docs.
4. Run the full validation suite (`typecheck`, `lint`, `test`, `build`).
5. Open a PR using the [template](.github/PULL_REQUEST_TEMPLATE.md).
6. Be patient and responsive to review feedback. Most reviews land within 72 hours.

## Architecture orientation

If you are new to the codebase, start here:

- `src/background/message-handler.ts`: the central message router. Most user actions hit this first.
- `src/content/detectors/`: platform-specific job extraction. Adding a new ATS starts here.
- `src/core/ats/hybrid-scorer.ts`: the scoring entry point combining quick and deep analysis.
- `src/ai/agent-loop.ts`: the generate -> evaluate -> iterate utility used by AI generation features.
- `src/ai/providers/`: the AI provider abstraction. Add a new provider by implementing this interface.

## Testing philosophy

- **Unit tests** (`*.test.ts`) for pure logic: scorers, validators, parsers, prompt builders.
- **Integration tests** for message handlers (mock the AI provider, hit real storage).
- **E2E tests** (`tests/e2e/`) only for critical user flows: load extension, score a job, generate a resume.

We do not aim for 100% coverage. We aim for **the high-leverage code is well covered**.

## Adding a new ATS detector

1. Create `src/content/detectors/<platform>.ts` exporting a function that returns `JobDetectionResult`
2. Add the platform to `src/shared/constants/platforms.ts`
3. Wire it into `src/content/detectors/index.ts`
4. Add a unit test with a saved HTML fixture in `tests/fixtures/`

## Adding a new AI provider

1. Create `src/ai/providers/<provider>.ts` implementing the `AIProvider` interface
2. Register it in `src/ai/providers/index.ts`
3. Add it to `src/options/pages/AISettings.tsx`
4. Add a config schema for any provider-specific options

## Code of Conduct

By participating, you agree to abide by the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## Questions?

Open a [Discussion](https://github.com/saitata7/apply-sharp/discussions) (preferred for open-ended questions) or an Issue (for specific bugs and features).
