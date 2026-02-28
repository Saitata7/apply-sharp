import { useState, useEffect } from 'react';
import type { UserSettings, AIProvider } from '@shared/types/settings.types';
import { getDefaultSettings } from '@shared/types/settings.types';
import {
  DEFAULT_MODELS,
  DEFAULT_OLLAMA_BASE_URL,
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
  GROQ_MODELS,
} from '@shared/constants/models';

export default function AISettings() {
  const [settings, setSettings] = useState<UserSettings>(getDefaultSettings());
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      // Load settings from background (IndexedDB) via messaging
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response?.success && response.data) {
        setSettings(response.data);
      }
    } catch (error) {
      console.error('[AISettings] Failed to load settings:', error);
      // Keep default settings
    }
  }

  async function saveSettings(newSettings: UserSettings) {
    try {
      // Save settings to background (IndexedDB) via messaging
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        payload: newSettings,
      });
      if (response?.success && response.data) {
        setSettings(response.data);
      } else {
        setSettings(newSettings); // Update local state anyway
      }
    } catch (error) {
      console.error('[AISettings] Failed to save settings:', error);
      setSettings(newSettings); // Update local state anyway
    }
  }

  function updateProvider(provider: AIProvider) {
    saveSettings({
      ...settings,
      ai: { ...settings.ai, provider },
    });
  }

  function updateOllamaConfig(field: string, value: string | number) {
    saveSettings({
      ...settings,
      ai: {
        ...settings.ai,
        ollama: {
          ...(settings.ai.ollama || {
            baseUrl: 'http://localhost:11434',
            model: 'llama3.2',
            contextLength: 4096,
          }),
          [field]: value,
        },
      },
    });
  }

  function updateOpenAIConfig(field: string, value: string) {
    saveSettings({
      ...settings,
      ai: {
        ...settings.ai,
        openai: {
          ...settings.ai.openai,
          apiKey: settings.ai.openai?.apiKey || '',
          model: settings.ai.openai?.model || DEFAULT_MODELS.openai,
          [field]: value,
        },
      },
    });
  }

  function updateAnthropicConfig(field: string, value: string) {
    saveSettings({
      ...settings,
      ai: {
        ...settings.ai,
        anthropic: {
          ...settings.ai.anthropic,
          apiKey: settings.ai.anthropic?.apiKey || '',
          model: settings.ai.anthropic?.model || DEFAULT_MODELS.anthropic,
          [field]: value,
        },
      },
    });
  }

  function updateGroqConfig(field: string, value: string) {
    saveSettings({
      ...settings,
      ai: {
        ...settings.ai,
        groq: {
          ...settings.ai.groq,
          apiKey: settings.ai.groq?.apiKey || '',
          model: settings.ai.groq?.model || DEFAULT_MODELS.groq,
          [field]: value,
        },
      },
    });
  }

  async function testConnection() {
    setTestStatus('testing');
    setTestMessage('Testing connection...');

    try {
      const provider = settings.ai.provider;

      if (provider === 'ollama') {
        const baseUrl = settings.ai.ollama?.baseUrl || DEFAULT_OLLAMA_BASE_URL;
        const response = await fetch(`${baseUrl}/api/tags`);
        if (response.ok) {
          const data = await response.json();
          setTestStatus('success');
          setTestMessage(`Connected! Found ${data.models?.length || 0} models.`);
        } else {
          throw new Error('Could not connect to Ollama');
        }
      } else if (provider === 'openai') {
        // Test OpenAI connection
        const apiKey = settings.ai.openai?.apiKey;
        if (!apiKey) {
          throw new Error('API key is required');
        }
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (response.ok) {
          setTestStatus('success');
          setTestMessage('Connected to OpenAI successfully!');
        } else {
          throw new Error('Invalid API key');
        }
      } else if (provider === 'anthropic') {
        // Anthropic doesn't have a simple test endpoint
        const apiKey = settings.ai.anthropic?.apiKey;
        if (!apiKey) {
          throw new Error('API key is required');
        }
        setTestStatus('success');
        setTestMessage('API key saved. Will test on first use.');
      } else if (provider === 'groq') {
        const apiKey = settings.ai.groq?.apiKey;
        if (!apiKey) {
          throw new Error('API key is required');
        }
        const response = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (response.ok) {
          setTestStatus('success');
          setTestMessage('Connected to Groq successfully!');
        } else {
          throw new Error('Invalid API key');
        }
      }
    } catch (error) {
      setTestStatus('error');
      setTestMessage(error instanceof Error ? error.message : 'Connection failed');
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>AI Settings</h1>
        <p className="page-description">
          Configure your AI provider for job scoring and content generation
        </p>
      </div>

      <div className="settings-section">
        <h3>AI Provider</h3>
        <p className="section-description">
          Choose between local AI (Ollama) for privacy or cloud providers for better quality.
        </p>

        <div className="provider-cards">
          <div
            className={`provider-card ${settings.ai.provider === 'ollama' ? 'selected' : ''}`}
            onClick={() => updateProvider('ollama')}
          >
            <div className="provider-header">
              <span className="provider-name">Ollama (Local)</span>
              <span className="badge badge-green">Recommended</span>
            </div>
            <p className="provider-description">
              Run AI locally on your machine. Complete privacy, no API costs. Requires Ollama to be
              installed and running.
            </p>
          </div>

          <div
            className={`provider-card ${settings.ai.provider === 'openai' ? 'selected' : ''}`}
            onClick={() => updateProvider('openai')}
          >
            <div className="provider-header">
              <span className="provider-name">OpenAI</span>
            </div>
            <p className="provider-description">
              GPT-4o-mini or GPT-4o. Fast and high quality. Requires API key and has usage costs.
            </p>
          </div>

          <div
            className={`provider-card ${settings.ai.provider === 'anthropic' ? 'selected' : ''}`}
            onClick={() => updateProvider('anthropic')}
          >
            <div className="provider-header">
              <span className="provider-name">Anthropic</span>
            </div>
            <p className="provider-description">
              Claude 3 Haiku or Sonnet. Excellent for writing tasks. Requires API key and has usage
              costs.
            </p>
          </div>

          <div
            className={`provider-card ${settings.ai.provider === 'groq' ? 'selected' : ''}`}
            onClick={() => updateProvider('groq')}
          >
            <div className="provider-header">
              <span className="provider-name">Groq</span>
              <span className="badge badge-blue">Free Tier</span>
            </div>
            <p className="provider-description">
              Llama 3.3 70B at blazing speed. Free tier available with generous limits. Get API key
              at console.groq.com
            </p>
          </div>
        </div>
      </div>

      {settings.ai.provider === 'ollama' && (
        <div className="settings-section">
          <h3>Ollama Configuration</h3>
          <div className="form-grid">
            <div className="form-field">
              <label>Base URL</label>
              <input
                type="url"
                className="input"
                value={settings.ai.ollama?.baseUrl || DEFAULT_OLLAMA_BASE_URL}
                onChange={(e) => updateOllamaConfig('baseUrl', e.target.value)}
              />
              <span className="hint">Default: http://localhost:11434</span>
            </div>
            <div className="form-field">
              <label>Model</label>
              <input
                type="text"
                className="input"
                value={settings.ai.ollama?.model || DEFAULT_MODELS.ollama}
                onChange={(e) => updateOllamaConfig('model', e.target.value)}
              />
              <span className="hint">e.g., llama3.1, mistral, mixtral</span>
            </div>
          </div>
        </div>
      )}

      {settings.ai.provider === 'openai' && (
        <div className="settings-section">
          <h3>OpenAI Configuration</h3>
          <div className="form-grid">
            <div className="form-field full-width">
              <label>API Key</label>
              <input
                type="password"
                className="input"
                placeholder="sk-..."
                value={settings.ai.openai?.apiKey || ''}
                onChange={(e) => updateOpenAIConfig('apiKey', e.target.value)}
              />
              <span className="hint">
                Your API key is stored locally and never sent to our servers
              </span>
            </div>
            <div className="form-field">
              <label>Model</label>
              <select
                className="select"
                value={settings.ai.openai?.model || DEFAULT_MODELS.openai}
                onChange={(e) => updateOpenAIConfig('model', e.target.value)}
              >
                {OPENAI_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {settings.ai.provider === 'anthropic' && (
        <div className="settings-section">
          <h3>Anthropic Configuration</h3>
          <div className="form-grid">
            <div className="form-field full-width">
              <label>API Key</label>
              <input
                type="password"
                className="input"
                placeholder="sk-ant-..."
                value={settings.ai.anthropic?.apiKey || ''}
                onChange={(e) => updateAnthropicConfig('apiKey', e.target.value)}
              />
              <span className="hint">
                Your API key is stored locally and never sent to our servers
              </span>
            </div>
            <div className="form-field">
              <label>Model</label>
              <select
                className="select"
                value={settings.ai.anthropic?.model || DEFAULT_MODELS.anthropic}
                onChange={(e) => updateAnthropicConfig('model', e.target.value)}
              >
                {ANTHROPIC_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {settings.ai.provider === 'groq' && (
        <div className="settings-section">
          <h3>Groq Configuration</h3>
          <div className="form-grid">
            <div className="form-field full-width">
              <label>API Key</label>
              <input
                type="password"
                className="input"
                placeholder="gsk_..."
                value={settings.ai.groq?.apiKey || ''}
                onChange={(e) => updateGroqConfig('apiKey', e.target.value)}
              />
              <span className="hint">Get your free API key at console.groq.com</span>
            </div>
            <div className="form-field">
              <label>Model</label>
              <select
                className="select"
                value={settings.ai.groq?.model || DEFAULT_MODELS.groq}
                onChange={(e) => updateGroqConfig('model', e.target.value)}
              >
                {GROQ_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="settings-section">
        <h3>Test Connection</h3>
        <div className="test-connection">
          <button
            className="btn btn-secondary"
            onClick={testConnection}
            disabled={testStatus === 'testing'}
          >
            {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
          </button>
          {testMessage && (
            <span className={`test-result ${testStatus}`}>
              {testStatus === 'success' && '✓ '}
              {testStatus === 'error' && '✗ '}
              {testMessage}
            </span>
          )}
        </div>
      </div>

      <div className="settings-section">
        <h3>Generation Settings</h3>
        <div className="form-grid">
          <div className="form-field">
            <label>Temperature</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={settings.ai.generation.temperature}
              onChange={(e) =>
                saveSettings({
                  ...settings,
                  ai: {
                    ...settings.ai,
                    generation: {
                      ...settings.ai.generation,
                      temperature: parseFloat(e.target.value),
                    },
                  },
                })
              }
            />
            <span className="range-value">{settings.ai.generation.temperature}</span>
            <span className="hint">Lower = more focused, Higher = more creative</span>
          </div>
        </div>
      </div>

      {/* Detection Settings */}
      <div className="settings-section">
        <h2>Detection</h2>
        <div className="setting-row">
          <label>
            <input
              type="checkbox"
              checked={settings.detection?.autoDetect ?? true}
              onChange={(e) =>
                saveSettings({
                  ...settings,
                  detection: { ...settings.detection, autoDetect: e.target.checked },
                })
              }
            />
            Auto-detect jobs on supported platforms
          </label>
        </div>
        <div className="setting-row">
          <label>
            <input
              type="checkbox"
              checked={settings.detection?.showOverlay ?? true}
              onChange={(e) =>
                saveSettings({
                  ...settings,
                  detection: { ...settings.detection, showOverlay: e.target.checked },
                })
              }
            />
            Show sidebar overlay when job is detected
          </label>
        </div>
        <div className="setting-row">
          <label>
            <input
              type="checkbox"
              checked={settings.detection?.autoAnalyze ?? true}
              onChange={(e) =>
                saveSettings({
                  ...settings,
                  detection: { ...settings.detection, autoAnalyze: e.target.checked },
                })
              }
            />
            Auto-analyze job fit on detection
          </label>
        </div>
      </div>

      {/* Privacy Settings */}
      <div className="settings-section">
        <h2>Privacy</h2>
        <div className="setting-row">
          <label>
            <input
              type="checkbox"
              checked={settings.privacy?.trackApplications ?? true}
              onChange={(e) =>
                saveSettings({
                  ...settings,
                  privacy: { ...settings.privacy, trackApplications: e.target.checked },
                })
              }
            />
            Track application history
          </label>
        </div>
        <div className="setting-row">
          <label>
            <input
              type="checkbox"
              checked={settings.privacy?.enableLearning ?? true}
              onChange={(e) =>
                saveSettings({
                  ...settings,
                  privacy: { ...settings.privacy, enableLearning: e.target.checked },
                })
              }
            />
            Enable learning from outcomes (improves suggestions over time)
          </label>
        </div>
      </div>

      {/* Appearance Settings */}
      <div className="settings-section">
        <h2>Appearance</h2>
        <div className="setting-row">
          <label>Theme</label>
          <select
            value={settings.appearance?.theme ?? 'system'}
            onChange={(e) =>
              saveSettings({
                ...settings,
                appearance: {
                  ...settings.appearance,
                  theme: e.target.value as 'light' | 'dark' | 'system',
                  compactMode: settings.appearance?.compactMode ?? false,
                },
              })
            }
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>
    </div>
  );
}
