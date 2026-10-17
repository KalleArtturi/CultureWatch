import { useApi } from '../api'
import { BarList } from '../components/BarList'
import { DataTable } from '../components/DataTable'
import { FilterBar } from '../components/FilterBar'
import { Status } from '../components/Status'
import { num, pct, pp, pValue, shortOrg } from '../format'
import { filterParams, useMeta, type Filters } from '../state'
import type { OverviewResp, Rate, SettingComparison, WardProfileRow } from '../types'

export function HospitalView({ filters, setFilters, onOpenWard }: {
  filters: Filters
  setFilters: (f: Filters) => void
  onOpenWard: (code: string) => void
}) {
  const { meta, abLabel, wardName } = useMeta()
  const params = filterParams(filters)
  const ov = useApi<OverviewResp>('/api/overview', params)
  const comp = useApi<SettingComparison[]>('/api/hospital-vs-community', params)
  const wp = useApi<WardProfileRow[]>('/api/ward-profile', params)
  const minN = meta.min_isolates
  const small = <span className="muted">n&lt;{minN}</span>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="view-head">
        <h1>Hospital overview</h1>
        <span className="sub">All wards and health centres</span>
      </div>
      <FilterBar filters={filters} onChange={setFilters} />
      {ov.error && <p className="error">{ov.error}</p>}

      {ov.data && (
        <div className={ov.loading ? 'loading' : undefined} style={{ display: 'grid', gap: 16 }}>
          <div className="tiles">
            <div className="tile">
              <span className="tile-label">First isolates</span>
              <span className="tile-value">{num(ov.data.kpis.first_isolates)}</span>
            </div>
            <RateTile label="ESBL (E. coli + K. pneumoniae)" r={ov.data.kpis.esbl} minN={minN} />
            <RateTile label="MRSA (S. aureus)" r={ov.data.kpis.mrsa} minN={minN} />
            <div className="tile"><span className="tile-label">VRE cases</span><span className="tile-value">{ov.data.kpis.vre_cases}</span></div>
            <div className="tile"><span className="tile-label">CPE cases</span><span className="tile-value">{ov.data.kpis.cpe_cases}</span></div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-head"><h3>Organism mix</h3><p>first isolates</p></div>
              <BarList ariaLabel="Organism mix" items={ov.data.organism_mix.slice(0, 10).map(o => ({
                key: o.organism, label: <span className="italic">{shortOrg(o.organism)}</span>, value: o.n, display: num(o.n),
              }))} />
            </div>
            <div className="card">
              <div className="card-head">
                <h3>Biggest changes vs previous year</h3>
                <p>{ov.data.change_periods.join(' → ') || 'needs two surveillance years'} · time filter not applied</p>
              </div>
              <DataTable
                rows={ov.data.changes}
                rowKey={r => r.organism + r.antibiotic_code}
                empty={`Too few isolates (n<${minN}) to compare years with these filters.`}
                columns={[
                  { key: 'o', header: 'Organism', render: r => <span className="italic">{shortOrg(r.organism)}</span> },
                  { key: 'a', header: 'Antibiotic', render: r => abLabel(r.antibiotic_code) },
                  { key: 'p', header: 'Before', numeric: true, render: r => pct(r.pct_prev) },
                  { key: 'l', header: 'Now', numeric: true, render: r => pct(r.pct_last) },
                  { key: 'c', header: 'Change', numeric: true, render: r => <strong>{pp(r.change_pp)}</strong> },
                ]}
              />
            </div>
          </div>
        </div>
      )}

      <div className={`card${wp.loading ? ' loading' : ''}`}>
        <div className="card-head">
          <h3>Ward hotspots</h3>
          <p>ward and setting filters not applied · red row = ESBL or MRSA significantly above the overall rate (p &lt; 0.05)</p>
        </div>
        {wp.error && <p className="error">{wp.error}</p>}
        {wp.data && (
          <DataTable
            rows={wp.data}
            rowKey={r => r.ward_code}
            initialSort={{ key: 'esbl', desc: true }}
            highlight={r => (r.esbl_p_above ?? 1) < 0.05 || (r.mrsa_p_above ?? 1) < 0.05}
            columns={[
              { key: 'w', header: 'Ward', sort: r => wardName(r.ward_code), render: r => (
                <button type="button" className="link-btn" onClick={() => onOpenWard(r.ward_code)}>{wardName(r.ward_code)}</button>
              ) },
              { key: 'n', header: 'First isolates', numeric: true, render: r => num(r.first_isolates), sort: r => r.first_isolates },
              { key: 'ho', header: 'Hospital-onset', numeric: true, render: r => pct(r.hospital_onset_share, 0), sort: r => r.hospital_onset_share },
              { key: 'esbl', header: 'ESBL %', numeric: true, render: r => r.esbl_pct === null ? small : pct(r.esbl_pct), sort: r => r.esbl_pct },
              { key: 'esblp', header: 'p (above)', numeric: true, render: r => <PFlag p={r.esbl_p_above} />, sort: r => r.esbl_p_above },
              { key: 'mrsa', header: 'MRSA %', numeric: true, render: r => r.mrsa_pct === null ? small : pct(r.mrsa_pct), sort: r => r.mrsa_pct },
              { key: 'mrsap', header: 'p (above)', numeric: true, render: r => <PFlag p={r.mrsa_p_above} />, sort: r => r.mrsa_p_above },
              { key: 'vre', header: 'VRE', numeric: true, render: r => r.vre_n, sort: r => r.vre_n },
              { key: 'cpe', header: 'CPE', numeric: true, render: r => r.cpe_n, sort: r => r.cpe_n },
            ]}
          />
        )}
      </div>

      <div className={`card${comp.loading ? ' loading' : ''}`}>
        <div className="card-head">
          <h3>Hospital-onset vs community</h3>
          <p>setting filter not applied · Fisher's exact test · key organism–antibiotic pairs</p>
        </div>
        {comp.error && <p className="error">{comp.error}</p>}
        {comp.data && (
          <DataTable
            rows={comp.data}
            rowKey={r => r.organism + r.antibiotic_code}
            highlight={r => r.significant}
            empty="Not enough data for this comparison with the current filters."
            columns={[
              { key: 'o', header: 'Organism', render: r => <span className="italic">{shortOrg(r.organism)}</span>, sort: r => r.organism },
              { key: 'a', header: 'Antibiotic', render: r => abLabel(r.antibiotic_code), sort: r => r.antibiotic_code },
              { key: 'c', header: 'Community', numeric: true, render: r => r.pct_community === null ? small : pct(r.pct_community), sort: r => r.pct_community },
              { key: 'nc', header: 'n', numeric: true, render: r => num(r.n_community) },
              { key: 'h', header: 'Hospital-onset', numeric: true, render: r => r.pct_hospital === null ? small : pct(r.pct_hospital), sort: r => r.pct_hospital },
              { key: 'nh', header: 'n', numeric: true, render: r => num(r.n_hospital) },
              { key: 'd', header: 'Difference', numeric: true, render: r => pp(r.diff_pp), sort: r => r.diff_pp },
              { key: 'p', header: 'p', numeric: true, render: r => <PFlag p={r.p_value} />, sort: r => r.p_value },
            ]}
          />
        )}
      </div>
    </div>
  )
}

function PFlag({ p }: { p: number | null }) {
  if (p === null) return <span className="muted">—</span>
  return p < 0.05 ? <Status kind="critical">{pValue(p)}</Status> : <>{pValue(p)}</>
}

function RateTile({ label, r, minN }: { label: string; r: Rate; minN: number }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value">{r.pct === null ? <span className="muted">n&lt;{minN}</span> : pct(r.pct)}</span>
      <span className="tile-sub">
        {r.cases} of {num(r.n)}{r.ci_low !== null && <> · 95% CI {pct(r.ci_low, 0)}–{pct(r.ci_high, 0)}</>}
      </span>
    </div>
  )
}
