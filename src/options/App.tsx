import { useState, useEffect, useCallback } from 'react';
import Dashboard from './pages/Dashboard';
import ResumeUpload from './pages/ResumeUpload';
import MyProfile from './pages/MyProfile';
import ProfileManager from './pages/ProfileManager';
import AISettings from './pages/AISettings';
import ATSScore from './pages/ATSScore';
import InterviewPrep from './pages/InterviewPrep';
import EmailTemplates from './pages/EmailTemplates';
import ApplicationHistory from './pages/ApplicationHistory';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import DataManager from './pages/DataManager';
import WorkspaceSwitcher from './components/WorkspaceSwitcher';
import OnboardingWizard from './components/OnboardingWizard';
import { ProfileProvider } from './context/ProfileContext';

type Tab =
  | 'dashboard'
  | 'resume'
  | 'myprofile'
  | 'profiles'
  | 'atsscore'
  | 'interview'
  | 'email'
  | 'ai'
  | 'history'
  | 'analytics'
  | 'data';

const NAV_ITEMS: { tab: Tab; label: string; icon: React.ReactNode }[] = [
  {
    tab: 'dashboard',
    label: 'Dashboard',
    icon: (
      <>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </>
    ),
  },
  {
    tab: 'resume',
    label: 'Create Profile',
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <line x1="20" y1="8" x2="20" y2="14" />
        <line x1="23" y1="11" x2="17" y2="11" />
      </>
    ),
  },
  {
    tab: 'myprofile',
    label: 'My Profile',
    icon: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </>
    ),
  },
  {
    tab: 'profiles',
    label: 'Role Profiles',
    icon: (
      <>
        <circle cx="6" cy="6" r="3" />
        <path d="M6 9v12" />
        <path d="M6 15h7a3 3 0 0 0 3-3V9" />
        <circle cx="16" cy="6" r="3" />
      </>
    ),
  },
  { tab: 'atsscore', label: 'ATS Score', icon: <path d="M22 12h-4l-3 9L9 3l-3 9H2" /> },
  {
    tab: 'interview',
    label: 'Interview Prep',
    icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  },
  {
    tab: 'email',
    label: 'Email Templates',
    icon: (
      <>
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </>
    ),
  },
  {
    tab: 'ai',
    label: 'AI Settings',
    icon: (
      <>
        <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
        <path d="M12 2a10 10 0 0 1 10 10" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  {
    tab: 'history',
    label: 'Applications',
    icon: (
      <path d="M20 7h-4V4a2 2 0 0 0-2-2H10a2 2 0 0 0-2 2v3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM10 4h4v3h-4V4z" />
    ),
  },
  {
    tab: 'analytics',
    label: 'Analytics',
    icon: (
      <>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </>
    ),
  },
  {
    tab: 'data',
    label: 'Data Manager',
    icon: (
      <>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </>
    ),
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  useEffect(() => {
    chrome.runtime
      .sendMessage({ type: 'GET_SETTINGS' })
      .then((res) => {
        if (res?.success && res.data && !res.data.onboardingCompleted) {
          setShowOnboarding(true);
        }
      })
      .catch(() => {
        // Extension context may be invalidated — skip onboarding check
      })
      .finally(() => setCheckingOnboarding(false));
  }, []);

  const handleOnboardingDone = async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (res?.success && res.data) {
        await chrome.runtime.sendMessage({
          type: 'UPDATE_SETTINGS',
          payload: { ...res.data, onboardingCompleted: true },
        });
      }
    } catch {
      // Non-critical — onboarding state save failed
    }
    setShowOnboarding(false);
  };

  const handleNavKeyDown = useCallback((e: React.KeyboardEvent, currentTab: Tab) => {
    const tabs = NAV_ITEMS.map((n) => n.tab);
    const idx = tabs.indexOf(currentTab);
    let nextIdx = -1;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      nextIdx = (idx + 1) % tabs.length;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIdx = (idx - 1 + tabs.length) % tabs.length;
    }

    if (nextIdx >= 0) {
      setActiveTab(tabs[nextIdx]);
      const buttons = document.querySelectorAll<HTMLButtonElement>('.sidebar-nav .nav-item');
      buttons[nextIdx]?.focus();
    }
  }, []);

  if (checkingOnboarding) return null;

  if (showOnboarding) {
    return (
      <ProfileProvider>
        <OnboardingWizard onComplete={handleOnboardingDone} onSkip={handleOnboardingDone} />
      </ProfileProvider>
    );
  }

  return (
    <ProfileProvider>
      <div className="options-container">
        <aside className="sidebar">
          <div className="sidebar-header">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M20 7h-4V4a2 2 0 0 0-2-2H10a2 2 0 0 0-2 2v3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM10 4h4v3h-4V4z" />
            </svg>
            <span>ApplySharp</span>
          </div>

          {/* Workspace Switcher */}
          <WorkspaceSwitcher />

          <nav className="sidebar-nav" aria-label="Main navigation">
            {NAV_ITEMS.map(({ tab, label, icon }) => (
              <button
                key={tab}
                className={`nav-item ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
                aria-current={activeTab === tab ? 'page' : undefined}
                onKeyDown={(e) => handleNavKeyDown(e, tab)}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  {icon}
                </svg>
                {label}
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="version">v1.0.0</div>
          </div>
        </aside>

        <main className="main-content" aria-label="Page content">
          {activeTab === 'dashboard' && (
            <Dashboard onNavigate={(tab) => setActiveTab(tab as Tab)} />
          )}
          {activeTab === 'resume' && <ResumeUpload />}
          {activeTab === 'myprofile' && <MyProfile />}
          {activeTab === 'profiles' && <ProfileManager />}
          {activeTab === 'atsscore' && <ATSScore />}
          {activeTab === 'interview' && <InterviewPrep />}
          {activeTab === 'email' && <EmailTemplates />}
          {activeTab === 'ai' && <AISettings />}
          {activeTab === 'history' && <ApplicationHistory />}
          {activeTab === 'analytics' && <AnalyticsDashboard />}
          {activeTab === 'data' && <DataManager />}
        </main>
      </div>
    </ProfileProvider>
  );
}
