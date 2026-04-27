import { initDB } from '@storage/idb-client';
import { handleMessage } from './message-handler';
import { setupContextMenus } from './context-menu';
import { handleDeadlineAlarm } from './deadline-alarms';
import { migrateApplicationsV2 } from '@storage/repositories/application.repo';
import { GHOST_ALARM, installGhostDetector, runGhostDetection } from '@core/jobs/ghost-detector';
import { FOLLOWUP_PREFIX, handleFollowUpAlarm } from '@core/jobs/follow-up-scheduler';
import { LEAD_LIST_ALARM, refreshLeadListCache } from './handlers/lead-list-handlers';
import {
  clearTabJobContext,
  notifyTabActivated,
  setTabJobContext,
  subscribe as subscribeTabContext,
} from './tab-context-store';
import type { SidePanelPortMessage, TabJobContext } from '@shared/types/sidepanel.types';
import { isFeatureEnabled } from '@shared/feature-flags';
import { extractLinkedInJobInPage } from '@shared/linkedin-job-extractor';

let dbInitialized = false;

// Initialize database when service worker starts
initDB()
  .then(async () => {
    dbInitialized = true;
    console.log('[ApplySharp] Database initialized');
    // Workstream 4: idempotent one-time migration that adds the new
    // tracker fields and transitions deprecated 'expired' to 'ghosted'.
    try {
      await migrateApplicationsV2();
    } catch (err) {
      console.error('[ApplySharp] applicationV2 migration failed:', err);
    }
    // Workstream 4: install the daily ghost-detector cron. Idempotent.
    try {
      await installGhostDetector();
    } catch (err) {
      console.error('[ApplySharp] ghost detector install failed:', err);
    }
  })
  .catch((error) => {
    console.error('[ApplySharp] CRITICAL: Database initialization failed:', error);
    // Use chrome.alarms for reliable retry in service worker (setTimeout is unreliable)
    chrome.alarms.create('db-retry', { delayInMinutes: 0.02 });
  });

// Set up message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Guard: queue messages until DB is ready (except settings/ping)
  if (!dbInitialized && message?.type && !['GET_SETTINGS', 'PING'].includes(message.type)) {
    console.warn('[ApplySharp] Database not yet initialized, waiting...:', message.type);
    // Wait up to 5s for DB to initialize before processing
    const waitForDB = async () => {
      const start = Date.now();
      while (!dbInitialized && Date.now() - start < 5000) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!dbInitialized) {
        throw new Error('Database initialization timed out');
      }
    };
    waitForDB()
      .then(() => handleMessage(message, sender))
      .then(sendResponse)
      .catch((error) => {
        console.error('[ApplySharp] Message handler error:', error);
        sendResponse({ success: false, error: error?.message || 'Unknown error' });
      });
    return true;
  }

  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error('[ApplySharp] Message handler error:', error);
      sendResponse({ success: false, error: error?.message || 'Unknown error' });
    });

  // Return true to indicate async response
  return true;
});

// Set up context menus
chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
  console.log('[ApplySharp] Extension installed/updated');
});

// Note: action.onClicked is not used because manifest.json has default_popup set.
// Sidebar toggle is available via keyboard shortcut (Ctrl+Shift+S) and context menu.

// Handle alarms (DB retry + deadline reminders + ghost detector + follow-ups)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'db-retry' && !dbInitialized) {
    initDB()
      .then(() => {
        dbInitialized = true;
        console.log('[ApplySharp] Database initialized on retry');
      })
      .catch((retryError) => {
        console.error('[ApplySharp] Database initialization failed on retry:', retryError);
      });
    return;
  }

  // Workstream 4: ghost detector daily cron
  if (alarm.name === GHOST_ALARM) {
    runGhostDetection().catch((err) => {
      console.error('[ApplySharp] Ghost detection failed:', err);
    });
    return;
  }

  // Workstream 4: follow-up reminder fired
  if (alarm.name.startsWith(FOLLOWUP_PREFIX)) {
    handleFollowUpAlarm(alarm.name).catch((err) => {
      console.error('[ApplySharp] Follow-up alarm handler failed:', err);
    });
    return;
  }

  // Daily lead-list cache pre-warm. Runs once per day so the morning
  // side-panel open is instant. Registered conditionally on the
  // discovery.leadList flag below.
  if (alarm.name === LEAD_LIST_ALARM) {
    refreshLeadListCache().catch((err) => {
      console.error('[ApplySharp] Lead-list refresh failed:', err);
    });
    return;
  }

  handleDeadlineAlarm(alarm.name).catch((err) => {
    console.error('[ApplySharp] Deadline alarm handler failed:', err);
  });
});

