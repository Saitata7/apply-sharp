import type { MessageResponse } from '@shared/utils/messaging';
import { conversationRepo } from '@storage/repositories/conversation.repo';
import {
  PROFILE_INTERVIEW_SYSTEM,
  PROFILE_INTERVIEW_WITH_RESUME,
  PROFILE_INTERVIEW_WITHOUT_RESUME,
  createConversationState,
  type ConversationState,
} from '@/ai/prompts/profile-interview';
import { sanitizePromptInput } from '@shared/utils/prompt-safety';
import { getAIService } from '../message-handler';

// ============================================================================
// Conversational Profile Builder Handlers
// ============================================================================

export async function handleStartProfileConversation(payload: {
  masterProfileId?: string;
  resumeText?: string;
}): Promise<MessageResponse> {
  try {
    const ai = await getAIService();
    if (ai.error) return { success: false, error: ai.error };
    const aiService = ai.service!;

    const hasResume = !!payload.resumeText;
    const profileId = payload.masterProfileId || crypto.randomUUID();
    const conversation = createConversationState(profileId, hasResume);

    // Build initial user message for the AI
    const initialPrompt = hasResume
      ? PROFILE_INTERVIEW_WITH_RESUME.replace(
          '{resumeData}',
          sanitizePromptInput(payload.resumeText || '', 'resume_data')
        )
      : PROFILE_INTERVIEW_WITHOUT_RESUME;

    // Get AI greeting
    const response = await aiService.chat(
      [
        { role: 'system', content: PROFILE_INTERVIEW_SYSTEM },
        { role: 'user', content: initialPrompt },
      ],
      { temperature: 0.7, maxTokens: 1000, feature: 'profile_interview' }
    );

    // Store messages
    conversation.messages.push(
      { role: 'system', content: PROFILE_INTERVIEW_SYSTEM },
      { role: 'user', content: initialPrompt },
      { role: 'assistant', content: response.content }
    );

    // Try to extract any data from the response
    const extracted = tryExtractConversationData(response.content);
    if (extracted) {
      mergeExtractedData(conversation, extracted);
    }

    await conversationRepo.save(conversation);

    return {
      success: true,
      data: {
        conversationId: conversation.id,
        assistantMessage: stripJsonBlock(response.content),
        phase: conversation.phase,
      },
    };
  } catch (error) {
    console.error('[ApplySharp] Start profile conversation failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function handleSendConversationMessage(payload: {
  conversationId: string;
  userMessage: string;
}): Promise<MessageResponse> {
  try {
    const conversation = await conversationRepo.getById(payload.conversationId);
    if (!conversation) {
      return { success: false, error: 'Conversation not found' };
    }

    const ai = await getAIService();
    if (ai.error) return { success: false, error: ai.error };
    const aiService = ai.service!;

    // Add user message
    conversation.messages.push({
      role: 'user',
      content: payload.userMessage,
    });

    // Build messages for AI with sliding window to avoid token overflow
    // Keep system message (first) + last 20 messages (10 turns)
    const allMessages = conversation.messages;
    const windowedMessages =
      allMessages.length > 22 ? [allMessages[0], ...allMessages.slice(-20)] : allMessages;

    const aiMessages = windowedMessages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    // Get AI response
    const response = await aiService.chat(aiMessages, {
      temperature: 0.7,
      maxTokens: 1000,
      feature: 'profile_interview',
    });

    // Store assistant response
    conversation.messages.push({
      role: 'assistant',
      content: response.content,
    });

    // Extract any structured data from the response
    const extracted = tryExtractConversationData(response.content);
    if (extracted) {
      mergeExtractedData(conversation, extracted);

      // Update phase if indicated
      if (extracted.currentPhase && typeof extracted.currentPhase === 'string') {
        const validPhases = [
          'introduction',
          'experience_deep_dive',
          'skills_projects',
          'career_goals',
          'review',
          'complete',
        ];
        if (validPhases.includes(extracted.currentPhase as string)) {
          conversation.phase = extracted.currentPhase as ConversationState['phase'];
        }
      }
    }

    conversation.lastMessageAt = new Date();
    await conversationRepo.save(conversation);

    return {
      success: true,
      data: {
        assistantMessage: stripJsonBlock(response.content),
        phase: conversation.phase,
        extractedData: conversation.extractedData,
      },
    };
  } catch (error) {
    console.error('[ApplySharp] Send conversation message failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function handleGetConversationState(payload: {
  conversationId?: string;
  masterProfileId?: string;
}): Promise<MessageResponse> {
  try {
    let conversation: ConversationState | undefined;

    if (payload.conversationId) {
      conversation = await conversationRepo.getById(payload.conversationId);
    } else if (payload.masterProfileId) {
      conversation = await conversationRepo.getByMasterProfileId(payload.masterProfileId);
    }

    if (!conversation) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        conversationId: conversation.id,
        phase: conversation.phase,
        messageCount: conversation.messages.filter((m) => m.role !== 'system').length,
        extractedData: conversation.extractedData,
        lastMessageAt: conversation.lastMessageAt,
      },
    };
  } catch (error) {
    console.error('[ApplySharp] Get conversation state failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

// ── Conversation Helpers ────────────────────────────────────────────────────

function tryExtractConversationData(aiResponse: string): Record<string, unknown> | null {
  // Look for ```json ... ``` blocks in the response
  const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    return parsed?.extractedData || parsed;
  } catch {
    return null;
  }
}

function stripJsonBlock(response: string): string {
  // Remove ```json ... ``` blocks from the visible response
  return response.replace(/```json\s*[\s\S]*?```/g, '').trim();
}

function mergeExtractedData(
  conversation: ConversationState,
  newData: Record<string, unknown>
): void {
  const existing = conversation.extractedData;

  // Merge experiences
  if (Array.isArray(newData.experience) || Array.isArray(newData.experiences)) {
    const newExps = (newData.experience || newData.experiences) as Array<Record<string, unknown>>;
    for (const newExp of newExps) {
      if (!newExp.company) continue;
      const existingExp = existing.experiences.find((e) => e.company === newExp.company);
      if (existingExp) {
        // Merge into existing
        if (newExp.title) existingExp.title = newExp.title as string;
        if (Array.isArray(newExp.achievements)) {
          existingExp.achievements = [
            ...existingExp.achievements,
            ...(newExp.achievements as string[]),
          ];
        }
        if (Array.isArray(newExp.technologies)) {
          const newTech = newExp.technologies as string[];
          existingExp.technologies = [...new Set([...existingExp.technologies, ...newTech])];
        }
        if (newExp.teamSize) existingExp.teamSize = newExp.teamSize as string;
        if (newExp.companyStage) existingExp.companyStage = newExp.companyStage as string;
        if (newExp.businessImpact) existingExp.businessImpact = newExp.businessImpact as string;
      } else {
        existing.experiences.push({
          company: newExp.company as string,
          title: (newExp.title as string) || undefined,
          achievements: (newExp.achievements as string[]) || [],
          technologies: (newExp.technologies as string[]) || [],
          teamSize: newExp.teamSize as string | undefined,
          companyStage: newExp.companyStage as string | undefined,
          businessImpact: newExp.businessImpact as string | undefined,
        });
      }
    }
  }

  // Merge skills
  if (newData.skills && typeof newData.skills === 'object') {
    const skillsData = newData.skills as Record<string, unknown>;
    if (!existing.skills) {
      existing.skills = { strongest: [], learning: [], tools: [] };
    }
    if (Array.isArray(skillsData.strongest)) {
      existing.skills.strongest = [
        ...new Set([...(existing.skills.strongest || []), ...(skillsData.strongest as string[])]),
      ];
    }
    if (Array.isArray(skillsData.learning)) {
      existing.skills.learning = [
        ...new Set([...(existing.skills.learning || []), ...(skillsData.learning as string[])]),
      ];
    }
  }

  // Merge career goals
  if (newData.careerGoals && typeof newData.careerGoals === 'object') {
    const goals = newData.careerGoals as Record<string, unknown>;
    existing.careerGoals = {
      ...existing.careerGoals,
      ...(goals.targetRoles ? { targetRoles: goals.targetRoles as string[] } : {}),
      ...(goals.preferredCompanyType
        ? { preferredCompanyType: goals.preferredCompanyType as string }
        : {}),
      ...(goals.dealBreakers ? { dealBreakers: goals.dealBreakers as string[] } : {}),
    };
  }

  // Merge personal
  if (newData.personal && typeof newData.personal === 'object') {
    const personal = newData.personal as Record<string, unknown>;
    existing.personal = {
      ...existing.personal,
      ...(personal.fullName ? { fullName: personal.fullName as string } : {}),
      ...(personal.targetRoles ? { targetRoles: personal.targetRoles as string[] } : {}),
    };
  }
}
