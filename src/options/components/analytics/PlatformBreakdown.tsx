interface PlatformBreakdownProps {
  platforms: { name: string; total: number; responded: number }[];
}

export default function PlatformBreakdown({ platforms }: PlatformBreakdownProps) {
  const maxTotal = Math.max(...platforms.map((p) => p.total), 1);

  return (
    <div className="analytics-card">
      <h3 className="analytics-card-title">By Platform</h3>
      {platforms.length === 0 ? (
        <div className="analytics-empty">No data yet</div>
      ) : (
        <div className="platform-breakdown">
          {platforms.map((p) => {
            const pct = maxTotal > 0 ? (p.total / maxTotal) * 100 : 0;
            const responseRate = p.total > 0 ? Math.round((p.responded / p.total) * 100) : 0;
            return (
              <div key={p.name} className="platform-row">
                <div className="platform-row-header">
                  <span className="platform-name">
                    {p.name.charAt(0).toUpperCase() + p.name.slice(1)}
                  </span>
                  <span className="platform-stats">
                    {p.total} apps &middot; {responseRate}% response
                  </span>
                </div>
                <div className="platform-bar-track">
                  <div className="platform-bar" style={{ width: `${Math.max(pct, 2)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
