# Roadmap

This document captures what is shipped, what is in progress, and what is being considered. It is updated as priorities shift. PRs and issues are welcome on any item.

## Shipped: v1.0 (2026-04-27)

The core experience. Resume tailoring, ATS scoring, autofill, sidebar overlay, AI Assistant, application tracking, profile management. See [CHANGELOG.md](CHANGELOG.md) for the full list.

## In progress: v1.1 (Q2 2026)

The discovery and outreach layer. Code is partially written and lives behind feature flags in `src/shared/feature-flags.ts`. Default off in v1.0; will flip to default on at v1.1 launch.

### Sponsor lookup

- DOL H-1B LCA database query interface
- Browse companies by sponsorship volume, approval rate, role
- Filter the lead list by visa-friendliness
- Status: backend wired, UI works, needs LCA dataset shipping strategy

### Lead list (sponsor-filtered)

- Daily background refresh of new sponsoring-company job postings
- Hiring trigger signals from HN Algolia
- Cross-reference with DOL sponsor index
- Status: code complete, gated by `discovery.leadList` flag

### HN "Who is hiring" job feed

- Monthly thread parser
- Personal-fit scoring per posting
- Visa-friendly filter
- Status: parser works, page gated by `pages.jobFeed` flag

### Outreach composer

- LinkedIn DM and email drafting tailored per recipient
- Connection-type aware (alumni, shared employer, cold)
- Gmail draft creation via OAuth (BYOK)
- Status: first iteration shipped to internal, refining UX

### LinkedIn signals

- In-feed badge with HIGH/MEDIUM/LOW per posting
- Ghost job detection
- Actively reviewing applicants signal
- Status: code complete, off by default due to LinkedIn ToS considerations. Requires explicit opt-in.

## Considered: v1.2 and beyond

These are ideas being validated against the actual bottleneck (interview rate, not apply rate). Some will ship, some will be cut.

### Agent loop library extraction

- Extract `src/ai/agent-loop.ts` into a standalone npm package
- Multi-provider support (Ollama, OpenAI, Anthropic, Groq)
- Production-ready evaluation harness
- Goal: become the canonical "20-line agent loop" for AI engineers

### MCP server surface

- Expose the same agent tool registry over MCP
- Lets Claude Code drive ApplySharp from outside the browser
- Enables CLI workflows for power users

### LLM evaluation harness

- Catch resume regression before generation hits the user
- Snapshot diff: before/after prompt change against a fixture set
- Tie into CI to fail builds on regressions

### Multi-page Workday support

- Track `data-automation-id` mutations
- Auto-advance through 3+ page Workday workflows
- Persist form state across page navigations

### Combobox / custom select autofill

- Click simulation for Lever and custom Workday selects
- Detect React combobox patterns
- Type into input, click match from dropdown

### Browser-use agent integration

- Optional headless agent that completes full applications
- For complex multi-step ATS flows where one-pass autofill fails

## Not on the roadmap

Things we have considered and explicitly decided NOT to build:

- **Cloud sync.** Defeats the local-first privacy promise.
- **User accounts.** Same reason.
- **Subscription tier.** ApplySharp stays free. BYOK keeps costs on the user.
- **Resume upload to a vendor cloud.** Same as cloud sync.
- **Ad-supported features.** Conflict of interest with the user's job search.
- **Auto-apply at volume (100+ apps/day).** The 2026 hiring market punishes generic mass applications. ApplySharp is a quality tool, not a volume tool.

## Contributing to the roadmap

Open a [Discussion](https://github.com/saitata7/apply-sharp/discussions) to propose a new direction. Open an [Issue](https://github.com/saitata7/apply-sharp/issues) to claim one of the v1.1 items.
