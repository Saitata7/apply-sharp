# ApplySharp - Product Requirements Document

## Vision

ApplySharp is a local-first AI Job Assistant Chrome extension that transforms the job application process from tedious manual work into an intelligent, personalized experience. It combines the automation of tools like Simplify with the AI-powered customization of RightJob, while keeping all data private on the user's machine.

**Key Differentiators:**
- **Self-improving system** that learns from application outcomes automatically
- **Platform-specific ATS optimization** for maximum matching scores
- **Humanized content generation** that doesn't sound AI-generated
- **Token-efficient architecture** that uses AI only where truly needed

## Problem Statement

Job seekers face several challenges:
1. **Repetitive data entry**: Re-entering the same information across hundreds of applications
2. **One-size-fits-all resumes**: Using generic resumes instead of tailored versions for each role
3. **No tracking**: Losing track of which jobs they've applied to and their status
4. **Poor job fit assessment**: Wasting time applying to mismatched roles
5. **Generic cover letters**: Sending template cover letters that don't resonate
6. **ATS rejection**: Getting filtered out by automated systems before a human sees the resume
7. **AI-sounding content**: Generated content that's obviously written by AI

Existing solutions either:
- Require cloud storage of sensitive personal data (privacy concern)
- Lack AI-powered customization
- Don't learn from user behavior over time
- Generate obvious AI content that hurts applications
- Don't understand different ATS platforms

## Solution

ApplySharp addresses these problems with:

### Core Features

1. **Master Profile System**
   - Upload resume (PDF/DOCX) for deep AI analysis
   - Extract career context, skills with proficiency levels, and accomplishments
   - Identify target roles with fit scores
   - Generate role-specific profiles automatically
   - Build answer bank for common application questions

2. **Platform-Specific ATS Optimization**
   - **Greenhouse**: Frequency-based matching (repeat keywords 2-3x)
   - **Lever**: Semantic matching (understands synonyms, tenses)
   - **Workday**: Exact phrase matching (strictest - copy from JD)
   - **Taleo/iCIMS**: Hybrid matching with skills extraction
   - Automatic strategy selection based on detected platform

3. **Hybrid ATS Scoring (Cost-Efficient)**
   - **Layer 1 (Instant/Free)**: Keyword matching, skills overlap, format check
   - **Layer 2 (AI/On-Demand)**: Deep semantic analysis, contextual matching
   - Only use AI when user wants detailed analysis

4. **Self-Improving Learning Engine**
   - Automatically tracks application outcomes (response, interview, offer)
   - Learns which keywords lead to callbacks per platform
   - Identifies patterns in successful applications
   - Provides increasingly personalized recommendations
   - **No user intervention required** - learns silently in background

5. **Adaptive Keyword Database**
   - Tracks keyword effectiveness per platform
   - Auto-adjusts weights based on success rates
   - Time decay for outdated keywords
   - Semantic relationships between skills
   - Industry-specific clustering

6. **Humanized Content Generation**
   - Removes AI-typical phrases ("I am excited to...", "leverage my skills...")
   - Adds natural variations and human touches
   - Confidence scoring for AI detection
   - Makes generated content indistinguishable from human writing

7. **Smart Autofill with Approval**
   - Detect application form fields
   - Map profile data to form fields
   - Platform-specific handlers (Greenhouse, Lever, Workday)
   - **Always require human approval before filling**
   - Pre-filled answer bank for common questions

8. **Automatic Job Detection**
   - Detects when user visits a job listing page
   - Extracts job title, company, description, requirements
   - Works across major platforms: LinkedIn, Indeed, Greenhouse, Lever, Workday, Dice
   - JSON-LD parsing when available for accuracy

9. **Application Outcome Tracking**
   - Track all applications automatically
   - Status workflow: Applied → Viewed → Interview → Offer/Rejected
   - Auto-mark stale applications as "no response" after 2 weeks
   - Calculate response rates, interview rates per platform
   - Weekly trend analysis

10. **Auto-Improvement Recommendations**
    - Generate improvement suggestions automatically
    - Keyword emphasis/de-emphasis based on performance
    - Platform-specific tips
    - Learning insights dashboard
    - Job-specific keyword recommendations

## User Stories

### As a job seeker, I want to:

