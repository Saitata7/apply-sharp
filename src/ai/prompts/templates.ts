/**
 * AI Prompt Templates — System + User Message Separation
 *
 * Modern approach: Each prompt is split into:
 *   - System message: persona + rules + learning context (cacheable by Anthropic)
 *   - User message: data only (job description, profile, etc.)
 *
 * This enables:
 *   1. Anthropic prompt caching (system messages cached for 5 min)
 *   2. Learning context injection into system messages
 *   3. Consistent rule enforcement via system-rules.ts
 *   4. Clearer separation of instructions vs data
 */

import type { ChatMessage } from '@shared/types/ai.types';
import { sanitizePromptInput } from '@shared/utils/prompt-safety';
import {
  buildSystemPrompt,
  PERSONAS,
  CORE_RULES,
  PROFILE_BUILDING_RULES,
  RESUME_GENERATION_RULES,
  COVER_LETTER_RULES,
} from './system-rules';

// ─── Message Builder Types ──────────────────────────────────────────────────

export interface PromptMessages {
  messages: ChatMessage[];
}

// ─── Job Scoring ────────────────────────────────────────────────────────────

export function buildJobScoringMessages(
  jobDescription: string,
  candidateName: string,
  candidateSummary: string,
  skills: string,
  experience: string,
  learningContext?: string
): PromptMessages {
  const systemContent = buildSystemPrompt(PERSONAS.HIRING_MANAGER, [CORE_RULES], learningContext);

  const userContent = `## Job Description
<job_description>
${sanitizePromptInput(jobDescription, 'job_description')}
</job_description>

## Candidate Profile
Name: ${sanitizePromptInput(candidateName, 'candidate_name')}
Summary: ${sanitizePromptInput(candidateSummary, 'candidate_summary')}
Skills: ${sanitizePromptInput(skills, 'skills')}
Experience: ${sanitizePromptInput(experience, 'experience')}

## Task
Analyze the fit between this job and candidate. Provide:

1. **Overall Score** (0-100): How well does this candidate match the job?
2. **Skill Match Score** (0-100): How well do the candidate's skills align?
3. **Experience Match Score** (0-100): How relevant is their experience?
4. **Education Match Score** (0-100): How relevant is their education?
5. **Culture Fit Score** (0-100): Based on job description language
6. **Matched Skills**: List skills the candidate has that the job requires
7. **Missing Skills**: List required skills the candidate lacks
8. **Strengths**: Why this candidate would be good for this role
9. **Gaps**: Areas where the candidate may fall short
10. **Suggestions**: How to improve the application

Respond ONLY with valid JSON in this exact format:
{
  "overallScore": number,
  "skillMatch": number,
  "experienceMatch": number,
  "educationMatch": number,
  "cultureFit": number,
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "strengths": ["strength1", "strength2"],
  "gaps": ["gap1", "gap2"],
  "suggestions": ["suggestion1", "suggestion2"],
  "reasoning": "Brief explanation of the overall score"
}`;

  return {
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
  };
}

// ─── Cover Letter ───────────────────────────────────────────────────────────

export function buildCoverLetterMessages(
  company: string,
  title: string,
  jobDescription: string,
  candidateProfile: string,
  learningContext?: string
): PromptMessages {
  const systemContent = buildSystemPrompt(
    PERSONAS.CAREER_ADVISOR,
    [CORE_RULES, COVER_LETTER_RULES],
    learningContext
  );

  const userContent = `## Job Details
Company: ${sanitizePromptInput(company, 'company')}
Position: ${sanitizePromptInput(title, 'job_title')}
<job_description>
${sanitizePromptInput(jobDescription, 'job_description')}
</job_description>

## Candidate Profile
<candidate_profile>
${sanitizePromptInput(candidateProfile, 'candidate_profile')}
</candidate_profile>

## Task
Write a professional cover letter that:
1. Opens with genuine enthusiasm for the specific role (NOT "I am writing to express my interest...")
2. Highlights 2-3 most relevant experiences/achievements with specific examples
3. Addresses key requirements from the job description
4. Shows understanding of the company/role
5. Closes with a confident call to action

Rules:
- Keep it concise: 3-4 paragraphs, ~250-300 words
- Be specific to THIS role and company
- Use active voice and strong verbs
- Avoid generic phrases and clichés
- Do NOT include a header, date, or address - just the letter body
- Do NOT use "Dear Hiring Manager" - start directly with the opening paragraph

Return ONLY the cover letter text, nothing else.`;

  return {
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
  };
}

