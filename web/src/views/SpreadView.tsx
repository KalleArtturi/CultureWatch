import { useState } from 'react'
import { useApi } from '../api'
import { DataTable } from '../components/DataTable'
import { dateRange, num, pct, PHENOTYPE_LABEL } from '../format'
import { useMeta, useT } from '../state'
import type { Phenotype, SpreadResp } from '../types'

const PHENOTYPES: Phenotype[] = ['mrsa', 'esbl', 'vre', 'cpe']
type Period = '4w' | '12m' | 'all'

interface Route { from: string; to: string; patients: number; types: Phenotype[] }

export function SpreadView() {
  const { meta, wardName } = useMeta()
  const { t } = useT()
  const [period, setPeriod] = useState<Period>('12m')
  const [phenotype, setPhenotype] = useState<Phenotype | ''>('')
  const { data, error, loading } = useApi<SpreadResp>('/api/spread', { window: period, phenotype })

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">{t.spread.loading}</p>

  // One route per ward pair, summed over resistance types (a patient with two types counts once per type).
  const byPair = new Map<string, Route>()
  for (const m of data.movements) {
    const key = `${m.from_ward}>${m.to_ward}`
    const r = byPair.get(key) ?? { from: m.from_ward, to: m.to_ward, patients: 0, types: [] }
    r.patients += m.patients
    if (!r.types.includes(m.phenotype)) r.types.push(m.phenotype)
    byPair.set(key, r)
  }
  const routes = [...byPair.values()].sort((a, b) => b.patients - a.patients)
  const periods: { value: Period; label: string }[] = [
    { value: '4w', label: t.spread.last4w }, { value: '12m', label: t.spread.last12m }, { value: 'all', label: t.spread.all },
  ]

  return (
    <div className={loading ? 'loading' : undefined} style={{ display: 'grid', gap: 16 }}>
      <div className="view-head">
        <h1>{t.spread.title}</h1>
        <span className="sub">{t.spread.sub}</span>
      </div>

      <div className="filter-bar">
        <div className="field">
          <span>{t.spread.period}</span>
          <div className="segmented">
            {periods.map(p => <button key={p.value} type="button" aria-pressed={period === p.value} onClick={() => setPeriod(p.value)}>{p.label}</button>)}
          </div>
        </div>
        <div className="field">
          <span>{t.spread.type}</span>
          <div className="segmented">
            <button type="button" aria-pressed={phenotype === ''} onClick={() => setPhenotype('')}>{t.spread.allTypes}</button>
            {PHENOTYPES.map(p => <button key={p} type="button" aria-pressed={phenotype === p} onClick={() => setPhenotype(p)}>{PHENOTYPE_LABEL[p]}</button>)}
          </div>
        </div>
        <span className="ignored-note">{dateRange([data.start, data.end])}</span>
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="tile-label">{t.spread.newCarriers}</span>
          <span className="tile-value">{num(data.new_carriers)}</span>
        </div>
        <div className="tile">
          <span className="tile-label">{t.spread.moved}</span>
          <span className="tile-value">{num(data.moved)}</span>
          <span className="tile-sub">{t.spread.movedSub(data.new_carriers ? pct(data.moved / data.new_carriers, 0) : '–')}</span>
        </div>
        <div className="tile">
          <span className="tile-label">{t.spread.routes}</span>
          <span className="tile-value">{num(routes.length)}</span>
          <span className="tile-sub">{t.spread.routesSub}</span>
        </div>
      </div>

      {routes.length === 0 ? <p className="muted">{t.spread.none}</p> : (
        <div className="grid-2">
          <div className="card">
            <div className="card-head"><h3>{t.spread.mapTitle}</h3></div>
            <p className="small secondary" style={{ margin: '0 0 8px' }}>{t.spread.mapSub}</p>
            <SpreadMap wards={meta.wards.map(w => w.ward_code)} routes={routes} wardName={wardName} />
          </div>
          <div className="card">
            <div className="card-head"><h3>{t.spread.tableTitle}</h3></div>
            <DataTable
              rows={routes}
              rowKey={r => r.from + r.to}
              initialSort={{ key: 'n', desc: true }}
              search={r => [wardName(r.from), r.from, wardName(r.to), r.to, ...r.types.map(p => PHENOTYPE_LABEL[p])].join(' ')}
              columns={[
                { key: 'f', header: t.spread.from, render: r => wardName(r.from), sort: r => wardName(r.from) },
                { key: 'a', header: '', render: () => <span className="muted">→</span> },
                { key: 't', header: t.spread.to, render: r => wardName(r.to), sort: r => wardName(r.to) },
                { key: 'ty', header: t.common.type, render: r => r.types.map(p => PHENOTYPE_LABEL[p]).join(', ') },
                { key: 'n', header: t.spread.patients, numeric: true, render: r => num(r.patients), sort: r => r.patients },
              ]}
            />
          </div>
        </div>
      )}
      <p className="small muted">{t.spread.caveat}</p>
    </div>
  )
}

