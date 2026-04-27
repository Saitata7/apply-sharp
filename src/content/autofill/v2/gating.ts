/**
 * Pill mount gating.
 *
 * The pill should only appear when:
 *   1. The host is NOT linkedin.com (HARD BAN, no exceptions)
 *   2. The host is in the known ATS list
 *   3. The DOM contains a form with at least 3 fields
 *   4. The user has not dismissed for this hostname in the last 24 hours
 */

import { detectPlatform } from '@shared/constants/platforms';

const DISMISS_PREFIX = 'autofill-dismissed:';
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

export async function shouldMountPill(): Promise<{ allowed: boolean; reason?: string }> {
  const host = window.location.hostname;

  // Hard ban: linkedin.com is forbidden regardless of any other check.
  // Strict match (not endsWith) so a host like `evilfakelinkedin.com` is
  // NOT bypassed by a substring match.
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
    return { allowed: false, reason: 'linkedin' };
  }

  // Known ATS host
  const platform = detectPlatform(window.location.href);
  if (!platform) {
    return { allowed: false, reason: 'unknown-host' };
  }

  // Form with 3+ fields
  const formCount = countViableForms();
  if (formCount === 0) {
    return { allowed: false, reason: 'no-form' };
  }

  // Dismissed for this host?
  try {
    const key = DISMISS_PREFIX + host;
    const stored = await chrome.storage.local.get(key);
    const ts = stored?.[key] as number | undefined;
    if (ts && Date.now() - ts < DISMISS_TTL_MS) {
      return { allowed: false, reason: 'dismissed' };
    }
  } catch {
    // chrome.storage may be unavailable; fail open.
  }

  return { allowed: true };
}

function countViableForms(): number {
  let count = 0;
  const forms = document.querySelectorAll<HTMLFormElement>('form');
  for (const f of forms) {
    const fields = f.querySelectorAll(
      'input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select'
    );
    if (fields.length >= 3) count++;
  }
  // Fallback: dialog containers (SPA modals without a real form)
  if (count === 0) {
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"], .ReactModal__Content');
    for (const d of dialogs) {
      const fields = d.querySelectorAll(
        'input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select'
      );
      if (fields.length >= 3) count++;
    }
  }
  return count;
}

export async function dismissForHost(): Promise<void> {
  try {
    const key = DISMISS_PREFIX + window.location.hostname;
    await chrome.storage.local.set({ [key]: Date.now() });
  } catch {
    // best effort
  }
}