// ─── Skill Extraction ───────────────────────────────────────────────────────

export function buildSkillExtractionMessages(jobDescription: string): PromptMessages {
  const systemContent = buildSystemPrompt(PERSONAS.ATS_ANALYST, [CORE_RULES]);

  const userContent = `Extract skills and requirements from this job description.

<job_description>
${sanitizePromptInput(jobDescription, 'job_description')}
</job_description>

## Task
Extract and categorize:
1. Technical skills required
2. Soft skills mentioned
3. Years of experience requirements
4. Education requirements
5. Nice-to-have qualifications

Respond ONLY with valid JSON:
{
  "technicalSkills": ["skill1", "skill2"],
  "softSkills": ["skill1", "skill2"],
  "experienceRequirements": ["3+ years Python", "5+ years backend"],
  "educationRequirements": ["BS in Computer Science"],
  "niceToHave": ["requirement1", "requirement2"]
}`;

  return {
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
  };
}

// ─── Answer Generation ──────────────────────────────────────────────────────

export function buildAnswerGenerationMessages(
  question: string,
  candidateProfile: string,
  title: string,
  company: string,
  jobDescription: string,
  learningContext?: string
): PromptMessages {
  const systemContent = buildSystemPrompt(PERSONAS.CAREER_ADVISOR, [CORE_RULES], learningContext);

  const userContent = `## Question
<question>
${sanitizePromptInput(question, 'question')}
</question>

## Candidate Profile
<candidate_profile>
${sanitizePromptInput(candidateProfile, 'candidate_profile')}
</candidate_profile>

## Job Context
Position: ${sanitizePromptInput(title, 'job_title')} at ${sanitizePromptInput(company, 'company')}
<job_description>
${sanitizePromptInput(jobDescription, 'job_description')}
</job_description>

## Task
Write a concise, compelling answer that:
1. Directly addresses the question
2. Uses specific examples from the candidate's background
3. Connects to the job requirements when relevant
4. Is honest and authentic
5. Stays under 200 words unless the question requires more detail

Return ONLY the answer text.`;

  return {
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
  };
}

// ─── Resume Parsing ─────────────────────────────────────────────────────────

export function buildResumeParseMessages(resumeText: string): PromptMessages {
  const systemContent = buildSystemPrompt(
    `You are an expert resume parser. Extract structured information accurately and thoroughly. Preserve original wording for achievements. Standardize dates to YYYY-MM format when possible.`,
    [CORE_RULES]
  );

  const userContent = `<resume_text>
${sanitizePromptInput(resumeText, 'resume_text')}
</resume_text>

## Task
Extract ALL information into this exact JSON structure. Be thorough - extract every detail you can find.

{
  "personal": {
    "fullName": "string",
    "firstName": "string",
    "lastName": "string",
    "email": "string or null",
    "phone": "string or null",
    "location": {
      "city": "string or null",
      "state": "string or null",
      "country": "string or null",
      "formatted": "full location string"
    },
    "linkedInUrl": "string or null",
    "githubUrl": "string or null",
    "portfolioUrl": "string or null"
  },
  "experience": [
    {
      "company": "string",
      "title": "string",
      "location": "string or null",
      "startDate": "YYYY-MM or YYYY",
      "endDate": "YYYY-MM or Present",
      "isCurrent": boolean,
      "description": "role description",
      "achievements": ["bullet point 1", "bullet point 2"],
      "technologies": ["tech1", "tech2"]
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string (e.g., Bachelor of Science)",
      "field": "string (e.g., Computer Science)",
      "startDate": "YYYY",
      "endDate": "YYYY",
      "gpa": number or null,
      "honors": ["honor1"] or null
    }
  ],
  "skills": {
    "technical": ["skill1", "skill2"],
    "tools": ["tool1", "tool2"],
    "frameworks": ["framework1"],
    "languages": ["Python", "JavaScript"]
  },
  "certifications": [
    {
      "name": "string",
      "issuer": "string",
      "date": "string or null"
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "technologies": ["tech1"],
      "url": "string or null"
    }
  ]
}

Rules:
- Return ONLY valid JSON, no explanations or markdown
- Use null for missing fields, not empty strings
- Preserve original wording for achievements
- Standardize dates to YYYY-MM format when possible
- Extract ALL skills mentioned anywhere in the resume`;

  return {
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
  };
}

