# Changelog

All notable changes to ApplySharp are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

See [ROADMAP.md](ROADMAP.md) for v1.1 features in development.

## [1.0.0] - 2026-04-27

### Added

**Resume intelligence**

- ATS-safe PDF and DOCX resume generation passing 20+ ATS systems
- 4-layer ATS scoring (background, role, skill area, keyword) across 11 professional backgrounds
- AI resume tailoring with 3-step strategic pipeline (deep JD analysis, story-driven summary, bullet enhancement)
- Cover letter generator in Problem-Solution format
- Bullet validator, red-flag scanner, authenticity guard
- Multi-version resume manager for different target roles
- Skills gap analysis

**Job intelligence**

- Live ATS score on job pages across LinkedIn, Indeed, Greenhouse, Lever, Workday, and 15+ platforms
- Sidebar overlay with matched and missing keywords, requirement gaps, sponsorship signals
- Quick Tailor: detect, tailor, download in one click
- Hybrid scoring (instant quick + deep AI with hiring manager persona)
- Semantic embeddings for keyword matching

**Autofill**

- One-pass LLM-based form filling
- Multi-provider AI (Ollama, OpenAI, Anthropic, Groq)
- Company research with Jina + Wikipedia tiered fallback
- React/Vue compatible value setters via native prototype hijacking
- Refusal detection and form race condition guard

**AI Assistant**

- Claude-powered chat with tool access to profile, applications, jobs, settings
- Read tools: profile, applications, recent jobs, settings
- Write tools: profile updates, role profile generation, application status changes

**Profile management**

- MasterProfile (verified trunk) and RoleProfile (branches) data model
- Conversational AI interview for profile building
- Workspace switcher
- Onboarding wizard

**Application tracking**

- Kanban tracker with drag-and-drop
- Application history with outcome tracking
- Adaptive learning system feeding outcomes back into AI prompts

**AI infrastructure**

- Multi-provider abstraction layer
- Structured outputs for guaranteed valid JSON
- Agent loop (generate -> evaluate -> iterate)
- Response cache by input checksum
- Cost router (cheap-to-expensive provider cascade)
- Usage tracker

### Privacy and security

- Zero telemetry, zero analytics
- All data in `chrome.storage.local` and IndexedDB
- BYOK model for AI providers
- LinkedIn integrations off by default behind explicit opt-in
- No external API calls except to your chosen LLM provider

### Developer experience

- TypeScript strict mode throughout
- Vitest unit tests, Playwright e2e tests
- Vite 5 with `@crxjs/vite-plugin` for HMR
- Conventional Commits with commitlint
- ESLint + Prettier

[Unreleased]: https://github.com/saitata7/apply-sharp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/saitata7/apply-sharp/releases/tag/v1.0.0
