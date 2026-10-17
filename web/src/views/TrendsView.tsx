import { useState } from 'react'
import { useApi } from '../api'
import { DataTable } from '../components/DataTable'
import { FilterBar } from '../components/FilterBar'
import { Status } from '../components/Status'
import { TrendChart } from '../components/TrendChart'
import { pct, pText, pValue, shortOrg } from '../format'
import { filterParams, useMeta, type Filters } from '../state'
import type { TrendResp, TrendSummaryRow } from '../types'

export function TrendsView({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const { meta, abLabel } = useMeta()
  const [pair, setPair] = useState({ organism: 'Escherichia coli', antibiotic: 'TMP' })
  const params = filterParams(filters, ['time'])
  const trend = useApi<TrendResp>('/api/trend', { ...params, ...pair })
  const summary = useApi<TrendSummaryRow[]>('/api/trend-summary', params)
  const sig = trend.data && trend.data.p_value < 0.05

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="view-head">
        <h1>Trends</h1>
        <span className="sub">Is resistance rising? Quarterly, all surveillance years</span>
      </div>
      <FilterBar filters={filters} onChange={setFilters} ignore={['time']} note="Time filter not applied: trends always show every quarter." />

      <div className="filter-bar">
        <label className="field">
          <span>Organism</span>
          <select value={pair.organism} onChange={e => setPair(p => ({ ...p, organism: e.target.value }))} style={{ minWidth: 220 }}>
            {meta.organisms.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Antibiotic</span>
          <select value={pair.antibiotic} onChange={e => setPair(p => ({ ...p, antibiotic: e.target.value }))} style={{ minWidth: 220 }}>
            {meta.ab_order.map(a => <option key={a} value={a}>{abLabel(a)}</option>)}
          </select>
        </label>
      </div>

      <div className={`card${trend.loading ? ' loading' : ''}`}>
        <div className="card-head">
          <h3><span className="italic">{pair.organism}</span> · {abLabel(pair.antibiotic)}: % resistant per quarter</h3>
          {trend.data && trend.data.points.length >= 2 && (
            sig ? <Status kind="critical">Significantly {trend.data.direction} · {pText(trend.data.p_value)}</Status>
              : <Status kind="muted">No significant trend · {pText(trend.data.p_value)}</Status>
          )}
        </div>
        {trend.error && <p className="error">{trend.error}</p>}
        {trend.data && (trend.data.points.length >= 2 ? (
          <>
            <TrendChart points={trend.data.points} minN={meta.min_isolates} label={`Quarterly resistance, ${pair.organism} ${pair.antibiotic}`} />
            <div className="legend" style={{ marginTop: 8 }}>
              <span><span className="line-key" style={{ borderColor: 'var(--series-1)' }} />% resistant (shaded: 95% CI)</span>
              <span>○ quarter with n&lt;{meta.min_isolates}, shown but unreliable</span>
              <span><span className="line-key" style={{ borderColor: 'var(--critical)', borderTopStyle: 'dashed' }} />20%, a common limit for empirical use</span>
            </div>
          </>
        ) : <p className="muted">Not enough data over time for this pair with these filters (it may not be tested for this organism).</p>)}
      </div>

      <div className={`card${summary.loading ? ' loading' : ''}`}>
        <div className="card-head"><h3>Key pairs</h3><p>Cochran–Armitage test for a linear trend · select a row to plot it</p></div>
        {summary.data && (
          <DataTable
            rows={summary.data}
            rowKey={r => r.organism + r.antibiotic_code}
            highlight={r => r.significant && r.direction === 'increasing'}
            initialSort={{ key: 'p', desc: false }}
            columns={[
              { key: 'o', header: 'Pair', sort: r => r.organism, render: r => (
                <button type="button" className="link-btn" onClick={() => setPair({ organism: r.organism, antibiotic: r.antibiotic_code })}>
                  <span className="italic">{shortOrg(r.organism)}</span> · {r.antibiotic_code}
                </button>
              ) },
              { key: 'f', header: 'First quarter', numeric: true, render: r => pct(r.first) },
              { key: 'l', header: 'Last quarter', numeric: true, render: r => pct(r.last) },
              { key: 'd', header: 'Direction', render: r => r.direction },
              { key: 'p', header: 'p', numeric: true, sort: r => r.p_value, render: r => r.significant ? <Status kind="critical">{pValue(r.p_value)}</Status> : pValue(r.p_value) },
            ]}
          />
        )}
      </div>
    </div>
  )
}
