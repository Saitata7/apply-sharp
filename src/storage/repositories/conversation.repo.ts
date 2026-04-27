/**
 * Conversation Repository
 * Stores conversational profile builder state in chrome.storage.local
 * Allows users to resume profile-building conversations across sessions.
 */

import type { ConversationState } from '../../ai/prompts/profile-interview';

const STORAGE_KEY = 'profileConversations';

export const conversationRepo = {
  /**
   * Get all conversations
   */
  async getAll(): Promise<ConversationState[]> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const conversations: ConversationState[] = result[STORAGE_KEY] || [];
      // Rehydrate dates
      for (const c of conversations) {
        if (c.startedAt && typeof c.startedAt === 'string') c.startedAt = new Date(c.startedAt);
        if (c.lastMessageAt && typeof c.lastMessageAt === 'string')
          c.lastMessageAt = new Date(c.lastMessageAt);
      }
      return conversations;
    } catch (error) {
      console.error('[ConversationRepo] getAll failed:', error);
      return [];
    }
  },

  /**
   * Get conversation by ID
   */
  async getById(id: string): Promise<ConversationState | undefined> {
    try {
      const conversations = await this.getAll();
      return conversations.find((c) => c.id === id);
    } catch (error) {
      console.error('[ConversationRepo] getById failed:', error);
      return undefined;
    }
  },

  /**
   * Get the most recent conversation for a master profile
   */
  async getByMasterProfileId(masterProfileId: string): Promise<ConversationState | undefined> {
    try {
      const conversations = await this.getAll();
      return conversations
        .filter((c) => c.masterProfileId === masterProfileId)
        .sort(
          (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
        )[0];
    } catch (error) {
      console.error('[ConversationRepo] getByMasterProfileId failed:', error);
      return undefined;
    }
  },

  /**
   * Save or update a conversation
   */
  async save(conversation: ConversationState): Promise<ConversationState> {
    try {
      const conversations = await this.getAll();
      const existingIndex = conversations.findIndex((c) => c.id === conversation.id);

      const updated = {
        ...conversation,
        lastMessageAt: new Date(),
      };

      if (existingIndex >= 0) {
        conversations[existingIndex] = updated;
      } else {
        conversations.push(updated);
      }

      await chrome.storage.local.set({ [STORAGE_KEY]: conversations });
      return updated;
    } catch (error) {
      console.error('[ConversationRepo] save failed:', error);
      throw new Error(`Failed to save conversation: ${(error as Error).message}`);
    }
  },

  /**
   * Delete a conversation
   */
  async delete(id: string): Promise<boolean> {
    try {
      const conversations = await this.getAll();
      const filtered = conversations.filter((c) => c.id !== id);
      if (filtered.length === conversations.length) return false;
      await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
      return true;
    } catch (error) {
      console.error('[ConversationRepo] delete failed:', error);
      return false;
    }
  },

  /**
   * Delete all conversations for a master profile
   */
  async deleteByMasterProfileId(masterProfileId: string): Promise<void> {
    try {
      const conversations = await this.getAll();
      const filtered = conversations.filter((c) => c.masterProfileId !== masterProfileId);
      await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
    } catch (error) {
      console.error('[ConversationRepo] deleteByMasterProfileId failed:', error);
    }
  },
};
