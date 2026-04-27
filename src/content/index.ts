import { detectPlatform, looksLikeJobUrl } from '@shared/constants/platforms';
import { createDetector } from './detectors';
import { showSidebar, hideSidebar, updateATSScore, updateGhostScore } from './ui/sidebar';
import { detectJobPage } from './detectors/job-heuristics';
import { extractJobWithAI } from './detectors/ai-fallback';
import { escapeHtml } from '@shared/utils/dom-utils';
import type { ExtractedJob, JobPlatform } from '@shared/types/job.types';
import type { ResumeProfile } from '@shared/types/profile.types';
// NOTE: The v1 autofill imports (detectFormFields, generateFillPreview,
// fillForm, highlightFilledFields) were removed in the cutover commit. The
// v2 path lives in src/content/autofill/v2/ and is loaded as a separate
// content script entry; START_AUTOFILL messages are now handled by
// src/content/autofill/v2/index.ts.

// Cross-injection load guard. The sidebar IIFE is re-injected by the
// background on every LinkedIn SPA navigation (chrome.scripting.executeScript
// from maybeInjectLinkedInFloatingButton). Without this guard the message
// listener stacks (one extra firing per re-injection) AND a new overlay
// mounts on top of the prior one, so after 3 in-app clicks you see 3
// stacked sidebars and every message handler runs 3 times. The Symbol
// lives on the page's isolated-world globalThis which is shared across
// re-injections, so the second injection sees the flag and bails on the
// side-effectful setup at the bottom of this file.
const APSH_CONTENT_LOAD_GUARD = Symbol.for('apsh.content.bootstrap');
const apshAlreadyLoaded =
  (globalThis as unknown as Record<symbol, boolean>)[APSH_CONTENT_LOAD_GUARD] === true;
(globalThis as unknown as Record<symbol, boolean>)[APSH_CONTENT_LOAD_GUARD] = true;

let currentJob: ExtractedJob | null = null;
let currentProfile: ResumeProfile | null = null;
let isInitialized = false;

async function init() {
  if (isInitialized) return;
  isInitialized = true;

  const url = window.location.href;

  // First, try to detect a known platform
  const platform = detectPlatform(url);
  let platformType: JobPlatform = platform?.platform || 'generic';

  // If no known platform, check if it looks like a job page
  if (!platform) {
    // Quick URL check first (faster)
    if (!looksLikeJobUrl(url)) {
      // Not a job URL, do a deeper check with heuristics
      const jobSignals = detectJobPage();

      if (!jobSignals.isJobPage) {
        console.debug('[ApplySharp] Not a job page (confidence:', jobSignals.confidence, '%)');
        return;
      }

      console.debug('[ApplySharp] Detected job page via heuristics:', {
        confidence: jobSignals.confidence,
        signals: jobSignals.signals.slice(0, 3),
      });
    }

    // Use generic platform
    platformType = 'generic';
    console.debug('[ApplySharp] Using generic detection for:', window.location.hostname);
  } else {
    console.log(`[ApplySharp] Detected ${platform.name} job page`);
  }

  const detector = createDetector(platformType);
  if (!detector) {
    console.debug('[ApplySharp] No detector for platform:', platformType);
    return;
  }

  // Wait for page to fully load
  await waitForElement(detector.getMainSelector(), 3000);

  // Extract job data
  try {
    currentJob = await detector.extract();

    // Validate extraction - if platform detector fails, try AI fallback
    const needsFallback =
      !currentJob.title ||
      currentJob.title === 'Unknown Title' ||
      !currentJob.description ||
      currentJob.description.length < 100;

    if (needsFallback) {
      console.debug('[ApplySharp] Platform detector insufficient, trying AI fallback...');
      const aiResult = await extractJobWithAI(url);
      if (aiResult) {
        currentJob = aiResult;
        console.log('[ApplySharp] AI fallback succeeded:', currentJob.title);
      } else {
        // AI also failed — check original extraction
        if (!currentJob.title || currentJob.title === 'Unknown Title') {
          console.debug('[ApplySharp] Could not extract job title, skipping');
          return;
        }
        if (!currentJob.description || currentJob.description.length < 100) {
          console.debug('[ApplySharp] Job description too short, might not be a job page');
          return;
        }
      }
    }

    console.log('[ApplySharp] Extracted job:', currentJob.title, 'at', currentJob.company);

    // Store job context for autofill (persists during navigation to application form)
    try {
      await chrome.storage.session.set({
        lastJobContext: {
          jobTitle: currentJob.title,
          companyName: currentJob.company,
          jobDescription: currentJob.description,
          url: url,
          timestamp: Date.now(),
        },
      });
      console.debug('[ApplySharp] Stored job context for autofill');
    } catch (e) {
      console.log('[ApplySharp] Could not store job context:', e);
    }

    // LinkedIn note: this content script reaches LinkedIn ONLY via two
    // gated paths:
    //   1. Manifest content_scripts (NOT registered for linkedin.com per
    //      the Apr 2026 fingerprint commit 25d9ba2). Default-install
    //      users have ZERO LinkedIn surface via this path.
    //   2. chrome.scripting.executeScript({files: ['assets/sidebar-iife.js']})
    //      from background/index.ts:maybeInjectLinkedInFloatingButton.
    //      Only fires when the user has explicitly enabled
    //      linkedin.injectFloatingButton via the warning dialog in
    //      Options. The IIFE bundle is built by scripts/build-sidebar-iife.mjs
    //      as a self-contained file with no dynamic imports, so it does
    //      not need web_accessible_resources for linkedin.com.
    //
    // When path 2 fires on linkedin.com, this very same init() runs in
    // the page's isolated world, detects the LinkedIn platform, extracts
    // the job, and calls showSidebar - exactly the same code path that
    // runs on Wellfound/Greenhouse/Lever/Ashby/etc. ONE codebase, ONE UI.
    showSidebar(currentJob, platformType);

    // Notify background script
    chrome.runtime
      .sendMessage({
        type: 'JOB_DETECTED',
        payload: {
          ...currentJob,
          url,
          platform: platformType,
        },
      })
      .catch((error) => {
        // Extension context may be invalidated after update
        console.log(
          '[ApplySharp] Could not notify background:',
          error?.message || 'Extension context invalidated'
        );
      });

    // Auto-analyze if we have a profile
    autoAnalyzeIfReady();
  } catch (error) {
    console.error('[ApplySharp] Failed to extract job:', error);
  }
}