1. **Upload my resume once** and have the system deeply understand my career context
2. **See ATS-optimized keyword recommendations** for each job based on the platform
3. **Get a job fit score instantly** when I open a job listing
4. **Generate a custom cover letter** that doesn't sound AI-generated
5. **Have the system learn automatically** from my application outcomes
6. **See which keywords are working** and which to avoid
7. **Autofill application forms** with pre-generated answers
8. **Track my applications** with automatic status updates
9. **Get platform-specific tips** (e.g., "Workday requires exact phrases")
10. **Keep my data private** on my own computer

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Extension                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Popup UI   │  │  Options UI  │  │ Content Script│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│          │                │                  │                   │
│          └────────────────┼──────────────────┘                   │
│                           │                                      │
│                    ┌──────┴──────┐                              │
│                    │  Background  │                              │
│                    │   Service    │                              │
│                    └──────────────┘                              │
│                           │                                      │
│    ┌──────────────────────┼──────────────────────────┐          │
│    │                      │                          │          │
│  ┌─┴───────────┐  ┌──────┴──────┐  ┌───────────────┴┐         │
│  │ Storage Layer│  │  AI Service │  │ Learning Engine │         │
│  │  (IndexedDB) │  │ (Providers) │  │  (Self-Improve) │         │
│  └─────────────┘  └─────────────┘  └────────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Core Modules

| Module | Purpose | Key Files |
|--------|---------|-----------|
| **Learning Engine** | Self-improving recommendations | `src/core/learning/` |
| **ATS Optimization** | Platform-specific strategies | `src/core/ats/` |
| **Profile Engine** | Career context analysis | `src/core/profile/` |
| **Content Humanizer** | Make AI content natural | `src/core/content/` |
| **Resume Parser** | PDF/DOCX extraction | `src/core/resume/` |
| **Job Detectors** | Platform-specific extraction | `src/content/detectors/` |
| **AI Service** | Provider abstraction | `src/ai/` |
| **Storage** | IndexedDB repositories | `src/storage/` |

### Privacy & Security
- All data stored locally in IndexedDB
- No data sent to external servers except chosen AI provider
- API keys stored encrypted in browser storage
- Option to use fully local AI (Ollama)
- Learning data never leaves the device

### Platform Support
- Chrome browser (Manifest V3)
- Job boards: LinkedIn, Indeed, Greenhouse, Lever, Workday, Dice, Monster
- Extensible architecture for adding new platforms

### AI Integration
- Support multiple providers: Ollama (local), OpenAI, Groq
- User chooses their preferred provider
- Streaming responses for better UX
- Token-efficient design (AI only when needed)
- Graceful fallback when AI unavailable

### Performance
- Extension popup loads in <200ms
- Job detection happens within 1s of page load
- Instant ATS score (Layer 1) in <100ms
- AI scoring (Layer 2) completes within 5s
- Form autofill preview appears within 500ms

## Learning System Details

### Data Flow

```
Application Submitted
        │
        ▼
┌───────────────────┐
│ Track Application │ ──► Store keywords, platform, profile
└───────────────────┘
        │
        ▼ (Over time)
┌───────────────────┐
│  Record Outcome   │ ──► Response? Interview? Offer?
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Update Weights   │ ──► Adjust keyword scores per platform
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Generate Insights│ ──► Surface recommendations
└───────────────────┘
```

### Key Metrics Tracked
- Response rate per platform
- Response rate per keyword
- Time to response
- Interview conversion rate
- Offer rate
- Keyword performance trends (rising/stable/declining)

## Success Metrics

1. **Activation**: User uploads resume and creates master profile
2. **Engagement**: User generates 3+ tailored applications
3. **Learning**: System has 10+ tracked applications with outcomes
4. **Retention**: User returns within 7 days
5. **Efficiency**: 50% time reduction per application
6. **Quality**: 20% higher response rate vs generic applications

## Out of Scope (v1)

- Mobile app
- Job search/discovery (only assists with found jobs)
- Direct application submission (always manual)
- Cloud sync between devices
- Team/enterprise features
- Interview preparation features

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Job site structure changes | Modular detector architecture, easy to update |
| AI rate limits | Local Ollama option, Layer 1 instant scoring, caching |
| User enters sensitive data | Clear warnings, local-only storage, no cloud |
| Form filling breaks site | Preview/approval flow, conservative field detection |
| AI content sounds robotic | Humanizer module removes AI patterns |
| Learning needs data volume | Graceful degradation, show "need more data" messaging |

## Timeline (Completed)

- **Phase 1** (Foundation): Project setup, storage, basic UI ✓
- **Phase 2** (Detection): Job page detection for all platforms ✓
- **Phase 3** (Profiles): Master profile with career context ✓
- **Phase 4** (AI): Hybrid scoring and humanized generation ✓
- **Phase 5** (Autofill): Form detection and filling with approval ✓
- **Phase 6** (Learning): Self-improving outcome tracking ✓
- **Phase 7** (ATS): Platform-specific optimization strategies ✓

## Future Enhancements

- LinkedIn profile sync
- Browser-based resume editor
- A/B testing for cover letter variants
- Interview scheduling integration
- Salary negotiation insights from market data
- Chrome sync for multi-device use (opt-in, encrypted)
