/**
 * Autofill v2 bootstrap.
 *
 * Wires the watcher, gating, pill, serializer, and applier together. Loaded
 * as a content script on every supported ATS host (NOT linkedin.com).
 */

import { detectPlatform } from '@shared/constants/platforms';
import { shouldMountPill } from './gating';
import { createFormWatcher } from './mutation-watcher';
import { findBestForm, serializeForm } from './serializer';
import { applyAnswers, FormRacedError } from './applier';
import { mountPill, unmountPill, isPillMounted, setPillStatus } from './pill';
import { startPassiveSubmitWatcher } from '@/content/detectors/passive-submit-watcher';
import type { TFormSnapshot } from '@/ai/autofill/schema';
import type { RunAutofillResponseData } from '@/background/handlers/autofill-handlers';

let watcher: ReturnType<typeof createFormWatcher> | null = null;

async function getJobContext(): Promise<{
  company?: string;
  title?: string;
  description?: string;
  url?: string;
}> {
  try {
    const stored = await chrome.storage.session.get('lastJobContext');
    const ctx = stored?.lastJobContext;
    if (ctx) {
      return {
        company: ctx.companyName,
        title: ctx.jobTitle,
        description: ctx.jobDescription,
        url: ctx.url,
      };
    }
  } catch {
    // session storage may be empty
  }
  return {};
}

async function runOnePassFill(form: HTMLFormElement | HTMLElement): Promise<void> {
  const platform = detectPlatform(window.location.href)?.platform || 'generic';

  let snapshot: TFormSnapshot;
  try {
    snapshot = serializeForm(form, platform);
  } catch (err) {
    setPillStatus(`Could not read form: ${(err as Error).message}`, 'error');
    return;
  }

  if (snapshot.fields.length === 0) {
    setPillStatus('No fillable fields detected', 'error');
    return;
  }

  setPillStatus(`Asking AI to fill ${snapshot.fields.length} fields...`);

  const jobContext = await getJobContext();

  let response: { success: boolean; data?: RunAutofillResponseData; error?: string };
  try {
    response = await chrome.runtime.sendMessage({
      type: 'RUN_AUTOFILL',
      payload: { snapshot, jobContext },
    });
  } catch (err) {
    setPillStatus(`Extension error: ${(err as Error).message}`, 'error');
    return;
  }

  if (!response?.success || !response.data) {
    setPillStatus(response?.error ?? 'Autofill failed', 'error');
    return;
  }

  const { response: aiResponse, answered, skipped, hadRefusals, research } = response.data;

  let applyResult;
  try {
    applyResult = applyAnswers(form, snapshot, aiResponse);
  } catch (err) {
    if (err instanceof FormRacedError) {
      // Form changed mid-fill. Re-serialize and try once more.
      try {
        const fresh = serializeForm(form, platform);
        applyResult = applyAnswers(form, fresh, aiResponse);
      } catch (retryErr) {
        setPillStatus(`Form changed during fill: ${(retryErr as Error).message}`, 'error');
        return;
      }
    } else {
      setPillStatus(`Apply failed: ${(err as Error).message}`, 'error');
      return;
    }
  }

  const tierNote = research.tier === 1 ? '' : ` (research tier ${research.tier})`;
  if (applyResult.errors.length > 0) {
    setPillStatus(
      `Filled ${applyResult.written}/${snapshot.fields.length}${tierNote}, review purple fields`,
      'success'
    );
  } else if (hadRefusals) {
    setPillStatus(`Filled ${answered} fields${tierNote}, ${skipped} need your input`, 'success');
  } else {
    setPillStatus(`Filled ${applyResult.written} fields${tierNote}`, 'success');
  }

  console.log('[AutofillV2] Done', { answered, skipped, hadRefusals, applyResult });
}

function openSettings(): void {
  chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }).catch(() => {
    // Background may not handle this; just no-op.
  });
}

async function evaluateAndMount(): Promise<void> {
  const gate = await shouldMountPill();
  if (!gate.allowed) {
    if (isPillMounted()) unmountPill();
    return;
  }
  if (isPillMounted()) return;

  const form = findBestForm();
  if (!form) return;

  // Try to read the active role label from session storage so the pill shows
  // "Tailored for: Senior Backend" instead of a generic label.
  let roleLabel = 'this role';
  let initials = 'A';
  try {
    const stored = await chrome.storage.local.get(['activeRoleLabel', 'profileInitials']);
    if (stored.activeRoleLabel) roleLabel = stored.activeRoleLabel;
    if (stored.profileInitials) initials = stored.profileInitials;
  } catch {
    // best effort
  }

  mountPill(form, {
    roleLabel,
    initials,
    callbacks: {
      onAutofill: () => runOnePassFill(form),
      onSettings: openSettings,
    },
  });
}

function init(): void {
  if (watcher) return;
  watcher = createFormWatcher(() => {
    evaluateAndMount().catch((err) => console.warn('[AutofillV2] mount eval failed:', err));
  });
  watcher.start();

  // Workstream 4 Tier 2: passive submission detection. Watches for the user
  // touching a form on the page and then a confirmation page rendering.
  // Saves the application to the tracker without requiring autofill usage.
  // Hard-bans linkedin.com internally.
  startPassiveSubmitWatcher();

  // Re-evaluate on URL changes (SPAs).
  //
  // Dedup: src/content/index.ts already runs a single MutationObserver
  // that walks document.body for URL changes and dispatches an
  // `applysharp:url-change` CustomEvent. We listen for that here instead
  // of mounting a second subtree observer. A heavy ATS page (Workday,
  // Wellfound modal mounts) was previously paying the cost of TWO
  // mutation walks per DOM change. The fallback observer below only
  // attaches if the v1 script never fires within 2 seconds (e.g. on a
  // page that v1 bailed out of as not-a-job-page).
  let lastUrl = window.location.href;
  let v1Heard = false;
  const onUrlChange = (): void => {
    v1Heard = true;
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      unmountPill();
      setTimeout(() => evaluateAndMount(), 500);
    }
  };
  window.addEventListener('applysharp:url-change', onUrlChange);

  setTimeout(() => {
    if (v1Heard) return;
    const urlObserver = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        unmountPill();
        setTimeout(() => evaluateAndMount(), 500);
      }
    });
    urlObserver.observe(document.body, { childList: true, subtree: true });
  }, 2000);

  // Power user: Cmd+Shift+F triggers fill without mouse.
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'F') {
      const form = findBestForm();
      if (form) {
        e.preventDefault();
        runOnePassFill(form);
      }
    }
  });

  // Backwards compatibility: the legacy ATS-score sidebar's "Autofill"
  // button still dispatches START_AUTOFILL via chrome.runtime.sendMessage.
  // The v1 handler is gone after the cutover, so v2 listens for the same
  // message and runs the one-pass fill instead.
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'START_AUTOFILL') {
        const form = findBestForm();
        if (form) {
          runOnePassFill(form)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
          return true; // async sendResponse
        }
        sendResponse({ success: false, error: 'No fillable form detected on this page' });
        return false;
      }
      return false;
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
