import { date, dateRange } from '../format'
import { useMeta, useT } from '../state'

export function MethodsView() {
  const { meta } = useMeta()
  const { t } = useT()
  return (
    <div className="card methods">
      <h1 style={{ marginBottom: 12 }}>{t.methods.title}</h1>
      <ul>
        {t.methods.items(dateRange([meta.date_min, meta.date_max]), date(meta.date_max), meta.min_isolates).map(([term, text]) => (
          <li key={term}><strong>{term}:</strong> {text}</li>
        ))}
      </ul>
      <p className="secondary" style={{ marginTop: 12 }}>{t.methods.footer}</p>
    </div>
  )
}
