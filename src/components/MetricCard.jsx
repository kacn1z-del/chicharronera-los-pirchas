export default function MetricCard({ label, value, hint, tone = 'default' }) {
  return (
    <div className={`metric-card metric-card--${tone}`}>
      <p className="metric-card__label">{label}</p>
      <p className="metric-card__value mono">{value}</p>
      {hint && <p className="metric-card__hint">{hint}</p>}
    </div>
  )
}

