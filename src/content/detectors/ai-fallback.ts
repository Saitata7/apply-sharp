/**
 * AI Fallback Job Detector — Self-Healing Detection
 *
 * When platform-specific detectors fail (extraction returns no title/description),
 * this module sends the page content to the background service worker for AI extraction.
 *
 * Flow:
 *   1. Platform detector fails (no title or description < 100 chars)
 *   2. Collect visible text from the page (limited to avoid token waste)
 *   3. Send to background via AI_EXTRACT_JOB message
 *   4. Background runs AI extraction with structured output
 *   5. Return extracted job data or null
 *
 * This closes the gap: new ATS platforms, layout changes, or unusual page structures
 * that break regex-based detectors are handled gracefully by AI.
 */

import type { ExtractedJob } from '@shared/types/job.types';

/**
 * Attempt AI-powered job extraction as a fallback.
 * Returns null if AI extraction also fails or is unavailable.
 */
export async function extractJobWithAI(url: string): Promise<ExtractedJob | null> {
  try {
    // Collect visible page text (limit to ~6000 chars to save tokens)
    const pageText = collectPageText(6000);

    if (pageText.length < 200) {
      console.log('[AIFallback] Page text too short for AI extraction');
      return null;
    }

    // Collect page metadata for additional context
    const metadata = collectPageMetadata();

    const response = await chrome.runtime.sendMessage({
      type: 'AI_EXTRACT_JOB',
      payload: {
        pageText,
        url,
        pageTitle: document.title,
        ...metadata,
      },
    });

    if (!response?.success || !response?.data) {
      console.log('[AIFallback] AI extraction failed or unavailable');
      return null;
    }

    const extracted = response.data as ExtractedJob;

    // Validate AI extraction
    if (!extracted.title || extracted.title === 'Unknown' || !extracted.description) {
      console.log('[AIFallback] AI extraction returned insufficient data');
      return null;
    }

    console.log('[AIFallback] AI extracted job:', extracted.title, 'at', extracted.company);
    return extracted;
  } catch (error) {
    // Extension context may be invalidated
    console.debug('[AIFallback] Failed:', (error as Error).message);
    return null;
  }
}

/**
 * Collect visible text from the page, prioritizing job-relevant content.
 * Strips scripts, styles, nav, footer, and other non-content elements.
 */
function collectPageText(maxLength: number): string {
  const clone = document.body.cloneNode(true) as HTMLElement;

  // Remove non-content elements
  const removeSelectors = [
    'script',
    'style',
    'noscript',
    'iframe',
    'svg',
    'nav',
    'footer',
    'header',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '.cookie-banner',
    '.cookie-consent',
    '#cookie',
    '.ads',
    '.advertisement',
    '.social-share',
    '.apply-sharp-sidebar', // Our own sidebar
  ];

  for (const selector of removeSelectors) {
    clone.querySelectorAll(selector).forEach((el) => el.remove());
  }

  // Get text, collapse whitespace
  const text = (clone.textContent || '')
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  return text.slice(0, maxLength);
}

/**
 * Collect page metadata that helps AI understand context.
 */
function collectPageMetadata(): {
  ogTitle?: string;
  ogDescription?: string;
  ogCompany?: string;
} {
  const ogTitle =
    document.querySelector('meta[property="og:title"]')?.getAttribute('content') || undefined;
  const ogDescription =
    document.querySelector('meta[property="og:description"]')?.getAttribute('content') || undefined;
  const ogCompany =
    document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || undefined;

  return { ogTitle, ogDescription, ogCompany };
}