// ─── Career Context ─────────────────────────────────────────────────────────

export function buildCareerContextMessages(parsedData: string): PromptMessages {
  const systemContent = buildSystemPrompt(PERSONAS.CAREER_ADVISOR, [
    CORE_RULES,
    PROFILE_BUILDING_RULES,
  ]);

  const userContent = `<parsed_resume>
${sanitizePromptInput(parsedData, 'parsed_resume')}
</parsed_resume>

## Task
Analyze this candidate's career and create a comprehensive career context. Think like a recruiter understanding WHO this person really is.

{
  "summary": "2-3 sentence professional summary written in first person, highlighting key strengths and experience",
  "careerTrajectory": "ascending" | "pivoting" | "stable" | "returning",
  "yearsOfExperience": number,
  "seniorityLevel": "entry" | "mid" | "senior" | "lead" | "principal" | "executive",
  "primaryDomain": "string (e.g., Backend Engineering, Data Science)",
  "secondaryDomains": ["domain1", "domain2"],
  "industryExperience": ["industry1", "industry2"],
  "bestFitRoles": [
    {
      "title": "role title",
      "fitScore": 0-100,
      "reasons": ["reason1", "reason2"],
      "yearsRelevantExp": number
    }
  ],
  "strengthAreas": ["top 5 strengths"],
  "growthAreas": ["honest areas for improvement"],
  "writingStyle": {
    "tone": "professional" | "conversational" | "technical",
    "complexity": "simple" | "moderate" | "complex",
    "preferredVoice": "first-person"
  },
  "topAccomplishments": [
    {
      "statement": "accomplishment statement",
      "impact": "quantified impact",
      "skills": ["demonstrated skills"],
      "relevantFor": ["role types"]
    }
  ],
  "uniqueValueProps": ["what makes this candidate unique"]
}

Rules:
- Be honest and realistic in assessments
- Focus on ACTUAL achievements, not potential
- Write the summary in first person as if the candidate wrote it
- Base bestFitRoles on actual experience, not aspirations
- Identify genuine strengths from accomplishments
- Growth areas should be constructive, not negative
- Return ONLY valid JSON, no explanations or markdown`;

  return {
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
  };
}

// ─── Skills Enrichment ──────────────────────────────────────────────────────

export function buildSkillsEnrichmentMessages(parsedData: string): PromptMessages {
  const systemContent = buildSystemPrompt(PERSONAS.ATS_ANALYST, [CORE_RULES]);

  const userContent = `Analyze and enrich the skill profile for this candidate.

<parsed_resume>
${sanitizePromptInput(parsedData, 'parsed_resume')}
</parsed_resume>

## Task
Create a comprehensive skills analysis with proficiency levels based on evidence.

{
  "technical": [
    {
      "name": "skill name",
      "normalizedName": "standardized name",
      "category": "frontend|backend|database|cloud|devops|ai|mobile|other",
      "yearsOfExperience": number,
      "proficiency": "basic|intermediate|advanced|expert",
      "lastUsed": "current|YYYY",
      "aliases": ["alternative names"]
    }
  ],
  "frameworks": [...same structure...],
  "tools": [...same structure...],
  "clusters": [
    {
      "name": "cluster name (e.g., Cloud Infrastructure)",
      "skills": ["skill1", "skill2"],
      "strength": 0-100,
      "relevantRoles": ["role types"]
    }
  ]
}

Rules:
- Proficiency is based on years used AND depth shown
- Expert = 5+ years with deep expertise shown
- Advanced = 3-5 years with solid experience
- Intermediate = 1-3 years
- Basic = mentioned but limited evidence
- Create skill clusters for related technologies
- Return ONLY valid JSON, no explanations or markdown`;

  return {
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
  };
}

