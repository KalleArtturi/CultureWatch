import { useApi } from '../api'
import { FilterBar } from '../components/FilterBar'
import { useTooltip } from '../components/Tooltip'
import { csvCell, num, pct } from '../format'
import { filterParams, useMeta, useT, type Filters } from '../state'
import type { AbCell, AntibiogramResp } from '../types'

function band(c: AbCell | undefined): string {
  if (!c) return 'empty'
  if (c.pct_resistant === null) return 'grey'
  return c.pct_resistant < 0.1 ? 'green' : c.pct_resistant <= 0.2 ? 'amber' : 'red'
}

function toCsv(d: AntibiogramResp, cell: (o: string, a: string) => AbCell | undefined): string {
  const head = ['organism', ...d.antibiotics].join(',')
  const rows = d.organisms.map(o => [o, ...d.antibiotics.map(a => cell(o, a)?.label ?? '')].map(csvCell).join(','))
  return [head, ...rows].join('\n')
}

export function AntibiogramView({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const { meta, abLabel } = useMeta()
  const { t } = useT()
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
      {c.intrinsic ? <div className="tt-value">{t.abg.intrinsic}</div>
        : c.pct_resistant === null ? <div className="tt-value">{t.common.tooFew(meta.min_isolates)}</div>
        : <div className="tt-value">{t.charts.resistant(pct(c.pct_resistant))}</div>}
      <div>{t.common.resistedOf(num(c.n_resistant), num(c.n_tested))}</div>
      {c.ci_low !== null && c.ci_high !== null && <div className="secondary">{t.common.ci(pct(c.ci_low), pct(c.ci_high))}</div>}
    </>
  )

  // Cell text: the % without its sign (the column says it), or IR / n<30
  const cellText = (c: AbCell | undefined) =>
    !c ? '' : c.pct_resistant !== null ? num(c.pct_resistant * 100, 1) : c.intrinsic ? 'IR' : t.common.nLow(meta.min_isolates)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="view-head">
        <h1>{t.abg.title}</h1>
        <span className="sub">{t.abg.sub}</span>
      </div>
      <FilterBar filters={filters} onChange={setFilters} />
      {error && <p className="error">{error}</p>}
      {data && (
        <div className={`card${loading ? ' loading' : ''}`}>
          <div className="card-head">
            <div className="legend">
              <span><span className="sw" style={{ background: 'color-mix(in srgb, var(--good) 22%, var(--surface))' }} />{t.abg.lt10}</span>
              <span><span className="sw" style={{ background: 'color-mix(in srgb, var(--warning) 32%, var(--surface))' }} />{t.abg.mid}</span>
              <span><span className="sw" style={{ background: 'color-mix(in srgb, var(--critical) 26%, var(--surface))' }} />{t.abg.gt20}</span>
              <span><span className="sw" style={{ background: 'var(--surface-2)' }} />{t.abg.grey(meta.min_isolates)}</span>
              <span>{t.abg.urineOnly}</span>
            </div>
            <button type="button" className="btn" onClick={download}>{t.common.downloadCsv}</button>
          </div>
          {data.organisms.length === 0 ? <p className="muted">{t.abg.none}</p> : (
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
                            {cellText(c)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tip.node}
        </div>
      )}
    </div>
  )
}
