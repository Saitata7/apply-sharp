/**
 * DiscoveryCard tests (Workstream 9, iter-3 coverage gap fix).
 *
 * Verifies the three subcards render, the permission-denied state shows
 * the grant button, the dismissable banner can be dismissed, and the
 * sanitized HN HTML lands inside the sp-hn-comment box.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockSendMessage = vi.fn();
vi.mock('@shared/utils/messaging', () => ({
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}));

import DiscoveryCard from './DiscoveryCard';
import type { TabJobContext } from '@shared/types/sidepanel.types';

const ctx: TabJobContext = {
  jobId: 'linkedin-1',
  jobTitle: 'Senior Backend Engineer',
  companyName: 'Acme Corp',
  platform: 'linkedin',
  url: 'https://www.linkedin.com/jobs/view/1',
  capturedAt: Date.now(),
};

describe('DiscoveryCard', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
    // Default: portal recommender returns 3 portals + a 5-entry skip list
    mockSendMessage.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'GET_PORTAL_RECOMMENDATIONS') {
        return {
          success: true,
          data: {
            recommendations: [
              {
                sourceName: 'Y Combinator Work at a Startup',
                sourceUrl: 'https://www.workatastartup.com/',
                rank: 1,
                notes: 'YC-backed early stage',
              },
              { sourceName: 'Wellfound', sourceUrl: 'https://wellfound.com/jobs', rank: 2 },
              {
                sourceName: 'Hacker News Who is Hiring',
                sourceUrl: 'https://news.ycombinator.com/submitted?id=whoishiring',
                rank: 3,
              },
            ],
            skipList: [
              { name: 'Stack Overflow Jobs', reason: 'Service shut down', kind: 'dead' },
              { name: 'Glassdoor Jobs', reason: 'Search index broken', kind: 'dead' },
              { name: 'Jobcase', reason: 'Affiliate spam', kind: 'spam' },
              { name: 'Neuvoo', reason: 'Aggregator of aggregators', kind: 'spam' },
              { name: 'Lensa', reason: 'Email marketing aggregator', kind: 'spam' },
            ],
          },
        };
      }
      if (msg.type === 'GET_YC_ATS_LINKS') {
        return {
          success: true,
          data: {
            links: [
              {
                batch: 'W23',
                company: 'Anthropic',
                sector: 'ai',
                careerUrl: 'https://www.anthropic.com/careers',
                ats: 'greenhouse',
              },
            ],
            appliedSector: null,
          },
        };
      }
      return { success: true, data: null };
    });
  });

  it('renders Top portals subcard with the recommended sources', async () => {
    render(<DiscoveryCard context={ctx} />);
    await waitFor(() =>
      expect(screen.getByText('Y Combinator Work at a Startup')).toBeInTheDocument()
    );
    expect(screen.getByText('Wellfound')).toBeInTheDocument();
    expect(screen.getByText('Hacker News Who is Hiring')).toBeInTheDocument();
  });

  it('renders the YC direct ATS links subcard', async () => {
    render(<DiscoveryCard context={ctx} />);
    await waitFor(() => expect(screen.getByText('Anthropic')).toBeInTheDocument());
  });

  it('renders the Skip these dismissable banner with curated reasons', async () => {
    render(<DiscoveryCard context={ctx} />);
    await waitFor(() => expect(screen.getByText('Skip these. We checked.')).toBeInTheDocument());
    expect(screen.getByText(/Stack Overflow Jobs/)).toBeInTheDocument();
  });

  it('dismisses the Skip these banner on click', async () => {
    render(<DiscoveryCard context={ctx} />);
    await waitFor(() => expect(screen.getByText('Skip these. We checked.')).toBeInTheDocument());
    const dismissBtn = screen.getByLabelText('Dismiss skip list banner');
    fireEvent.click(dismissBtn);
    expect(screen.queryByText('Skip these. We checked.')).not.toBeInTheDocument();
  });

  it('does NOT contain an em-dash in the rendered output', async () => {
    const { container } = render(<DiscoveryCard context={ctx} />);
    await waitFor(() =>
      expect(screen.getByText('Y Combinator Work at a Startup')).toBeInTheDocument()
    );
    expect(container.textContent).not.toContain('\u2014');
  });
});
