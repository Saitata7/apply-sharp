/**
 * Deadline alarm scheduling and Chrome notification handling.
 * Uses chrome.alarms (persists across service worker restarts) and
 * chrome.storage.local for alarm metadata.
 */

const ALARM_PREFIX = 'deadline-reminder-';

export async function scheduleDeadlineAlarm(
  jobId: string,
  deadline: Date,
  jobTitle: string,
  company: string
): Promise<void> {
  const alarmName = `${ALARM_PREFIX}${jobId}`;

  // Clear any existing alarm for this job
  await chrome.alarms.clear(alarmName);

  const now = Date.now();
  const deadlineMs = deadline.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  // Don't schedule if deadline already passed
  if (deadlineMs <= now) return;

  // Fire 24h before deadline, or in 1 minute if less than 24h away
  const fireAt = Math.max(now + 60_000, deadlineMs - oneDayMs);

  await chrome.alarms.create(alarmName, { when: fireAt });

  // Store metadata (alarms don't carry data, service worker may restart)
  const key = `alarm-meta-${jobId}`;
  await chrome.storage.local.set({
    [key]: { jobId, jobTitle, company, deadline: deadline.toISOString() },
  });
}

export async function clearDeadlineAlarm(jobId: string): Promise<void> {
  await chrome.alarms.clear(`${ALARM_PREFIX}${jobId}`);
  await chrome.storage.local.remove(`alarm-meta-${jobId}`);
}

export async function handleDeadlineAlarm(alarmName: string): Promise<void> {
  if (!alarmName.startsWith(ALARM_PREFIX)) return;

  const jobId = alarmName.slice(ALARM_PREFIX.length);
  const key = `alarm-meta-${jobId}`;
  const result = await chrome.storage.local.get(key);
  const meta = result[key];
  if (!meta) return;

  const deadline = new Date(meta.deadline);
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const urgency = daysLeft <= 0 ? 'TODAY' : daysLeft === 1 ? 'TOMORROW' : `in ${daysLeft} days`;
  const dateStr = deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  try {
    await chrome.notifications.create(`deadline-notif-${jobId}`, {
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: `Deadline ${urgency}: ${meta.jobTitle}`,
      message: `${meta.company} application closes ${dateStr}. Don't miss it!`,
      priority: 2,
    });
  } catch (error) {
    console.error('[ApplySharp] Failed to show deadline notification:', error);
  }

  // Clean up metadata after notification is shown
  await chrome.storage.local.remove(key);
}
