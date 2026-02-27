/**
 * Universal Autofill Content Script
 * Runs on all pages to provide form detection and autofill
 * Uses JobRight-style sidebar for better UX
 */

import { detectFormFields, type DetectedForm } from './autofill/form-detector';
import { generateFillPreview, fillForm, highlightFilledFields, type FillPreview, type JobContext } from './autofill/filler';
import { showAutofillSidebar, hideAutofillSidebar } from './autofill/autofill-sidebar';
import type { ResumeProfile } from '@shared/types/profile.types';
import { escapeHtml } from '@shared/utils/dom-utils';

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'DETECT_FORM':
      handleDetectForm().then(sendResponse);
      return true;

    case 'START_AUTOFILL':
      handleAutofill(message.payload?.profile, message.payload?.showPreview).then(sendResponse);
      return true;

    case 'PREVIEW_AUTOFILL':
      handlePreviewAutofill(message.payload?.profile).then(sendResponse);
      return true;

    case 'CLOSE_PREVIEW':
      hideAutofillSidebar();
      sendResponse({ success: true });
      break;
  }
});

async function handleDetectForm(): Promise<{ success: boolean; data?: DetectedForm; error?: string }> {
  try {
    const form = detectFormFields();
    return {
      success: true,
      data: form,
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleAutofill(
  profile?: ResumeProfile,
  showPreview = true
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    // Get profile if not provided
    if (!profile) {
      let response;
      try {
        response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_PROFILE' });
      } catch (err) {
        // Extension context invalidated (after update/reload)
        showNotification('error', 'Extension was updated. Please refresh the page.');
        return { success: false, error: 'Extension context invalidated - refresh page' };
      }
      if (!response?.success || !response.data) {
        showNotification('error', 'No profile found. Please set up your profile in ApplySharp settings.');
        return { success: false, error: 'No profile found' };
      }
      profile = response.data as ResumeProfile;
    }

    // Detect form fields
    const form = detectFormFields();
    if (form.fields.length === 0) {
      showNotification('warning', 'No fillable form fields detected on this page.');
      return { success: false, error: 'No form fields detected' };
    }

    if (showPreview) {
      // Try to get job context from main content script first (more reliable)
      const mainJob = await getCurrentJobFromMainScript();

      // If main script doesn't have the job, try to get stored context (for navigation to application form)
      let storedJob: { jobTitle?: string; companyName?: string; jobDescription?: string } | null = null;
      if (!mainJob) {
        storedJob = await getStoredJobContext();
      }

      // Extract job context from page for better AI answers
      const jobContext: JobContext = {
        companyName: mainJob?.company || storedJob?.companyName || extractCompanyName(),
        jobTitle: mainJob?.title || storedJob?.jobTitle || extractJobTitle(),
        jobDescription: mainJob?.description || storedJob?.jobDescription || extractJobDescription(),
      };

      console.log('[Autofill] Job context:', {
        source: mainJob ? 'main script' : storedJob ? 'storage' : 'page extraction',
        hasDescription: !!jobContext.jobDescription,
        descriptionLength: jobContext.jobDescription?.length || 0,
      });

      // Show JobRight-style sidebar
      await showAutofillSidebar(form, profile, jobContext);
      return { success: true, data: { showingPreview: true } };
    }

    // Fill directly without preview
    const result = await fillForm(form, profile);

    if (result.success) {
      highlightFilledFields(result.filledFields);
      showNotification('success', `Filled ${result.filledFields.length} fields successfully!`);
    } else {
      showNotification('warning', `Filled ${result.filledFields.length} fields. ${result.errors.join(', ')}`);
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
    showNotification('error', (error as Error).message);
    return { success: false, error: (error as Error).message };
  }
}

async function handlePreviewAutofill(
  profile?: ResumeProfile
): Promise<{ success: boolean; data?: FillPreview; error?: string }> {
  try {
    if (!profile) {
      let response;
      try {
        response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_PROFILE' });
      } catch {
        return { success: false, error: 'Extension context invalidated - refresh page' };
      }
      if (!response?.success || !response.data) {
        return { success: false, error: 'No profile found' };
      }
      profile = response.data as ResumeProfile;
    }

    const form = detectFormFields();
    if (form.fields.length === 0) {
      return { success: false, error: 'No form fields detected' };
    }

    const preview = await generateFillPreview(form, profile);
    return { success: true, data: preview };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Extract company name from page context
 */
function extractCompanyName(): string | undefined {
  // Try common patterns for company name
  const selectors = [
    '[data-company-name]',
    '.company-name',
    '.employer-name',
    '[class*="company"]',
    '[class*="employer"]',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el?.textContent?.trim()) {
      return el.textContent.trim();
    }
  }

  // Try to extract from URL (e.g., greenhouse.io/companies/acme)
  const urlMatch = window.location.pathname.match(/companies?\/([^\/]+)/i);
  if (urlMatch) {
    return urlMatch[1].replace(/-/g, ' ');
  }

  // Try from page title
  const titleMatch = document.title.match(/at\s+([^|•-]+)/i);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  return undefined;
}

/**
 * Extract job title from page context
 */
function extractJobTitle(): string | undefined {
  // Try common patterns for job title
  const selectors = [
    '[data-job-title]',
    '.job-title',
    '.position-title',
    'h1[class*="title"]',
    '[class*="job-title"]',
    '[class*="position"]',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el?.textContent?.trim()) {
      return el.textContent.trim();
    }
  }

  // Try from page title
  const title = document.title;
  // Remove common suffixes like "| Company Name" or "- Apply"
  const cleaned = title.split(/[|•\-–]/)[0].trim();
  if (cleaned && cleaned.length < 100) {
    return cleaned;
  }

  return undefined;
}

/**
 * Get stored job context from chrome.storage.session
 * This persists when navigating from job page to application form
 */
async function getStoredJobContext(): Promise<{ jobTitle?: string; companyName?: string; jobDescription?: string } | null> {
  try {
    const result = await chrome.storage.session.get('lastJobContext');
    if (result?.lastJobContext) {
      const context = result.lastJobContext;
      // Check if context is recent (within 30 minutes)
      const age = Date.now() - (context.timestamp || 0);
      const maxAge = 30 * 60 * 1000; // 30 minutes

      if (age < maxAge) {
        console.log('[Autofill] Found stored job context:', context.jobTitle);
        return context;
      } else {
        console.log('[Autofill] Stored job context expired');
      }
    }
  } catch (e) {
    console.log('[Autofill] Could not get stored job context:', e);
  }
  return null;
}

/**
 * Try to get the current job from the main content script
 * This is more reliable as the main detector already handles dynamic content
 */
async function getCurrentJobFromMainScript(): Promise<{ title?: string; company?: string; description?: string } | null> {
  try {
    // Send message to the main content script (same tab)
    const response = await new Promise<{ success: boolean; data?: { title?: string; company?: string; description?: string } }>((resolve) => {
      // Use window messaging since both scripts run in the same context
      const messageId = `jp-get-job-${Date.now()}`;

      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'JP_CURRENT_JOB_RESPONSE' && event.data?.messageId === messageId) {
          window.removeEventListener('message', handler);
          resolve({ success: true, data: event.data.job });
        }
      };

      window.addEventListener('message', handler);
      window.postMessage({ type: 'JP_GET_CURRENT_JOB', messageId }, '*');

      // Timeout after 500ms
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve({ success: false });
      }, 500);
    });

    if (response.success && response.data) {
      return response.data;
    }
  } catch {
    // Expected: main content script may not be loaded on this page
  }
  return null;
}