// ─── Profile Generator ──────────────────────────────────────────────────────

export function buildProfileGeneratorMessages(
  masterProfile: string,
  targetRole: string,
  learningContext?: string
): PromptMessages {
  const systemContent = buildSystemPrompt(
    PERSONAS.RESUME_OPTIMIZER,
    [CORE_RULES, RESUME_GENERATION_RULES],
    learningContext
  );

  const userContent = `Generate a role-specific resume profile for this candidate.

<master_profile>
${sanitizePromptInput(masterProfile, 'master_profile')}
</master_profile>

## Target Role
${targetRole}

## Task
Create a tailored profile optimized for this specific role type.

{
  "name": "Profile name (e.g., Senior Backend Engineer - 5+ yrs Python)",
  "targetRole": "exact target role",
  "tailoredSummary": "2-3 sentence summary emphasizing relevant experience for THIS role",
  "highlightedSkills": ["top 8-10 most relevant skills for this role"],
  "relevantExperience": ["experience IDs to emphasize"],
  "atsKeywords": ["keywords to include for ATS matching"],
  "strengthsForRole": ["why this candidate is good for THIS role"],
  "positioningStrategy": "how to position this candidate for maximum impact"
}

Rules:
- Summary should feel natural, not keyword-stuffed
- Highlight skills that directly match the role
- Choose experiences that demonstrate relevant competencies
- ATS keywords should be naturally integrated
- Be specific to the role, not generic
- Return ONLY valid JSON, no explanations or markdown`;

  return {
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
  };
}

// ─── Humanize Content ───────────────────────────────────────────────────────

export function buildHumanizeContentMessages(
  content: string,
  tone: string,
  complexity: string,
  voice: string
): PromptMessages {
  const systemContent = buildSystemPrompt(
    `You are a writing coach who makes AI-generated content sound natural and human. You match the candidate's natural writing style and remove AI-typical phrases.`,
    [CORE_RULES]
  );

  const userContent = `Rewrite this content to sound natural and human, not AI-generated.

<original_content>
${sanitizePromptInput(content, 'original_content')}
</original_content>

## Candidate's Writing Style
Tone: ${tone}
Complexity: ${complexity}
Voice: ${voice}

## Task
Rewrite the content to:
1. Match the candidate's natural writing style
2. Remove AI-typical phrases ("I am excited to", "leverage my skills", "thrilled")
3. Use specific, concrete language
4. Vary sentence structure naturally
5. Include subtle imperfections that humans have
6. Sound confident but not boastful

Return ONLY the rewritten content.`;

  return {
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
  };
}

// ─── Answer Bank ────────────────────────────────────────────────────────────

export function buildAnswerBankMessages(
  candidateProfile: string,
  learningContext?: string
): PromptMessages {
  const systemContent = buildSystemPrompt(PERSONAS.CAREER_ADVISOR, [CORE_RULES], learningContext);

  const userContent = `Generate answers for common application questions based on this candidate's profile.

<candidate_profile>
${sanitizePromptInput(candidateProfile, 'candidate_profile')}
</candidate_profile>

## Task
Generate authentic, personalized answers for these common questions. Each answer should use specific examples from the candidate's background.

Generate answers for:
1. "Why are you interested in this position?" (generic version)
2. "What is your greatest professional strength?"
3. "Describe a challenging situation and how you handled it"
4. "Tell me about a time you demonstrated leadership"
5. "Why are you leaving your current role?" (or "Why did you leave your last role?")
6. "Where do you see yourself in 5 years?"
7. "What's your greatest professional achievement?"
8. "How do you handle working under pressure?"

{
  "why_interested": {
    "answer": "full answer",
    "shortAnswer": "50-word version for character-limited fields"
  },
  "greatest_strength": {...},
  "challenge_overcome": {...},
  "leadership_example": {...},
  "why_leaving": {...},
  "career_goals": {...},
  "technical_achievement": {...},
  "handle_pressure": {...}
}

Rules:
- Use specific examples from their experience
- Sound authentic, not rehearsed
- Keep answers concise but impactful
- Include quantifiable results where possible
- Avoid clichés and generic statements
- Return ONLY valid JSON, no explanations or markdown`;

  return {
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
  };
}

