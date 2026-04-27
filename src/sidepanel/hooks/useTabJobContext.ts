/**
 * useTabJobContext - subscribes the side panel to the background per-tab job
 * context store.
 *
 * On mount:
 *  1. Sends GET_TAB_JOB_CONTEXT to fetch the current tab's context (background
 *     reads sender.tab.id from the message envelope).
 *  2. Opens a long-lived port named 'sidepanel-tab-context' for live push
 *     updates so the panel re-renders when the user switches tabs OR when the
 *     content script on the active tab detects a new job.
 *  3. Cleans up the port on unmount.
 *
 * Resilience:
 *  - If the background is cold-starting or the message API is unavailable
 *    (jsdom test runtime), the hook resolves to `{ context: null, loading: false }`
 *    so the side panel renders the empty state instead of crashing.
 *  - Port disconnect is silent - the side panel will simply stop receiving
 *    push updates but the last known context stays rendered.
 */

import { useEffect, useState } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import type {
  TabJobContext,
  GetTabJobContextResponse,
  SidePanelPortMessage,
} from '@shared/types/sidepanel.types';

interface UseTabJobContextResult {
  context: TabJobContext | null;
  loading: boolean;
  tabId: number | null;
}

const PORT_NAME = 'sidepanel-tab-context';

export function useTabJobContext(): UseTabJobContextResult {
  const [context, setContext] = useState<TabJobContext | null>(null);
  const [tabId, setTabId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let port: chrome.runtime.Port | null = null;
    // Defense in depth: even though the background's port wrapper filters
    // CONTEXT_UPDATE by tabId, we keep our own bound tab id and ignore any
    // messages whose tabId does not match. A future bug in the background
    // filter cannot cause a cross-tab data leak this way.
    let boundTabId: number | null = null;

    // Phase 1: initial fetch via one-shot message. The handler resolves
    // the active tab id and returns it alongside the context, which we
    // use to bind this hook's port-level filter.
    void (async () => {
      try {
        const res = await sendMessage<undefined, GetTabJobContextResponse>({
          type: 'GET_TAB_JOB_CONTEXT',
        });
        if (cancelled) return;
        if (res?.success && res.data) {
          setContext(res.data.context);
          setTabId(res.data.tabId);
          boundTabId = res.data.tabId;
        }
      } catch {
        // Background may be cold-starting; jsdom may not have chrome.runtime.
        // Silent fall-through to empty state.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Phase 2: long-lived port for live updates
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.connect) {
        port = chrome.runtime.connect({ name: PORT_NAME });
        port.onMessage.addListener((msg: SidePanelPortMessage) => {
          if (cancelled) return;
          if (msg.type === 'TAB_CHANGED') {
            // The active tab changed; re-bind and re-fetch the new tab's
            // context. This is what makes "open two LinkedIn job tabs and
            // switch between them" work.
            boundTabId = msg.tabId;
            setTabId(msg.tabId);
            void (async () => {
              try {
                const res = await sendMessage<undefined, GetTabJobContextResponse>({
                  type: 'GET_TAB_JOB_CONTEXT',
                });
                if (cancelled) return;
                if (res?.success && res.data) setContext(res.data.context);
              } catch {
                // Silent fall-through; last context stays rendered
              }
            })();
            return;
          }
          if (msg.type === 'CONTEXT_UPDATE') {
            // Defensive filter: ignore updates for any other tab.
            if (boundTabId !== null && msg.tabId !== boundTabId) return;
            setContext(msg.context);
          }
        });
        port.onDisconnect.addListener(() => {
          // Silent; last known context stays rendered.
          port = null;
        });
      }
    } catch {
      // chrome.runtime may be unavailable in tests; silent fall-through.
    }

    return () => {
      cancelled = true;
      try {
        port?.disconnect();
      } catch {
        // best-effort
      }
    };
  }, []);

  return { context, loading, tabId };
}
