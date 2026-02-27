import { detectPlatform, looksLikeJobUrl } from '@shared/constants/platforms';
import { createDetector } from './detectors';
import { showSidebar, hideSidebar, updateATSScore } from './ui/sidebar';
import { detectFormFields } from './autofill/form-detector';
import { generateFillPreview, fillForm, highlightFilledFields } from './autofill/filler';
import { detectJobPage } from './detectors/job-heuristics';
import { escapeHtml } from '@shared/utils/dom-utils';
import type { ExtractedJob, JobPlatform } from '@shared/types/job.types';
import type { ResumeProfile } from '@shared/types/profile.types';

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
        console.log('[ApplySharp] Not a job page (confidence:', jobSignals.confidence, '%)');
        return;
      }

      console.log('[ApplySharp] Detected job page via heuristics:', {
        confidence: jobSignals.confidence,
        signals: jobSignals.signals.slice(0, 3),
      });
    }

    // Use generic platform
    platformType = 'generic';
    console.log('[ApplySharp] Using generic detection for:', window.location.hostname);
  } else {
    console.log(`[ApplySharp] Detected ${platform.name} job page`);
  }

  const detector = createDetector(platformType);
  if (!detector) {
    console.log('[ApplySharp] No detector for platform:', platformType);
    return;
  }

  // Wait for page to fully load
  await waitForElement(detector.getMainSelector(), 3000);

  // Extract job data
  try {
    currentJob = await detector.extract();

    // Validate extraction - need at least a title and some description
    if (!currentJob.title || currentJob.title === 'Unknown Title') {
      console.log('[ApplySharp] Could not extract job title, skipping');
      return;
    }

    if (!currentJob.description || currentJob.description.length < 100) {
      console.log('[ApplySharp] Job description too short, might not be a job page');
      return;
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
      console.log('[ApplySharp] Stored job context for autofill');
    } catch (e) {
      console.log('[ApplySharp] Could not store job context:', e);
    }

    // Show the sidebar
    showSidebar(currentJob, platformType);

    // Notify background script
    chrome.runtime.sendMessage({
      type: 'JOB_DETECTED',
      payload: {
        ...currentJob,
        url,
        platform: platformType,
      },
    }).catch((error) => {
      // Extension context may be invalidated after update
      console.log('[ApplySharp] Could not notify background:', error?.message || 'Extension context invalidated');
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
      console.log('[ApplySharp] No active profile for auto-analysis');
      // Show message in sidebar
      if (sidebar) {
        const matchedEl = sidebar.querySelector('#jp-matched-keywords');
        if (matchedEl) {
          matchedEl.innerHTML = '<span class="jp-tag jp-tag-placeholder">Upload resume first</span>';
        }
      }
      return;
    }

    // Update sidebar to show loading state
    updateATSScoreLoading();

    // Log job info for debugging
    console.log('[ApplySharp] Analyzing job:');
    console.log('  - Title:', currentJob.title);
    console.log('  - Company:', currentJob.company);
    console.log('  - Description length:', currentJob.description?.length || 0);
    if (currentJob.description && currentJob.description.length < 100) {
      console.log('  - WARNING: Description too short! Content:', currentJob.description);
    }

    // Use the background script's layered ATS scorer
    const platform = detectPlatform(window.location.href);
    const response = await chrome.runtime.sendMessage({
      type: 'ANALYZE_JOB',
      payload: { job: currentJob, platform: platform?.platform || 'generic' },
    });

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
        matchedEl.innerHTML = '<span class="jp-tag jp-tag-placeholder" style="color: #ef4444;">Error - try Re-analyze</span>';
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

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Ignore messages not intended for content script
  if (!message?.type) {
    return false;
  }

  switch (message.type) {
    case 'SAVE_CURRENT_JOB':
      if (currentJob) {
        chrome.runtime.sendMessage({
          type: 'SAVE_JOB',
          payload: {
            ...currentJob,
            url: window.location.href,
            platform: detectPlatform(window.location.href)?.platform || 'generic',
          },
        }).then(sendResponse).catch(() => sendResponse({ success: false, error: 'Failed to save' }));
        return true;
      }
      sendResponse({ success: false, error: 'No job detected' });
      return false;

    case 'ANALYZE_JOB':
      handleAnalyzeJob(message.payload)
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'START_AUTOFILL':
      handleAutofill(message.payload?.profile)
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'PREVIEW_AUTOFILL':
      handlePreviewAutofill(message.payload?.profile)
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'TOGGLE_SIDEBAR':
      if (currentJob) {
        const sidebar = document.getElementById('applysharp-sidebar');
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
      autoAnalyzeIfReady();
      sendResponse({ success: true });
      return false;

    default:
      // Unknown message type - don't handle it
      return false;
  }
});

async function handleAnalyzeJob(payload: { job: ExtractedJob }): Promise<{ success: boolean; data?: unknown; error?: string }> {
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

async function handleAutofill(profile?: ResumeProfile): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    // Get profile if not provided
    if (!profile) {
      const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_PROFILE' });
      if (!response?.success || !response.data) {
        return { success: false, error: 'No profile found. Please set up your profile first.' };
      }
      profile = response.data as ResumeProfile;
    }

    // Detect form fields
    const form = detectFormFields();
    if (form.fields.length === 0) {
      return { success: false, error: 'No form fields detected on this page.' };
    }

    // Fill the form
    const result = await fillForm(form, profile);

    if (result.success) {
      // Highlight filled fields
      highlightFilledFields(result.filledFields);
    }

    return {
      success: result.success,
      data: {
        filledCount: result.filledFields.length,
        skippedCount: result.skippedFields.length,
        errors: result.errors,
      },
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handlePreviewAutofill(profile?: ResumeProfile): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    // Get profile if not provided
    if (!profile) {
      const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_PROFILE' });
      if (!response?.success || !response.data) {
        return { success: false, error: 'No profile found. Please set up your profile first.' };
      }
      profile = response.data as ResumeProfile;
    }

    // Detect form fields
    const form = detectFormFields();
    if (form.fields.length === 0) {
      return { success: false, error: 'No form fields detected on this page.' };
    }

    // Generate preview
    const preview = generateFillPreview(form, profile);

    return { success: true, data: preview };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Re-check on URL changes (for SPAs like LinkedIn)
let lastUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    isInitialized = false;
    hideSidebar();
    currentJob = null;

    // Small delay to let the page update
    setTimeout(init, 500);
  }
});

urlObserver.observe(document.body, {
  childList: true,
  subtree: true,
});

// Listen for window messages from autofill content script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data?.type === 'JP_GET_CURRENT_JOB' && event.data?.messageId) {
    window.postMessage({
      type: 'JP_CURRENT_JOB_RESPONSE',
      messageId: event.data.messageId,
      job: currentJob ? {
        title: currentJob.title,
        company: currentJob.company,
        description: currentJob.description,
      } : null,
    }, '*');
  }
});
