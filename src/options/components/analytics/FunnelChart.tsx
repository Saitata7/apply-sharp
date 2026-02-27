interface FunnelChartProps {
  stages: { label: string; count: number; color: string }[];
}

export default function FunnelChart({ stages }: FunnelChartProps) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="analytics-card">
      <h3 className="analytics-card-title">Application Funnel</h3>
      {stages.every((s) => s.count === 0) ? (
        <div className="analytics-empty">No data yet</div>
      ) : (
        <div className="funnel-chart">
          {stages.map((stage) => {
            const pct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
            return (
              <div key={stage.label} className="funnel-row">
                <span className="funnel-label">{stage.label}</span>
                <div className="funnel-bar-track">
                  <div
                    className={`funnel-bar funnel-bar--${stage.color}`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
                <span className="funnel-count">{stage.count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