async function autoAnalyzeIfReady() {
  if (!currentJob) return;

  const sidebar = document.getElementById('applysharp-overlay');

  try {
    // Check if we have an active master profile
    const profileResponse = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_MASTER_PROFILE' });
    if (!profileResponse?.success || !profileResponse.data) {
      console.debug('[ApplySharp] No active profile for auto-analysis');
      // Show message in sidebar
      if (sidebar) {
        const matchedEl = sidebar.querySelector('#jp-matched-keywords');
        if (matchedEl) {
          matchedEl.innerHTML =
            '<span class="jp-tag jp-tag-placeholder">Upload resume first</span>';
        }
      }
      return;
    }

    // Update sidebar to show loading state
    updateATSScoreLoading();

    // Log job info for debugging
    console.debug('[ApplySharp] Analyzing job:');
    console.debug('  - Title:', currentJob.title);
    console.debug('  - Company:', currentJob.company);
    console.debug('  - Description length:', currentJob.description?.length || 0);
    if (currentJob.description && currentJob.description.length < 100) {
      console.log('  - WARNING: Description too short! Content:', currentJob.description);
    }

    // Run ATS scoring AND ghost detection in parallel - both calls are
    // independent and the user wants to see both as fast as possible.
    const platform = detectPlatform(window.location.href);
    const [atsRes, ghostRes] = await Promise.allSettled([
      chrome.runtime.sendMessage({
        type: 'ANALYZE_JOB',
        payload: { job: currentJob, platform: platform?.platform || 'generic' },
      }),
      chrome.runtime.sendMessage({
        type: 'SCORE_GHOST_JOB',
        payload: { job: currentJob, phase: 'cheap' },
      }),
    ]);

    // Render ghost score independently of ATS - one failing should not
    // hide the other. The ghost render is a no-op if the sidebar does
    // not have the ghost slot rendered yet (graceful degradation for
    // any in-flight UI variant).
    if (ghostRes.status === 'fulfilled' && ghostRes.value?.success && ghostRes.value.data) {
      try {
        updateGhostScore(ghostRes.value.data);
      } catch (err) {
        console.debug('[ApplySharp] updateGhostScore failed:', err);
      }
    }

    const response = atsRes.status === 'fulfilled' ? atsRes.value : null;
    if (response?.success && response.data) {
      updateATSScore(response.data);
      console.log('[ApplySharp] Auto-analyzed job:', response.data.overallScore);
    } else {
      console.log('[ApplySharp] Auto-analysis returned no data:', response?.error);
      // Show error in sidebar
      if (sidebar) {
        const matchedEl = sidebar.querySelector('#jp-matched-keywords');
        const scoreEl = sidebar.querySelector('#jp-ats-score');
        const analyzeBtn = sidebar.querySelector('#jp-analyze-btn') as HTMLButtonElement;
        if (matchedEl) {
          matchedEl.innerHTML = `<span class="jp-tag jp-tag-placeholder" style="color: #f59e0b;">${escapeHtml(response?.error || 'Try clicking Re-analyze')}</span>`;
        }
        if (scoreEl) {
          scoreEl.textContent = '--';
        }
        if (analyzeBtn) {
          analyzeBtn.textContent = 'Re-analyze';
          analyzeBtn.disabled = false;
        }
      }
    }
  } catch (error) {
    console.error('[ApplySharp] Failed to auto-analyze:', error);
    // Show error in sidebar
    if (sidebar) {
      const matchedEl = sidebar.querySelector('#jp-matched-keywords');
      const analyzeBtn = sidebar.querySelector('#jp-analyze-btn') as HTMLButtonElement;
      if (matchedEl) {
        matchedEl.innerHTML =
          '<span class="jp-tag jp-tag-placeholder" style="color: #ef4444;">Error - try Re-analyze</span>';
      }
      if (analyzeBtn) {
        analyzeBtn.textContent = 'Re-analyze';
        analyzeBtn.disabled = false;
      }
    }
  }
}

