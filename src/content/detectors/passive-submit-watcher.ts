/**
 * Tier-2 passive submission watcher (Workstream 4 auto-detection).
 *
 * Sits alongside the v2 autofill content script on every supported ATS host.
 * Watches for two signals that the user just submitted an application:
 *
 *   1. Form interaction: any input/change event in a <form> sets a flag
 *      saying "the user touched this form". Without the flag, a confirmation
 *      page that loads independently (e.g. a marketing page that happens to
 *      contain "Thank you for applying") would not trigger detection.
 *
 *   2. Confirmation text: a scoped MutationObserver watches the per-platform
 *      container selectors (or document.body fallback) for textPatterns from
 *      src/content/detectors/confirmation-detectors.ts. URL-pattern checks
 *      run on history.pushState (same-origin monkey-patch, no chrome.history
 *      permission needed) and on popstate.
 *
 * When BOTH signals fire, the watcher sends an APPLICATION_SUBMIT_DETECTED
 * message to the background. The background handler creates an Application
 * record with autoDetected.tier = 2 and the matched signal text. Throttled
 * to fire at most once per page load.
 *
 * Tier 1 (autofill path) lives in the v2 autofill code itself - when
 * runOnePassFill completes successfully, it sends APPLICATION_SUBMIT_DETECTED
 * with tier = 1.
 *
 * Tier 3 (prompt to confirm) is a future addition: if formInteractedFlag is
 * true but no Tier 1 or Tier 2 fired and the user navigates away, show a
 * side-panel toast asking "Did you submit this?". Not in this commit.
 */

import { matchConfirmationRule, type ConfirmationMatch } from './confirmation-detectors';

let formInteractedFlag = false;
let alreadyFired = false;
let observer: MutationObserver | null = null;
let urlListenerInstalled = false;

const INTERACTION_DEBOUNCE_MS = 250;
let interactionDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function markFormInteraction(): void {
  if (interactionDebounceTimer) clearTimeout(interactionDebounceTimer);
  interactionDebounceTimer = setTimeout(() => {
    formInteractedFlag = true;
  }, INTERACTION_DEBOUNCE_MS);
}

function tryFire(reason: 'mutation' | 'navigation'): void {
  if (alreadyFired) return;
  if (!formInteractedFlag) return;

  const match = matchConfirmationRule(window.location, document);
  if (!match) return;

  alreadyFired = true;
  sendDetection(match, reason);
}

function sendDetection(match: ConfirmationMatch, reason: 'mutation' | 'navigation'): void {
  // Send to background. The handler creates an Application record with
  // autoDetected.tier = 2. Best effort; never throws.
  try {
    chrome.runtime
      .sendMessage({
        type: 'APPLICATION_SUBMIT_DETECTED',
        payload: {
          tier: 2 as const,
          platform: match.platform,
          signal: match.signal,
          url: window.location.href,
          reason,
        },
      })
      .catch(() => {
        // Background may be reloading; silent.
      });
  } catch {
    // chrome.runtime may be invalidated after extension reload
  }
}

function startObserver(): void {
  if (observer) return;

  // Find the first matching rule's containerSelectors so we can scope the
  // observer to a smaller subtree than document.body.
  const rule = matchConfirmationRule(window.location, document);
  let target: Element = document.body;
  if (rule?.rule?.containerSelectors) {
    for (const sel of rule.rule.containerSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        target = el;
        break;
      }
    }
  }

  observer = new MutationObserver(() => tryFire('mutation'));
  observer.observe(target, { childList: true, subtree: true, characterData: true });

  // Fire once immediately for confirmation pages already rendered at script
  // load time (the alternative is missing them because no mutations follow).
  tryFire('mutation');
}

function installUrlListener(): void {
  if (urlListenerInstalled) return;
  urlListenerInstalled = true;

  // Same-origin pushState monkey-patch. Avoids the chrome.history permission
  // (which is a Chrome Web Store reviewer flag and is not actually needed
  // for our use case; we only care about navigation on the current tab).
  const originalPushState = history.pushState.bind(history);
  history.pushState = function patchedPushState(...args: Parameters<typeof history.pushState>) {
    const result = originalPushState(...args);
    setTimeout(() => tryFire('navigation'), 100);
    return result;
  };

  window.addEventListener('popstate', () => {
    setTimeout(() => tryFire('navigation'), 100);
  });
}

function installInteractionListeners(): void {
  document.addEventListener('input', markFormInteraction, { capture: true, passive: true });
  document.addEventListener('change', markFormInteraction, { capture: true, passive: true });
  // Submit is the strongest signal: if the user actually submitted the form,
  // we set the flag immediately AND try to fire (in case the confirmation
  // text was already rendered before submit fired).
  document.addEventListener(
    'submit',
    () => {
      formInteractedFlag = true;
      // Wait one tick for the page to render any post-submit confirmation.
      setTimeout(() => tryFire('mutation'), 250);
    },
    { capture: true }
  );
}

/**
 * Strict LinkedIn host check. The previous version used
 * `host.endsWith('linkedin.com')` which is bypassable by a hostname like
 * `evilfakelinkedin.com`. This version requires the host to BE
 * linkedin.com or end with `.linkedin.com`. Used as the LinkedIn
 * fingerprinting hard ban so the strictness matters.
 */
function isLinkedInHost(host: string): boolean {
  return host === 'linkedin.com' || host.endsWith('.linkedin.com');
}

/**
 * Bootstrap. Called from src/content/autofill/v2/index.ts so the watcher
 * shares the v2 content script's lifecycle and host gating.
 */
export function startPassiveSubmitWatcher(): void {
  if (isLinkedInHost(window.location.hostname)) {
    // Hard ban: no DOM observation on linkedin.com per the P0 fingerprint fix.
    return;
  }
  installInteractionListeners();
  installUrlListener();
  startObserver();
}

/** For tests / cleanup. */
export function _resetPassiveSubmitWatcher(): void {
  formInteractedFlag = false;
  alreadyFired = false;
  observer?.disconnect();
  observer = null;
  if (interactionDebounceTimer) {
    clearTimeout(interactionDebounceTimer);
    interactionDebounceTimer = null;
  }
}
