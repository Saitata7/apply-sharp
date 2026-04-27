import type { MessageResponse } from '@shared/utils/messaging';
import { profileRepo, masterProfileRepo } from '@storage/index';
import { CareerContextEngine } from '@core/profile/context-engine';
import { analyzeClaim, validateAllClaims } from '@core/profile/claims-validator';
import { reviewProfileHealth } from '@core/profile/profile-reviewer';
import { getNextQuestion } from '@/ai/prompts/profile-interview';
import type { RoleProfile, MasterProfile } from '@shared/types/master-profile.types';
import type { ResumeProfile } from '@shared/types/profile.types';
import { buildSystemPrompt, PERSONAS, CORE_RULES } from '@/ai/prompts/system-rules';
import { getAIService } from '../message-handler';

// ============================================================================
// Profile Conversion Helper
// ============================================================================

/**
 * Convert MasterProfile to ResumeProfile format for autofill compatibility
 */
export function convertMasterToResumeProfile(master: MasterProfile): ResumeProfile {
  return {
    id: master.id,
    name: master.personal?.fullName || 'Profile',
    isDefault: true,
    createdAt: master.createdAt,
    updatedAt: master.updatedAt,

    personal: {
      fullName: master.personal?.fullName || '',
      email: master.personal?.email || '',
      phone: master.personal?.phone || '',
      location: master.personal?.location?.formatted || '',
      linkedInUrl: master.personal?.linkedInUrl,
      portfolioUrl: master.personal?.portfolioUrl,
      githubUrl: master.personal?.githubUrl,
    },

    summary: master.careerContext?.summary || '',

    skills: {
      technical: master.skills?.technical?.map((s) => s.name) || [],
      soft: master.skills?.soft?.map((s) => s.name) || [],
      tools: master.skills?.tools?.map((s) => s.name) || [],
      certifications: master.certifications?.map((c) => c.name) || [],
    },

    experience:
      master.experience?.map((exp) => ({
        id: exp.id,
        company: exp.company,
        title: exp.title,
        location: exp.location || '',
        startDate: exp.startDate,
        endDate: exp.endDate,
        isCurrent: exp.isCurrent,
        description: exp.description || '',
        achievements: exp.achievements?.map((a) => a.statement) || [],
        technologies: exp.technologiesUsed?.map((t) => t.skill) || [],
      })) || [],

    education:
      master.education?.map((edu) => ({
        id: edu.id,
        institution: edu.institution,
        degree: edu.degree,
        field: edu.field,
        startDate: edu.startDate || '',
        endDate: edu.endDate || '',
        gpa: edu.gpa,
        honors: edu.honors || [],
      })) || [],

    projects:
      master.projects?.map((proj) => ({
        id: proj.id,
        name: proj.name,
        description: proj.description || '',
        technologies: proj.technologies || [],
        url: proj.url,
        highlights: proj.highlights || [],
      })) || [],

    targetRoles: master.careerContext?.bestFitRoles?.map((r) => r.title) || [],

    autofillData: {
      workAuthorization: master.autofillData?.workAuthorization || 'other',
      visaType: master.autofillData?.visaType,
      requiresSponsorship: master.autofillData?.requiresSponsorship || false,
      availableStartDate: master.autofillData?.availableStartDate,
      noticePeriod: master.autofillData?.noticePeriod,
      willingToRelocate: master.autofillData?.willingToRelocate || false,
      relocationPreferences: master.autofillData?.relocationPreferences,
      remotePreference: master.autofillData?.remotePreference || 'flexible',
      workPreference:
        master.autofillData?.remotePreference === 'flexible'
          ? 'hybrid'
          : master.autofillData?.remotePreference,
      travelWillingness: master.autofillData?.travelWillingness,
      demographics: master.autofillData?.demographics,
      customAnswers: {},
    },

    rawResumeText: master.sourceDocument?.rawText,
  };
}

// ============================================================================
// Profile Handlers
// ============================================================================