function updateATSScoreLoading() {
  const sidebar = document.getElementById('applysharp-overlay');
  if (!sidebar) return;

  const scoreEl = sidebar.querySelector('#jp-ats-score');
  const matchedEl = sidebar.querySelector('#jp-matched-keywords');
  const missingEl = sidebar.querySelector('#jp-missing-keywords');
  const analyzeBtn = sidebar.querySelector('#jp-analyze-btn') as HTMLButtonElement;

  if (scoreEl) {
    scoreEl.textContent = '...';
  }
  if (matchedEl) {
    matchedEl.innerHTML = '<span class="jp-tag jp-tag-placeholder">Analyzing...</span>';
  }
  if (missingEl) {
    missingEl.innerHTML = '';
  }
  if (analyzeBtn) {
    analyzeBtn.textContent = 'Analyzing...';
    analyzeBtn.disabled = true;
  }
}

function waitForElement(selector: string, timeout = 5000): Promise<Element | null> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

// Listen for messages from background/popup. Guarded so a re-injection
// does not stack additional listeners (each one would also fire on every
// message, multiplying handler runs by the number of injections).
if (!apshAlreadyLoaded)
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Ignore messages not intended for content script
    if (!message?.type) {
      return false;
    }

    switch (message.type) {
      case 'SAVE_CURRENT_JOB':
        if (currentJob) {
          chrome.runtime
            .sendMessage({
              type: 'SAVE_JOB',
              payload: {
                ...currentJob,
                url: window.location.href,
                platform: detectPlatform(window.location.href)?.platform || 'generic',
              },
            })
            .then(sendResponse)
            .catch(() => sendResponse({ success: false, error: 'Failed to save' }));
          return true;
        }
        sendResponse({ success: false, error: 'No job detected' });
        return false;

      case 'ANALYZE_JOB':
        handleAnalyzeJob(message.payload)
          .then(sendResponse)
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;

      case 'EXTRACT_CONTACTS_FOR_JOB': {
        // Workstream 10: race-free contact extraction triggered by the
        // background after JOB_DETECTED persists. Lazy-imports the
        // contact extractor module so non-job pages on supported
        // platforms never pay the cost of loading email/phone/anchor
        // walker code. Hard-bans linkedin.com (popup capture only).
        const jobId = (message.payload as { jobId?: string } | undefined)?.jobId;
        if (!jobId) {
          sendResponse({ success: false, error: 'jobId required' });
          return false;
        }
        const host = window.location.hostname;
        if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
          sendResponse({ success: false, error: 'LinkedIn passive extraction is hard-banned' });
          return false;
        }
        void import('./detectors/contact-extractor')
          .then(({ runContactExtractionForJob }) => runContactExtractionForJob(jobId))
          .then(() => sendResponse({ success: true }))
          .catch((err) => {
            console.warn('[ApplySharp] contact extractor lazy-load failed:', err);
            sendResponse({ success: false, error: err?.message ?? 'extractor failed' });
          });
        return true; // async sendResponse
      }

      case 'ANALYZE_CURRENT_JOB':
        if (currentJob) {
          // SAFETY: do not inject sidebar on linkedin.com (extension fingerprinting)
          if (
            !(
              window.location.hostname === 'linkedin.com' ||
              window.location.hostname.endsWith('.linkedin.com')
            )
          ) {
            showSidebar(currentJob, detectPlatform(window.location.href)?.platform || 'generic');
          }
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'No job detected on this page' });
        }
        return false;

      // START_AUTOFILL and PREVIEW_AUTOFILL are now handled by the v2 content
      // script at src/content/autofill/v2/index.ts. The message is forwarded
      // to the active tab by the background, and BOTH content scripts (v1
      // ATS-score and v2 autofill) receive it. We deliberately do NOT handle
      // it here so the v2 listener takes responsibility for the response.
      // Returning false (no-op) lets v2's listener answer.

      case 'TOGGLE_SIDEBAR':
        if (currentJob) {
          // SAFETY: never mount the sidebar on linkedin.com
          if (
            window.location.hostname === 'linkedin.com' ||
            window.location.hostname.endsWith('.linkedin.com')
          ) {
            sendResponse({
              success: false,
              error: 'Sidebar disabled on LinkedIn for account safety',
            });
            return false;
          }
          const sidebar = document.getElementById('applysharp-overlay');
          if (sidebar) {
            hideSidebar();
          } else {
            showSidebar(currentJob, detectPlatform(window.location.href)?.platform || 'generic');
          }
        }
        sendResponse({ success: true });
        return false;

      case 'GET_CURRENT_JOB':
        sendResponse({ success: true, data: currentJob });
        return false;

      case 'GET_CONTENT_STATE':
        sendResponse({ success: true, data: { currentJob, currentProfile } });
        return false;

      case 'UPDATE_PROFILE':
        currentProfile = message.payload;
        autoAnalyzeIfReady().catch((err) =>
          console.error('[ApplySharp] Auto-analyze failed after profile update:', err)
        );
        sendResponse({ success: true });
        return false;

      default:
        // Unknown message type - don't handle it
        return false;
    }
  });

