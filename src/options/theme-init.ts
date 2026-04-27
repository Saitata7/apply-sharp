// Apply persisted theme before React mounts to avoid light/dark flash.
// Mirrors chrome.storage.local theme into localStorage so we have a sync
// read path here. Imported first from main.tsx so it runs before any
// React render. Lives outside HTML to satisfy the manifest CSP
// (script-src 'self' disallows inline <script>).
try {
  const saved = localStorage.getItem('applysharp:theme');
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.setAttribute('data-theme', saved);
  } else {
    const prefersDark =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
} catch {
  document.documentElement.setAttribute('data-theme', 'light');
}
