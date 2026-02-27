# Architecture

## System Overview

ApplySharp is a **Chrome Extension (Manifest V3)** that runs entirely in the browser. There is no backend server — all data stays on the user's machine.

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Browser                        │
│                                                         │
│  ┌──────────────┐    Messages    ┌──────────────────┐   │
│  │Content Script │──────────────→│ Background Worker │   │
│  │(Job Pages)    │←──────────────│ (Service Worker)  │   │
│  │               │               │                   │   │
│  │ • Detectors   │               │ • Message Handler │   │
│  │ • Overlay UI  │               │ • AI Service      │   │
│  │ • Autofill    │               │ • Context Menu    │   │
│  └──────────────┘               └────────┬──────────┘   │
│                                          │              │
│  ┌──────────────┐               ┌────────▼──────────┐   │
│  │ Options Page  │    Messages   │   Storage Layer   │   │
│  │ (React SPA)   │──────────────→│                   │   │
│  │               │               │ • IndexedDB (idb) │   │
│  │ • Profile Mgr │               │ • Chrome Storage  │   │
│  │ • AI Settings │               └───────────────────┘   │
│  │ • Resume Gen  │                                       │
│  │ • History     │               ┌───────────────────┐   │
│  └──────────────┘               │  External AI APIs  │   │
│                                  │ • OpenAI           │   │
│  ┌──────────────┐               │ • Groq             │   │
│  │    Popup      │               │ • Ollama (local)   │   │
│  │ (Quick View)  │               └───────────────────┘   │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React 18 + TypeScript |
| Styling | Tailwind CSS |
| State Management | Zustand (local) + React Query (async) |
| Build Tool | Vite + @crxjs/vite-plugin |
| Storage | IndexedDB (via idb) + Chrome Storage API |
| AI Providers | OpenAI, Groq, Ollama |
| Document Gen | jsPDF (PDF) + docx (DOCX) |
| Document Parse | mammoth (DOCX) + pdfjs-dist (PDF) |
| Validation | Zod |
| Testing | Vitest |

## Extension Entry Points

| Entry Point | File | Purpose |
|-------------|------|---------|
| Background Worker | `src/background/index.ts` | Message routing, AI calls, storage ops |
| Content Script | `src/content/index.ts` | Job detection, overlay UI on job pages |
| Autofill Script | `src/content/autofill-content.ts` | Form detection and autofill on all pages |
| Options Page | `src/options/index.html` | React SPA for settings and profile management |
| Popup | `src/popup/index.html` | Quick-access popup |

## Communication Pattern

All communication uses **Chrome message passing** — there are no HTTP endpoints.

```
Content Script                    Background Worker
     │                                  │
     │  sendMessage({ type, payload })  │
     ├─────────────────────────────────→│
     │                                  ├── Switch on message.type
     │                                  ├── Call handler function
     │                                  ├── Access storage / AI
     │  { success, data, error }        │
     │←─────────────────────────────────┤
     │                                  │
```

**45+ message types** defined in `src/shared/utils/messaging.ts`, all routed through `src/background/message-handler.ts`.

## Directory Structure

```
src/
├── background/              # Service worker (MV3)
│   ├── index.ts             # Entry point, listener setup
│   ├── message-handler.ts   # Routes all 45+ message types
│   └── context-menu.ts      # Right-click menu actions
│
├── content/                 # Injected into web pages
│   ├── index.ts             # Main content script
│   ├── autofill-content.ts  # Form autofill script
│   ├── styles.css           # Injected styles
│   ├── detectors/           # Platform-specific job extractors
│   │   ├── linkedin.ts
│   │   ├── indeed.ts
│   │   ├── greenhouse.ts
│   │   ├── lever.ts
│   │   ├── dice.ts
│   │   └── generic.ts      # Fallback detector
│   ├── autofill/            # Form detection & filling
│   │   ├── form-detector.ts
│   │   ├── filler.ts
│   │   └── autofill-sidebar.ts
│   └── ui/                  # Overlay components
│       ├── overlay.ts
│       └── sidebar.ts
│
├── core/                    # Business logic (no Chrome APIs)
│   ├── ats/                 # ATS scoring engine
│   │   ├── hybrid-scorer.ts # Quick (instant) + Deep (AI) scoring
│   │   ├── layered-scorer.ts# 4-layer: Background→Role→Skill→Keywords
│   │   ├── matcher.ts       # Keyword matching algorithms
│   │   └── keywords/        # 11 background keyword sets (~200KB)
│   ├── profile/
│   │   └── context-engine.ts# 5-stage AI pipeline for resume analysis
│   ├── resume/              # Resume parsing utilities
│   ├── learning/            # Self-improving keyword system
│   └── autofill/            # Answer bank logic
│
├── ai/                      # AI provider abstraction
│   ├── index.ts             # AIService class
│   ├── providers/           # OpenAI, Groq, Ollama implementations
│   └── prompts/             # Prompt templates
│
├── storage/                 # Data persistence
│   ├── idb-client.ts        # IndexedDB setup (4 stores)
│   └── repositories/        # CRUD for profiles, jobs, applications, settings
│
├── options/                 # React settings app
│   ├── App.tsx              # 5-tab navigation
│   ├── components/          # ResumeGenerator, BackgroundConfig, etc.
│   ├── pages/               # ResumeUpload, MyProfile, AISettings, etc.
│   └── context/             # ProfileProvider
│
├── popup/                   # Extension popup
│
├── shared/                  # Shared across all entry points
│   ├── types/               # TypeScript interfaces (8 type files)
│   ├── constants/           # Platform definitions
│   └── utils/               # Messaging, JSON parsing
│
└── manifest.json            # Chrome Extension Manifest V3
```