async function handleAnalyzeJob(payload: {
  job: ExtractedJob;
}): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const job = payload?.job || currentJob;
    if (!job) {
      return { success: false, error: 'No job to analyze' };
    }

    // Show loading state
    updateATSScoreLoading();

    // Delegate to background script's layered ATS scorer
    const platform = detectPlatform(window.location.href);
    const response = await chrome.runtime.sendMessage({
      type: 'ANALYZE_JOB',
      payload: { job, platform: platform?.platform || 'generic' },
    });

    if (response?.success && response.data) {
      updateATSScore(response.data);
      return { success: true, data: response.data };
    } else {
      return { success: false, error: response?.error || 'Analysis failed' };
    }
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// handleAutofill and handlePreviewAutofill were removed in the cutover
// commit. The v1 per-field path (form-detector + filler + autofill-sidebar)
// is gone. The v2 path at src/content/autofill/v2/ now owns START_AUTOFILL
// via its own chrome.runtime.onMessage listener and the in-page pill UI.

// Initialize when DOM is ready. Guarded by APSH_CONTENT_LOAD_GUARD so a
// re-injection on the same tab does not run init() a second time (which
// would attach duplicate observers and stack a second overlay).
if (apshAlreadyLoaded) {
  console.debug('[ApplySharp] content script already bootstrapped on this tab; skipping init');
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Re-check on URL changes (for SPAs like LinkedIn).
// This single observer is the source of truth for URL changes; the v2 autofill
// content script (src/content/autofill/v2/index.ts) listens for the
// `applysharp:url-change` CustomEvent we dispatch below instead of running its
// own duplicate MutationObserver. Two MutationObservers walking the entire
// subtree on every DOM mutation was wasted work on heavy ATS pages.
let lastUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
  // Disconnect if extension context invalidated (after extension reload)
  if (!chrome.runtime?.id) {
    urlObserver.disconnect();
    return;
  }

  if (window.location.href !== lastUrl) {
    const previous = lastUrl;
    lastUrl = window.location.href;
    isInitialized = false;
    hideSidebar();
    currentJob = null;

    try {
      window.dispatchEvent(
        new CustomEvent('applysharp:url-change', {
          detail: { from: previous, to: lastUrl },
        })
      );
    } catch {
      // CustomEvent may not be available in very old runtimes; harmless.
    }

    // Small delay to let the page update
    setTimeout(init, 500);
  }
});

// Guarded so a re-injection does not attach a second urlObserver walking
// the entire DOM subtree on every mutation (cumulative CPU drain).
if (!apshAlreadyLoaded)
  urlObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

// Listen for window messages from autofill content script. Guarded so a
// re-injection does not stack postMessage handlers; without this every
// JP_GET_CURRENT_JOB request gets answered N times after N injections.
if (!apshAlreadyLoaded)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data?.type === 'JP_GET_CURRENT_JOB' && event.data?.messageId) {
      window.postMessage(
        {
          type: 'JP_CURRENT_JOB_RESPONSE',
          messageId: event.data.messageId,
          job: currentJob
            ? {
                title: currentJob.title,
                company: currentJob.company,
                description: currentJob.description,
              }
            : null,
        },
        window.location.origin
      );
    }
  });
