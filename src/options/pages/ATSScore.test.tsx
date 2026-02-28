import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ATSScore from './ATSScore';

// ── Mocks ────────────────────────────────────────────────────────────────

const mockSendMessage = vi.fn();
vi.mock('@shared/utils/messaging', () => ({
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}));

vi.mock('@/core/resume/file-parser', () => ({
  parseResumeFile: vi.fn(),
}));

const mockProfile = {
  id: 'test-profile-1',
  personal: { fullName: 'Test User' },
  experience: [
    {
      company: 'TestCo',
      title: 'Senior Engineer',
      startDate: 'Jan 2020',
      endDate: 'Present',
      achievements: ['Built systems serving 1M users'],
    },
  ],
  skills: {
    technical: [{ name: 'Python' }],
    tools: [],
    frameworks: [],
  },
  careerContext: { yearsOfExperience: 5, seniority: 'mid' },
  education: [],
  certifications: [],
  projects: [],
  generatedProfiles: [],
};

let mockProfileValue: typeof mockProfile | null = mockProfile;

vi.mock('../context/ProfileContext', () => ({
  useProfile: () => ({
    profile: mockProfileValue,
    allProfiles: mockProfileValue ? [mockProfileValue] : [],
    isLoading: false,
    error: null,
    setProfile: vi.fn(),
    switchWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    updateProfile: vi.fn(),
    refreshProfile: vi.fn(),
    refreshAllProfiles: vi.fn(),
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────

const mockScoreResult = {
  formatScore: {
    overallScore: 82,
    categoryScores: {
      sectionHeaders: 90,
      dateFormat: 100,
      keywordDensity: 75,
      bulletQuality: 80,
      pageCount: 100,
      acronymCoverage: 65,
    },
    issues: [
      {
        category: 'acronyms',
        severity: 'info',
        message: 'AWS used without full form',
        suggestion: 'Include "Amazon Web Services (AWS)"',
      },
    ],
    passesMinimum: true,
  },
  bulletReport: {
    overallScore: 78,
    totalBullets: 5,
    bulletsWithIssues: 2,
    roles: [
      {
        company: 'TestCo',
        title: 'Senior Engineer',
        bulletCount: 5,
        expectedRange: [5, 8],
        roleScore: 78,
        bullets: [],
        issues: [],
      },
    ],
    topIssues: [],
  },
  overallScore: 80,
};

function setupSuccessResponse() {
  mockSendMessage.mockResolvedValue({
    success: true,
    data: mockScoreResult,
  });
}

function setupErrorResponse(error = 'Connection failed') {
  mockSendMessage.mockResolvedValue({
    success: false,
    error,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('ATSScore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfileValue = mockProfile;
    // Default: successful scoring
    setupSuccessResponse();
  });

  it('renders both mode tabs', () => {
    render(<ATSScore />);
    expect(screen.getByTestId('mode-profile')).toBeInTheDocument();
    expect(screen.getByTestId('mode-file')).toBeInTheDocument();
    expect(screen.getByTestId('mode-profile')).toHaveTextContent('Score My Profile');
    expect(screen.getByTestId('mode-file')).toHaveTextContent('Upload & Score Resume');
  });

  it('shows empty state when no profile loaded in profile mode', async () => {
    mockProfileValue = null;
    render(<ATSScore />);
    // Default mode is 'file' when no profile, switch to profile mode
    fireEvent.click(screen.getByTestId('mode-profile'));
    expect(screen.getByText(/No profile loaded/i)).toBeInTheDocument();
  });

  it('auto-scores profile on mount when profile exists', async () => {
    render(<ATSScore />);
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SCORE_RESUME_ATS',
          payload: expect.objectContaining({
            masterProfileId: 'test-profile-1',
          }),
        })
      );
    });
  });

  it('shows error for invalid file type in file mode', () => {
    render(<ATSScore />);
    // Switch to file mode
    fireEvent.click(screen.getByTestId('mode-file'));

    const fileInput = document.getElementById('ats-file-input') as HTMLInputElement;
    const invalidFile = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    expect(screen.getByTestId('ats-error')).toHaveTextContent(
      'Please upload a PDF, DOCX, or TXT file'
    );
  });

  it('shows error for file too large', () => {
    render(<ATSScore />);
    fireEvent.click(screen.getByTestId('mode-file'));

    const fileInput = document.getElementById('ats-file-input') as HTMLInputElement;
    // Create a fake large file (>10MB)
    const largeContent = new Array(11 * 1024 * 1024).fill('a').join('');
    const largeFile = new File([largeContent], 'resume.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    expect(screen.getByTestId('ats-error')).toHaveTextContent('File size must be less than 10MB');
  });

  it('disables score button when no profile in profile mode', () => {
    mockProfileValue = null;
    render(<ATSScore />);
    // No profile means no controls shown, but let's verify with profile that has no id
    mockProfileValue = { ...mockProfile, id: '' } as typeof mockProfile;
    render(<ATSScore />);
    // Score button should be disabled since profile.id is falsy
    const buttons = screen.getAllByTestId('score-button');
    const lastButton = buttons[buttons.length - 1];
    expect(lastButton).toBeDisabled();
  });

  it('shows overall score card after successful scoring', async () => {
    render(<ATSScore />);
    await waitFor(() => {
      expect(screen.getByTestId('overall-score')).toBeInTheDocument();
    });
    const scoreCard = screen.getByTestId('overall-score');
    expect(scoreCard).toHaveTextContent('80');
    expect(screen.getByText('Overall ATS Score')).toBeInTheDocument();
  });

  it('shows all 6 format category labels after scoring', async () => {
    render(<ATSScore />);
    await waitFor(() => {
      expect(screen.getByTestId('overall-score')).toBeInTheDocument();
    });
    expect(screen.getByText('Section Headers')).toBeInTheDocument();
    expect(screen.getByText('Date Formatting')).toBeInTheDocument();
    expect(screen.getByText('Keyword Density')).toBeInTheDocument();
    expect(screen.getByText('Bullet Quality')).toBeInTheDocument();
    expect(screen.getByText('Page Count')).toBeInTheDocument();
    expect(screen.getByText('Acronym Coverage')).toBeInTheDocument();
  });

  it('shows error message when scoring fails', async () => {
    setupErrorResponse('Backend service unavailable');
    render(<ATSScore />);
    await waitFor(() => {
      expect(screen.getByTestId('ats-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('ats-error')).toHaveTextContent('Backend service unavailable');
  });

  it('shows success banner after scoring completes', async () => {
    render(<ATSScore />);
    await waitFor(() => {
      expect(screen.getByTestId('ats-success')).toBeInTheDocument();
    });
    expect(screen.getByTestId('ats-success')).toHaveTextContent('Score: 80/100');
  });
});