// ─── Legacy Exports (backward compatibility during migration) ────────────────
// These are the old string-template exports. They will be removed once all
// usage sites are migrated to the message builder functions above.

import { PROMPT_SAFETY_PREAMBLE } from '@shared/utils/prompt-safety';

export const JOB_SCORING_PROMPT = `${PROMPT_SAFETY_PREAMBLE}

You are an expert career advisor analyzing job fit. Given a job description and candidate profile, provide a detailed analysis.

## Job Description
<job_description>
{jobDescription}
</job_description>

## Candidate Profile
Name: {candidateName}
Summary: {candidateSummary}
Skills: {skills}
Experience: {experience}

## Task
Analyze the fit between this job and candidate. Provide:

1. **Overall Score** (0-100): How well does this candidate match the job?
2. **Skill Match Score** (0-100): How well do the candidate's skills align?
3. **Experience Match Score** (0-100): How relevant is their experience?
4. **Education Match Score** (0-100): How relevant is their education?
5. **Culture Fit Score** (0-100): Based on job description language
6. **Matched Skills**: List skills the candidate has that the job requires
7. **Missing Skills**: List required skills the candidate lacks
8. **Strengths**: Why this candidate would be good for this role
9. **Gaps**: Areas where the candidate may fall short
10. **Suggestions**: How to improve the application

Respond ONLY with valid JSON in this exact format:
{
  "overallScore": number,
  "skillMatch": number,
  "experienceMatch": number,
  "educationMatch": number,
  "cultureFit": number,
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "strengths": ["strength1", "strength2"],
  "gaps": ["gap1", "gap2"],
  "suggestions": ["suggestion1", "suggestion2"],
  "reasoning": "Brief explanation of the overall score"
}`;

export const COVER_LETTER_PROMPT = `${PROMPT_SAFETY_PREAMBLE}

You are an expert career coach writing a compelling cover letter.

## Job Details
Company: {company}
Position: {title}
<job_description>
{jobDescription}
</job_description>

## Candidate Profile
<candidate_profile>
{candidateProfile}
</candidate_profile>

## Instructions
Write a professional cover letter that:
1. Opens with genuine enthusiasm for the specific role (NOT "I am writing to express my interest...")
2. Highlights 2-3 most relevant experiences/achievements with specific examples
3. Addresses key requirements from the job description
4. Shows understanding of the company/role
5. Closes with a confident call to action

Rules:
- Keep it concise: 3-4 paragraphs, ~250-300 words
- Be specific to THIS role and company
- Use active voice and strong verbs
- Avoid generic phrases and clichés
- Do NOT include a header, date, or address - just the letter body
- Do NOT use "Dear Hiring Manager" - start directly with the opening paragraph

Return ONLY the cover letter text, nothing else.`;

export const SKILL_EXTRACTION_PROMPT = `${PROMPT_SAFETY_PREAMBLE}

Extract skills and requirements from this job description.

<job_description>
{jobDescription}
</job_description>

## Task
Extract and categorize:
1. Technical skills required
2. Soft skills mentioned
3. Years of experience requirements
4. Education requirements
5. Nice-to-have qualifications

Respond ONLY with valid JSON:
{
  "technicalSkills": ["skill1", "skill2"],
  "softSkills": ["skill1", "skill2"],
  "experienceRequirements": ["3+ years Python", "5+ years backend"],
  "educationRequirements": ["BS in Computer Science"],
  "niceToHave": ["requirement1", "requirement2"]
}`;

export const ANSWER_GENERATION_PROMPT = `${PROMPT_SAFETY_PREAMBLE}

You are helping a job applicant answer an application question.

## Question
<question>
{question}
</question>

## Candidate Profile
<candidate_profile>
{candidateProfile}
</candidate_profile>

## Job Context
Position: {title} at {company}
<job_description>
{jobDescription}
</job_description>

## Instructions
Write a concise, compelling answer that:
1. Directly addresses the question
2. Uses specific examples from the candidate's background
3. Connects to the job requirements when relevant
4. Is honest and authentic
5. Stays under 200 words unless the question requires more detail

Return ONLY the answer text.`;