export async function handleGetProfiles(): Promise<MessageResponse> {
  try {
    const profiles = await profileRepo.getAll();
    return { success: true, data: profiles };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleGetCurrentProfile(): Promise<MessageResponse> {
  try {
    // First, try to get the active MasterProfile and convert it
    const masterProfile = await masterProfileRepo.getActive();
    if (masterProfile) {
      // Convert MasterProfile to ResumeProfile format for autofill compatibility
      const resumeProfile = convertMasterToResumeProfile(masterProfile);
      return { success: true, data: resumeProfile };
    }

    // Fall back to old profile system
    const profile = await profileRepo.getDefault();
    return { success: true, data: profile };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleSetCurrentProfile(profileId: string): Promise<MessageResponse> {
  try {
    const profile = await profileRepo.setDefault(profileId);
    return { success: true, data: profile };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleCreateProfile(
  profileData: Parameters<typeof profileRepo.create>[0]
): Promise<MessageResponse> {
  try {
    const profile = await profileRepo.create(profileData);
    return { success: true, data: profile };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleUpdateProfile(payload: {
  id: string;
  updates: Parameters<typeof profileRepo.update>[1];
}): Promise<MessageResponse> {
  try {
    const profile = await profileRepo.update(payload.id, payload.updates);
    return { success: true, data: profile };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleDeleteProfile(profileId: string): Promise<MessageResponse> {
  try {
    const deleted = await profileRepo.delete(profileId);
    return { success: true, data: deleted };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleAnalyzeResume(payload: {
  fileName: string;
  rawText: string;
  basicInfo: {
    email?: string;
    phone?: string;
    linkedIn?: string;
    github?: string;
    name?: string;
    skills: string[];
  };
  confidence: number;
}): Promise<MessageResponse> {
  try {
    const ai = await getAIService();
    if (ai.error) return { success: false, error: ai.error };
    const aiService = ai.service!;

    // Run career context engine with raw text (static import)
    const engine = new CareerContextEngine(aiService);

    // Use the new method that accepts raw text
    const masterProfile = await engine.analyzeResumeText(
      payload.rawText,
      payload.basicInfo,
      payload.fileName
    );

    // Save the master profile
    console.debug('[MessageHandler] Saving master profile');
    await masterProfileRepo.save(masterProfile);
    console.debug('[MessageHandler] Master profile saved successfully');

    // SYNC: Also create/update a ResumeProfile for the Profile Manager
    // This ensures both systems stay in sync
    const existingProfiles = await profileRepo.getAll();
    const isFirstProfile = existingProfiles.length === 0;

    // Check if a ResumeProfile already exists for this master profile (re-upload case)
    const existingResumeProfile = existingProfiles.find(
      (p) =>
        p.rawResumeText === payload.rawText || p.name === (masterProfile.personal?.fullName || '')
    );

    // Build location string from MasterProfile location object
    const locationStr =
      masterProfile.personal?.location?.formatted ||
      [masterProfile.personal?.location?.city, masterProfile.personal?.location?.state]
        .filter(Boolean)
        .join(', ') ||
      '';

    const resumeProfile = {
      name: masterProfile.personal?.fullName || payload.fileName.replace(/\.[^/.]+$/, ''),
      isDefault: isFirstProfile,
      personal: {
        fullName: masterProfile.personal?.fullName || '',
        email: masterProfile.personal?.email || payload.basicInfo.email || '',
        phone: masterProfile.personal?.phone || payload.basicInfo.phone || '',
        location: locationStr,
        linkedInUrl: masterProfile.personal?.linkedInUrl || payload.basicInfo.linkedIn || '',
        githubUrl: masterProfile.personal?.githubUrl || payload.basicInfo.github || '',
        portfolioUrl: masterProfile.personal?.portfolioUrl || '',
      },
      summary: masterProfile.careerContext?.summary || '',
      skills: {
        technical:
          masterProfile.skills?.technical?.map((s: { name: string }) => s.name) ||
          payload.basicInfo.skills ||
          [],
        soft: masterProfile.skills?.soft?.map((s: { name: string }) => s.name) || [],
        tools: masterProfile.skills?.tools?.map((s: { name: string }) => s.name) || [],
        certifications: masterProfile.certifications?.map((c: { name: string }) => c.name) || [],
      },
      experience:
        masterProfile.experience?.map((exp) => ({
          id: exp.id || crypto.randomUUID(),
          company: exp.company || '',
          title: exp.title || '',
          location: exp.location || '',
          startDate: exp.startDate || '',
          endDate: exp.endDate,
          isCurrent: exp.isCurrent || false,
          description: exp.description || '',
          achievements: exp.achievements?.map((a) => a.statement) || [],
          technologies: exp.technologiesUsed?.map((t) => t.skill) || [],
        })) || [],
      education:
        masterProfile.education?.map((edu) => ({
          id: edu.id || crypto.randomUUID(),
          institution: edu.institution || '',
          degree: edu.degree || '',
          field: edu.field || '',
          startDate: edu.startDate || '',
          endDate: edu.endDate || '',
          gpa: edu.gpa,
          honors: edu.honors || [],
        })) || [],
      targetRoles: masterProfile.careerContext?.bestFitRoles?.map((r) => r.title) || [],
      autofillData: {
        workAuthorization: 'citizen' as const,
        requiresSponsorship: false,
        willingToRelocate: false,
        remotePreference: 'flexible' as const,
        customAnswers: {},
      },
      rawResumeText: payload.rawText,
      sourceFileName: payload.fileName,
      parseConfidence: payload.confidence,
    };

    if (existingResumeProfile) {
      await profileRepo.update(existingResumeProfile.id, resumeProfile);
      console.log('[ApplySharp] Updated existing ResumeProfile from MasterProfile');
    } else {
      await profileRepo.create(resumeProfile);
      console.log('[ApplySharp] Created synced ResumeProfile from MasterProfile');
    }

    return { success: true, data: masterProfile };
  } catch (error) {
    console.error('Resume analysis error:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function handleGetMasterProfiles(): Promise<MessageResponse> {
  try {
    const profiles = await masterProfileRepo.getAll();
    return { success: true, data: profiles };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleGetActiveMasterProfile(): Promise<MessageResponse> {
  try {
    console.log('[MessageHandler] Getting active master profile...');
    const profile = await masterProfileRepo.getActive();
    console.log('[MessageHandler] Active profile found:', profile?.personal?.fullName || 'None');
    console.log('[MessageHandler] Profile ID:', profile?.id || 'None');
    return { success: true, data: profile };
  } catch (error) {
    console.error('[MessageHandler] Error getting active profile:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function handleSetActiveMasterProfile(profileId: string): Promise<MessageResponse> {
  try {
    await masterProfileRepo.setActive(profileId);
    const profile = await masterProfileRepo.getById(profileId);
    return { success: true, data: profile };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleDeleteMasterProfile(profileId: string): Promise<MessageResponse> {
  try {
    const deleted = await masterProfileRepo.delete(profileId);
    if (deleted) {
      return { success: true, data: { deleted: true } };
    }
    return { success: false, error: 'Profile not found' };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleUpdateMasterProfile(payload: {
  id: string;
  updates: Partial<MasterProfile>;
}): Promise<MessageResponse> {
  try {
    const existingProfile = await masterProfileRepo.getById(payload.id);
    if (!existingProfile) {
      return { success: false, error: 'Profile not found' };
    }

    // Deep merge the updates with existing profile
    const updatedProfile = {
      ...existingProfile,
      ...payload.updates,
      personal: {
        ...existingProfile.personal,
        ...(payload.updates.personal || {}),
        location: {
          ...existingProfile.personal?.location,
          ...(payload.updates.personal?.location || {}),
        },
      },
      updatedAt: new Date(),
    };

    // Handle certifications array
    if (payload.updates.certifications !== undefined) {
      updatedProfile.certifications = payload.updates.certifications;
    }

    // Handle projects array
    if (payload.updates.projects !== undefined) {
      updatedProfile.projects = payload.updates.projects;
    }

    const saved = await masterProfileRepo.save(updatedProfile);
    return { success: true, data: saved };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// AI-powered profile update - analyze input and either ask questions, show error, or preview
export async function handleProcessProfileUpdate(payload: {
  profileId: string;
  context: string;
  updateType?: string;
}): Promise<MessageResponse> {
  try {
    const profile = await masterProfileRepo.getById(payload.profileId);
    if (!profile) {
      return { success: false, error: 'Profile not found' };
    }

    const ai = await getAIService();
    if (ai.error) return { success: false, error: ai.error };
    const aiService = ai.service!;

    // Define required fields and validation rules per update type
    const updateTypeRequirements: Record<string, { required: string[]; hint: string }> = {
      company: {
        required: ['company name', 'job title', 'start date', 'what you do'],
        hint: 'Please include: Company Name, Job Title, Start Date, and what you do (domain/tech/responsibilities)',
      },
      timeline: {
        required: ['company name', 'what to fix'],
        hint: 'Please specify: Company Name and what to fix (e.g., "PreviousCo ended Dec 2024" or "Remove duplicate CurrentCo entry")',
      },
      achievement: {
        required: ['which company/role', 'achievement description', 'impact'],
        hint: 'Please mention which company, what you achieved, and the impact (e.g., "At CurrentCo: Reduced API latency by 60%")',
      },
      skills: {
        required: ['skill or technology names'],
        hint: 'Please list the skills you want to add (e.g., "Rust, WebAssembly, gRPC")',
      },
      certification: {
        required: ['certification name', 'issuing organization'],
        hint: 'Please include: Certification Name and Issuing Organization (e.g., "AWS Solutions Architect Professional from Amazon")',
      },
      links: {
        required: ['type of link', 'URL'],
        hint: 'Please specify the link type and URL (e.g., "LinkedIn: linkedin.com/in/myname")',
      },
      project: {
        required: ['project name', 'description', 'technologies'],
        hint: 'Please include: Project Name, Description, and Technologies used',
      },
    };

    const updateType = payload.updateType || 'unknown';
    const requirements = updateTypeRequirements[updateType];

    // Get existing companies for context
    const existingCompanies =
      profile.experience?.map((e) => ({
        company: e.company,
        title: e.title || '(no title)',
        startDate: e.startDate || '(no date)',
        isCurrent: e.isCurrent,
        hasAchievements: (e.achievements?.length || 0) > 0,
      })) || [];

    const profileUpdateSystemPrompt = buildSystemPrompt(PERSONAS.CAREER_ADVISOR, [CORE_RULES]);
    const prompt = `Analyze this user's request for a "${updateType}" profile update.

EXISTING WORK EXPERIENCE (IMPORTANT - check if user is updating an existing entry):
${
  existingCompanies.length > 0
    ? existingCompanies
        .map(
          (c) =>
            `- ${c.company}: ${c.title}, ${c.startDate}${c.isCurrent ? ' (Current)' : ''}, ${c.hasAchievements ? 'has achievements' : 'NO achievements yet'}`
        )
        .join('\n')
    : '- No work experience entries yet'
}

Current Profile:
- Name: ${profile.personal?.fullName || 'Unknown'}
- Years of Experience: ${profile.careerContext?.yearsOfExperience || 0}
- Skills: ${
      profile.skills?.technical
        ?.slice(0, 10)
        .map((s) => s.name)
        .join(', ') || 'None'
    }

User's Input:
"${payload.context}"

${requirements ? `REQUIRED INFORMATION: ${requirements.required.join(', ')}` : ''}

IMPORTANT RULES:
1. If user mentions a company that ALREADY EXISTS in their profile, this is an UPDATE to that entry, not a new entry.
2. For "company" updates: If user provides role details (tech stack, domain, responsibilities), you should GENERATE 2-3 achievement bullet points based on that context.
3. Be helpful - if user says "Java, retail sector", generate relevant achievements like "Developed Java-based inventory management APIs" or "Built backend services for retail operations".

Respond with ONLY valid JSON:

If ANY required information is MISSING:
{
  "status": "error",
  "error": "Not enough information. ${requirements?.hint || 'Please provide all required details.'}"
}

If ALL required information is present:
{
  "status": "ready",
  "preview": "[Explain what will be updated. If updating existing company, say 'I'll UPDATE your [Company] entry with...'. If generating achievements, list them.]",
  "isUpdate": true/false,
  "existingCompany": "company name if updating existing"
}

`;

    const PROFILE_UPDATE_CHECK_SCHEMA = {
      type: 'object' as const,
      properties: {
        status: { type: 'string', description: 'Either "error" or "ready"' },
        error: { type: 'string', description: 'Error message when status is error' },
        preview: {
          type: 'string',
          description: 'Preview of what will be updated when status is ready',
        },
        isUpdate: { type: 'boolean', description: 'Whether this updates an existing entry' },
        existingCompany: { type: 'string', description: 'Company name if updating existing' },
      },
      required: ['status'],
    };

    try {
      const result = await aiService.chatStructured<{
        status: string;
        error?: string;
        preview?: string;
        isUpdate?: boolean;
        existingCompany?: string;
      }>(
        [
          { role: 'system', content: profileUpdateSystemPrompt },
          { role: 'user', content: prompt },
        ],
        PROFILE_UPDATE_CHECK_SCHEMA,
        'profile_update_check',
        {
          temperature: 0.3,
          maxTokens: 600,
          feature: 'profile_update_check',
        }
      );
      return { success: true, data: result };
    } catch (parseError) {
      console.debug('[MessageHandler] AI response parse failed:', (parseError as Error).message);
      return {
        success: true,
        data: {
          status: 'error',
          error: 'Could not process your request. Please try again with more details.',
        },
      };
    }
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// AI-powered profile update - actually apply the changes
export async function handleApplyProfileUpdate(payload: {
  profileId: string;
  context: string;
}): Promise<MessageResponse> {
  try {
    const profile = await masterProfileRepo.getById(payload.profileId);
    if (!profile) {
      return { success: false, error: 'Profile not found' };
    }

    const ai = await getAIService();
    if (ai.error) return { success: false, error: ai.error };
    const aiService = ai.service!;

    // Get existing companies for context
    const existingCompanies =
      profile.experience?.map((e, idx) => ({
        index: idx,
        company: e.company,
        title: e.title || '',
        startDate: e.startDate || '',
        isCurrent: e.isCurrent,
        achievementCount: e.achievements?.length || 0,
      })) || [];

    const prompt = `You are a profile update assistant. Parse the user's update request and return a JSON object with the changes to apply.

EXISTING WORK EXPERIENCE (check if user is updating one of these):
${
  existingCompanies.length > 0
    ? existingCompanies
        .map(
          (c) =>
            `[${c.index}] ${c.company}: ${c.title || '(no title)'}, ${c.startDate || '(no date)'}${c.isCurrent ? ' (Current)' : ''}, ${c.achievementCount} achievements`
        )
        .join('\n')
    : 'None'
}

Current Profile Summary:
- Skills: ${
      profile.skills?.technical
        ?.slice(0, 10)
        .map((s) => s.name)
        .join(', ') || 'None'
    }
- Certifications: ${profile.certifications?.map((c) => c.name).join(', ') || 'None'}
- Projects: ${profile.projects?.map((p) => p.name).join(', ') || 'None'}

User's Update Request:
"${payload.context}"

IMPORTANT RULES:
1. If user mentions a company that ALREADY EXISTS above, use "updateExistingExperience" to UPDATE that entry (match by company name, case-insensitive).
2. Only use "newExperience" if it's a truly NEW company not in the list above.
3. GENERATE 2-4 professional achievement bullet points based on context (tech stack, domain, responsibilities mentioned).
   - Make them specific and impactful
   - Include metrics/scale where reasonable (e.g., "for 500+ stores", "reduced by 40%")
   - Use strong action verbs (Built, Developed, Led, Optimized, Implemented)
4. Extract skills from the context and add to "newSkills".

Include ONLY the categories that need updating:

{
  "updateExistingExperience": {
    "companyName": "exact company name to match",
    "updates": {
      "title": "new or updated title",
      "startDate": "YYYY-MM or Month YYYY",
      "isCurrent": true/false,
      "description": "brief role description",
      "achievements": ["Generated achievement 1", "Generated achievement 2", "Generated achievement 3"]
    }
  },
  "setEndDate": {
    "companyName": "company to update",
    "endDate": "YYYY-MM or Month YYYY",
    "isCurrent": false
  },
  "removeDuplicate": {
    "companyName": "company with duplicates",
    "keepIndex": 0
  },
  "newExperience": {
    "company": "string (only if NEW company)",
    "title": "string",
    "location": "string or null",
    "startDate": "YYYY-MM or Month YYYY",
    "isCurrent": true/false,
    "description": "string or null",
    "achievements": ["Generated achievement 1", "Generated achievement 2"]
  },
  "addAchievementsToCompany": {
    "companyName": "which company",
    "achievements": ["new achievement 1", "new achievement 2"]
  },
  "newSkills": ["skill1", "skill2"],
  "newCertification": {
    "name": "string",
    "issuer": "string",
    "dateObtained": "string or null"
  },
  "newProject": {
    "name": "string",
    "description": "string",
    "technologies": ["tech1", "tech2"],
    "url": "string or null"
  },
  "personalUpdates": {
    "linkedInUrl": "string or null",
    "githubUrl": "string or null",
    "portfolioUrl": "string or null",
    "phone": "string or null",
    "location": "city, state or null"
  }
}

For timeline fixes:
- Use "setEndDate" to add an end date and mark job as not current
- Use "removeDuplicate" to remove a duplicate company entry (keepIndex 0 = keep first, 1 = keep second)

Only include fields that apply. Omit categories with no changes.`;

    const PROFILE_UPDATE_SCHEMA = {
      type: 'object' as const,
      properties: {
        updateExistingExperience: { type: 'object' },
        setEndDate: { type: 'object' },
        removeDuplicate: { type: 'object' },
        newExperience: { type: 'object' },
        addAchievementsToCompany: { type: 'object' },
        newSkills: { type: 'array', items: { type: 'string' } },
        newCertification: { type: 'object' },
        newProject: { type: 'object' },
        personalUpdates: { type: 'object' },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let updates: Record<string, any>;
    try {
      updates = await aiService.chatStructured<Record<string, unknown>>(
        [{ role: 'user', content: prompt }],
        PROFILE_UPDATE_SCHEMA,
        'profile_update',
        {
          temperature: 0.1,
          maxTokens: 1500,
          feature: 'profile_update',
        }
      );
    } catch (parseError) {
      console.debug('[MessageHandler] AI profile update parse failed:', parseError);
      return { success: false, error: 'Failed to parse AI response. Please try again.' };
    }

    // Apply the updates
    const updatedProfile = { ...profile, updatedAt: new Date() };

    // Update existing experience (same company, update details)
    if (updates.updateExistingExperience) {
      const companyToUpdate = updates.updateExistingExperience.companyName?.toLowerCase();
      const existingIndex = profile.experience?.findIndex(
        (e) => e.company?.toLowerCase() === companyToUpdate
      );

      if (existingIndex !== undefined && existingIndex >= 0 && updatedProfile.experience) {
        const existing = updatedProfile.experience[existingIndex];
        const updateData = updates.updateExistingExperience.updates;

        // Merge achievements (existing + new)
        const newAchievements = (updateData.achievements || []).map((a: string) => ({
          statement: a,
          isQuantified: /\d/.test(a),
          keywords: [],
        }));

        updatedProfile.experience[existingIndex] = {
          ...existing,
          title: updateData.title || existing.title,
          normalizedTitle: updateData.title || existing.normalizedTitle,
          startDate: updateData.startDate || existing.startDate,
          isCurrent: updateData.isCurrent !== undefined ? updateData.isCurrent : existing.isCurrent,
          description: updateData.description || existing.description,
          achievements: [...(existing.achievements || []), ...newAchievements],
        };

        console.log('[ProfileUpdate] Updated existing company:', companyToUpdate);
      }
    }

    // Add achievements to a specific company
    if (updates.addAchievementsToCompany) {
      const companyToUpdate = updates.addAchievementsToCompany.companyName?.toLowerCase();
      const existingIndex = profile.experience?.findIndex(
        (e) => e.company?.toLowerCase() === companyToUpdate
      );

      if (existingIndex !== undefined && existingIndex >= 0 && updatedProfile.experience) {
        const existing = updatedProfile.experience[existingIndex];
        const newAchievements = (updates.addAchievementsToCompany.achievements || []).map(
          (a: string) => ({
            statement: a,
            isQuantified: /\d/.test(a),
            keywords: [],
          })
        );

        updatedProfile.experience[existingIndex] = {
          ...existing,
          achievements: [...(existing.achievements || []), ...newAchievements],
        };

        console.log('[ProfileUpdate] Added achievements to:', companyToUpdate);
      }
    }

    // Set end date for a company (timeline fix)
    if (updates.setEndDate) {
      const companyToUpdate = updates.setEndDate.companyName?.toLowerCase();
      const existingIndex = updatedProfile.experience?.findIndex(
        (e) => e.company?.toLowerCase() === companyToUpdate
      );

      if (existingIndex !== undefined && existingIndex >= 0 && updatedProfile.experience) {
        updatedProfile.experience[existingIndex] = {
          ...updatedProfile.experience[existingIndex],
          endDate: updates.setEndDate.endDate,
          isCurrent: false,
        };
        console.log(
          '[ProfileUpdate] Set end date for:',
          companyToUpdate,
          'to',
          updates.setEndDate.endDate
        );
      }
    }

    // Remove duplicate company entry (timeline fix)
    if (updates.removeDuplicate) {
      const companyToFix = updates.removeDuplicate.companyName?.toLowerCase();
      const keepIndex = updates.removeDuplicate.keepIndex || 0;

      // Find all entries for this company
      const duplicateIndices: number[] = [];
      updatedProfile.experience?.forEach((exp, idx) => {
        if (exp.company?.toLowerCase() === companyToFix) {
          duplicateIndices.push(idx);
        }
      });

      if (duplicateIndices.length > 1) {
        // Remove all except the one to keep (clamp keepIndex to valid range)
        const clampedKeepIndex = Math.max(0, Math.min(keepIndex, duplicateIndices.length - 1));
        const indexToKeep = duplicateIndices[clampedKeepIndex] ?? duplicateIndices[0];
        updatedProfile.experience = updatedProfile.experience?.filter((_, idx) => {
          if (idx === indexToKeep) return true; // Keep this one
          return !duplicateIndices.includes(idx); // Remove other duplicates
        });
        console.log(
          '[ProfileUpdate] Removed duplicate entries for:',
          companyToFix,
          'kept index:',
          keepIndex
        );
      }
    }

    // Add new experience (truly new company)
    if (updates.newExperience) {
      const newExp = {
        id: crypto.randomUUID(),
        company: updates.newExperience.company,
        title: updates.newExperience.title,
        normalizedTitle: updates.newExperience.title,
        location: updates.newExperience.location || '',
        employmentType: 'full-time' as const,
        startDate: updates.newExperience.startDate,
        endDate: updates.newExperience.isCurrent ? undefined : updates.newExperience.endDate,
        isCurrent: updates.newExperience.isCurrent || false,
        durationMonths: 0,
        description: updates.newExperience.description || '',
        achievements: (updates.newExperience.achievements || []).map((a: string) => ({
          statement: a,
          isQuantified: /\d/.test(a),
          keywords: [],
        })),
        responsibilities: [],
        technologiesUsed: [],
        skillsGained: [],
        relevanceMap: {},
      };
      // Mark previous current job as not current
      const existingExperience = [...(profile.experience || [])];
      if (newExp.isCurrent && existingExperience[0]?.isCurrent) {
        existingExperience[0] = {
          ...existingExperience[0],
          isCurrent: false,
          endDate: newExp.startDate,
        };
      }
      updatedProfile.experience = [newExp, ...existingExperience];
    }

    // Add achievements to current job
    if (updates.addAchievementsToCurrentJob && updates.addAchievementsToCurrentJob.length > 0) {
      if (updatedProfile.experience && updatedProfile.experience.length > 0) {
        const currentJob = updatedProfile.experience[0];
        const newAchievements = updates.addAchievementsToCurrentJob.map((a: string) => ({
          statement: a,
          isQuantified: /\d/.test(a),
          keywords: [],
        }));
        updatedProfile.experience[0] = {
          ...currentJob,
          achievements: [...(currentJob.achievements || []), ...newAchievements],
        };
      }
    }

    // Add new skills
    if (updates.newSkills && updates.newSkills.length > 0) {
      const existingSkillNames = new Set(
        (profile.skills?.technical || []).map((s) => s.name.toLowerCase())
      );
      const newTechnicalSkills = updates.newSkills
        .filter((s: string) => !existingSkillNames.has(s.toLowerCase()))
        .map((s: string) => ({
          name: s,
          normalizedName: s,
          category: 'other' as const,
          yearsOfExperience: 1,
          proficiency: 'intermediate' as const,
          lastUsed: 'current',
          evidenceFrom: [],
          aliases: [],
        }));

      updatedProfile.skills = {
        ...profile.skills,
        technical: [...(profile.skills?.technical || []), ...newTechnicalSkills],
      };
    }

    // Add new certification
    if (updates.newCertification) {
      const newCert = {
        name: updates.newCertification.name,
        issuer: updates.newCertification.issuer || '',
        dateObtained: updates.newCertification.dateObtained,
        isValid: true,
        relevanceMap: {},
      };
      updatedProfile.certifications = [...(profile.certifications || []), newCert];
    }

    // Add new project
    if (updates.newProject) {
      const newProj = {
        id: crypto.randomUUID(),
        name: updates.newProject.name,
        description: updates.newProject.description || '',
        role: updates.newProject.role || 'Developer',
        technologies: updates.newProject.technologies || [],
        url: updates.newProject.url,
        highlights: updates.newProject.highlights || [],
        impact: updates.newProject.impact || '',
        dateRange: updates.newProject.dateRange,
        relevanceMap: {},
      };
      updatedProfile.projects = [...(profile.projects || []), newProj];
    }

    // Apply personal updates
    if (updates.personalUpdates) {
      const pu = updates.personalUpdates;
      updatedProfile.personal = {
        ...profile.personal,
        ...(pu.linkedInUrl && { linkedInUrl: pu.linkedInUrl }),
        ...(pu.githubUrl && { githubUrl: pu.githubUrl }),
        ...(pu.portfolioUrl && { portfolioUrl: pu.portfolioUrl }),
        ...(pu.phone && { phone: pu.phone }),
        ...(pu.location && {
          location: {
            ...profile.personal?.location,
            formatted: pu.location,
            city: pu.location.split(',')[0]?.trim() || '',
            state: pu.location.split(',')[1]?.trim() || '',
          },
        }),
      };
    }

    // Recalculate years of experience if experience was updated
    if (updates.newExperience && updatedProfile.experience) {
      const yearsOfExp = calculateYearsFromExperience(updatedProfile.experience);
      updatedProfile.careerContext = {
        ...profile.careerContext,
        yearsOfExperience: yearsOfExp,
        // Update seniority level based on years
        seniorityLevel:
          yearsOfExp > 12
            ? 'principal'
            : yearsOfExp > 8
              ? 'lead'
              : yearsOfExp > 5
                ? 'senior'
                : yearsOfExp > 2
                  ? 'mid'
                  : 'entry',
      };
    }

    const saved = await masterProfileRepo.save(updatedProfile);
    return { success: true, data: saved };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// Calculate years of experience from experience array
function calculateYearsFromExperience(
  experiences: { startDate?: string; endDate?: string; isCurrent?: boolean }[]
): number {
  if (!experiences || experiences.length === 0) return 0;

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const monthMap: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  const parseDate = (dateStr: string | undefined): { year: number; month: number } | null => {
    if (!dateStr) return null;
    const lower = dateStr.toLowerCase().trim();
    if (lower === 'present' || lower === 'current' || lower === 'now') {
      return { year: currentYear, month: currentMonth };
    }

    // "2024-01" format
    const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})$/);
    if (isoMatch) {
      return { year: parseInt(isoMatch[1]), month: parseInt(isoMatch[2]) };
    }

    // "January 2024" or "Jan 2024" format
    const monthYearMatch = dateStr.match(/^([A-Za-z]+)\s*(\d{4})$/);
    if (monthYearMatch) {
      const monthKey = monthYearMatch[1].toLowerCase().substring(0, 3);
      const month = monthMap[monthKey] || 1;
      return { year: parseInt(monthYearMatch[2]), month };
    }

    // Just year "2024"
    if (/^\d{4}$/.test(dateStr)) {
      return { year: parseInt(dateStr), month: 1 };
    }

    return null;
  };

  interface DateRange {
    startMonths: number;
    endMonths: number;
  }
  const ranges: DateRange[] = [];

  for (const exp of experiences) {
    const start = parseDate(exp.startDate);
    const end = exp.isCurrent ? { year: currentYear, month: currentMonth } : parseDate(exp.endDate);

    if (start && end) {
      ranges.push({
        startMonths: start.year * 12 + start.month,
        endMonths: end.year * 12 + end.month,
      });
    }
  }

  // Sort and merge overlapping ranges
  ranges.sort((a, b) => a.startMonths - b.startMonths);
  const merged: DateRange[] = [];

  for (const range of ranges) {
    if (merged.length === 0) {
      merged.push(range);
    } else {
      const last = merged[merged.length - 1];
      if (range.startMonths <= last.endMonths + 1) {
        last.endMonths = Math.max(last.endMonths, range.endMonths);
      } else {
        merged.push(range);
      }
    }
  }

  // Calculate total months
  let totalMonths = 0;
  for (const range of merged) {
    totalMonths += range.endMonths - range.startMonths + 1;
  }

  return Math.round(totalMonths / 12);
}

export async function handleGenerateRoleProfile(payload: {
  masterProfileId: string;
  targetRole: string;
}): Promise<MessageResponse> {
  try {
    const masterProfile = await masterProfileRepo.getById(payload.masterProfileId);
    if (!masterProfile) {
      return { success: false, error: 'Master profile not found' };
    }

    const ai = await getAIService();
    if (ai.error) return { success: false, error: ai.error };
    const aiService = ai.service!;

    // Run career context engine (static import)
    const engine = new CareerContextEngine(aiService);

    const generatedProfile = await engine.generateRoleProfile(masterProfile, payload.targetRole);
    if (!generatedProfile) {
      return { success: false, error: 'Failed to generate profile' };
    }

    // Add to master profile
    await masterProfileRepo.addGeneratedProfile(payload.masterProfileId, generatedProfile);

    return { success: true, data: generatedProfile };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleDeleteRoleProfile(payload: {
  masterProfileId: string;
  roleProfileId: string;
}): Promise<MessageResponse> {
  try {
    const updated = await masterProfileRepo.removeGeneratedProfile(
      payload.masterProfileId,
      payload.roleProfileId
    );
    if (!updated) {
      return { success: false, error: 'Failed to delete role profile' };
    }
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function handleSetActiveRoleProfile(payload: {
  masterProfileId: string;
  roleProfileId: string;
}): Promise<MessageResponse> {
  try {
    const profile = await masterProfileRepo.getById(payload.masterProfileId);
    if (!profile) {
      return { success: false, error: 'Master profile not found' };
    }

    // Update all generated profiles, setting only the selected one as active
    const updatedProfiles =
      profile.generatedProfiles?.map((gp) => ({
        ...gp,
        isActive: gp.id === payload.roleProfileId,
      })) || [];

    const updated = await masterProfileRepo.update(payload.masterProfileId, {
      generatedProfiles: updatedProfiles,
    });

    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ── Role Profile Management ─────────────────────────────────────────

export async function handleCreateRoleProfile(payload: {
  masterProfileId: string;
  targetRole: string;
  skillEmphasis?: string[];
}): Promise<MessageResponse> {
  try {
    const masterProfile = await masterProfileRepo.getById(payload.masterProfileId);
    if (!masterProfile) {
      return { success: false, error: 'Master profile not found' };
    }

    const roleProfile: RoleProfile = {
      id: crypto.randomUUID(),
      masterProfileId: payload.masterProfileId,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: payload.targetRole,
      targetRole: payload.targetRole,
      isActive: false,
      tailoredSummary: masterProfile.careerContext?.summary || '',
      skillEmphasis: payload.skillEmphasis || [],
      bulletOverrides: {},
      projectVisibility: {},
      sectionPriority: {
        summary: 1,
        experience: 2,
        skills: 3,
        projects: 4,
        education: 5,
        certifications: 6,
      },
      roleStrength: 0,
      atsKeywords: [],
      applicationsUsed: 0,
    };

    const updated = await masterProfileRepo.addRoleProfile(payload.masterProfileId, roleProfile);

    if (!updated) {
      return { success: false, error: 'Failed to save role profile' };
    }

    return { success: true, data: roleProfile };
  } catch (error) {
    console.error('[ApplySharp] Create role profile failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function handleGetRoleProfiles(payload: {
  masterProfileId: string;
}): Promise<MessageResponse> {
  try {
    const roleProfiles = await masterProfileRepo.getAllRoleProfiles(payload.masterProfileId);
    return { success: true, data: roleProfiles };
  } catch (error) {
    console.error('[ApplySharp] Get role profiles failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

// ── Claims Validation ───────────────────────────────────────────────

export async function handleValidateClaims(payload: {
  masterProfileId: string;
}): Promise<MessageResponse> {
  try {
    const profile = await masterProfileRepo.getById(payload.masterProfileId);
    if (!profile) {
      return { success: false, error: 'Profile not found' };
    }

    const experiences = (profile.experience || []).map((exp) => ({
      company: exp.company || '',
      title: exp.title || '',
      achievements: (exp.achievements || []).map(
        (a) => (typeof a === 'string' ? a : (a as { text?: string }).text) || ''
      ),
    }));

    const report = validateAllClaims(experiences);
    return { success: true, data: report };
  } catch (error) {
    console.error('[ApplySharp] Validate claims failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function handleValidateSingleClaim(payload: {
  bulletText: string;
}): Promise<MessageResponse> {
  try {
    const analysis = analyzeClaim(payload.bulletText);
    return { success: true, data: analysis };
  } catch (error) {
    console.error('[ApplySharp] Validate single claim failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

// ── Profile Health ──────────────────────────────────────────────────

export async function handleGetProfileHealth(payload: {
  masterProfileId: string;
}): Promise<MessageResponse> {
  try {
    const profile = await masterProfileRepo.getById(payload.masterProfileId);
    if (!profile) {
      return { success: false, error: 'Profile not found' };
    }

    const report = reviewProfileHealth(profile);
    return { success: true, data: report };
  } catch (error) {
    console.error('[ApplySharp] Get profile health failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Workstream 2 handler. Returns the highest-leverage next question for the
 * conversational profile interview, computed from the completeness scorer
 * via getNextQuestion. The UI shows it next to the CompletenessRing so the
 * user has a one-click "tell me what to fill in next" path that targets
 * the dimension worth the most points.
 *
 * Returns null when the profile has no missing dimensions (already at 100).
 */
export async function handleGetProfileNextQuestion(payload: {
  masterProfileId?: string;
}): Promise<MessageResponse> {
  try {
    const profile = payload.masterProfileId
      ? await masterProfileRepo.getById(payload.masterProfileId)
      : await masterProfileRepo.getActive();
    if (!profile) {
      return { success: false, error: 'No active profile found' };
    }
    const next = getNextQuestion(profile);
    return { success: true, data: next };
  } catch (error) {
    console.error('[ApplySharp] getNextQuestion handler failed:', error);
    return { success: false, error: (error as Error).message };
  }
}
