import { useState } from 'react'
import { useApi } from '../api'
import { DataTable } from '../components/DataTable'
import { Status } from '../components/Status'
import { WeeklyColumns } from '../components/WeeklyColumns'
import { date, PHENOTYPE_LABEL, pValue } from '../format'
import { useMeta } from '../state'
import type { AlertsResp, Phenotype } from '../types'

const PHENOTYPES: Phenotype[] = ['mrsa', 'esbl', 'vre', 'cpe']

export function AlertsView({ myWard }: { myWard: string | null }) {
  const { meta, wardName } = useMeta()
  const [phenotype, setPhenotype] = useState<Phenotype>('mrsa')
  const [specimen, setSpecimen] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const { data, error, loading } = useApi<AlertsResp>('/api/alerts', { phenotype, specimen })

  if (error) return <p className="error">Could not load alerts: {error}</p>
  if (!data) return <p className="muted">Loading alerts…</p>

  const active = data.status.filter(s => s.alert)
  const ward = picked ?? active[0]?.ward_code ?? myWard ?? data.status[0]?.ward_code
  const wardStatus = data.status.find(s => s.ward_code === ward)
  const alertWeeks = new Set(data.alerts.filter(a => a.ward_code === ward).map(a => a.window_end))
  const label = PHENOTYPE_LABEL[phenotype]

  return (
    <div className={loading ? 'loading' : undefined} style={{ display: 'grid', gap: 20 }}>
      <div className="view-head">
        <h1>Cluster alerts</h1>
        <span className="sub">Each ward's last 4 weeks vs its own previous 52 weeks · all dates, all wards</span>
      </div>

      <div className="filter-bar">
        <div className="field">
          <span>Resistance type</span>
          <div className="segmented">
            {PHENOTYPES.map(p => (
              <button key={p} type="button" aria-pressed={phenotype === p} onClick={() => setPhenotype(p)}>{PHENOTYPE_LABEL[p]}</button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Specimen</span>
          <select value={specimen} onChange={e => setSpecimen(e.target.value)}>
            <option value="">All</option>
            {meta.specimens.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </label>
      </div>

      {active.length ? (
        <div className="banner critical" role="alert">
          <Status kind="critical">Alert</Status>
          <div>
            <strong>{label} cluster{active.length > 1 ? 's' : ''} right now on {active.map(a => wardName(a.ward_code)).join(', ')}</strong>
            <span className="secondary">An alert means "look into this", not a confirmed outbreak.</span>
          </div>
        </div>
      ) : (
        <div className="banner good">
          <Status kind="good">Normal</Status>
          <span>No ward has an unusual number of {label} cases in the latest 4 weeks.</span>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Latest 4 weeks, every ward</h3><p>select a row to see its weekly cases</p></div>
          <DataTable
            rows={data.status}
            rowKey={r => r.ward_code}
            initialSort={{ key: 'p', desc: false }}
            highlight={r => r.alert}
            columns={[
              { key: 'ward', header: 'Ward', sort: r => wardName(r.ward_code), render: r => (
                <button type="button" className="link-btn" onClick={() => setPicked(r.ward_code)} aria-pressed={r.ward_code === ward}>
                  {wardName(r.ward_code)}{r.ward_code === myWard ? ' (my ward)' : ''}
                </button>
              ) },
              { key: 'obs', header: 'Cases', numeric: true, render: r => r.observed, sort: r => r.observed },
              { key: 'exp', header: 'Usual', numeric: true, render: r => r.expected.toFixed(1), sort: r => r.expected },
              { key: 'p', header: 'p', numeric: true, render: r => pValue(r.p_value), sort: r => r.p_value },
              { key: 's', header: 'Status', render: r => r.alert ? <Status kind="critical">Alert</Status> : <Status kind="good">Normal</Status>, sort: r => (r.alert ? 0 : 1) },
            ]}
          />
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Alert history</h3>
            <p>first week of each run of alerts, {data.alerts.length} in total</p>
          </div>
          <DataTable
            rows={data.alerts}
            rowKey={r => r.ward_code + r.window_end}
            initialSort={{ key: 'week', desc: true }}
            empty={`No ${label} clusters flagged in the whole period.`}
            columns={[
              { key: 'ward', header: 'Ward', render: r => wardName(r.ward_code), sort: r => r.ward_code },
              { key: 'week', header: 'Window ending', render: r => date(r.window_end.slice(11, 21)), sort: r => r.window_end },
              { key: 'obs', header: 'Cases', numeric: true, render: r => r.observed, sort: r => r.observed },
              { key: 'exp', header: 'Usual', numeric: true, render: r => r.expected.toFixed(1), sort: r => r.expected },
              { key: 'p', header: 'p', numeric: true, render: r => pValue(r.p_value), sort: r => r.p_value },
            ]}
          />
        </div>
      </div>

      {ward && (
        <div className="card">
          <div className="card-head">
            <h3>{label} cases per week · {wardName(ward)}</h3>
            <p>red ticks under the axis = weeks an alert was raised · dashed = usual weekly level now</p>
          </div>
          <WeeklyColumns
            values={data.counts[ward] ?? []}
            weeks={data.weeks}
            alertWeeks={alertWeeks}
            usualPerWeek={wardStatus ? wardStatus.expected / 4 : undefined}
            height={200}
            label={`${label} cases per week on ${wardName(ward)}`}
          />
        </div>
      )}

      <p className="small muted">
        Method: cases in the latest 4 weeks are compared with the ward's mean over the 52 weeks before them (Poisson test).
        An alert needs at least 3 cases and p &lt; 0.01. With many wards and weeks, some alerts are expected by chance.
      </p>
    </div>
  )
}
