# ApplySharp — Project Overview

## Key Documentation

- `CLAUDE.md` — Agent instructions and coding standards
- `chrome-agent.md` — ATS resume agent mindset and rules
- `docs/product/mvp-plan.toml` — Authoritative task list (Phase 1-8)
- `docs/product/prd.md` — Product requirements
- `docs/product/modern-ai-architecture.md` — AAA framework (Automate → Augment → Agency)
- `docs/product/product-brief.md` — Product brief

## Architecture

Chrome Extension (Manifest V3), Local-first, No backend.
Stack: TypeScript, React 18, Vite 5, Tailwind CSS, IndexedDB, Chrome Storage.
AI: OpenAI, Anthropic, Groq, Ollama (local).
