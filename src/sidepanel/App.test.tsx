/**
 * Side panel App shell tests (Workstream 7, iter-3 coverage gap fix).
 *
 * Verifies the App component:
 *   - mounts the empty state when no tab context exists
 *   - mounts the three insight cards once a context arrives
 *   - uses the <aside role="complementary"> landmark
 *   - respects feature flag toggles to hide individual cards
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockSendMessage = vi.fn();
vi.mock('@shared/utils/messaging', () => ({
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}));

const mockGetAllFeatureFlags = vi.fn();
vi.mock('@shared/feature-flags', async () => {
  const actual =
    await vi.importActual<typeof import('@shared/feature-flags')>('@shared/feature-flags');
  return {
    ...actual,
    getAllFeatureFlags: () => mockGetAllFeatureFlags(),
  };
});

import App from './App';
import { DEFAULT_FLAGS } from '@shared/feature-flags';

describe('Side panel App', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
    mockGetAllFeatureFlags.mockReset().mockResolvedValue(DEFAULT_FLAGS);
  });

  it('renders the empty state when GET_TAB_JOB_CONTEXT returns null', async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      data: { tabId: null, context: null },
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText('No job detected')).toBeInTheDocument());
  });

  it('uses the aside role="complementary" landmark', async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      data: { tabId: null, context: null },
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole('complementary')).toBeInTheDocument());
  });

  it('renders the three insight cards once a tab context hydrates', async () => {
    mockSendMessage.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'GET_TAB_JOB_CONTEXT') {
        return {
          success: true,
          data: {
            tabId: 1,
            context: {
              jobId: 'linkedin-1',
              jobTitle: 'Senior Backend Engineer',
              companyName: 'Acme Corp',
              platform: 'linkedin',
              url: 'https://www.linkedin.com/jobs/view/1',
              capturedAt: Date.now(),
            },
          },
        };
      }
      // Other messages (ANALYZE_JOB, SCORE_GHOST_JOB, ...) return empty success
      return { success: true, data: null };
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText('Senior Backend Engineer')).toBeInTheDocument());
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    // Card titles
    expect(screen.getByText('Job Insights')).toBeInTheDocument();
    expect(screen.getByText('Ghost Score')).toBeInTheDocument();
    expect(screen.getByText('Find better jobs')).toBeInTheDocument();
  });

  it('hides Ghost Score card when discovery.ghostJob flag is off', async () => {
    mockGetAllFeatureFlags.mockResolvedValue({
      ...DEFAULT_FLAGS,
      'discovery.ghostJob': false,
    });
    mockSendMessage.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'GET_TAB_JOB_CONTEXT') {
        return {
          success: true,
          data: {
            tabId: 1,
            context: {
              jobId: 'linkedin-1',
              jobTitle: 'Senior Backend Engineer',
              companyName: 'Acme Corp',
              platform: 'linkedin',
              url: 'https://www.linkedin.com/jobs/view/1',
              capturedAt: Date.now(),
            },
          },
        };
      }
      return { success: true, data: null };
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText('Job Insights')).toBeInTheDocument());
    expect(screen.queryByText('Ghost Score')).not.toBeInTheDocument();
  });

  it('hides Discovery card when ALL discovery sub-flags are off', async () => {
    mockGetAllFeatureFlags.mockResolvedValue({
      ...DEFAULT_FLAGS,
      'discovery.portalRecommender': false,
      'discovery.hnWhosHiring': false,
      'discovery.ycDirectLinks': false,
    });
    mockSendMessage.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'GET_TAB_JOB_CONTEXT') {
        return {
          success: true,
          data: {
            tabId: 1,
            context: {
              jobId: 'linkedin-1',
              jobTitle: 'Senior Backend Engineer',
              companyName: 'Acme Corp',
              platform: 'linkedin',
              url: 'https://www.linkedin.com/jobs/view/1',
              capturedAt: Date.now(),
            },
          },
        };
      }
      return { success: true, data: null };
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText('Job Insights')).toBeInTheDocument());
    expect(screen.queryByText('Find better jobs')).not.toBeInTheDocument();
  });
});
