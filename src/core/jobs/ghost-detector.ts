/**
 * Ghost detector cron.
 *
 * Daily chrome.alarms job that auto-transitions applications stuck in
 * `submitted` for more than the threshold (default 30 days) to `ghosted`.
 * Also schedules a "send a polite follow-up" reminder for each newly ghosted
 * application via the follow-up scheduler.
 *
 * The cron itself is small. The wiring lives in src/background/index.ts
 * which routes the alarm name to runGhostDetection.
 */

import { applicationRepo } from '@storage/repositories/application.repo';
import { scheduleFollowUp } from './follow-up-scheduler';

export const GHOST_ALARM = 'applysharp-ghost-detector';
export const GHOST_THRESHOLD_DAYS = 30;
const ONE_DAY_MIN = 60 * 24;

/**
 * Install the daily ghost-detector alarm. Idempotent: chrome.alarms.create
 * with the same name replaces any existing alarm with the same name. Call
 * from chrome.runtime.onInstalled and from any time the extension is loaded.
 */
export async function installGhostDetector(): Promise<void> {
  await chrome.alarms.create(GHOST_ALARM, {
    when: Date.now() + 60_000, // first run in 1 minute
    periodInMinutes: ONE_DAY_MIN,
  });
}

/**
 * Run ghost detection now. Finds all applications submitted more than 30
 * days ago with no status change, transitions them to `ghosted`, and
 * schedules a follow-up reminder for each.
 *
 * Spread guard: when a single run ghosts N apps, the previous version
 * scheduled all N follow-up alarms with `days: 0`, which fires N
 * notifications simultaneously. We now spread them across the next hour
 * (one alarm every 4 minutes) so the user sees a paced trickle, not a
 * notification storm. Spread is in fractional days so the existing
 * `days * 86_400_000` math just works.
 *
 * Returns the number of applications that were ghosted in this run.
 */
export async function runGhostDetection(
  thresholdDays: number = GHOST_THRESHOLD_DAYS
): Promise<number> {
  let ghostedCount = 0;
  try {
    const candidates = await applicationRepo.findGhostCandidates(thresholdDays);
    const SPREAD_MINUTES = 4;
    for (let i = 0; i < candidates.length; i++) {
      const app = candidates[i];
      try {
        await applicationRepo.updateStatus(
          app.id,
          'ghosted',
          `Auto-transitioned: no response in ${thresholdDays} days`
        );
        // Stagger follow-up alarms so a batch of N ghosted apps does not
        // produce N simultaneous notifications. First alarm fires in
        // ~SPREAD_MINUTES, the next ~2*SPREAD_MINUTES, etc.
        const offsetMinutes = (i + 1) * SPREAD_MINUTES;
        const offsetDays = offsetMinutes / (60 * 24);
        await scheduleFollowUp(app.id, {
          days: offsetDays,
          note: 'Send a polite follow-up?',
        });
        ghostedCount++;
      } catch (err) {
        console.warn('[GhostDetector] failed to transition app', app.id, err);
      }
    }
  } catch (err) {
    console.error('[GhostDetector] run failed:', err);
  }
  return ghostedCount;
}

/**
 * Uninstall the alarm. Used when the user disables ghost detection in
 * settings.
 */
export async function uninstallGhostDetector(): Promise<void> {
  await chrome.alarms.clear(GHOST_ALARM);
}