// Workstream 1 keyboard shortcut: forward chrome.commands events to the
// active tab so the v2 content script's START_AUTOFILL listener catches
// them. Without this listener, the manifest "commands" entry registers
// the shortcut but Chrome silently swallows the keypress for the
// extension. The duplicate keydown handler in v2/index.ts only fires
// when the keypress reaches the page; chrome.commands fires it
// independently for the extension itself.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'run-autofill-v2') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await chrome.tabs.sendMessage(tab.id, { type: 'START_AUTOFILL' });
  } catch (err) {
    // Tab may have no content script (linkedin, chrome://, etc.). Silent.
    console.log('[ApplySharp] run-autofill-v2 command could not reach tab:', err);
  }
});

// Workstream 7: per-tab job context store wiring.
//
// The store itself lives in src/background/tab-context-store.ts and is
// updated lazily from the JOB_DETECTED message handler in message-handler.ts
// (which knows the sender tab id). Here we wire the lifecycle plumbing:
//
//   - chrome.tabs.onRemoved: free the entry when the tab closes
//   - chrome.tabs.onUpdated (status === 'loading'): clear stale context on
//     navigation so the side panel does not show last-page data while the
//     new page loads
//   - chrome.tabs.onActivated: notify subscribers so the side panel
//     re-fetches its current context for the newly-active tab
//   - chrome.runtime.onConnect for the 'sidepanel-tab-context' port:
//     forward CONTEXT_UPDATE/TAB_CHANGED broadcasts to the side panel
//
// Also configures the side panel default behavior so the action icon opens it.
chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabJobContext(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    clearTabJobContext(tabId);
  }

  // WS10.5+: opt-in LinkedIn integration. Two independent flags:
  //   1. linkedin.autoExtractJobs (lower risk): read-only querySelector
  //      pass that populates the per-tab context store so the Chrome
  //      side panel auto-renders Job Insights / Ghost Score / Discovery
  //      cards on LinkedIn jobs. NO DOM injection on the LinkedIn page.
  //   2. linkedin.injectFloatingButton (higher risk): inline DOM injection
  //      via chrome.scripting.executeScript with a self-contained
  //      function that creates the full ATS sidebar. Mirrors the
  //      pre-25d9ba2 src/content/ui/sidebar.ts UX feature for feature.
  //
  // Default-install users have ZERO LinkedIn DOM surface; both flags
  // default OFF and require an explicit opt-in via Options -> Contacts
  // -> LinkedIn integration.
  //
  // We use chrome.scripting.executeScript({func}) instead of dynamic
  // chrome.scripting.registerContentScripts because crxjs's content
  // script loader pattern requires the bundled chunk to be in
  // web_accessible_resources matched for the host - and adding LinkedIn
  // to WAR would re-leak the fingerprint surface that 25d9ba2 closed
  // for ALL users (not just opted-in ones).
  if (changeInfo.status === 'complete' && tab?.url) {
    void maybeAutoExtractLinkedInJob(tabId, tab.url);
    void maybeInjectLinkedInFloatingButton(tabId, tab.url);
  }
});

/**
 * Dynamic content-script registration for the LinkedIn jobs-feed badge.
 *
 * Why this and not the executeScript-on-tab.onUpdated path: LinkedIn is an
 * SPA. tab.onUpdated rarely fires with status === 'complete' on in-app
 * navigations, so an executeScript-driven approach loses badges every time
 * the user clicks within the rail. chrome.scripting.registerContentScripts
 * registers a real content script that Chrome auto-injects on every
 * matching navigation (full or in-place) for as long as the registration
 * stands - same UX as a manifest content_script, but enabled at runtime.
 *
 * Why this and not adding linkedin.com to manifest content_scripts.matches:
 * the manifest path forces the surface on for ALL users at install time.
 * Runtime registration keeps the opt-in posture: default-install users have
 * zero LinkedIn surface until they explicitly enable the flag.
 *
 * The IIFE bundle has no dynamic imports, so it does not require the file
 * to be in web_accessible_resources for linkedin.com (Chrome injects
 * registered content scripts directly into the isolated world).
 */
