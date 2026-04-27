/**
 * Gemini Nano availability banner (Workstream 6 UI promotion).
 *
 * Detects whether Chrome's built-in Prompt API is available in the current
 * browser and surfaces a "no API key needed, free, on-device" message at
 * the top of AI Settings when it is. Without this banner the cost-router
 * fallback works silently and a Chrome 138+ user has no idea they can use
 * the free local model.
 *
 * Three states:
 *   - available: green banner with "Use Gemini Nano" CTA
 *   - downloadable: amber banner explaining the model needs to download once
 *   - unavailable: nothing rendered (do not nag users on Chrome 137 or older)
 */

import { useEffect, useState } from 'react';

interface PromptApiSession {
  destroy?: () => void;
}

interface PromptApiNamespace {
  availability?: () => Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
  capabilities?: () => Promise<{
    available: 'no' | 'after-download' | 'readily';
  }>;
  /** Triggers the model download. Only present when availability is 'downloadable'.
   *  Returns a session whose memory we release immediately via destroy() so the
   *  banner does not pin the on-device model in service worker memory. */
  create?: (opts?: {
    monitor?: (m: {
      addEventListener: (event: string, cb: (e: { loaded: number }) => void) => void;
    }) => void;
  }) => Promise<PromptApiSession>;
}

// The Window type augmentation for these is owned by
// src/ai/providers/gemini-nano.ts. We do not re-declare it here to avoid
// TS subsequent-declaration conflicts. We just cast at the access site.
type WindowWithPromptApi = Window & {
  LanguageModel?: PromptApiNamespace;
  ai?: { languageModel?: PromptApiNamespace };
};

type Status = 'checking' | 'available' | 'downloadable' | 'unavailable';

interface Props {
  currentProvider: string;
  onUseGeminiNano: () => void;
}

async function detectStatus(): Promise<Status> {
  const w = window as WindowWithPromptApi;
  const api = w.LanguageModel ?? w.ai?.languageModel;
  if (!api) return 'unavailable';
  try {
    if (typeof api.availability === 'function') {
      const s = await api.availability();
      if (s === 'available') return 'available';
      if (s === 'downloadable' || s === 'downloading') return 'downloadable';
      return 'unavailable';
    }
    if (typeof api.capabilities === 'function') {
      const caps = await api.capabilities();
      if (caps.available === 'readily') return 'available';
      if (caps.available === 'after-download') return 'downloadable';
      return 'unavailable';
    }
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export default function GeminiNanoBanner({ currentProvider, onUseGeminiNano }: Props) {
  const [status, setStatus] = useState<Status>('checking');
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    let mounted = true;
    detectStatus().then((s) => {
      if (mounted) setStatus(s);
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function startDownload(): Promise<void> {
    const w = window as WindowWithPromptApi;
    const api = w.LanguageModel ?? w.ai?.languageModel;
    if (!api?.create) return;
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const session = await api.create({
        monitor: (m) => {
          m.addEventListener('downloadprogress', (e) => {
            setDownloadProgress(Math.round((e.loaded ?? 0) * 100));
          });
        },
      });
      // We only used create() to trigger the model download; the banner does
      // not need a live session. Release it immediately so we do not hold a
      // reference to the on-device model. The actual feature paths get a
      // fresh session via getAIService() at call time.
      try {
        session?.destroy?.();
      } catch {
        // destroy is best-effort; older Chrome builds may not implement it.
      }
      // After successful download the model is now available; re-detect.
      const s = await detectStatus();
      setStatus(s);
    } catch (err) {
      console.warn('[GeminiNanoBanner] download failed:', err);
    } finally {
      setDownloading(false);
    }
  }

  if (status === 'checking' || status === 'unavailable') return null;
  if (currentProvider === 'gemini-nano') return null;

  const isReady = status === 'available';

  return (
    <div
      role="region"
      aria-label="Gemini Nano availability"
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        padding: '14px 16px',
        marginBottom: 16,
        background: isReady ? 'var(--cl-emerald-glow)' : 'var(--cl-orange-glow)',
        border: `1px solid ${isReady ? 'var(--cl-emerald-glow)' : 'var(--cl-orange-glow)'}`,
        borderRadius: 8,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: isReady ? 'var(--cl-emerald)' : 'var(--cl-orange)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        {isReady ? '\u2713' : '\u25BC'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-primary)' }}>
          {isReady
            ? 'Gemini Nano is available on this Chrome'
            : 'Gemini Nano can be downloaded for free'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--tx-secondary)', marginTop: 2 }}>
          {isReady
            ? 'Free, on-device AI built into Chrome 138+. No API key, no setup, no data leaves your machine. Recommended for the local-first setup.'
            : 'Chrome will download a small on-device model the first time you use it. After that everything runs locally with no API key.'}
        </div>
      </div>
      {isReady ? (
        <button
          onClick={onUseGeminiNano}
          style={{
            padding: '8px 16px',
            background: 'var(--cl-emerald)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          Use Gemini Nano
        </button>
      ) : (
        <button
          onClick={startDownload}
          disabled={downloading}
          style={{
            padding: '8px 16px',
            background: downloading ? 'var(--tx-muted)' : 'var(--cl-orange)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: downloading ? 'wait' : 'pointer',
            fontWeight: 600,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {downloading
            ? downloadProgress > 0
              ? `Downloading ${downloadProgress}%`
              : 'Downloading...'
            : 'Download model'}
        </button>
      )}
    </div>
  );
}
