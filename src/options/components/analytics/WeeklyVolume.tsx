interface WeeklyVolumeProps {
  weeks: { label: string; count: number }[];
}

export default function WeeklyVolume({ weeks }: WeeklyVolumeProps) {
  const maxCount = Math.max(...weeks.map((w) => w.count), 1);

  return (
    <div className="analytics-card">
      <h3 className="analytics-card-title">Weekly Applications</h3>
      {weeks.every((w) => w.count === 0) ? (
        <div className="analytics-empty">No data yet</div>
      ) : (
        <div className="weekly-chart">
          <div className="weekly-bars">
            {weeks.map((week) => {
              const pct = maxCount > 0 ? (week.count / maxCount) * 100 : 0;
              return (
                <div key={week.label} className="weekly-bar-col">
                  <span className="weekly-bar-value">{week.count || ''}</span>
                  <div className="weekly-bar-track">
                    <div className="weekly-bar" style={{ height: `${Math.max(pct, 3)}%` }} />
                  </div>
                  <span className="weekly-bar-label">{week.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