const JOBS_FEED_SCRIPT_ID = 'apsh-linkedin-jobs-feed';

// Mutex so concurrent callers (onStartup + onInstalled + top-level eval +
// storage listener can all fire near-simultaneously after a build) don't
// race into a "Duplicate script ID" error from chrome.scripting. The
// promise resolves when the in-flight sync completes; subsequent callers
// queue behind it and re-read the flag, which is idempotent.
let jobsFeedSyncInFlight: Promise<void> | null = null;

async function syncLinkedInJobsFeedRegistration(): Promise<void> {
  if (jobsFeedSyncInFlight) {
    return jobsFeedSyncInFlight;
  }
  jobsFeedSyncInFlight = doSyncLinkedInJobsFeedRegistration().finally(() => {
    jobsFeedSyncInFlight = null;
  });
  return jobsFeedSyncInFlight;
}

async function doSyncLinkedInJobsFeedRegistration(): Promise<void> {
  const enabled = await isFeatureEnabled('linkedin.jobsFeedSignals');

  // Read the existing registration once. Both branches (off and on) need
  // this to decide what to do; a race-resilient approach is to call
  // unregister with a tolerant catch instead of trusting the read.
  let alreadyRegistered = false;
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({
      ids: [JOBS_FEED_SCRIPT_ID],
    });
    alreadyRegistered = existing.length > 0;
  } catch (err) {
    console.debug('[ApplySharp] could not query existing jobs-feed registration:', err);
  }

  if (!enabled) {
    if (alreadyRegistered) {
      try {
        await chrome.scripting.unregisterContentScripts({ ids: [JOBS_FEED_SCRIPT_ID] });
      } catch (err) {
        console.debug('[ApplySharp] jobs-feed unregister failed (already gone?):', err);
      }
    }
    console.log('[ApplySharp] jobs-feed flag off; not registering content script');
    return;
  }

  // Enabled path. If something is already registered (persisted across
  // sessions or a previous startup just registered it), prefer
  // updateContentScripts which is idempotent on the existing ID.
  // Otherwise register fresh.
  const scriptDef = {
    id: JOBS_FEED_SCRIPT_ID,
    js: ['assets/jobs-feed-iife.js'],
    matches: [
      'https://www.linkedin.com/jobs/search*',
      'https://www.linkedin.com/jobs/search/*',
      'https://www.linkedin.com/jobs/collections/*',
    ],
    runAt: 'document_idle' as const,
    persistAcrossSessions: true,
    allFrames: false,
  };

  if (alreadyRegistered) {
    try {
      await chrome.scripting.updateContentScripts([scriptDef]);
      console.log('[ApplySharp] jobs-feed content script updated (already registered)');
      return;
    } catch (err) {
      console.debug('[ApplySharp] jobs-feed update failed; will fall through to re-register:', err);
      // Fall through to unregister-then-register.
      try {
        await chrome.scripting.unregisterContentScripts({ ids: [JOBS_FEED_SCRIPT_ID] });
      } catch {
        // ignore
      }
    }
  }

  try {
    await chrome.scripting.registerContentScripts([scriptDef]);
    console.log('[ApplySharp] jobs-feed content script registered');
  } catch (err) {
    // The most common cause of register failing here is a concurrent
    // caller having registered the same ID milliseconds earlier. That
    // is fine: the script IS registered, we just lost the race.
    if (String(err).includes('Duplicate script ID')) {
      console.debug('[ApplySharp] jobs-feed already registered by a concurrent caller');
      return;
    }
    console.error('[ApplySharp] jobs-feed registration failed:', err);
  }
}

// Register at every service-worker startup. Chrome may evict the worker
// and reload it, so onStartup AND top-level evaluation both call into the
// same idempotent sync function. onInstalled covers the very first install
// and updates that bumped the manifest.
chrome.runtime.onStartup.addListener(() => {
  void syncLinkedInJobsFeedRegistration();
});
chrome.runtime.onInstalled.addListener(() => {
  void syncLinkedInJobsFeedRegistration();
});
void syncLinkedInJobsFeedRegistration();

