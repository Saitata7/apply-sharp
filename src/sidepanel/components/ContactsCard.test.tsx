/**
 * ContactsCard tests (Workstream 10, iter-2 coverage gap fix).
 *
 * Verifies the 4th sidepanel card:
 *   - hides when no contacts captured for the current job (empty != error)
 *   - renders contact rows with name + title + email
 *   - draft email button writes the outreach handoff to chrome.storage and
 *     dispatches OPEN_OPTIONS with tab='outreach' (not the dead fire-and-
 *     forget GENERATE_OUTREACH the iter-1 version had)
 *   - "View all in CRM" dispatches OPEN_OPTIONS with tab='contacts'
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockSendMessage = vi.fn();
vi.mock('@shared/utils/messaging', () => ({
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}));

import ContactsCard from './ContactsCard';
import type { TabJobContext } from '@shared/types/sidepanel.types';
import type { Contact } from '@shared/types/contact.types';

const ctx: TabJobContext = {
  jobId: 'wellfound-1',
  jobTitle: 'Senior Backend Engineer',
  companyName: 'Acme Corp',
  platform: 'wellfound',
  url: 'https://wellfound.com/jobs/1',
  capturedAt: Date.now(),
};

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'email:abc',
    sightings: [],
    jobIds: ['wellfound-1'],
    canonical: {
      name: 'Sarah Chen',
      title: 'Head of Engineering',
      email: 'sarah@acme.co',
      company: 'Acme Corp',
    },
    createdAt: '2026-04-09T00:00:00Z',
    updatedAt: '2026-04-09T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockSendMessage.mockReset();
  // Mock chrome.runtime + chrome.storage for the draft handoff path
  (
    globalThis as unknown as {
      chrome: {
        runtime: { sendMessage: ReturnType<typeof vi.fn> };
        storage: { local: { set: ReturnType<typeof vi.fn> } };
      };
    }
  ).chrome = {
    runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
    storage: { local: { set: vi.fn().mockResolvedValue(undefined) } },
  };
});

describe('ContactsCard', () => {
  it('hides entirely when no contacts are captured for the current job', async () => {
    mockSendMessage.mockResolvedValue({ success: true, data: [] });
    const { container } = render(<ContactsCard context={ctx} />);
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalled();
    });
    // The component returns null on empty success state
    expect(container.querySelector('section')).toBeNull();
  });

  it('renders contact rows when the job has captured contacts', async () => {
    mockSendMessage.mockResolvedValue({ success: true, data: [makeContact()] });
    render(<ContactsCard context={ctx} />);
    await waitFor(() => expect(screen.getByText('Sarah Chen')).toBeInTheDocument());
    expect(screen.getByText('Head of Engineering')).toBeInTheDocument();
    expect(screen.getByText('sarah@acme.co')).toBeInTheDocument();
  });

  it('shows the section header with capture count', async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      data: [makeContact(), makeContact({ id: 'email:def' })],
    });
    render(<ContactsCard context={ctx} />);
    await waitFor(() => expect(screen.getByText('Contacts')).toBeInTheDocument());
    expect(screen.getByText('2 captured')).toBeInTheDocument();
  });

  it('does NOT call GENERATE_OUTREACH on draft button click (iter-2 fix)', async () => {
    mockSendMessage.mockResolvedValue({ success: true, data: [makeContact()] });
    render(<ContactsCard context={ctx} />);
    await waitFor(() => expect(screen.getByText('Draft email')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Draft email'));
    await waitFor(() => {
      expect(
        (
          globalThis as unknown as {
            chrome: { runtime: { sendMessage: ReturnType<typeof vi.fn> } };
          }
        ).chrome.runtime.sendMessage
      ).toHaveBeenCalledWith({
        type: 'OPEN_OPTIONS',
        payload: { tab: 'outreach' },
      });
    });
    // The dead GENERATE_OUTREACH path should NEVER fire
    const callTypes = mockSendMessage.mock.calls.map((c) => c[0]?.type);
    expect(callTypes).not.toContain('GENERATE_OUTREACH');
  });

  it('writes outreachHandoff to chrome.storage on draft click', async () => {
    mockSendMessage.mockResolvedValue({ success: true, data: [makeContact()] });
    render(<ContactsCard context={ctx} />);
    await waitFor(() => expect(screen.getByText('Draft email')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Draft email'));
    await waitFor(() => {
      const storage = (
        globalThis as unknown as {
          chrome: { storage: { local: { set: ReturnType<typeof vi.fn> } } };
        }
      ).chrome.storage.local;
      expect(storage.set).toHaveBeenCalledWith(
        expect.objectContaining({
          outreachHandoff: expect.objectContaining({
            recipientEmail: 'sarah@acme.co',
            recipientName: 'Sarah Chen',
            companyName: 'Acme Corp',
          }),
        })
      );
    });
  });

  it('"View all in CRM" navigates to the contacts options tab', async () => {
    mockSendMessage.mockResolvedValue({ success: true, data: [makeContact()] });
    render(<ContactsCard context={ctx} />);
    await waitFor(() => expect(screen.getByText('View all in CRM')).toBeInTheDocument());
    fireEvent.click(screen.getByText('View all in CRM'));
    await waitFor(() => {
      expect(
        (
          globalThis as unknown as {
            chrome: { runtime: { sendMessage: ReturnType<typeof vi.fn> } };
          }
        ).chrome.runtime.sendMessage
      ).toHaveBeenCalledWith({
        type: 'OPEN_OPTIONS',
        payload: { tab: 'contacts' },
      });
    });
  });
});
