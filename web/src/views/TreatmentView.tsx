import { useEffect, useState } from 'react'
import { useApi } from '../api'
import { BarList } from '../components/BarList'
import { DataTable } from '../components/DataTable'
import { FilterBar } from '../components/FilterBar'
import { Status } from '../components/Status'
import { num, pct, shortOrg } from '../format'
import { filterParams, useMeta, type Filters } from '../state'
import type { TreatmentResp } from '../types'


function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function TreatmentView({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const { meta, abLabel } = useMeta()
  const [scenario, setScenario] = useState(meta.scenarios[0]?.name ?? 'custom')
  const preset = meta.scenarios.find(s => s.name === scenario)
  const [target, setTarget] = useState(preset?.target ?? 0.85)
  const debTarget = useDebounced(target, 250)
  const custom = scenario === 'custom'
  const { data, error, loading } = useApi<TreatmentResp>('/api/treatment', {
    scenario,
    target: debTarget,
    ...(custom ? filterParams(filters) : {}),
  })

  const pickScenario = (name: string) => {
    setScenario(name)
    const p = meta.scenarios.find(s => s.name === name)
    if (p) setTarget(p.target)
  }
  const regimenLabel = (r: string) => r.split(' + ').map(abLabel).join(' + ')
  const picked = data?.single.find(r => r.regimen === data.recommended) ?? data?.combos.find(r => r.regimen === data.recommended)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="view-head">
        <h1>Treatment guide</h1>
        <span className="sub">Which antibiotic would have covered this kind of infection?</span>
      </div>

      <div className="filter-bar">
        <label className="field">
          <span>Scenario</span>
          <select value={scenario} onChange={e => pickScenario(e.target.value)} style={{ minWidth: 240 }}>
            {meta.scenarios.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
            <option value="custom">Custom (use the filters below)</option>
          </select>
        </label>
        <label className="field">
          <span>Coverage target: <strong className="num">{Math.round(target * 100)}%</strong></span>
          <input type="range" min={0.5} max={0.99} step={0.01} value={target} onChange={e => setTarget(Number(e.target.value))} style={{ width: 200, height: 32 }} />
        </label>
      </div>
      {custom ? <FilterBar filters={filters} onChange={setFilters} /> : (
        <p className="ignored-note">This scenario sets its own filters. Choose "Custom" in the scenario list to use the filters.</p>
      )}

      {error && <p className="error">{error}</p>}
      {data && (
        <div className={loading ? 'loading' : undefined} style={{ display: 'grid', gap: 16 }}>
          {!data.reportable ? (
            <div className="banner warning">
              <Status kind="muted">Not enough data</Status>
              <span>Only {data.n_isolates} isolates match. At least {meta.min_isolates} are needed for a coverage estimate, so no suggestion is shown.</span>
            </div>
          ) : picked ? (
            <div className="banner good">
              <Status kind="good">Suggested</Status>
              <div>
                <strong>{regimenLabel(picked.regimen)}</strong>
                <span>covers {pct(picked.coverage, 0)} (95% CI {pct(picked.ci_low, 0)}–{pct(picked.ci_high, 0)}) · {picked.tier_name} · based on {num(data.n_isolates)} isolates</span>
              </div>
            </div>
          ) : (
            <div className="banner warning">
              <Status kind="critical">No match</Status>
              <span>No single antibiotic or two-drug combination reaches {pct(data.target, 0)} coverage.</span>
            </div>
          )}

          {data.reportable && (
            <div className="grid-3-2">
              <div className="card">
                <div className="card-head">
                  <h3>Expected coverage, single antibiotics</h3>
                  <p>dashed line = target · whiskers = 95% CI · grey = below target</p>
                </div>
                <BarList
                  ariaLabel="Coverage per antibiotic"
                  labelWidth="48%"
                  max={1}
                  target={data.target}
                  items={[...data.single].sort((a, b) => b.coverage - a.coverage).map(r => ({
                    key: r.regimen,
                    label: <>{abLabel(r.regimen)}<span className="chip">{r.tier_name}</span></>,
                    value: r.coverage,
                    display: pct(r.coverage, 0),
                    ciLow: r.ci_low,
                    ciHigh: r.ci_high,
                    deEmph: !r.meets_target,
                    picked: r.regimen === data.recommended,
                    tooltip: (
                      <>
                        <div className="tt-title">{abLabel(r.regimen)} · {r.tier_name}</div>
                        <div className="tt-value">{pct(r.coverage)} covered</div>
                        <div>{num(r.n_covered)} of {num(r.n_isolates)} isolates</div>
                        <div className="secondary">95% CI {pct(r.ci_low)}–{pct(r.ci_high)}</div>
                      </>
                    ),
                  }))}
                />
              </div>
              <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
                <div className="card">
                  <div className="card-head"><h3>Bacteria causing these infections</h3><p>{num(data.n_isolates)} first isolates</p></div>
                  <BarList ariaLabel="Organism mix" max={1} items={data.organism_mix.slice(0, 8).map(o => ({
                    key: o.organism,
                    label: <span className="italic">{shortOrg(o.organism)}</span>,
                    value: o.share,
                    display: pct(o.share, 0),
                  }))} />
                </div>
                <div className="card">
                  <div className="card-head"><h3>Two-drug combinations</h3><p>top 10 by coverage</p></div>
                  <DataTable rows={data.combos} rowKey={r => r.regimen} columns={[
                    { key: 'r', header: 'Regimen', render: r => r.regimen },
                    { key: 'c', header: 'Coverage', numeric: true, render: r => pct(r.coverage, 0) },
                    { key: 't', header: 'Tier', render: r => r.tier_name },
                  ]} />
                </div>
              </div>
            </div>
          )}
          <p className="small muted">
            Coverage for a patient group, not a prescription. The choice depends on the patient, severity and local guidelines;
            adjust when the culture result arrives. Stewardship tiers are illustrative.
          </p>
        </div>
      )}
    </div>
  )
}
