import { useState } from 'react';
import ResumeUpload from './pages/ResumeUpload';
import MyProfile from './pages/MyProfile';
import ProfileManager from './pages/ProfileManager';
import AISettings from './pages/AISettings';
import ApplicationHistory from './pages/ApplicationHistory';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import WorkspaceSwitcher from './components/WorkspaceSwitcher';
import { ProfileProvider } from './context/ProfileContext';

type Tab = 'resume' | 'myprofile' | 'profiles' | 'ai' | 'history' | 'analytics';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('resume');

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
            >
              <path d="M20 7h-4V4a2 2 0 0 0-2-2H10a2 2 0 0 0-2 2v3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM10 4h4v3h-4V4z" />
            </svg>
            <span>ApplySharp</span>
          </div>

          {/* Workspace Switcher */}
          <WorkspaceSwitcher />

          <nav className="sidebar-nav">
            <button
              className={`nav-item ${activeTab === 'resume' ? 'active' : ''}`}
              onClick={() => setActiveTab('resume')}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload Resume
            </button>

            <button
              className={`nav-item ${activeTab === 'myprofile' ? 'active' : ''}`}
              onClick={() => setActiveTab('myprofile')}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              My Profile
            </button>

            <button
              className={`nav-item ${activeTab === 'profiles' ? 'active' : ''}`}
              onClick={() => setActiveTab('profiles')}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="6" cy="6" r="3" />
                <path d="M6 9v12" />
                <path d="M6 15h7a3 3 0 0 0 3-3V9" />
                <circle cx="16" cy="6" r="3" />
              </svg>
              Role Profiles
            </button>

            <button
              className={`nav-item ${activeTab === 'ai' ? 'active' : ''}`}
              onClick={() => setActiveTab('ai')}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                <path d="M12 2a10 10 0 0 1 10 10" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              AI Settings
            </button>

            <button
              className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M20 7h-4V4a2 2 0 0 0-2-2H10a2 2 0 0 0-2 2v3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM10 4h4v3h-4V4z" />
              </svg>
              Applications
            </button>

            <button
              className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveTab('analytics')}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              Analytics
            </button>
          </nav>

          <div className="sidebar-footer">
            <div className="version">v1.0.0</div>
          </div>
        </aside>

        <main className="main-content">
          {activeTab === 'resume' && <ResumeUpload />}
          {activeTab === 'myprofile' && <MyProfile />}
          {activeTab === 'profiles' && <ProfileManager />}
          {activeTab === 'ai' && <AISettings />}
          {activeTab === 'history' && <ApplicationHistory />}
          {activeTab === 'analytics' && <AnalyticsDashboard />}
        </main>
      </div>
    </ProfileProvider>
  );
}
