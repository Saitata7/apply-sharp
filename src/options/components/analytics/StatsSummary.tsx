interface StatsSummaryProps {
  total: number;
  responseRate: number;
  interviewRate: number;
  offerRate: number;
}

export default function StatsSummary({
  total,
  responseRate,
  interviewRate,
  offerRate,
}: StatsSummaryProps) {
  const cards = [
    { label: 'Total Applications', value: total.toString(), color: 'blue' },
    { label: 'Response Rate', value: `${responseRate}%`, color: 'violet' },
    { label: 'Interview Rate', value: `${interviewRate}%`, color: 'cyan' },
    { label: 'Offer Rate', value: `${offerRate}%`, color: 'green' },
  ];

  return (
    <div className="stats-summary">
      {cards.map((card) => (
        <div key={card.label} className={`stats-card stats-card--${card.color}`}>
          <div className="stats-card-value">{card.value}</div>
          <div className="stats-card-label">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
