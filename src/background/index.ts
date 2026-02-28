import { initDB } from '@storage/idb-client';
import { handleMessage } from './message-handler';
import { setupContextMenus } from './context-menu';
import { handleDeadlineAlarm } from './deadline-alarms';

let dbInitialized = false;

// Initialize database when service worker starts
initDB()
  .then(() => {
    dbInitialized = true;
    console.log('[ApplySharp] Database initialized');
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

// Handle alarms (DB retry + deadline reminders)
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

  handleDeadlineAlarm(alarm.name).catch((err) => {
    console.error('[ApplySharp] Deadline alarm handler failed:', err);
  });
});

console.log('[ApplySharp] Background service worker started');
