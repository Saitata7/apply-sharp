/**
 * Light/dark theme toggle.
 * Persists to chrome.storage.local under THEME_KEY and applies data-theme on
 * <html> at boot via the inline script in index.html. This component just
 * mutates the attribute and the storage value; the boot script handles initial
 * paint to avoid a light/dark flash.
 */

import { useEffect, useState } from 'react';

const THEME_KEY = 'applysharp:theme';
type Theme = 'light' | 'dark';

function readInitial(): Theme {
  if (typeof document === 'undefined') return 'light';
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function ThemeToggle(): JSX.Element {
  const [theme, setTheme] = useState<Theme>(readInitial);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // localStorage powers the inline boot script (sync read, no flash).
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Some embedded contexts disallow localStorage; non-fatal.
    }
    try {
      void chrome.storage?.local?.set({ [THEME_KEY]: theme });
    } catch {
      // storage may be unavailable in some test contexts
    }
  }, [theme]);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(next)}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
    >
      {theme === 'dark' ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
      <span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span>
    </button>
  );
}