/** Wards on a circle, one curved arrow per route; width grows with the number of patients. */
function SpreadMap({ wards, routes, wardName }: { wards: string[]; routes: Route[]; wardName: (c: string) => string }) {
  const W = 680, H = 430, cx = W / 2, cy = H / 2, R = 160
  const pos = new Map(wards.map((w, i) => {
    const a = (i / wards.length) * 2 * Math.PI - Math.PI / 2
    return [w, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a }]
  }))
  const max = Math.max(...routes.map(r => r.patients), 1)
  const traffic = new Map<string, number>()
  for (const r of routes) {
    traffic.set(r.from, (traffic.get(r.from) ?? 0) + r.patients)
    traffic.set(r.to, (traffic.get(r.to) ?? 0) + r.patients)
  }
  const NODE = 20

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={routes.map(r => `${wardName(r.from)} → ${wardName(r.to)}: ${r.patients}`).join('; ')}>
      <defs>
        <marker id="spread-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--series-2)" />
        </marker>
      </defs>
      {routes.map(r => {
        const a = pos.get(r.from), b = pos.get(r.to)
        if (!a || !b) return null
        // Curve to the right of the travel direction, so A→B and B→A do not overlap.
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1
        const ux = dx / len, uy = dy / len
        const sx = a.x + ux * NODE, sy = a.y + uy * NODE
        const ex = b.x - ux * (NODE + 4), ey = b.y - uy * (NODE + 4)
        const mx = (sx + ex) / 2 - uy * len * 0.18, my = (sy + ey) / 2 + ux * len * 0.18
        const width = 1.5 + 4.5 * (r.patients / max)
        return (
          <path key={r.from + r.to} d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`} fill="none"
            stroke="var(--series-2)" strokeOpacity={0.75} strokeWidth={width} markerEnd="url(#spread-arrow)">
            <title>{`${wardName(r.from)} → ${wardName(r.to)}: ${r.patients}`}</title>
          </path>
        )
      })}
      {wards.map(w => {
        const p = pos.get(w)!
        const busy = traffic.has(w)
        const lx = cx + (R + NODE + 14) * Math.cos(p.a), ly = cy + (R + NODE + 14) * Math.sin(p.a)
        const anchor = Math.abs(Math.cos(p.a)) < 0.3 ? 'middle' : Math.cos(p.a) > 0 ? 'start' : 'end'
        return (
          <g key={w}>
            <circle cx={p.x} cy={p.y} r={NODE} fill={busy ? 'var(--accent-wash)' : 'var(--surface-2)'}
              stroke={busy ? 'var(--accent)' : 'var(--border)'} strokeWidth={busy ? 2 : 1} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight={600} fill="var(--text)">{w}</text>
            <text x={lx} y={ly + 4} textAnchor={anchor} fontSize="11" fill="var(--text-2)">{wardName(w)}</text>
            <title>{wardName(w)}</title>
          </g>
        )
      })}
    </svg>
  )
}
