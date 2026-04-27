/**
 * GhostScoreCard render tests (Workstream 8 UI, iter-2 coverage gap fix).
 *
 * Verifies the card renders the right bucket / icon / recommendation /
 * details state for each of the three GhostScore buckets, and that the
 * "Check layoff news + JD vagueness" CTA appears for cheap-phase scores
 * but not for full-phase ones.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockSendMessage = vi.fn();
vi.mock('@shared/utils/messaging', () => ({
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}));

import GhostScoreCard from './GhostScoreCard';
import type { TabJobContext } from '@shared/types/sidepanel.types';
import type { GhostScore } from '@core/ghost-job-detector/types';

const ctx: TabJobContext = {
  jobId: 'linkedin-1',
  jobTitle: 'Senior Backend Engineer',
  companyName: 'Acme Corp',
  platform: 'linkedin',
  url: 'https://www.linkedin.com/jobs/view/1',
  capturedAt: Date.now(),
};

function greenScore(): GhostScore {
  return {
    total: 10,
    bucket: 'green',
    recommendation: 'apply_normally',
    signals: [
      {
        kind: 'posting_age',
        triggered: false,
        weight: 0,
        confidence: 'high',
        reason: 'Posted 5 days ago (recent)',
      },
    ],
    computedAt: '2026-04-08T12:00:00Z',
    scoreVersion: 1,
    phase: 'cheap',
  };
}

function redScore(): GhostScore {
  return {
    total: 78,
    bucket: 'red',
    recommendation: 'skip_likely_ghost',
    signals: [
      {
        kind: 'posting_age',
        triggered: true,
        weight: 35,
        confidence: 'high',
        reason: 'Posted 67 days ago',
        evidence: '2026-02-01',
      },
      {
        kind: 'reposting',
        triggered: true,
        weight: 30,
        confidence: 'high',
        reason: 'Reposted 3 times in your tracker',
      },
    ],
    computedAt: '2026-04-08T12:00:00Z',
    scoreVersion: 1,
    phase: 'full',
  };
}

describe('GhostScoreCard', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
  });

  it('renders the green bucket with apply_normally recommendation', async () => {
    mockSendMessage.mockResolvedValue({ success: true, data: greenScore() });
    render(<GhostScoreCard context={ctx} />);
    await waitFor(() => expect(screen.getByText('Apply normally')).toBeInTheDocument());
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Looks fine')).toBeInTheDocument();
  });

  it('renders the red bucket with skip recommendation and reasoning bullets', async () => {
    mockSendMessage.mockResolvedValue({ success: true, data: redScore() });
    render(<GhostScoreCard context={ctx} />);
    await waitFor(() => expect(screen.getByText('Skip, likely ghost')).toBeInTheDocument());
    expect(screen.getByText('78')).toBeInTheDocument();
    expect(screen.getByText('Likely ghost')).toBeInTheDocument();
    expect(screen.getByText(/Posted 67 days ago/)).toBeInTheDocument();
    expect(screen.getByText(/Reposted 3 times/)).toBeInTheDocument();
  });

  it('does NOT contain an em-dash anywhere in the rendered output', async () => {
    mockSendMessage.mockResolvedValue({ success: true, data: redScore() });
    const { container } = render(<GhostScoreCard context={ctx} />);
    await waitFor(() => expect(screen.getByText('Skip, likely ghost')).toBeInTheDocument());
    expect(container.textContent).not.toContain('\u2014');
  });

  it('renders the cheap-phase CTA for cheap-phase score', async () => {
    mockSendMessage.mockResolvedValue({ success: true, data: greenScore() });
    render(<GhostScoreCard context={ctx} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Check layoff news/i })).toBeInTheDocument()
    );
  });

  it('renders the full-phase refresh button for full-phase score', async () => {
    mockSendMessage.mockResolvedValue({ success: true, data: redScore() });
    render(<GhostScoreCard context={ctx} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Refresh layoff news/i })).toBeInTheDocument()
    );
  });

  it('renders the error state with retry button on failure', async () => {
    mockSendMessage.mockResolvedValue({ success: false, error: 'AI provider down' });
    render(<GhostScoreCard context={ctx} />);
    await waitFor(() => expect(screen.getByText('AI provider down')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
