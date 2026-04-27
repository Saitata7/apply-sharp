/**
 * Styles for the autofill pill, served as a string for shadow DOM injection.
 *
 * Uses :host { all: initial; } to escape the host page's CSS reset (Workday
 * and Greenhouse will absolutely clobber a naked div with their global styles
 * if we don't isolate). Plain CSS, no Tailwind, no preprocessor.
 */

export const PILL_CSS = `
:host {
  all: initial;
  position: absolute;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  color: #fff;
  pointer-events: auto;
}

.pill {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #0f1419;
  border: 1px solid #2a3441;
  border-radius: 999px;
  padding: 8px 12px 8px 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  min-width: 280px;
  /* Cap the pill so it does not overflow narrow ATS panes (Workday left
   * navigation, Lever sidebar). The flex children inside (.label) already
   * use ellipsis on overflow, so capping the container is safe. */
  max-width: min(420px, calc(100vw - 32px));
  height: 44px;
  box-sizing: border-box;
}

.thumb {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #1a2332;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: #c4d2e6;
}

/* Visible keyboard shortcut hint inside the pill so users discover the
 * Cmd+Shift+F shortcut without hovering for a tooltip. */
.kbd {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  margin-left: 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'SFMono-Regular', monospace;
  font-size: 10px;
  font-weight: 600;
  color: #c4d2e6;
  background: #1a2332;
  border: 1px solid #2a3441;
  border-radius: 4px;
  vertical-align: 1px;
}

.label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #d5e0ed;
  font-size: 13px;
  font-weight: 500;
}

.go {
  background: linear-gradient(180deg, #f59e0b 0%, #d97706 100%);
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  /* Cap the autofill button so the kbd hint plus label do not blow the
   * pill out on narrow ATS panes. flex-shrink: 0 so it never collapses
   * below its readable width when the .label sibling has long role text. */
  max-width: 180px;
  flex-shrink: 0;
}

.go:hover {
  filter: brightness(1.1);
}

.go:focus-visible {
  outline: 2px solid #fbbf24;
  outline-offset: 2px;
}

.go:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.gear, .close {
  background: transparent;
  color: #c4d2e6;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  line-height: 1;
  border-radius: 4px;
}

.gear:hover, .close:hover {
  color: #fff;
  background: #1a2332;
}

.gear:focus-visible, .close:focus-visible {
  outline: 2px solid #fbbf24;
  outline-offset: 2px;
}

/* Spinner shown next to "Filling..." status text */
.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  display: inline-block;
  animation: applysharp-spin 700ms linear infinite;
  vertical-align: -2px;
}

@keyframes applysharp-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
    border-top-color: rgba(255, 255, 255, 0.35);
  }
}

.status {
  margin-top: 4px;
  font-size: 12px;
  color: #a5b8d0;
  text-align: center;
}

.error {
  color: #f87171;
}

.success {
  color: #34d399;
}
`.trim();
