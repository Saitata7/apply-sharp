import { useState, useEffect } from 'react';
import { sendMessage } from '@shared/utils/messaging';
import type { UsageSummary } from '@/ai/usage-tracker';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const FEATURE_LABELS: Record<string, string> = {
  jd_analysis: 'JD Analysis',
  summary_rewrite: 'Summary Rewrite',
  bullet_enhancement: 'Bullet Enhancement',
  cover_letter: 'Cover Letter',
  job_scoring: 'Job Scoring',
  profile_analysis: 'Profile Analysis',
  interview_prep: 'Interview Prep',
  email_template: 'Email Template',
  claims_validation: 'Claims Validation',
  profile_health: 'Profile Health',
  role_profile: 'Role Profile',
  quick_tailor: 'Quick Tailor',
  unknown: 'Other',
};

export default function UsageStats() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadUsage();
  }, []);

  async function loadUsage() {
    try {
      const response = await sendMessage<void, UsageSummary>({ type: 'GET_AI_USAGE' });
      if (response.success && response.data) {
        setSummary(response.data);
      }
    } catch (error) {
      console.error('[UsageStats] Failed to load usage:', error);
    } finally {
      setLoading(false);
    }
  }

  async function clearUsage() {
    if (!confirm('Clear all usage data? This cannot be undone.')) return;
    setClearing(true);
    try {
      await sendMessage<void, void>({ type: 'CLEAR_AI_USAGE' });
      setSummary(null);
      await loadUsage();
    } catch (error) {
      console.error('[UsageStats] Failed to clear usage:', error);
    } finally {
      setClearing(false);
    }
  }

  if (loading) {
    return (
      <div className="settings-section">
        <h3>Token Usage</h3>
        <p style={{ color: '#64748b' }}>Loading usage data...</p>
      </div>
    );
  }

  if (!summary || summary.totalCalls === 0) {
    return (
      <div className="settings-section">
        <h3>Token Usage</h3>
        <p style={{ color: '#64748b' }}>
          No usage data yet. Token consumption will appear here after AI calls.
        </p>
      </div>
    );
  }

  const providerEntries = Object.entries(summary.byProvider);
  const featureEntries = Object.entries(summary.byFeature).sort((a, b) => b[1].calls - a[1].calls);

  return (
    <div className="settings-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Token Usage</h3>
        <button
          className="btn btn-secondary"
          onClick={clearUsage}
          disabled={clearing}
          style={{ fontSize: '0.75rem', padding: '4px 10px' }}
        >
          {clearing ? 'Clearing...' : 'Clear Data'}
        </button>
      </div>

      {/* Totals */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <StatCard label="Total Calls" value={formatNumber(summary.totalCalls)} />
        <StatCard label="Input Tokens" value={formatNumber(summary.totalInputTokens)} />
        <StatCard label="Output Tokens" value={formatNumber(summary.totalOutputTokens)} />
      </div>

      {/* Time windows */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            padding: '10px',
            background: 'var(--bg-secondary, #f8fafc)',
            borderRadius: '8px',
          }}
        >
          <div
            style={{
              fontSize: '0.7rem',
              color: '#64748b',
              textTransform: 'uppercase',
              marginBottom: '4px',
            }}
          >
            Last 24 Hours
          </div>
          <div style={{ fontSize: '0.85rem' }}>
            {formatNumber(summary.last24h.calls)} calls &middot;{' '}
            {formatNumber(summary.last24h.input + summary.last24h.output)} tokens
          </div>
        </div>
        <div
          style={{
            padding: '10px',
            background: 'var(--bg-secondary, #f8fafc)',
            borderRadius: '8px',
          }}
        >
          <div
            style={{
              fontSize: '0.7rem',
              color: '#64748b',
              textTransform: 'uppercase',
              marginBottom: '4px',
            }}
          >
            Last 7 Days
          </div>
          <div style={{ fontSize: '0.85rem' }}>
            {formatNumber(summary.last7d.calls)} calls &middot;{' '}
            {formatNumber(summary.last7d.input + summary.last7d.output)} tokens
          </div>
        </div>
      </div>

      {/* By provider */}
      {providerEntries.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '8px' }}>By Provider</h4>
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Provider</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>Calls</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>Input</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>Output</th>
              </tr>
            </thead>
            <tbody>
              {providerEntries.map(([provider, stats]) => (
                <tr
                  key={provider}
                  style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)' }}
                >
                  <td style={{ padding: '4px 8px', textTransform: 'capitalize' }}>{provider}</td>
                  <td style={{ textAlign: 'right', padding: '4px 8px' }}>
                    {formatNumber(stats.calls)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '4px 8px' }}>
                    {formatNumber(stats.input)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '4px 8px' }}>
                    {formatNumber(stats.output)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* By feature */}
      {featureEntries.length > 0 && (
        <div>
          <h4 style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '8px' }}>By Feature</h4>
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Feature</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>Calls</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>Input</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>Output</th>
              </tr>
            </thead>
            <tbody>
              {featureEntries.map(([feature, stats]) => (
                <tr
                  key={feature}
                  style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)' }}
                >
                  <td style={{ padding: '4px 8px' }}>{FEATURE_LABELS[feature] || feature}</td>
                  <td style={{ textAlign: 'right', padding: '4px 8px' }}>
                    {formatNumber(stats.calls)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '4px 8px' }}>
                    {formatNumber(stats.input)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '4px 8px' }}>
                    {formatNumber(stats.output)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '10px',
        background: 'var(--bg-secondary, #f8fafc)',
        borderRadius: '8px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: '0.7rem',
          color: '#64748b',
          textTransform: 'uppercase',
          marginBottom: '4px',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{value}</div>
    </div>
  );
}
