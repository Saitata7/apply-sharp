interface TopKeywordsProps {
  keywords: { keyword: string; score: number }[];
}

export default function TopKeywords({ keywords }: TopKeywordsProps) {
  const maxScore = Math.max(...keywords.map((k) => k.score), 1);

  return (
    <div className="analytics-card">
      <h3 className="analytics-card-title">Top Performing Keywords</h3>
      {keywords.length === 0 ? (
        <div className="analytics-empty">Apply to more jobs to see keyword performance</div>
      ) : (
        <div className="top-keywords">
          {keywords.slice(0, 10).map((k, i) => {
            const pct = maxScore > 0 ? (k.score / maxScore) * 100 : 0;
            return (
              <div key={k.keyword} className="keyword-row">
                <span className="keyword-rank">#{i + 1}</span>
                <span className="keyword-name">{k.keyword}</span>
                <div className="keyword-bar-track">
                  <div className="keyword-bar" style={{ width: `${Math.max(pct, 5)}%` }} />
                </div>
                <span className="keyword-score">{k.score}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
