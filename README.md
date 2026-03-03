# ApplySharp

A local-first AI Job Assistant Chrome extension that automates and optimizes the job application process while keeping all data private on your machine.

## Features

- **ATS-Optimized Resume Generation** - DOCX and PDF output that passes Workday, Greenhouse, Lever, iCIMS, and 10+ ATS systems
- **4-Layer ATS Scoring** - Background, Role, Skill Area, and Keyword matching across 11 professional backgrounds
- **AI Resume Tailoring** - Strategic JD-to-resume optimization using a hiring manager mindset (not keyword stuffing)
- **Cover Letter Generation** - Problem-Solution format with company-specific hooks
- **Job Detection** - Auto-detects job postings on LinkedIn, Indeed, Greenhouse, Lever, Workday, and 15+ platforms
- **Sidebar Overlay** - In-page ATS score, matched/missing keywords, requirement gaps, and sponsorship status
- **Learning System** - Tracks application outcomes and adapts keyword recommendations over time
- **Interview Prep** - Generates tailored interview questions based on JD and profile
- **Multi-Provider AI** - Supports Ollama (local), OpenAI, Anthropic (Claude), and Groq
- **100% Local Data** - All profile data, job history, and settings stay on your machine via IndexedDB and Chrome storage

## Quick Start

### Prerequisites

- Node.js 18+
- npm
- Chrome browser

### Install and Build

```bash
git clone <repo-url>
cd apply-sharp
npm install
npm run dev    # Development with hot reload
```

### Load Extension

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder

### Configure AI

1. Click the extension icon and open **Settings**
2. Go to **AI Settings**
3. Choose a provider:
   - **Ollama** (recommended) - Free, local, private. Install from [ollama.com](https://ollama.com)
   - **OpenAI** - GPT-4o-mini or GPT-4o. Requires API key
   - **Anthropic** - Claude 3.5 Sonnet or Haiku. Requires API key
   - **Groq** - Llama 3.3 70B. Free tier available at [console.groq.com](https://console.groq.com)
4. Click **Test Connection** to verify

## Architecture

```
Content Script (job page) --> Message --> Background Service Worker --> IndexedDB
     |                                          |
  Sidebar UI                                AI Service
     |                                          |
Options Page (React) <-- Message <-- Response with data
```

### Key Directories

| Directory                | Purpose                                                   |
| ------------------------ | --------------------------------------------------------- |
| `src/background/`        | Service worker, message routing, AI orchestration         |
| `src/content/detectors/` | Platform-specific job extraction (LinkedIn, Indeed, etc.) |
| `src/core/ats/`          | ATS scoring engines (hybrid, layered, gap analyzer)       |
| `src/core/resume/`       | Bullet validator, red-flag scanner, authenticity guard    |
| `src/core/learning/`     | Adaptive keywords, outcome tracking, auto-improver        |
| `src/core/content/`      | Humanizer for natural-sounding AI content                 |
| `src/ai/`                | AI provider abstraction (Ollama, OpenAI, Anthropic, Groq) |
| `src/options/`           | React settings pages and resume generator                 |
| `src/storage/`           | IndexedDB + Chrome storage repositories                   |
| `src/shared/`            | Types, constants, utilities                               |

## Tech Stack

- **TypeScript** - Strict typing throughout
- **React** - Options page UI
- **Vite** - Build tooling with Chrome extension plugin
- **Vitest** - Testing framework
- **docx** - DOCX resume generation
- **jsPDF** - PDF resume generation
- **IndexedDB** - Local data persistence
- **Chrome Extension Manifest V3** - Service worker architecture

## Build Commands

```bash
npm install          # Install dependencies
npm run dev          # Development with hot reload
npm run build        # Production build
npm run typecheck    # Type checking
npm run lint         # Linting
npm test             # Run tests with vitest
```

## Privacy

ApplySharp is designed with privacy as a core principle:

- **No cloud storage** - All data stays in your browser's local storage (IndexedDB + Chrome storage)
- **No telemetry** - Zero analytics, tracking, or data collection
- **BYOK model** - Bring Your Own Key for AI providers; we never see your API keys
- **Local-first AI** - Ollama support means you can run AI completely offline
- **No account required** - No sign-up, no login, no user tracking

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and ensure tests pass: `npm test && npm run typecheck`
4. Submit a pull request

## License

See [LICENSE](LICENSE) for details.
