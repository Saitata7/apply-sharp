/**
 * Agent tool registry.
 *
 * Each tool wraps an existing background message into a shape the
 * Anthropic Messages API can call. v1 is read-only — write tools come
 * next iteration once the loop is proven.
 *
 * Both the in-extension Assistant panel and any future external surface
 * (MCP server, CLI) call into this same registry so behavior is identical.
 */

import { sendMessage } from '@shared/utils/messaging';
import { loadHnHiring, loadSponsorsIndex, normalizeCompanyName } from './data-bundle';

export interface AgentTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

async function call<TPayload, TResult>(type: string, payload?: TPayload): Promise<TResult> {
  const res = await sendMessage<TPayload, TResult>({ type, payload } as never);
  if (!res?.success) throw new Error(res?.error ?? `${type} failed`);
  return res.data as TResult;
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'get_master_profile',
    description:
      "Returns the user's active master profile (the verified trunk of truth: experience, skills, education, summary, contact info). Call this first when the user asks anything about themselves.",
    input_schema: { type: 'object', properties: {} },
    handler: async () => call('GET_ACTIVE_MASTER_PROFILE'),
  },
  {
    name: 'list_role_profiles',
    description:
      "Returns the user's role profiles (branches of the master profile, each tailored for a specific target role like 'Senior Backend Engineer' or 'GenAI Engineer'). Each entry has id, targetRole, tailoredSummary, roleStrength.",
    input_schema: { type: 'object', properties: {} },
    handler: async () => {
      const profile = await call<undefined, { id: string } | null>('GET_ACTIVE_MASTER_PROFILE');
      if (!profile?.id) return [];
      return call('GET_ROLE_PROFILES', { masterProfileId: profile.id });
    },
  },
  {
    name: 'list_recent_applications',
    description:
      'Returns recent job applications (most recent first) with status, company, role, applied date. Use this to give the user context about their pipeline.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max applications to return. Default 20.',
        },
      },
    },
    handler: async (input) => {
      const apps = (await call<undefined, unknown[]>('GET_APPLICATIONS')) ?? [];
      const limit = typeof input.limit === 'number' ? input.limit : 20;
      return apps.slice(0, limit);
    },
  },
  {
    name: 'list_recent_jobs',
    description:
      'Returns recent job postings the user has saved or seen, most recent first. Use this when the user asks about leads, the queue, or what they should apply to next.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max jobs to return. Default 20.',
        },
      },
    },
    handler: async (input) => {
      const limit = typeof input.limit === 'number' ? input.limit : 20;
      return call('GET_RECENT_JOBS', limit);
    },
  },
  {
    name: 'get_settings',
    description:
      'Returns the user settings (AI provider/model in use, etc.). Useful for diagnostic questions like "which model am I using" or "is my OpenAI key set."',
    input_schema: { type: 'object', properties: {} },
    handler: async () => call('GET_SETTINGS'),
  },

  // ── Write tools ────────────────────────────────────────────────────────

  {
    name: 'create_master_profile_from_text',
    description:
      'Create a fresh master profile from resume-style text. The backend AI parses the text and extracts structured experience, skills, education, certifications, and career context. Use this when the user has NO master profile yet and asks you to bootstrap one. Pass the most complete resume-style text you have. If the user only gives you their work history conversationally, draft a clean resume-shaped text first (header, summary, experience entries with dates and 2-4 bullets each, education, skills) and pass that.',
    input_schema: {
      type: 'object',
      properties: {
        resumeText: {
          type: 'string',
          description:
            'Full resume-style text. Include: name + contact at the top, professional summary, work experience entries (each with company, title, dates, 2-4 achievement bullets), education, and a skills section.',
        },
        fullName: { type: 'string', description: 'Full name (e.g. "Sai Tata").' },
        email: { type: 'string' },
        phone: { type: 'string' },
        linkedIn: { type: 'string' },
        github: { type: 'string' },
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'Top technical skills as a flat string array.',
        },
      },
      required: ['resumeText'],
    },
    handler: async (input) => {
      const result = (await call('ANALYZE_RESUME', {
        fileName: 'assistant-bootstrap.txt',
        rawText: String(input.resumeText ?? ''),
        basicInfo: {
          name: input.fullName ? String(input.fullName) : undefined,
          email: input.email ? String(input.email) : undefined,
          phone: input.phone ? String(input.phone) : undefined,
          linkedIn: input.linkedIn ? String(input.linkedIn) : undefined,
          github: input.github ? String(input.github) : undefined,
          skills: Array.isArray(input.skills) ? (input.skills as unknown[]).map(String) : [],
        },
        confidence: 0.85,
      })) as {
        personal?: { fullName?: string };
        experience?: unknown[];
        skills?: { technical?: unknown[] };
      } | null;

      // Detect a degraded extraction. The backend swallows AI errors and
      // saves a near-empty profile with success:true. We catch it here so
      // the assistant can tell the user the truth.
      const expCount = result?.experience?.length ?? 0;
      const skillCount = result?.skills?.technical?.length ?? 0;
      const hasName = !!result?.personal?.fullName;
      if (!hasName && expCount === 0 && skillCount === 0) {
        throw new Error(
          'Profile creation appeared to succeed but the AI extraction returned an empty result. Likely cause: the AI provider rejected the structured-output schema for this model. Open the browser DevTools console (Options page) and look for [ContextEngine] errors. Try a different Anthropic model (Sonnet 4.6 has stronger tool-use compliance than Haiku 4.5).'
        );
      }
      return {
        savedFullName: result?.personal?.fullName ?? null,
        experienceEntries: expCount,
        technicalSkills: skillCount,
        note:
          expCount === 0
            ? 'Profile saved but no work experience was extracted — ask the user to verify in My Profile and add experience via update_master_profile.'
            : `Profile saved with ${expCount} experience entries and ${skillCount} technical skills.`,
      };
    },
  },

  {
    name: 'update_master_profile',
    description:
      "Apply a natural-language update to the user's active master profile. The user says what changed in plain English and the backend AI parses it into the right fields. Use this for: adding/editing experience, fixing dates, adding skills, adding achievements, adding certifications, adding projects, updating links. The change is APPLIED immediately — do NOT call this for hypothetical questions, only when the user explicitly asks to update something.",
    input_schema: {
      type: 'object',
      properties: {
        context: {
          type: 'string',
          description:
            "The natural-language description of the update, e.g. 'I worked at Acme from Jun 2023 to Dec 2024 as a backend engineer building LLM scheduling on Spring Boot' or 'Add Rust and WebAssembly to my skills' or 'Acme actually ended in November 2024, fix the date'.",
        },
      },
      required: ['context'],
    },
    handler: async (input) => {
      const profile = await call<undefined, { id: string } | null>('GET_ACTIVE_MASTER_PROFILE');
      if (!profile?.id) {
        throw new Error(
          'No active master profile. Ask the user to create one in Create Profile first.'
        );
      }
      return call('APPLY_PROFILE_UPDATE', {
        profileId: profile.id,
        context: String(input.context ?? ''),
      });
    },
  },

  {
    name: 'generate_role_profile',
    description:
      "Generate a role profile (a branch of the master profile tailored for a specific target role). Use this when the user asks for a 'Senior Backend' version, a 'GenAI Engineer' version, etc. The role profile reorders skills, rewrites the summary, and emphasizes relevant bullets without modifying the master profile.",
    input_schema: {
      type: 'object',
      properties: {
        targetRole: {
          type: 'string',
          description:
            "The target role to optimize for, e.g. 'Senior Backend Engineer', 'GenAI Engineer', 'Full-Stack Engineer'.",
        },
      },
      required: ['targetRole'],
    },
    handler: async (input) => {
      const profile = await call<undefined, { id: string } | null>('GET_ACTIVE_MASTER_PROFILE');
      if (!profile?.id) {
        throw new Error('No active master profile. Create one first.');
      }
      return call('GENERATE_ROLE_PROFILE', {
        masterProfileId: profile.id,
        targetRole: String(input.targetRole ?? ''),
      });
    },
  },

  {
    name: 'update_application_status',
    description:
      "Update the status of a tracked job application (e.g. 'applied' → 'interviewing' → 'offer' or 'rejected'). Use this when the user reports an outcome ('I got an interview at Baseten', 'Brico rejected me', etc.).",
    input_schema: {
      type: 'object',
      properties: {
        applicationId: {
          type: 'string',
          description: 'The application id (look it up via list_recent_applications first).',
        },
        status: {
          type: 'string',
          description:
            "New status. Common values: 'applied', 'screening', 'interviewing', 'offer', 'rejected', 'ghosted', 'withdrawn'.",
        },
      },
      required: ['applicationId', 'status'],
    },
    handler: async (input) =>
      call('UPDATE_APPLICATION_STATUS', {
        id: String(input.applicationId ?? ''),
        status: String(input.status ?? ''),
      }),
  },

  // ── ATS / scoring / generation (replaces dedicated pages) ──────────────

  {
    name: 'score_jd',
    description:
      "Score a job description against the user's profile. Returns ATS fit score, matched/missing skills, and improvement suggestions. Use when the user asks 'should I apply to this' or 'how good is my fit for this JD' and pastes a description. Auto-uses the user's active role profile if they have one, otherwise falls back to a profile-shaped object.",
    input_schema: {
      type: 'object',
      properties: {
        jobDescription: {
          type: 'string',
          description: 'The full job description text to score against.',
        },
        targetRoleId: {
          type: 'string',
          description:
            'Optional role profile id to score against. If omitted, the first available role profile is used.',
        },
      },
      required: ['jobDescription'],
    },
    handler: async (input) => {
      const profile = await call<undefined, { id: string } | null>('GET_ACTIVE_MASTER_PROFILE');
      if (!profile?.id) {
        throw new Error('No active master profile. Bootstrap one first.');
      }
      const roleProfiles =
        (await call<
          { masterProfileId: string },
          Array<{
            id: string;
            targetRole?: string;
            skillEmphasis?: string[];
            atsKeywords?: string[];
          }>
        >('GET_ROLE_PROFILES', { masterProfileId: profile.id })) ?? [];

      const wantedId = input.targetRoleId ? String(input.targetRoleId) : undefined;
      const role = (wantedId && roleProfiles.find((r) => r.id === wantedId)) || roleProfiles[0];

      if (!role) {
        throw new Error(
          'No role profile to score against. Ask the user to generate one first via generate_role_profile (e.g. for "Senior Backend Engineer").'
        );
      }

      return call('SCORE_JOB', {
        jobDescription: String(input.jobDescription ?? ''),
        roleProfile: {
          id: role.id,
          targetRole: role.targetRole,
          highlightedSkills: role.skillEmphasis ?? [],
          atsKeywords: role.atsKeywords ?? [],
        },
      });
    },
  },

  {
    name: 'generate_cover_letter',
    description:
      'Generate a tailored cover letter for a specific job. Returns body text the user can paste and send. Keep tone honest — backend uses problem-solution structure (under 1 page).',
    input_schema: {
      type: 'object',
      properties: {
        jobDescription: { type: 'string', description: 'The job description text.' },
        companyName: { type: 'string', description: "Company name (e.g. 'Baseten')." },
        jobTitle: { type: 'string', description: "Job title (e.g. 'Senior ML Engineer')." },
        tone: {
          type: 'string',
          description: "'professional' (default), 'conversational', or 'formal'.",
        },
      },
      required: ['jobDescription', 'companyName', 'jobTitle'],
    },
    handler: async (input) =>
      call('GENERATE_COVER_LETTER', {
        jobDescription: String(input.jobDescription ?? ''),
        companyName: String(input.companyName ?? ''),
        jobTitle: String(input.jobTitle ?? ''),
        tone: (input.tone as 'professional' | 'conversational' | 'formal') ?? 'professional',
      }),
  },

  {
    name: 'generate_outreach',
    description:
      'Generate a tailored cold email or LinkedIn DM via the AI outreach pipeline. Includes light recruiter/company research. Use this when the user wants to draft outreach to a specific person at a specific company. For canned high-frequency replies, use the Quick Replies page (different purpose).',
    input_schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description: "'cold_email' or 'linkedin_dm'.",
        },
        intent: {
          type: 'string',
          description:
            "What the user is trying to accomplish, e.g. 'Exploring senior backend roles at small AI startups, saw their Series B'.",
        },
        companyName: { type: 'string', description: 'Company name (required).' },
        recipientName: { type: 'string', description: 'Recipient name (first preferred).' },
        recipientTitle: { type: 'string', description: 'Recipient role title.' },
        targetRole: { type: 'string', description: 'Role the user is interested in.' },
      },
      required: ['kind', 'intent', 'companyName'],
    },
    handler: async (input) =>
      call('GENERATE_OUTREACH', {
        kind: input.kind === 'linkedin_dm' ? 'linkedin_dm' : 'cold_email',
        context: {
          intent: String(input.intent ?? ''),
          companyName: String(input.companyName ?? ''),
          recipientName: input.recipientName ? String(input.recipientName) : undefined,
          recipientTitle: input.recipientTitle ? String(input.recipientTitle) : undefined,
          targetRole: input.targetRole ? String(input.targetRole) : undefined,
        },
      }),
  },

  {
    name: 'interview_prep',
    description:
      'Generate likely interview questions and prep notes for a specific job. Use when the user asks "what should I prep for this interview" or shares a JD they have an upcoming interview for.',
    input_schema: {
      type: 'object',
      properties: {
        jobDescription: { type: 'string', description: 'The job description text.' },
        companyName: { type: 'string' },
        jobTitle: { type: 'string' },
      },
      required: ['jobDescription', 'companyName', 'jobTitle'],
    },
    handler: async (input) =>
      call('GENERATE_INTERVIEW_PREP', {
        jobDescription: String(input.jobDescription ?? ''),
        companyName: String(input.companyName ?? ''),
        jobTitle: String(input.jobTitle ?? ''),
      }),
  },

  // ── Bundled scraped data (Sai's pre-vetted job-hunt intel) ─────────────

  {
    name: 'search_hn_jobs',
    description:
      "Search the bundled HackerNews 'Who is Hiring' scrape (Sai's curated, stack-scored, visa-flagged target list). Returns matching company posts ranked by stackScore. Use when the user asks 'what should I apply to', 'show me visa-friendly companies', 'who's hiring with my stack', etc.",
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Optional substring filter on company name, location, matched-keywords, or excerpt.',
        },
        visaFriendlyOnly: {
          type: 'boolean',
          description:
            "If true, only return posts flagged 'friendly' (explicitly mention sponsorship). Default true given Sai needs sponsorship.",
        },
        minStackScore: {
          type: 'number',
          description:
            "Optional minimum stack score (default 5). Higher = better stack match against Sai's tuned tier-1/tier-2 keywords.",
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default 15).',
        },
      },
    },
    handler: async (input) => {
      const bundle = await loadHnHiring();
      if (!bundle) {
        throw new Error(
          "HN hiring data isn't bundled yet. Run `node tools/job-search/hn-hiring.mjs` to scrape, then convert the CSV to public/data/hn-hiring.json (or rebuild the extension)."
        );
      }
      const query = input.query ? String(input.query).toLowerCase().trim() : '';
      const visaFriendlyOnly =
        input.visaFriendlyOnly === undefined ? true : Boolean(input.visaFriendlyOnly);
      const minStackScore = typeof input.minStackScore === 'number' ? input.minStackScore : 5;
      const limit = typeof input.limit === 'number' ? input.limit : 15;

      let hits = bundle.records;
      if (visaFriendlyOnly) hits = hits.filter((r) => r.visa === 'friendly');
      if (minStackScore > 0) hits = hits.filter((r) => (r.stackScore ?? 0) >= minStackScore);
      if (query) {
        hits = hits.filter((r) => {
          const blob = `${r.company} ${r.location} ${r.matched} ${r.excerpt}`.toLowerCase();
          return blob.includes(query);
        });
      }

      hits.sort((a, b) => (b.stackScore ?? 0) - (a.stackScore ?? 0));

      return {
        scrapedAt: bundle.scrapedAt,
        totalInBundle: bundle.totalRecords,
        matchCount: hits.length,
        results: hits.slice(0, limit).map((r) => ({
          company: r.company,
          location: r.location,
          visa: r.visa,
          stackScore: r.stackScore,
          monthsActive: r.monthsActive,
          matchedKeywords: r.matched,
          hnLink: r.hnLink,
          excerpt: r.excerpt.slice(0, 220),
        })),
      };
    },
  },

  {
    name: 'lookup_h1b_sponsor',
    description:
      "Look up a company in the bundled DOL H-1B LCA disclosure index. Returns filing count, certified/denied breakdown, average wage, top job titles, top locations. Use when the user asks 'does Acme sponsor H1B', 'is this company a real sponsor', 'what's their H1B history'. Returns null gracefully if the sponsors index isn't bundled yet (Sai needs to run dol-process.py first).",
    input_schema: {
      type: 'object',
      properties: {
        companyName: {
          type: 'string',
          description: "Company name to look up (e.g. 'Stripe', 'Bank of America').",
        },
      },
      required: ['companyName'],
    },
    handler: async (input) => {
      const index = await loadSponsorsIndex();
      if (!index) {
        return {
          available: false,
          note: 'Sponsors index not bundled. Run `python3 tools/job-search/dol-process.py --input tools/job-search/data/LCA_FY*.xlsx`, then copy the produced sponsors-index.json into public/data/ and rebuild the extension.',
        };
      }
      const raw = String(input.companyName ?? '').trim();
      if (!raw) throw new Error('companyName is required');

      const key = normalizeCompanyName(raw);
      const exact = index[key];
      if (exact) {
        return { available: true, query: raw, match: 'exact', record: exact };
      }
      // Substring fallback — top 5 by filings.
      const matches = Object.entries(index)
        .filter(([k, v]) => k.includes(key) || normalizeCompanyName(v.displayName).includes(key))
        .sort(([, a], [, b]) => (b.filings ?? 0) - (a.filings ?? 0))
        .slice(0, 5)
        .map(([, v]) => v);
      return {
        available: true,
        query: raw,
        match: matches.length > 0 ? 'substring' : 'none',
        candidates: matches,
      };
    },
  },
];

export async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const tool = AGENT_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(input);
}

export function toAnthropicTools(): Array<{
  name: string;
  description: string;
  input_schema: AgentTool['input_schema'];
}> {
  return AGENT_TOOLS.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}
