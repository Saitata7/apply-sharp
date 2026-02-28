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
    // Try to recover by retrying once
    setTimeout(() => {
      initDB()
        .then(() => {
          dbInitialized = true;
          console.log('[ApplySharp] Database initialized on retry');
        })
        .catch((retryError) => {
          console.error('[ApplySharp] Database initialization failed on retry:', retryError);
        });
    }, 1000);
  });

// Set up message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Check if DB is ready for operations that need it
  if (!dbInitialized && message?.type && !['GET_SETTINGS', 'PING'].includes(message.type)) {
    console.warn('[ApplySharp] Database not yet initialized, message may fail:', message.type);
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

// Handle extension icon click when no popup
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' }).catch((error) => {
      // Tab might not have content script loaded (e.g., chrome:// pages)
      console.log(
        '[ApplySharp] Could not toggle sidebar:',
        error?.message || 'Content script not available'
      );
    });
  }
});

// Handle deadline reminder alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  handleDeadlineAlarm(alarm.name).catch((err) => {
    console.error('[ApplySharp] Deadline alarm handler failed:', err);
  });
});

console.log('[ApplySharp] Background service worker started');
