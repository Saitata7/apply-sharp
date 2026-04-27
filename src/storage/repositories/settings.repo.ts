import { getDB } from '../idb-client';
import type { UserSettings } from '@shared/types/settings.types';
import { getDefaultSettings } from '@shared/types/settings.types';
import { DEPRECATED_ANTHROPIC_MODELS, DEPRECATED_GROQ_MODELS } from '@shared/constants/models';

const SETTINGS_ID = 'user_settings';

function migrateDeprecatedModels(settings: UserSettings): {
  settings: UserSettings;
  changed: boolean;
} {
  let changed = false;
  const next = { ...settings, ai: { ...settings.ai } };

  const anthropicModel = next.ai.anthropic?.model;
  if (anthropicModel && DEPRECATED_ANTHROPIC_MODELS[anthropicModel]) {
    next.ai.anthropic = {
      ...next.ai.anthropic!,
      model: DEPRECATED_ANTHROPIC_MODELS[anthropicModel],
    };
    changed = true;
  }

  const groqModel = next.ai.groq?.model;
  if (groqModel && DEPRECATED_GROQ_MODELS[groqModel]) {
    next.ai.groq = {
      ...next.ai.groq!,
      model: DEPRECATED_GROQ_MODELS[groqModel],
    };
    changed = true;
  }

  return { settings: next, changed };
}

export const settingsRepo = {
  async get(): Promise<UserSettings> {
    const db = await getDB();
    const settings = await db.get('settings', SETTINGS_ID);

    if (!settings) {
      const defaults = getDefaultSettings();
      await this.save(defaults);
      return defaults;
    }

    const { settings: migrated, changed } = migrateDeprecatedModels(settings);
    if (changed) {
      await this.save(migrated);
      return migrated;
    }

    return settings;
  },

  async save(settings: UserSettings): Promise<UserSettings> {
    const db = await getDB();

    const toSave: UserSettings = {
      ...settings,
      id: SETTINGS_ID,
    };

    await db.put('settings', toSave);
    return toSave;
  },

  async update(updates: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.get();

    const updated: UserSettings = {
      ...current,
      ...updates,
      id: SETTINGS_ID,
    };

    return this.save(updated);
  },

  async reset(): Promise<UserSettings> {
    const defaults = getDefaultSettings();
    return this.save(defaults);
  },
};