export const RESUME_PARSE_PROMPT = `${PROMPT_SAFETY_PREAMBLE}

You are an expert resume parser. Extract structured information from this resume text.

<resume_text>
{resumeText}
</resume_text>

## Task
Extract ALL information into this exact JSON structure. Be thorough - extract every detail you can find.

{
  "personal": {
    "fullName": "string",
    "firstName": "string",
    "lastName": "string",
    "email": "string or null",
    "phone": "string or null",
    "location": {
      "city": "string or null",
      "state": "string or null",
      "country": "string or null",
      "formatted": "full location string"
    },
    "linkedInUrl": "string or null",
    "githubUrl": "string or null",
    "portfolioUrl": "string or null"
  },
  "experience": [
    {
      "company": "string",
      "title": "string",
      "location": "string or null",
      "startDate": "YYYY-MM or YYYY",
      "endDate": "YYYY-MM or Present",
      "isCurrent": boolean,
      "description": "role description",
      "achievements": ["bullet point 1", "bullet point 2"],
      "technologies": ["tech1", "tech2"]
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string (e.g., Bachelor of Science)",
      "field": "string (e.g., Computer Science)",
      "startDate": "YYYY",
      "endDate": "YYYY",
      "gpa": number or null,
      "honors": ["honor1"] or null
    }
  ],
  "skills": {
    "technical": ["skill1", "skill2"],
    "tools": ["tool1", "tool2"],
    "frameworks": ["framework1"],
    "languages": ["Python", "JavaScript"]
  },
  "certifications": [
    {
      "name": "string",
      "issuer": "string",
      "date": "string or null"
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "technologies": ["tech1"],
      "url": "string or null"
    }
  ]
}

Rules:
- Return ONLY valid JSON, no explanations or markdown
- Use null for missing fields, not empty strings
- Preserve original wording for achievements
- Standardize dates to YYYY-MM format when possible
- Extract ALL skills mentioned anywhere in the resume`;

export const CAREER_CONTEXT_PROMPT = `${PROMPT_SAFETY_PREAMBLE}

You are a senior career advisor building a deep understanding of a candidate's career profile.

<parsed_resume>
{parsedData}
</parsed_resume>

## Task
Analyze this candidate's career and create a comprehensive career context. Think like a recruiter understanding WHO this person really is.

{
  "summary": "2-3 sentence professional summary written in first person, highlighting key strengths and experience",
  "careerTrajectory": "ascending" | "pivoting" | "stable" | "returning",
  "yearsOfExperience": number,
  "seniorityLevel": "entry" | "mid" | "senior" | "lead" | "principal" | "executive",
  "primaryDomain": "string (e.g., Backend Engineering, Data Science)",
  "secondaryDomains": ["domain1", "domain2"],
  "industryExperience": ["industry1", "industry2"],
  "bestFitRoles": [
    {
      "title": "role title",
      "fitScore": 0-100,
      "reasons": ["reason1", "reason2"],
      "yearsRelevantExp": number
    }
  ],
  "strengthAreas": ["top 5 strengths"],
  "growthAreas": ["honest areas for improvement"],
  "writingStyle": {
    "tone": "professional" | "conversational" | "technical",
    "complexity": "simple" | "moderate" | "complex",
    "preferredVoice": "first-person"
  },
  "topAccomplishments": [
    {
      "statement": "accomplishment statement",
      "impact": "quantified impact",
      "skills": ["demonstrated skills"],
      "relevantFor": ["role types"]
    }
  ],
  "uniqueValueProps": ["what makes this candidate unique"]
}

Rules:
- Be honest and realistic in assessments
- Focus on ACTUAL achievements, not potential
- Write the summary in first person as if the candidate wrote it
- Base bestFitRoles on actual experience, not aspirations
- Identify genuine strengths from accomplishments
- Growth areas should be constructive, not negative
- Return ONLY valid JSON, no explanations or markdown`;

