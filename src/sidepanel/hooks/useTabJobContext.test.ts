/**
 * useTabJobContext hook tests (Workstream 7, iter-3 coverage gap fix).
 *
 * Verifies the hook:
 *   - hydrates from GET_TAB_JOB_CONTEXT on mount
 *   - subscribes to a long-lived port and processes CONTEXT_UPDATE messages
 *   - filters CONTEXT_UPDATE by tab id (defense in depth)
 *   - re-fetches on TAB_CHANGED
 *   - degrades gracefully when chrome.runtime is missing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const mockSendMessage = vi.fn();
vi.mock('@shared/utils/messaging', () => ({
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}));

import { useTabJobContext } from './useTabJobContext';
import type { SidePanelPortMessage, TabJobContext } from '@shared/types/sidepanel.types';

interface FakePort {
  onMessage: { addListener: (cb: (msg: SidePanelPortMessage) => void) => void };
  onDisconnect: { addListener: (cb: () => void) => void };
  disconnect: () => void;
  _emit: (msg: SidePanelPortMessage) => void;
}

function makeFakePort(): FakePort {
  let listener: ((msg: SidePanelPortMessage) => void) | null = null;
  return {
    onMessage: {
      addListener: (cb) => {
        listener = cb;
      },
    },
    onDisconnect: {
      addListener: () => {
        // not exercised in these tests
      },
    },
    disconnect: () => {
      // no-op
    },
    _emit: (msg) => {
      if (listener) listener(msg);
    },
  };
}

let fakePort: FakePort;

const ctxA: TabJobContext = {
  jobId: 'a',
  jobTitle: 'Backend Engineer at A',
  companyName: 'A Corp',
  platform: 'linkedin',
  url: 'https://example.com/a',
  capturedAt: Date.now(),
};

const ctxB: TabJobContext = {
  jobId: 'b',
  jobTitle: 'Backend Engineer at B',
  companyName: 'B Corp',
  platform: 'linkedin',
  url: 'https://example.com/b',
  capturedAt: Date.now(),
};

beforeEach(() => {
  mockSendMessage.mockReset();
  fakePort = makeFakePort();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      connect: () => fakePort,
    },
  };
});

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('useTabJobContext', () => {
  it('hydrates context from GET_TAB_JOB_CONTEXT on mount', async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      data: { tabId: 1, context: ctxA },
    });
    const { result } = renderHook(() => useTabJobContext());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.context).toEqual(ctxA);
    expect(result.current.tabId).toBe(1);
  });

  it('returns null context when GET_TAB_JOB_CONTEXT yields null', async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      data: { tabId: null, context: null },
    });
    const { result } = renderHook(() => useTabJobContext());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.context).toBeNull();
    expect(result.current.tabId).toBeNull();
  });

  it('updates context on CONTEXT_UPDATE for the bound tab id', async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      data: { tabId: 1, context: ctxA },
    });
    const { result } = renderHook(() => useTabJobContext());
    await waitFor(() => expect(result.current.context?.jobId).toBe('a'));

    act(() => {
      fakePort._emit({
        type: 'CONTEXT_UPDATE',
        tabId: 1,
        context: { ...ctxA, jobTitle: 'Updated' },
      });
    });
    expect(result.current.context?.jobTitle).toBe('Updated');
  });

  it('IGNORES CONTEXT_UPDATE for a different tab id (defense in depth)', async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      data: { tabId: 1, context: ctxA },
    });
    const { result } = renderHook(() => useTabJobContext());
    await waitFor(() => expect(result.current.context?.jobId).toBe('a'));

    act(() => {
      fakePort._emit({ type: 'CONTEXT_UPDATE', tabId: 99, context: ctxB });
    });
    // Should still be the original A context, not B
    expect(result.current.context?.jobId).toBe('a');
  });

  it('re-fetches context on TAB_CHANGED', async () => {
    mockSendMessage.mockResolvedValueOnce({
      success: true,
      data: { tabId: 1, context: ctxA },
    });
    const { result } = renderHook(() => useTabJobContext());
    await waitFor(() => expect(result.current.context?.jobId).toBe('a'));

    // Set up the second sendMessage response for the TAB_CHANGED re-fetch.
    mockSendMessage.mockResolvedValueOnce({
      success: true,
      data: { tabId: 2, context: ctxB },
    });

    act(() => {
      fakePort._emit({ type: 'TAB_CHANGED', tabId: 2 });
    });

    await waitFor(() => expect(result.current.context?.jobId).toBe('b'));
    expect(result.current.tabId).toBe(2);
  });

  it('degrades gracefully when chrome.runtime is missing', async () => {
    delete (globalThis as { chrome?: unknown }).chrome;
    mockSendMessage.mockRejectedValue(new Error('chrome.runtime missing'));
    const { result } = renderHook(() => useTabJobContext());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.context).toBeNull();
  });
});
