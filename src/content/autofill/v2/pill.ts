/**
 * In-page autofill pill (Shadow DOM, anchored to the form).
 *
 * Replaces the 1100-line autofill-sidebar.ts. One pill, one click, anchored
 * to the top of the detected form so it scrolls naturally and survives the
 * host page's CSS. Uses Shadow DOM with `:host { all: initial; }` so Workday
 * and Greenhouse cannot clobber it.
 */

import { PILL_CSS } from './pill-styles';
import { dismissForHost } from './gating';

const PILL_HOST_ID = '__applysharp_autofill_pill_host';

export interface PillCallbacks {
  onAutofill: () => Promise<void> | void;
  onSettings: () => void;
}

interface PillState {
  hostEl: HTMLDivElement;
  shadow: ShadowRoot;
  pillEl: HTMLDivElement;
  goButton: HTMLButtonElement;
  statusEl: HTMLDivElement;
  anchor: HTMLElement;
  resizeObserver: ResizeObserver | null;
  scrollHandler: () => void;
}

let activePill: PillState | null = null;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function reposition(state: PillState): void {
  const rect = state.anchor.getBoundingClientRect();
  const top = window.scrollY + rect.top - 56;
  const left = window.scrollX + rect.left;
  state.hostEl.style.top = `${Math.max(0, top)}px`;
  state.hostEl.style.left = `${Math.max(0, left)}px`;
}

export function mountPill(
  anchor: HTMLElement,
  opts: {
    roleLabel: string;
    initials: string;
    callbacks: PillCallbacks;
  }
): void {
  unmountPill();

  const hostEl = document.createElement('div');
  hostEl.id = PILL_HOST_ID;
  hostEl.style.position = 'absolute';
  hostEl.style.zIndex = '2147483647';
  hostEl.style.pointerEvents = 'none';
  document.body.appendChild(hostEl);

  const shadow = hostEl.attachShadow({ mode: 'open' });
  // Detect platform once for the shortcut hint glyph (Mac vs other).
  // navigator.platform is deprecated; prefer navigator.userAgentData.platform
  // (Chromium 90+, our minimum) and fall back only for very old runtimes.
  const isMac = (() => {
    if (typeof navigator === 'undefined') return false;
    const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData;
    if (uaData?.platform) {
      return /mac/i.test(uaData.platform);
    }
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  })();
  const shortcutLabel = isMac ? '\u2318\u21E7F' : 'Ctrl\u21E7F';
  shadow.innerHTML = `
    <style>${PILL_CSS}</style>
    <div class="pill" role="group" aria-label="ApplySharp autofill">
      <div class="thumb">${escapeHtml(opts.initials || 'A')}</div>
      <span class="label">Tailored for: ${escapeHtml(opts.roleLabel)}</span>
      <button class="go" type="button" title="Autofill this form (${escapeHtml(shortcutLabel)})">
        <span class="go-label">Autofill</span>
        <kbd class="kbd" aria-hidden="true">${escapeHtml(shortcutLabel)}</kbd>
      </button>
      <button class="gear" type="button" aria-label="Open ApplySharp settings" title="Settings">⚙</button>
      <button class="close" type="button" aria-label="Dismiss ApplySharp on this site for 24 hours" title="Dismiss for 24h">×</button>
    </div>
    <div class="status" role="status" aria-live="polite" aria-atomic="true"></div>
  `;

  const pillEl = shadow.querySelector('.pill') as HTMLDivElement;
  const goButton = shadow.querySelector('.go') as HTMLButtonElement;
  const goLabelEl = shadow.querySelector('.go-label') as HTMLSpanElement;
  const gearButton = shadow.querySelector('.gear') as HTMLButtonElement;
  const closeButton = shadow.querySelector('.close') as HTMLButtonElement;
  const statusEl = shadow.querySelector('.status') as HTMLDivElement;
  pillEl.style.pointerEvents = 'auto';

  goButton.addEventListener('click', async () => {
    goButton.disabled = true;
    // Show a spinner inside the button alongside the text. The status row
    // gets aria-live polite so screen readers announce the new text.
    goLabelEl.innerHTML = '<span class="spinner" aria-hidden="true"></span> Filling';
    statusEl.textContent = 'Asking AI to fill the form...';
    statusEl.className = 'status';
    try {
      await opts.callbacks.onAutofill();
    } finally {
      goButton.disabled = false;
      goLabelEl.textContent = 'Autofill';
    }
  });

  gearButton.addEventListener('click', () => opts.callbacks.onSettings());

  closeButton.addEventListener('click', async () => {
    await dismissForHost();
    unmountPill();
  });

  const state: PillState = {
    hostEl,
    shadow,
    pillEl,
    goButton,
    statusEl,
    anchor,
    resizeObserver: null,
    scrollHandler: () => {
      requestAnimationFrame(() => reposition(state));
    },
  };
  activePill = state;

  reposition(state);
  window.addEventListener('scroll', state.scrollHandler, { passive: true });
  state.resizeObserver = new ResizeObserver(() => reposition(state));
  state.resizeObserver.observe(document.body);
  state.resizeObserver.observe(anchor);
}

export function unmountPill(): void {
  if (!activePill) {
    const stale = document.getElementById(PILL_HOST_ID);
    stale?.remove();
    return;
  }
  window.removeEventListener('scroll', activePill.scrollHandler);
  activePill.resizeObserver?.disconnect();
  activePill.hostEl.remove();
  activePill = null;
}

let statusClearTimer: ReturnType<typeof setTimeout> | null = null;
export function setPillStatus(
  message: string,
  kind: 'normal' | 'error' | 'success' = 'normal'
): void {
  if (!activePill) return;
  activePill.statusEl.textContent = message;
  activePill.statusEl.className = `status ${kind === 'normal' ? '' : kind}`;
  // Auto-clear success / error states so the pill returns to a neutral
  // state and a second autofill attempt is not visually blocked.
  if (statusClearTimer) clearTimeout(statusClearTimer);
  if (kind !== 'normal') {
    statusClearTimer = setTimeout(() => {
      if (activePill?.statusEl) {
        activePill.statusEl.textContent = '';
        activePill.statusEl.className = 'status';
      }
    }, 6000);
  }
}

export function isPillMounted(): boolean {
  return activePill !== null;
}