// Re-sync when the user flips the flag from the options page or the
// console. The IIFE has its own Symbol-keyed load guard so a freshly
// registered script never double-injects on tabs that already had it.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (Object.prototype.hasOwnProperty.call(changes, 'feature-flag:linkedin.jobsFeedSignals')) {
    void syncLinkedInJobsFeedRegistration();
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'feature-flag:discovery.leadList')) {
    void syncLeadListAlarm();
  }
});

/**
 * Install or remove the daily lead-list refresh alarm based on the
 * discovery.leadList flag. The alarm pre-warms the cache once a day so
 * morning opens of the side-panel render instantly. We pick a fixed
 * delayInMinutes of 60 (first run an hour after enabling) and a 24h
 * period thereafter.
 */
async function syncLeadListAlarm(): Promise<void> {
  const enabled = await isFeatureEnabled('discovery.leadList');
  if (enabled) {
    chrome.alarms.create(LEAD_LIST_ALARM, { delayInMinutes: 60, periodInMinutes: 60 * 24 });
    console.log('[ApplySharp] lead-list daily refresh alarm installed');
  } else {
    chrome.alarms.clear(LEAD_LIST_ALARM);
    console.log('[ApplySharp] lead-list daily refresh alarm cleared');
  }
}

chrome.runtime.onStartup.addListener(() => {
  void syncLeadListAlarm();
});
chrome.runtime.onInstalled.addListener(() => {
  void syncLeadListAlarm();
});
void syncLeadListAlarm();

/**
 * Inject the full ApplySharp sidebar on a LinkedIn job/profile page by
 * loading the IIFE bundle built at scripts/build-sidebar-iife.mjs. The
 * IIFE is bundled from src/content/index.ts (the same source the legacy
 * content script uses on Wellfound/Greenhouse/Lever/Ashby/etc.) so the
 * LinkedIn UX is IDENTICAL to every other supported site - one codebase,
 * one UI, no parallel implementations to keep in sync.
 *
 * Three-step gate:
 *   1. URL must be a LinkedIn profile or job page
 *   2. Feature flag linkedin.injectFloatingButton must be enabled
 *   3. chrome.scripting.executeScript must succeed
 *
 * Why executeScript({files}) instead of the manifest content_scripts
 * path: adding linkedin.com to manifest content_scripts.matches would
 * expose the WAR (web_accessible_resources) chunks to LinkedIn's
 * BrowserGate fingerprinter (~23% account-restriction risk per
 * commit 25d9ba2). Default-install users have ZERO LinkedIn surface;
 * only opted-in users get the IIFE injected on their tab navigations.
 *
 * Why an IIFE bundle and not chrome.scripting.registerContentScripts:
 * crxjs's loader pattern uses dynamic `await import(chrome.runtime.
 * getURL("..."))` which requires the chunk to be in WAR matched for
 * the host. The IIFE bundle has no dynamic imports, so it bypasses
 * the WAR requirement entirely.
 */
async function maybeInjectLinkedInFloatingButton(tabId: number, urlString: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return;
  }
  const isLinkedIn = url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com');
  if (!isLinkedIn) return;
  if (!/^\/(in|jobs)\//.test(url.pathname)) return;

  const enabled = await isFeatureEnabled('linkedin.injectFloatingButton');
  if (!enabled) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['assets/sidebar-iife.js'],
    });
  } catch (err) {
    console.debug('[ApplySharp] LinkedIn sidebar injection failed:', err);
  }
}

/**
 * Auto-extract a LinkedIn job and write it into the per-tab context store
 * so the side panel automatically renders Job Insights / Ghost Score /
 * Discovery cards on LinkedIn job pages without the user clicking anything.
 *
 * Lower fingerprint risk than maybeInjectLinkedInFloatingButton because
 * the extractor is read-only (document.querySelector reads, no DOM
 * mutation). Still uses chrome.scripting.executeScript so not zero-risk.
 *
 * Three-step gate:
 *   1. URL must be a LinkedIn job page (not profile, not feed, etc.)
 *   2. Feature flag linkedin.autoExtractJobs must be enabled
 *   3. extractLinkedInJobInPage must return a non-null result (the page
 *      may be a /jobs/search/ landing without a currentJobId yet)
 */
