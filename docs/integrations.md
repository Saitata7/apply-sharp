# Integrations

## AI Providers

ApplySharp supports 3 AI providers through a common interface (`AIProviderInterface`).

| Provider | Type | Default Model | Context Limit | Config |
|----------|------|---------------|---------------|--------|
| **OpenAI** | Cloud | `gpt-4o-mini` | 16.4K–128K | API key in settings |
| **Groq** | Cloud | User-selected | Varies | API key in settings |
| **Ollama** | Local | User-selected | Varies | localhost:11434 |

### Provider Interface

```typescript
interface AIProviderInterface {
  name: string;
  isLocal: boolean;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string>;
  countTokens(text: string): number;
  getMaxContextLength(): number;
  isAvailable(): Promise<boolean>;
}
```

### Temperature Guide

| Range | Use Case | Examples |
|-------|----------|---------|
| 0.1–0.3 | Deterministic | Resume parsing, career analysis, ATS scoring |
| 0.4–0.5 | Analytical | Profile generation, bullet enhancement |
| 0.6–0.7 | Creative | Cover letters, summaries |

## Job Platforms

Content scripts detect and extract job data from these platforms.

### Dedicated Detectors

| Platform | Detector | URL Pattern |
|----------|----------|-------------|
| LinkedIn | `LinkedInDetector` | `linkedin.com/jobs/*` |
| Indeed | `IndeedDetector` | `indeed.com/*` |
| Greenhouse | `GreenhouseDetector` | `boards.greenhouse.io/*`, `*.greenhouse.io/*` |
| Lever | `LeverDetector` | `jobs.lever.co/*`, `*.lever.co/*` |
| Dice | `DiceDetector` | `dice.com/*` |

### Generic Detector (Fallback)

| Platform | URL Pattern | Status |
|----------|-------------|--------|
| Monster | `monster.com/*` | Generic fallback |
| Workday | `*.myworkdayjobs.com/*` | Generic fallback (TODO: dedicated) |
| Other ATS | Various | Heuristic-based detection |

### Detection Flow

```
Page loads → Content script injects
    ↓
URL matching → Select platform detector
    ↓
isJobPage() → Check if current page is a job listing
    ↓
extract() → Pull structured job data:
  { title, company, location, description,
    requirements, salary, url, platform }
    ↓
sendMessage({ type: 'JOB_DETECTED' })
```

## Document Libraries

| Library | Purpose | Used In |
|---------|---------|---------|
| **jsPDF** | Generate PDF resumes | `ResumeGenerator.tsx` |
| **docx** | Generate DOCX resumes | `ResumeGenerator.tsx` |
| **mammoth** | Parse uploaded DOCX files | `file-parser.ts` |
| **pdfjs-dist** | Parse uploaded PDF files | `file-parser.ts` |
| **jszip** | ZIP file handling | Document packaging |

## Chrome APIs Used

| API | Permission | Purpose |
|-----|-----------|---------|
| `chrome.storage.local` | `storage` | Settings, master profiles |
| `chrome.storage.local` | `unlimitedStorage` | Large profile data |
| `chrome.runtime.sendMessage` | — | Content ↔ Background messaging |
| `chrome.tabs` | `activeTab` | Inject scripts, get tab info |
| `chrome.contextMenus` | `contextMenus` | Right-click menu actions |
