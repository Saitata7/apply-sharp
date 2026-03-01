import { useState, useEffect, useMemo } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import type { ApplicationStatus } from '@shared/types/application.types';
import type { ApplicationWithJob } from '../components/applications/ApplicationCard';
import StatsSummary from '../components/analytics/StatsSummary';
import FunnelChart from '../components/analytics/FunnelChart';
import WeeklyVolume from '../components/analytics/WeeklyVolume';
import PlatformBreakdown from '../components/analytics/PlatformBreakdown';
import TopKeywords from '../components/analytics/TopKeywords';

export default function AnalyticsDashboard() {
  const [applications, setApplications] = useState<ApplicationWithJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [learningInsights, setLearningInsights] = useState<{
    topKeywords?: { keyword: string; score: number }[];
  } | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([loadApplications(), loadInsights()]).then((results) => {
      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        setLoadError('Some data failed to load');
      }
      setLoading(false);
    });
  }, []);

  async function loadApplications() {
    try {
      const response = await sendMessage<void, ApplicationWithJob[]>({
        type: 'GET_APPLICATIONS_WITH_JOBS',
      });
      if (response.success && response.data) {
        setApplications(response.data);
      }
    } catch (error) {
      console.error('[Analytics] Failed to load applications:', error);
    }
  }

  async function loadInsights() {
    try {
      const response = await sendMessage<
        void,
        { topKeywords?: { keyword: string; score: number }[] }
      >({
        type: 'GET_LEARNING_INSIGHTS',
      });
      if (response.success && response.data) {
        setLearningInsights(response.data);
      }
    } catch {
      // Learning insights are optional
    }
  }

  // Compute stats
  const stats = useMemo(() => {
    const total = applications.length;
    if (total === 0) return { total: 0, responseRate: 0, interviewRate: 0, offerRate: 0 };

    const responded = applications.filter((a) =>
      ['under_review', 'interview', 'offer', 'rejected'].includes(a.status)
    ).length;
    const interviewed = applications.filter((a) =>
      ['interview', 'offer'].includes(a.status)
    ).length;
    const offers = applications.filter((a) => a.status === 'offer').length;

    return {
      total,
      responseRate: Math.round((responded / total) * 100),
      interviewRate: Math.round((interviewed / total) * 100),
      offerRate: Math.round((offers / total) * 100),
    };
  }, [applications]);

  // Funnel stages
  const funnelStages = useMemo(() => {
    const countByStatus = (statuses: ApplicationStatus[]) =>
      applications.filter((a) => statuses.includes(a.status)).length;

    return [
      { label: 'Saved', count: countByStatus(['saved', 'in_progress']), color: 'slate' },
      { label: 'Submitted', count: countByStatus(['submitted', 'under_review']), color: 'blue' },
      { label: 'Interview', count: countByStatus(['interview']), color: 'cyan' },
      { label: 'Offer', count: countByStatus(['offer']), color: 'green' },
      { label: 'Rejected', count: countByStatus(['rejected']), color: 'red' },
    ];
  }, [applications]);

  // Weekly volume (last 8 weeks)
  const weeklyData = useMemo(() => {
    const weeks: { label: string; count: number }[] = [];
    const now = new Date();

    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - i * 7);
      weekStart.setHours(0, 0, 0, 0);
      // Align to Monday
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const count = applications.filter((a) => {
        const created = new Date(a.createdAt).getTime();
        return created >= weekStart.getTime() && created < weekEnd.getTime();
      }).length;

      const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      weeks.push({ label, count });
    }

    return weeks;
  }, [applications]);

  // Platform breakdown
  const platformData = useMemo(() => {
    const map: Record<string, { total: number; responded: number }> = {};
    for (const app of applications) {
      const platform = app.job?.platform || 'manual';
      if (!map[platform]) map[platform] = { total: 0, responded: 0 };
      map[platform].total++;
      if (['under_review', 'interview', 'offer', 'rejected'].includes(app.status)) {
        map[platform].responded++;
      }
    }
    return Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [applications]);

  // Top keywords from learning insights
  const topKeywords = useMemo(() => {
    return learningInsights?.topKeywords || [];
  }, [learningInsights]);

  if (loading) {
    return <div className="page-loading">Loading analytics...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Analytics</h1>
        <p className="page-description">Insights from your job application activity</p>
      </div>
      {loadError && (
        <div className="error-message" style={{ marginBottom: '1rem' }}>
          {loadError}
        </div>
      )}

      <StatsSummary
        total={stats.total}
        responseRate={stats.responseRate}
        interviewRate={stats.interviewRate}
        offerRate={stats.offerRate}
      />

      <div className="analytics-grid">
        <FunnelChart stages={funnelStages} />
        <WeeklyVolume weeks={weeklyData} />
      </div>

      <div className="analytics-grid">
        <PlatformBreakdown platforms={platformData} />
        <TopKeywords keywords={topKeywords} />
      </div>
    </div>
  );
}