async function maybeAutoExtractLinkedInJob(tabId: number, urlString: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return;
  }
  const isLinkedIn = url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com');
  if (!isLinkedIn) return;
  // Only job pages auto-extract; profile pages do not have job context
  if (!/^\/jobs\//.test(url.pathname)) return;

  const enabled = await isFeatureEnabled('linkedin.autoExtractJobs');
  if (!enabled) return;

  let extracted: ReturnType<typeof extractLinkedInJobInPage> | undefined;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractLinkedInJobInPage,
    });
    extracted = results?.[0]?.result ?? null;
  } catch (err) {
    console.debug('[ApplySharp] LinkedIn auto-extract failed:', err);
    return;
  }

  if (!extracted) return;

  // Build the per-tab context that the side panel reads. Mirrors the
  // shape JOB_DETECTED would produce for a normal content-script site.
  const ctx: TabJobContext = {
    jobId: extracted.jobId || `linkedin-${urlString}`,
    jobTitle: extracted.title,
    companyName: extracted.company,
    platform: 'linkedin',
    url: extracted.url,
    jobDescription: extracted.description,
    capturedAt: Date.now(),
  };
  setTabJobContext(tabId, ctx);
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  notifyTabActivated(tabId);
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel-tab-context') return;

  // CRITICAL: bind each port to a SPECIFIC tab id and filter broadcasts.
  //
  // Without this filter, tab A's side panel would re-render with tab B's
  // job whenever tab B's content script fired JOB_DETECTED. The previous
  // version called subscribeTabContext and forwarded EVERY message to
  // EVERY side panel port - a cross-tab data leak.
  //
  // The side panel does not know its tab id directly (it runs in
  // chrome-extension://, not a tab), so we resolve the active tab when
  // the port connects. The side panel re-connects on tab switch
  // implicitly via TAB_CHANGED + a fresh GET_TAB_JOB_CONTEXT roundtrip.
  //
  // Iter-3 race fix: messages that arrive BEFORE chrome.tabs.query
  // resolves are buffered into a pending queue and only flushed once the
  // bind completes. The previous version subscribed synchronously and
  // forwarded any pre-bind message regardless of tab id (~10ms window).
  let boundTabId: number | null = null;
  let bound = false;
  const pending: SidePanelPortMessage[] = [];

  function forwardOrBuffer(msg: SidePanelPortMessage): void {
    if (!bound) {
      pending.push(msg);
      return;
    }
    if (msg.type === 'TAB_CHANGED') {
      boundTabId = msg.tabId;
    } else if (msg.type === 'CONTEXT_UPDATE' && boundTabId !== null && msg.tabId !== boundTabId) {
      return;
    }
    try {
      port.postMessage(msg);
    } catch {
      // Port closed mid-flight; the disconnect listener cleans up.
    }
  }

  const unsubscribe = subscribeTabContext(forwardOrBuffer);

  // Resolve the bound tab id, then drain any queued messages.
  void (async () => {
    try {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      boundTabId = activeTab?.id ?? null;
    } catch {
      boundTabId = null;
    } finally {
      bound = true;
      // Drain the pending queue through the same forwarder so the filter
      // applies retroactively to anything that arrived during the race.
      const queued = pending.splice(0, pending.length);
      for (const msg of queued) {
        forwardOrBuffer(msg);
      }
    }
  })();

  port.onDisconnect.addListener(() => {
    unsubscribe();
  });
});

// Make the action icon open the side panel by default. Users can still pin
// the popup; this is the recommended Chrome 114+ pattern for ambient panels.
try {
  const sp = (
    chrome as typeof chrome & {
      sidePanel?: {
        setPanelBehavior?: (opts: { openPanelOnActionClick: boolean }) => Promise<void>;
      };
    }
  ).sidePanel;
  sp?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => {
    // Older Chrome builds may not implement this; popup remains the default.
  });
} catch {
  // chrome.sidePanel may be undefined in dev builds before reload.
}

console.log('[ApplySharp] Background service worker started');