/**
 * Extract job description from page content
 */
function extractJobDescription(): string | undefined {
  // Try common selectors for job description containers
  const selectors = [
    '[data-job-description]',
    '.job-description',
    '#job-description',
    '[class*="job-description"]',
    '[class*="jobDescription"]',
    '.job-details',
    '.posting-content',
    '.job-content',
    // BambooHR specific
    '.ResumableJob__body',
    '[class*="ResumableJob"] .content',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const text = (el as HTMLElement)?.innerText?.trim();
    if (text && text.length > 200) {
      // Limit to 5000 chars to keep it manageable
      return text.substring(0, 5000);
    }
  }

  // Try to find section with job-related keywords
  const bodyText = document.body.innerText || '';
  const lowerText = bodyText.toLowerCase();

  // Look for common job description markers
  const markers = ['responsibilities', 'requirements', 'qualifications', 'what you\'ll do', 'about the role'];
  for (const marker of markers) {
    const idx = lowerText.indexOf(marker);
    if (idx > 0) {
      // Extract a reasonable chunk around/after the marker
      const start = Math.max(0, idx - 100);
      const end = Math.min(bodyText.length, idx + 3000);
      const content = bodyText.substring(start, end).trim();
      if (content.length > 300) {
        return content;
      }
    }
  }

  // Fallback: get main content area
  const mainContent = document.querySelector('main, article, [role="main"]');
  if (mainContent) {
    const text = (mainContent as HTMLElement).innerText?.trim();
    if (text && text.length > 200) {
      return text.substring(0, 5000);
    }
  }

  return undefined;
}

function showNotification(type: 'success' | 'error' | 'warning', message: string): void {
  const notification = document.createElement('div');
  notification.className = 'jp-notification';

  const colors = {
    success: { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
    error: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    warning: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  };

  const color = colors[type];

  notification.innerHTML = `
    <style>
      .jp-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647;
        padding: 14px 20px;
        background: ${color.bg};
        border: 1px solid ${color.border};
        border-radius: 8px;
        color: ${color.text};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        gap: 10px;
        animation: jp-slide-in 0.3s ease;
      }

      @keyframes jp-slide-in {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    </style>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      ${type === 'success' ? '<polyline points="20,6 9,17 4,12"/>' :
        type === 'error' ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' :
        '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'}
    </svg>
    ${escapeHtml(message)}
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'jp-slide-out 0.3s ease forwards';
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

