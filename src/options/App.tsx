import { useState, useEffect, useCallback } from 'react';
import Dashboard from './pages/Dashboard';
import ResumeUpload from './pages/ResumeUpload';
import MyProfile from './pages/MyProfile';
import ProfileManager from './pages/ProfileManager';
import AISettings from './pages/AISettings';
import Tracker from './pages/Tracker';
import JobFeed from './pages/JobFeed';
import SponsorLookup from './pages/SponsorLookup';
import OutreachComposer from './pages/OutreachComposer';
import Contacts from './pages/Contacts';
import Assistant from './pages/Assistant';
import DataManager from './pages/DataManager';
import { DEFAULT_FLAGS, type FeatureFlagKey } from '@shared/feature-flags';
import WorkspaceSwitcher from './components/WorkspaceSwitcher';
import OnboardingWizard from './components/OnboardingWizard';
import Logo from './components/Logo';
import ThemeToggle from './components/ThemeToggle';
import { ProfileProvider } from './context/ProfileContext';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';

type Tab =
  | 'dashboard'
  | 'assistant'
  | 'jobfeed'
  | 'sponsorlookup'
  | 'composer'
  | 'resume'
  | 'myprofile'
  | 'profiles'
  | 'contacts'
  | 'ai'
  | 'tracker'
  | 'data';

const ALL_NAV_ITEMS: {
  tab: Tab;
  label: string;
  icon: React.ReactNode;
  flag?: FeatureFlagKey;
}[] = [
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
    tab: 'assistant',
    label: 'Assistant',
    icon: (
      <>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <circle cx="9" cy="11" r="1" />
        <circle cx="15" cy="11" r="1" />
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
  {
    tab: 'contacts',
    label: 'Contacts',
    flag: 'pages.contactsCrm',
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <path d="M20 8v6" />
        <path d="M23 11h-6" />
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
    tab: 'tracker',
    label: 'Tracker',
    icon: (
      <>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </>
    ),
  },
  {
    tab: 'jobfeed',
    label: 'Job Feed',
    flag: 'pages.jobFeed',
    icon: (
      <>
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </>
    ),
  },
  {
    tab: 'sponsorlookup',
    label: 'Sponsor Lookup',
    flag: 'pages.sponsorLookup',
    icon: (
      <>
        <path d="M12 2C8 2 5 5 5 9c0 5.5 7 13 7 13s7-7.5 7-13c0-4-3-7-7-7z" />
        <circle cx="12" cy="9" r="2.5" />
      </>
    ),
  },
  {
    tab: 'composer',
    label: 'Outreach',
    flag: 'pages.outreachComposer',
    icon: (
      <>
        <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
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

const NAV_ITEMS = ALL_NAV_ITEMS.filter((item) => !item.flag || DEFAULT_FLAGS[item.flag]);

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  useEffect(() => {
    chrome.runtime
      .sendMessage({ type: 'GET_SETTINGS' })
      .then((res) => {
        if (res?.success && res.data) {
          if (!res.data.onboardingCompleted) {
            setShowOnboarding(true);
          }
          // Apply compactMode setting
          if (res.data.appearance?.compactMode) {
            document.documentElement.classList.add('compact-mode');
          }
        }
      })
      .catch(() => {
        // Extension context may be invalidated, skip onboarding check
      })
      .finally(() => setCheckingOnboarding(false));
  }, []);

  // Workstream 10: read the optionsTab handoff written by handleOpenOptions
  // in background/message-handler.ts. The sidepanel ContactsCard sends
  // OPEN_OPTIONS with payload.tab='contacts' so the user lands on the
  // CRM page after clicking "View all in CRM". The background writes the
  // value to chrome.storage.local; we read it on mount, navigate, then
  // delete the key so a future plain "open options" does not get stuck
  // on the wrong tab. Pre-existing bug surfaced by WS10 iter-1 review.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const got = await chrome.storage.local.get('optionsTab');
        if (cancelled) return;
        const tab = got?.optionsTab as Tab | undefined;
        if (tab && NAV_ITEMS.some((item) => item.tab === tab)) {
          setActiveTab(tab);
          await chrome.storage.local.remove('optionsTab');
        }
      } catch {
        // chrome.storage may be unavailable; silent fall-through
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOnboardingDone = async () => {
    try {
      // Use partial update to avoid overwriting concurrent settings changes
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        payload: { onboardingCompleted: true },
      });
    } catch {
      // Non-critical — onboarding state save failed
    }
    setShowOnboarding(false);
  };

  // Global keyboard shortcuts for tab navigation (Alt+1 through Alt+9)
  useEffect(() => {
    const tabs = NAV_ITEMS.map((n) => n.tab);
    const handleGlobalKey = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (e.target as HTMLElement)?.isContentEditable
      )
        return;

      // Alt+1 through Alt+9 for direct tab access
      if (e.altKey && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        if (idx < tabs.length) {
          e.preventDefault();
          setActiveTab(tabs[idx]);
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKey);
    return () => document.removeEventListener('keydown', handleGlobalKey);
  }, []);

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

  if (checkingOnboarding) {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}
      >
        <div className="spinner" />
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <ErrorBoundary>
        <ProfileProvider>
          <OnboardingWizard onComplete={handleOnboardingDone} onSkip={handleOnboardingDone} />
        </ProfileProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <ProfileProvider>
          <div className="options-container">
            <aside className="sidebar">
              <div className="sidebar-header">
                <Logo size={32} />
                <span className="sidebar-brand">
                  Apply<strong>Sharp</strong>
                </span>
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
                <ThemeToggle />
                <div className="version">v{chrome.runtime.getManifest().version}</div>
                <div className="version-hint">Alt+1-9 for tabs</div>
              </div>
            </aside>

            <main className="main-content" aria-label="Page content">
              {activeTab === 'dashboard' && (
                <Dashboard onNavigate={(tab) => setActiveTab(tab as Tab)} />
              )}
              {activeTab === 'assistant' && <Assistant />}
              {activeTab === 'resume' && <ResumeUpload />}
              {activeTab === 'myprofile' && <MyProfile />}
              {activeTab === 'profiles' && <ProfileManager />}
              {activeTab === 'contacts' && <Contacts />}
              {activeTab === 'ai' && <AISettings />}
              {activeTab === 'tracker' && <Tracker />}
              {activeTab === 'jobfeed' && <JobFeed />}
              {activeTab === 'sponsorlookup' && <SponsorLookup />}
              {activeTab === 'composer' && <OutreachComposer />}
              {activeTab === 'data' && <DataManager />}
            </main>
          </div>
        </ProfileProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
