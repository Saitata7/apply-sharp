<div align="center">

# ApplySharp

**The local-first AI job assistant. Your resume never leaves your laptop.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](src/manifest.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

## Why ApplySharp

Every other AI job tool uploads your resume, your job history, and your cover letters to someone else's cloud. ApplySharp does the opposite. The entire stack runs inside your browser, with optional local LLMs via [Ollama](https://ollama.com). Your career data is yours.

**What it does:**

- Tailors your resume to every job description with a hiring manager mindset, not keyword stuffing
- Scores any job posting against your profile in real time on the page
- Fills out application forms across 20+ ATS platforms with a single click
- Drafts cover letters in the proven Problem-Solution format
- Tracks every application and learns from outcomes
- Talks to a built-in AI Assistant that has tool access to all your data

**What makes it different:**

|                  | ApplySharp                               | JobRight, Massive, LazyApply, Sonara |
| ---------------- | ---------------------------------------- | ------------------------------------ |
| Resume privacy   | Stays on your machine                    | Uploaded to vendor cloud             |
| AI provider      | You choose: Ollama, Claude, OpenAI, Groq | Vendor decides                       |
| Cost model       | Free (BYOK if you use cloud LLMs)        | $20-40/month subscription            |
| Telemetry        | Zero                                     | Extensive                            |
| Source code      | Open                                     | Closed                               |
| Account required | No                                       | Yes                                  |

---

## Features

### Resume intelligence

- ATS-safe PDF and DOCX generation that passes Workday, Greenhouse, Lever, iCIMS, Ashby, and 10+ other ATS systems
- 4-layer ATS scoring: background, role, skill area, keyword matching across 11 professional backgrounds
- AI tailoring with a 3-step strategic pipeline (deep JD analysis, story-driven summary, bullet enhancement)
- Cover letter generation in Problem-Solution format
- Bullet validator, red-flag scanner, authenticity guard against generic AI output
- Multi-version resume manager for different target roles

### Job intelligence

- Live ATS score on any job page (LinkedIn, Indeed, Greenhouse, Lever, Workday, plus 15 more)
- Sidebar overlay with matched and missing keywords, requirement gaps, sponsorship signals
- Quick Tailor button: detect job, tailor resume, download in one click
- Hybrid scoring: instant quick score plus deep AI analysis with hiring manager persona

### Autofill

- One-pass LLM-based form filling across all major ATS platforms
- Multi-provider AI (Ollama, OpenAI, Anthropic, Groq) for cost and privacy control
- Automatic company research (Jina + Wikipedia tiered fallback)
- Pill UI on supported pages with status messages

### AI Assistant

- Chat interface with Claude tool access to your profile, applications, and recent jobs
- Read tools: get profile, list applications, list recent jobs, get settings
- Write tools: update profile via natural language, generate role profiles, update application status
- Same agent registry will be exposed to MCP and CLI surfaces

### Application tracking

- Kanban tracker with drag-and-drop status changes
- Application history with outcome tracking
- Adaptive learning system: outcomes feed back into future AI prompts

### Profile management

- MasterProfile (verified trunk of truth, never modified by tailoring)
- Role profiles (branches: same facts, different emphasis)
- Conversational AI interview that interviews you like a career advisor
- Workspace switcher for managing multiple search contexts

---

## Quick start

### Requirements

- Node.js 18 or later
- npm
- Chrome (or Chromium-based browser)

### Install

```bash
git clone https://github.com/saitata7/apply-sharp.git
cd apply-sharp
npm install
npm run build
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder
5. Pin the ApplySharp icon to your toolbar

### Configure your AI provider

1. Click the ApplySharp icon, then click **Open Settings**
2. Go to **AI Settings**
3. Pick a provider:
   - **Ollama** (recommended for privacy): free, local, offline. Install from [ollama.com](https://ollama.com), then pull a model like `ollama pull llama3.1:8b`
   - **OpenAI**: GPT-4o or GPT-4o-mini. Bring your own API key.
   - **Anthropic**: Claude Sonnet or Haiku. Bring your own API key.
   - **Groq**: free tier with Llama 3.3 70B at [console.groq.com](https://console.groq.com)
4. Click **Test Connection**

### Build your profile

1. Open ApplySharp Options
2. Either upload an existing resume (PDF/DOCX) OR start with the Conversational Interview
3. The AI will ask follow-up questions to extract specific stories and validate claims
4. Done. Visit any job page to see ApplySharp in action.

---

## Architecture

```
Content Script (job page) -> Message -> Background Service Worker -> IndexedDB
     |                                          |
  Sidebar UI                                AI Service
     |                                          |
Options Page (React) <- Message <- Response with data
```

### Key directories

| Directory                | Purpose                                                                         |
| ------------------------ | ------------------------------------------------------------------------------- |
| `src/background/`        | Service worker, message routing, AI orchestration                               |
| `src/content/detectors/` | Platform-specific job extraction (LinkedIn, Indeed, Greenhouse, Lever, Workday) |
| `src/content/autofill/`  | LLM-based one-pass form filling                                                 |
| `src/core/ats/`          | ATS scoring engines (hybrid, layered, gap analyzer)                             |
| `src/core/resume/`       | Bullet validator, red-flag scanner, authenticity guard                          |
| `src/core/learning/`     | Adaptive keywords, outcome tracking, auto-improver                              |
| `src/core/agent/`        | Agent tool registry shared by Assistant and future MCP server                   |
| `src/ai/`                | AI provider abstraction, agent loop, embeddings, response cache                 |
| `src/options/`           | React settings pages and resume generator                                       |
| `src/sidepanel/`         | Chrome side panel UI cards                                                      |
| `src/storage/`           | IndexedDB + Chrome storage repositories                                         |

### AAA framework

ApplySharp follows Automate -> Augment -> Agency:

- **Automate:** AI does the task (one-shot generation)
- **Augment:** AI plus human collaborate (learning system feeds back into AI)
- **Agency:** AI self-evaluates and iterates (agent loop with validators as exit conditions)

See [docs/product/modern-ai-architecture.md](docs/product/modern-ai-architecture.md) for the full spec (note: this file is gitignored in v1.0; see [ROADMAP.md](ROADMAP.md)).

---

## Tech stack

- **TypeScript** with strict mode
- **React 18** for the options and side panel UI
- **Vite 5** with `@crxjs/vite-plugin` for Chrome extension HMR
- **Vitest** for unit tests, **Playwright** for e2e
- **docx** library for DOCX resume generation
- **jsPDF** for PDF resume generation
- **IndexedDB** via `idb` for local persistence
- **Chrome Extension Manifest V3** with service worker
- **Tailwind CSS** for utility styling
- **Zod** for runtime schema validation

---

## Development

```bash
npm run dev          # Vite dev server with hot reload
npm run build        # Production build to dist/
npm run typecheck    # TypeScript check (no emit)
npm run lint         # ESLint
npm test             # Vitest unit tests
npm run test:coverage # Coverage report
npm run e2e          # Playwright end-to-end tests
```

---

## Privacy posture

ApplySharp ships with these defaults:

- All profile, application, and job data stored in IndexedDB and `chrome.storage.local` only
- Zero telemetry, zero analytics, zero crash reporting
- No external API calls except to your chosen LLM provider
- Optional company research uses public endpoints (Jina, Wikipedia) only when autofill is invoked
- LinkedIn-related features are off by default and require explicit opt-in
- BYOK model: API keys stay in `chrome.storage.local`, never transmitted anywhere except to the provider you configured

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## Roadmap

v1.0 (this release): the headline features above.

v1.1 (in development): sponsor lookup, lead list with HN hiring scrape, outreach composer, LinkedIn signals. See [ROADMAP.md](ROADMAP.md).

---

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, coding standards, and PR process. By contributing you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## License

[MIT](LICENSE). Use freely, fork freely, ship freely.

---

<div align="center">

**Built for job seekers who want their data to stay theirs.**

</div>