export const SKILLS_ENRICHMENT_PROMPT = `${PROMPT_SAFETY_PREAMBLE}

Analyze and enrich the skill profile for this candidate.

<parsed_resume>
{parsedData}
</parsed_resume>

## Task
Create a comprehensive skills analysis with proficiency levels based on evidence.

{
  "technical": [
    {
      "name": "skill name",
      "normalizedName": "standardized name",
      "category": "frontend|backend|database|cloud|devops|ai|mobile|other",
      "yearsOfExperience": number,
      "proficiency": "basic|intermediate|advanced|expert",
      "lastUsed": "current|YYYY",
      "aliases": ["alternative names"]
    }
  ],
  "frameworks": [...same structure...],
  "tools": [...same structure...],
  "clusters": [
    {
      "name": "cluster name (e.g., Cloud Infrastructure)",
      "skills": ["skill1", "skill2"],
      "strength": 0-100,
      "relevantRoles": ["role types"]
    }
  ]
}

Rules:
- Proficiency is based on years used AND depth shown
- Expert = 5+ years with deep expertise shown
- Advanced = 3-5 years with solid experience
- Intermediate = 1-3 years
- Basic = mentioned but limited evidence
- Create skill clusters for related technologies
- Return ONLY valid JSON, no explanations or markdown`;

export const PROFILE_GENERATOR_PROMPT = `${PROMPT_SAFETY_PREAMBLE}

Generate a role-specific resume profile for this candidate.

<master_profile>
{masterProfile}
</master_profile>

## Target Role
{targetRole}

## Task
Create a tailored profile optimized for this specific role type.

{
  "name": "Profile name (e.g., Senior Backend Engineer - 5+ yrs Python)",
  "targetRole": "exact target role",
  "tailoredSummary": "2-3 sentence summary emphasizing relevant experience for THIS role",
  "highlightedSkills": ["top 8-10 most relevant skills for this role"],
  "relevantExperience": ["experience IDs to emphasize"],
  "atsKeywords": ["keywords to include for ATS matching"],
  "strengthsForRole": ["why this candidate is good for THIS role"],
  "positioningStrategy": "how to position this candidate for maximum impact"
}

Rules:
- Summary should feel natural, not keyword-stuffed
- Highlight skills that directly match the role
- Choose experiences that demonstrate relevant competencies
- ATS keywords should be naturally integrated
- Be specific to the role, not generic
- Return ONLY valid JSON, no explanations or markdown`;

export const HUMANIZE_CONTENT_PROMPT = `${PROMPT_SAFETY_PREAMBLE}

Rewrite this content to sound natural and human, not AI-generated.

<original_content>
{content}
</original_content>

## Candidate's Writing Style
Tone: {tone}
Complexity: {complexity}
Voice: {voice}

## Task
Rewrite the content to:
1. Match the candidate's natural writing style
2. Remove AI-typical phrases ("I am excited to", "leverage my skills", "thrilled")
3. Use specific, concrete language
4. Vary sentence structure naturally
5. Include subtle imperfections that humans have
6. Sound confident but not boastful

Return ONLY the rewritten content.`;

export const ANSWER_BANK_PROMPT = `${PROMPT_SAFETY_PREAMBLE}

Generate answers for common application questions based on this candidate's profile.

<candidate_profile>
{candidateProfile}
</candidate_profile>

## Task
Generate authentic, personalized answers for these common questions. Each answer should use specific examples from the candidate's background.

Generate answers for:
1. "Why are you interested in this position?" (generic version)
2. "What is your greatest professional strength?"
3. "Describe a challenging situation and how you handled it"
4. "Tell me about a time you demonstrated leadership"
5. "Why are you leaving your current role?" (or "Why did you leave your last role?")
6. "Where do you see yourself in 5 years?"
7. "What's your greatest professional achievement?"
8. "How do you handle working under pressure?"

{
  "why_interested": {
    "answer": "full answer",
    "shortAnswer": "50-word version for character-limited fields"
  },
  "greatest_strength": {...},
  "challenge_overcome": {...},
  "leadership_example": {...},
  "why_leaving": {...},
  "career_goals": {...},
  "technical_achievement": {...},
  "handle_pressure": {...}
}

Rules:
- Use specific examples from their experience
- Sound authentic, not rehearsed
- Keep answers concise but impactful
- Include quantifiable results where possible
- Avoid clichés and generic statements
- Return ONLY valid JSON, no explanations or markdown`;
