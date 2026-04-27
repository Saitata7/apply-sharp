/**
 * Follow-up scheduler.
 *
 * Schedules a chrome.alarms timer for "remind me to follow up on this
 * application in N days". Persists the metadata in chrome.storage.local
 * keyed by alarm id so the notification text survives a service-worker
 * restart. Fires a chrome.notifications notification when the alarm
 * triggers.
 *
 * Wires into src/background/index.ts via handleFollowUpAlarm in the
 * onAlarm dispatcher.
 */

import { applicationRepo } from '@storage/repositories/application.repo';
import type { FollowUp } from '@shared/types/application.types';

export const FOLLOWUP_PREFIX = 'applysharp-followup-';
const META_PREFIX = 'followup-meta-';
const DEFAULT_DAYS = 7;

interface FollowUpMeta {
  appId: string;
  followUpId: string;
  company: string;
  title: string;
  note: string;
}

/**
 * Schedule a follow-up reminder for an application.
 *
 * @param appId Application id
 * @param opts.days  Days from now until the reminder fires (default 7)
 * @param opts.note  Optional note shown in the notification
 */
export async function scheduleFollowUp(
  appId: string,
  opts: { days?: number; note?: string } = {}
): Promise<FollowUp | null> {
  const { days = DEFAULT_DAYS, note = 'Send a polite follow-up' } = opts;

  // Read once for the metadata snapshot. The actual append is atomic via
  // applicationRepo.appendFollowUp below, which uses a single IDB
  // transaction so it cannot race with concurrent updateStatus calls
  // (e.g. the ghost detector cron writing 'ghosted' immediately before
  // scheduling this reminder).
  const app = await applicationRepo.getById(appId);
  if (!app) return null;

  const followUpId = crypto.randomUUID();
  const alarmId = `${FOLLOWUP_PREFIX}${appId}:${followUpId}`;
  const dueDate = new Date(Date.now() + days * 86_400_000);

  await chrome.alarms.create(alarmId, { when: dueDate.getTime() });

  const meta: FollowUpMeta = {
    appId,
    followUpId,
    company: app.jdSnapshot?.company ?? '',
    title: app.jdSnapshot?.title ?? '',
    note,
  };
  await chrome.storage.local.set({ [META_PREFIX + alarmId]: meta });

  const followUp: FollowUp = { id: followUpId, dueDate, done: false, note, alarmId };
  // Atomic read-modify-write inside a single IDB transaction. Replaces the
  // previous getById + update sequence which raced with the ghost cron's
  // updateStatus call (the two writes could clobber each other depending
  // on which one finished last).
  await applicationRepo.appendFollowUp(appId, followUp);

  return followUp;
}

/**
 * Handle a follow-up alarm firing. Creates a chrome.notifications notification
 * and clears the persisted metadata.
 *
 * Returns true if the alarm name belonged to a follow-up (caller can early
 * return), false otherwise.
 */
export async function handleFollowUpAlarm(alarmName: string): Promise<boolean> {
  if (!alarmName.startsWith(FOLLOWUP_PREFIX)) return false;

  try {
    const key = META_PREFIX + alarmName;
    const stored = await chrome.storage.local.get(key);
    const meta = stored?.[key] as FollowUpMeta | undefined;
    if (!meta) return true; // alarm matched but metadata is gone (user dismissed)

    await chrome.notifications.create(alarmName, {
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      priority: 1,
      title: meta.title ? `Follow up: ${meta.title}` : 'Follow up reminder',
      message: meta.company ? `${meta.company} - ${meta.note}` : meta.note,
    });

    await chrome.storage.local.remove(key);
  } catch (err) {
    console.error('[FollowUpScheduler] handleFollowUpAlarm failed:', err);
  }

  return true;
}

/**
 * Mark a follow-up as dismissed and clear its alarm. Called from the tracker
 * UI when the user clicks "done" on a follow-up.
 */
export async function dismissFollowUp(appId: string, followUpId: string): Promise<void> {
  const app = await applicationRepo.getById(appId);
  if (!app?.followUps) return;

  const fu = app.followUps.find((f) => f.id === followUpId);
  if (fu) {
    try {
      await chrome.alarms.clear(fu.alarmId);
      await chrome.storage.local.remove(META_PREFIX + fu.alarmId);
    } catch {
      // best effort cleanup
    }
  }

  await applicationRepo.update(appId, {
    followUps: app.followUps.map((f) => (f.id === followUpId ? { ...f, done: true } : f)),
  });
}
