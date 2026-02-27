# Data Model

## Storage Overview

ApplySharp uses two storage mechanisms:
- **IndexedDB** (via `idb` package) — Structured data (profiles, jobs, applications)
- **Chrome Storage** (`chrome.storage.local`) — Settings, master profiles, active states

## IndexedDB Schema

Database: `applysharp-db` (version 1)

### Stores

```
┌─────────────────────────────────────────────┐
│ profiles (ResumeProfile)                    │
│ Key: id (string)                            │
│ Indexes: by-name, by-default, by-updated    │
├─────────────────────────────────────────────┤
│ jobs (Job)                                  │
│ Key: id (string)                            │
│ Indexes: by-platform, by-company,           │
│          by-url, by-created                 │
├─────────────────────────────────────────────┤
│ applications (Application)                  │
│ Key: id (string)                            │
│ Indexes: by-job, by-profile,               │
│          by-status, by-created              │
├─────────────────────────────────────────────┤
│ settings (UserSettings)                     │
│ Key: id (string)                            │
│ No indexes                                  │
└─────────────────────────────────────────────┘
```

## MasterProfile (Chrome Storage)

The MasterProfile is the core data structure — an AI-enriched representation of the user's resume.

```
MasterProfile
├── id, createdAt, updatedAt
├── sourceDocument
│   ├── fileName, fileType (pdf|docx|txt)
│   ├── uploadedAt, rawText, checksum
│
├── personal (ExtendedPersonalInfo)
│   ├── fullName, firstName, lastName
│   ├── email, phone
│   ├── location { city, state, country, zipCode }
│   └── linkedInUrl, portfolioUrl, githubUrl
│
├── careerContext (AI-generated understanding)
│   ├── summary (AI-written career summary)
│   ├── careerTrajectory: ascending|pivoting|stable|returning
│   ├── yearsOfExperience
│   ├── seniorityLevel: entry|mid|senior|lead|principal|executive
│   ├── primaryDomain, secondaryDomains[]
│   ├── bestFitRoles[]: { title, fitScore, reasons[] }
│   ├── strengthAreas[], growthAreas[]
│   ├── topAccomplishments[]
│   └── uniqueValueProps[]
│
├── experience[] (EnrichedExperience)
│   ├── company, companyContext, title
│   ├── startDate, endDate, durationMonths
│   ├── achievements[], responsibilities[]
│   ├── technologiesUsed[]: { skill, proficiency, yearsUsed }
│   └── relevanceMap: { "backend": 90, "frontend": 60 }
│
├── skills (SkillsWithContext)
│   ├── technical[]: { name, yearsOfExperience, proficiency, lastUsed }
│   ├── tools[], frameworks[], programmingLanguages[]
│   ├── soft[]: { name, evidence[] }
│   └── clusters[]: grouped skill areas
│
├── education[] (EnrichedEducation)
│   ├── institution, degree, field
│   ├── gpa, honors[], relevantCoursework[]
│   └── relevanceMap
│
├── projects[] (EnrichedProject)
│   ├── name, description, role
│   ├── technologies[], highlights[], impact
│   └── relevanceMap
│
├── certifications[]
│   ├── name, issuer, dateObtained
│   └── credentialUrl, isValid
│
├── answerBank
│   ├── commonQuestions[]: { questionType, question, answer }
│   ├── patterns[]: { type, patterns[], keywords[] }
│   └── customAnswers: Record<string, string>
│
├── autofillData (ExtendedAutofillData)
│   ├── Work auth, visa, sponsorship
│   ├── Availability, notice period
│   ├── Address, relocation preferences
│   ├── Salary expectations
│   └── Demographics, consents
│
└── generatedProfiles[] (role-specific variants)
    ├── targetRole, targetIndustries[]
    ├── tailoredSummary
    ├── highlightedSkills[]
    ├── selectedExperiences[], selectedProjects[]
    ├── atsKeywords[], atsScore
    └── applicationsUsed, lastUsed
```

## Common Question Types

Used in the answer bank for autofill:

```
why_interested | greatest_strength | greatest_weakness
leadership_example | conflict_resolution | challenge_overcome
failure_learned | teamwork_example | why_leaving
salary_expectations | career_goals | technical_achievement
work_style | handle_pressure | diversity_contribution
```
