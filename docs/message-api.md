# Message API Reference

All communication in ApplySharp uses Chrome message passing. This is the extension's "API."

## How It Works

```typescript
// Content script → Background worker
const response = await sendMessage<PayloadType, ResponseType>({
  type: 'MESSAGE_TYPE',
  payload: { ... }
});
// response: { success: boolean, data?: T, error?: string }
```

## Message Types by Category

### Job Detection & Scoring

| Type | Direction | Payload | Response | Handler |
|------|-----------|---------|----------|---------|
| `JOB_DETECTED` | Content → BG | `{ job }` | — | Logs job title |
| `SAVE_JOB` | Content → BG | `{ jobData }` | `{ job }` | Upsert by URL |
| `GET_JOB` | Any → BG | `{ jobId }` | `{ job }` | Lookup by ID |
| `GET_RECENT_JOBS` | Any → BG | `{ limit }` | `{ jobs[] }` | Recent jobs list |
| `ANALYZE_JOB` | Any → BG | `{ job, platform, useAI }` | `{ analysis }` | ATS scoring |
| `SCORE_JOB` | Any → BG | `{ job }` | `{ score }` | Quick ATS score |
| `ANALYZE_JD_FOR_RESUME` | Options → BG | `{ masterProfileId, jobDescription }` | `{ analysis }` | JD vs resume comparison |

### Resume & Cover Letter

| Type | Direction | Payload | Response | Handler |
|------|-----------|---------|----------|---------|
| `OPTIMIZE_RESUME` | Any → BG | `{ job }` | `{ suggestions }` | General optimization |
| `OPTIMIZE_RESUME_FOR_JD` | Options → BG | `{ masterProfileId, roleId, jobDescription, missingKeywords, ... }` | `{ optimized }` | 3-step strategic optimization |
| `GENERATE_COVER_LETTER` | Any → BG | `{ job }` | `{ coverLetter }` | AI cover letter |
| `PREVIEW_AUTOFILL` | Content → BG | — | `{ preview }` | Preview form fills |

### Profile Management

| Type | Direction | Payload | Response | Handler |
|------|-----------|---------|----------|---------|
| `GET_PROFILES` | Any → BG | — | `{ profiles[] }` | List all |
| `GET_CURRENT_PROFILE` | Any → BG | — | `{ profile }` | Active profile |
| `SET_CURRENT_PROFILE` | Any → BG | `{ profileId }` | `{ success }` | Switch active |
| `CREATE_PROFILE` | Options → BG | `{ profileData }` | `{ profile }` | Create new |
| `UPDATE_PROFILE` | Options → BG | `{ id, updates }` | `{ profile }` | Update existing |
| `DELETE_PROFILE` | Options → BG | `{ profileId }` | `{ success }` | Remove |

### Master Profile (AI-Enhanced)

| Type | Direction | Payload | Response | Handler |
|------|-----------|---------|----------|---------|
| `ANALYZE_RESUME` | Options → BG | `{ fileName, rawText, basicInfo, confidence }` | `{ masterProfile }` | Parse + AI analysis |
| `GET_MASTER_PROFILES` | Any → BG | — | `{ profiles[] }` | List all |
| `GET_ACTIVE_MASTER_PROFILE` | Any → BG | — | `{ profile }` | Active master |
| `SET_ACTIVE_MASTER_PROFILE` | Any → BG | `{ profileId }` | `{ success }` | Set active |
| `DELETE_MASTER_PROFILE` | Options → BG | `{ profileId }` | `{ success }` | Delete |
| `UPDATE_MASTER_PROFILE` | Options → BG | `{ id, updates }` | `{ profile }` | Update |
| `PROCESS_PROFILE_UPDATE` | Options → BG | `{ profileId, context, updateType }` | `{ updates }` | AI processing |
| `APPLY_PROFILE_UPDATE` | Options → BG | `{ profileId, context }` | `{ profile }` | Apply AI updates |
| `GENERATE_ROLE_PROFILE` | Options → BG | `{ masterProfileId, targetRole }` | `{ roleProfile }` | Create role variant |
| `DELETE_ROLE_PROFILE` | Options → BG | `{ masterProfileId, roleProfileId }` | `{ success }` | Remove role variant |
| `SET_ACTIVE_ROLE_PROFILE` | Options → BG | `{ masterProfileId, roleProfileId }` | `{ success }` | Activate role variant |
| `UPDATE_ANSWER_BANK` | Options → BG | `{ masterProfileId, keywords, context }` | `{ answerBank }` | Update Q&A bank |

### Autofill & Application Tracking

| Type | Direction | Payload | Response | Handler |
|------|-----------|---------|----------|---------|
| `START_AUTOFILL` | Content → BG | `{ tabId }` | `{ success }` | Start filling forms |
| `DETECT_FORM` | Content → BG | — | `{ formFields }` | Detect form inputs |
| `SAVE_ANSWER` | Any → BG | `{ questionText, answer }` | `{ success }` | Store Q&A |
| `GET_ANSWER_SUGGESTION` | Content → BG | `{ questionText, company, jobTitle }` | `{ suggestion }` | Find matching answer |
| `GENERATE_AI_ANSWER` | Content → BG | `{ questionText, company, jobTitle, jd }` | `{ answer }` | AI-generated answer |
| `TRACK_APPLICATION` | Any → BG | `{ applicationPayload }` | `{ application }` | Log application |
| `RECORD_OUTCOME` | Options → BG | `{ applicationId, status, notes }` | `{ success }` | Record result |

### Learning & Insights

| Type | Direction | Payload | Response | Handler |
|------|-----------|---------|----------|---------|
| `GET_LEARNING_INSIGHTS` | Options → BG | — | `{ insights }` | Performance data |
| `GET_APPLICATION_STATS` | Options → BG | — | `{ stats }` | Statistics |
| `GET_IMPROVEMENTS` | Options → BG | — | `{ improvements }` | Recommendations |
| `GET_KEYWORD_RECOMMENDATIONS` | Any → BG | `{ jobKw, resumeKw, platform }` | `{ keywords }` | Missing keywords |
| `RUN_LEARNING_ANALYSIS` | Options → BG | — | `{ analysis }` | Self-improvement run |

### Settings & Navigation

| Type | Direction | Payload | Response | Handler |
|------|-----------|---------|----------|---------|
| `GET_SETTINGS` | Any → BG | — | `{ settings }` | Get all settings |
| `UPDATE_SETTINGS` | Options → BG | `{ updates }` | `{ settings }` | Update settings |
| `OPEN_OPTIONS` | Any → BG | `{ tab? }` | — | Open options page |
| `TOGGLE_SIDEBAR` | Any → BG | — | — | Show/hide sidebar |
| `CLOSE_PREVIEW` | Content → BG | — | — | Close preview overlay |
| `SAVE_CURRENT_JOB` | Content → BG | — | `{ job }` | Save active job |
