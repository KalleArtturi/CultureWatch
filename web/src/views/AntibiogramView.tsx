import { useApi } from '../api'
import { FilterBar } from '../components/FilterBar'
import { useTooltip } from '../components/Tooltip'
import { num, pct } from '../format'
import { filterParams, useMeta, type Filters } from '../state'
import type { AbCell, AntibiogramResp } from '../types'

function band(c: AbCell | undefined): string {
  if (!c) return 'empty'
  if (c.pct_resistant === null) return 'grey'
  return c.pct_resistant < 0.1 ? 'green' : c.pct_resistant <= 0.2 ? 'amber' : 'red'
}

function toCsv(d: AntibiogramResp, cell: (o: string, a: string) => AbCell | undefined): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const head = ['organism', ...d.antibiotics].join(',')
  const rows = d.organisms.map(o => [o, ...d.antibiotics.map(a => cell(o, a)?.label ?? '')].map(esc).join(','))
  return [head, ...rows].join('\n')
}

export function AntibiogramView({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const { meta, abLabel } = useMeta()
  const { data, error, loading } = useApi<AntibiogramResp>('/api/antibiogram', filterParams(filters))
  const tip = useTooltip()

  const cells = new Map((data?.cells ?? []).map(c => [`${c.organism}|${c.antibiotic_code}`, c]))
  const cell = (o: string, a: string) => cells.get(`${o}|${a}`)
  const urineOnly = new Set(meta.urine_only)

  const download = () => {
    if (!data) return
    const url = URL.createObjectURL(new Blob([toCsv(data, cell)], { type: 'text/csv' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'antibiogram.csv' })
    a.click()
    URL.revokeObjectURL(url)
  }

  const tipFor = (c: AbCell) => (
    <>
      <div className="tt-title"><span className="italic">{c.organism}</span> · {abLabel(c.antibiotic_code)}</div>
      {c.intrinsic ? <div className="tt-value">Intrinsic resistance</div>
        : c.pct_resistant === null ? <div className="tt-value">n&lt;{meta.min_isolates}: too few isolates</div>
        : <div className="tt-value">{pct(c.pct_resistant)} resistant</div>}
      <div>{num(c.n_resistant)} of {num(c.n_tested)} isolates resistant</div>
      {c.ci_low !== null && <div className="secondary">95% CI {pct(c.ci_low)}–{pct(c.ci_high)}</div>}
    </>
  )

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="view-head">
        <h1>Antibiogram</h1>
        <span className="sub">% of first isolates resistant, per organism and antibiotic</span>
      </div>
      <FilterBar filters={filters} onChange={setFilters} />
      {error && <p className="error">{error}</p>}
      {data && (
        <div className={`card${loading ? ' loading' : ''}`}>
          <div className="card-head">
            <div className="legend">
              <span><span className="sw" style={{ background: 'color-mix(in srgb, var(--good) 22%, var(--surface))' }} />&lt;10% resistant</span>
              <span><span className="sw" style={{ background: 'color-mix(in srgb, var(--warning) 32%, var(--surface))' }} />10–20%</span>
              <span><span className="sw" style={{ background: 'color-mix(in srgb, var(--critical) 26%, var(--surface))' }} />&gt;20%</span>
              <span><span className="sw" style={{ background: 'var(--surface-2)' }} />IR = intrinsic · n&lt;{meta.min_isolates} = too few</span>
              <span>* urine samples only</span>
            </div>
            <button type="button" className="btn" onClick={download}>Download CSV</button>
          </div>
          {data.organisms.length === 0 ? <p className="muted">No isolates match these filters.</p> : (
            <div className="table-wrap">
              <table className="abg">
                <thead>
                  <tr>
                    <th />
                    {data.antibiotics.map(a => (
                      <th key={a} title={abLabel(a)}>{a}{urineOnly.has(a) ? '*' : ''}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.organisms.map(o => (
                    <tr key={o}>
                      <th className="org" scope="row">{o}</th>
                      {data.antibiotics.map(a => {
                        const c = cell(o, a)
                        return (
                          <td
                            key={a}
                            className={band(c)}
                            tabIndex={c ? 0 : undefined}
                            onPointerMove={c ? e => tip.show(e, tipFor(c)) : undefined}
                            onPointerLeave={tip.hide}
                            onFocus={c ? e => tip.showAt(e.currentTarget, tipFor(c)) : undefined}
                            onBlur={tip.hide}
                          >
                            {c?.label.replace('%', '') ?? ''}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted" style={{ marginTop: 10 }}>
            Values are % resistant. Hover a cell for counts and the 95% confidence interval. Blank = not tested.
          </p>
          {tip.node}
        </div>
      )}
    </div>
  )
}
