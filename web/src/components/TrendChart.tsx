import { useState } from 'react'
import { monthYear, num, pct } from '../format'
import { useT } from '../state'
import type { Projection, TrendPoint } from '../types'
import { useTooltip } from './Tooltip'
import { useWidth } from './useWidth'

/** '2026Q3' -> '2026Q4', '2026Q4' -> '2027Q1' */
function nextQuarter(q: string): string {
  const y = Number(q.slice(0, 4)), n = Number(q.slice(5))
  return n === 4 ? `${y + 1}Q1` : `${y}Q${n + 1}`
}

/**
 * Quarterly % resistant with a 95% CI wash. The line only joins quarters with n >= minN;
 * smaller quarters are hollow grey points (shown, but flagged as unreliable).
 * With `projection`, a fitted trend line is drawn (dashed beyond the data) and its crossing of
 * the empirical-use limit is marked: the 'guideline expiry date'.
 */
export function TrendChart({ points, quarters, projection, minN, threshold = 0.2, label }: {
  points: TrendPoint[]
  quarters?: string[]
  projection?: Projection | null
  minN: number
  threshold?: number
  label: string
}) {
  const { t } = useT()
  const [ref, width] = useWidth<HTMLDivElement>(800)
  const tip = useTooltip()
  const [hover, setHover] = useState<number | null>(null)
  const height = 300
  const m = { t: 16, r: 20, b: 30, l: 46 }
  const iw = Math.max(width - m.l - m.r, 10)
  const ih = height - m.t - m.b

  // Shared quarter axis: data quarters, plus future quarters up to a projected crossing (max 3 years ahead)
  const axis = quarters?.length ? [...quarters] : points.map(p => p.quarter)
  const px = points.map((p, i) => p.x ?? i)
  const xLast = projection?.x_last ?? axis.length - 1
  const crossX = projection?.cross_x ?? null
  const future = projection?.status === 'crossing' && crossX !== null ? Math.min(Math.ceil(crossX), xLast + 12) : xLast
  while (axis.length - 1 < future) axis.push(nextQuarter(axis[axis.length - 1]))
  const xMax = Math.max(axis.length - 1, 1)

  const ok = points.map(p => p.n_tested >= minN)
  const fit = (x: number) => (projection ? projection.a + projection.b * x : 0)
  const maxV = Math.max(threshold + 0.05, ...points.map((p, i) => (ok[i] ? p.ci_high : p.pct_resistant)), projection ? fit(xMax) : 0)
  const top = Math.min(1, Math.ceil(maxV * 10) / 10)
  const x = (xi: number) => m.l + (xi / xMax) * iw
  const y = (v: number) => m.t + ih - (Math.max(0, Math.min(v, top)) / top) * ih
  const ticks = Array.from({ length: Math.round(top / 0.1) + 1 }, (_, k) => k * 0.1).filter((_, k, a) => a.length <= 6 || k % 2 === 0)

  // Line and CI band only through reliable, consecutive quarters
  const segments: number[][] = []
  points.forEach((_, i) => {
    if (!ok[i]) return
    const last = segments[segments.length - 1]
    if (last && px[last[last.length - 1]] === px[i] - 1) last.push(i)
    else segments.push([i])
  })
  const linePath = (seg: number[]) => seg.map((i, k) => `${k ? 'L' : 'M'}${x(px[i])},${y(points[i].pct_resistant)}`).join('')
  const bandPath = (seg: number[]) =>
    seg.map((i, k) => `${k ? 'L' : 'M'}${x(px[i])},${y(points[i].ci_high)}`).join('') +
    [...seg].reverse().map(i => `L${x(px[i])},${y(points[i].ci_low)}`).join('') + 'Z'

  const nearest = (clientX: number, svg: SVGSVGElement) => {
    const xi = ((clientX - svg.getBoundingClientRect().left - m.l) / iw) * xMax
    let best = 0
    px.forEach((v, i) => { if (Math.abs(v - xi) < Math.abs(px[best] - xi)) best = i })
    return best
  }
  const labelEvery = Math.ceil(axis.length / Math.max(Math.floor(iw / 64), 1))
  const limitLabel = t.charts.limit(pct(threshold, 0))

  return (
    <div className="chart" ref={ref}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={label}
        onPointerMove={e => {
          const i = nearest(e.clientX, e.currentTarget)
          const p = points[i]
          setHover(i)
          tip.show(e, (
            <>
              <div className="tt-title">{p.quarter}</div>
              <div className="tt-value">{t.charts.resistant(pct(p.pct_resistant))}</div>
              <div>{t.charts.ofTested(num(p.n_resistant), num(p.n_tested))}</div>
              {ok[i] ? <div className="secondary">{t.common.ci(pct(p.ci_low), pct(p.ci_high))}</div>
                : <div className="secondary">{t.charts.unreliable(minN)}</div>}
            </>
          ))
        }}
        onPointerLeave={() => { setHover(null); tip.hide() }}
      >
        {ticks.map(v => (
          <g key={v}>
            <line x1={m.l} x2={m.l + iw} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} shapeRendering="crispEdges" />
            <text x={m.l - 8} y={y(v)} dy="0.32em" textAnchor="end">{pct(v, 0)}</text>
          </g>
        ))}
        {xMax > xLast && (
          <rect x={x(xLast)} y={m.t} width={x(xMax) - x(xLast)} height={ih} fill="var(--surface-2)" opacity={0.6} />
        )}
        <line x1={m.l} x2={m.l + iw} y1={y(threshold)} y2={y(threshold)} stroke="var(--critical)" strokeDasharray="4 3" strokeWidth={1} />
        {/* threshold label at the left end so it never meets the direct label on the latest point */}
        <text x={m.l + 6} y={y(threshold) - 5} style={{ fill: 'var(--text-2)' }}>{limitLabel}</text>
        {segments.map((s, k) => <path key={`b${k}`} d={bandPath(s)} fill="var(--series-1-wash)" />)}
        {projection && (
          <g>
            <line x1={x(0)} y1={y(fit(0))} x2={x(xLast)} y2={y(fit(xLast))} stroke="var(--text-2)" strokeWidth={1.5} />
            {xMax > xLast && (
              <line x1={x(xLast)} y1={y(fit(xLast))} x2={x(xMax)} y2={y(fit(xMax))} stroke="var(--text-2)" strokeWidth={1.5} strokeDasharray="5 4" />
            )}
          </g>
        )}
        {segments.map((s, k) => s.length > 1 && (
          <path key={`l${k}`} d={linePath(s)} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hover !== null && <line x1={x(px[hover])} x2={x(px[hover])} y1={m.t} y2={m.t + ih} stroke="var(--axis)" shapeRendering="crispEdges" />}
        {points.map((p, i) => ok[i] ? (
          <circle key={i} cx={x(px[i])} cy={y(p.pct_resistant)} r={hover === i ? 5.5 : 4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
        ) : (
          <circle key={i} cx={x(px[i])} cy={y(p.pct_resistant)} r={4} fill="var(--surface)" stroke="var(--muted)" strokeWidth={1.5} />
        ))}
        {projection && crossX !== null && projection.cross_date && crossX <= xMax && (
          <g>
            <circle cx={x(crossX)} cy={y(threshold)} r={6} fill="var(--critical)" stroke="var(--surface)" strokeWidth={2} />
            <text x={x(crossX)} y={y(threshold) + 20} textAnchor={x(crossX) > m.l + iw - 90 ? 'end' : 'middle'}
              style={{ fill: 'var(--text)', fontWeight: 600 }}>
              {projection.status === 'crossing' ? t.charts.crosses(monthYear(projection.cross_date)) : t.expiry.crossed(monthYear(projection.cross_date))}
            </text>
          </g>
        )}
        {axis.map((q, i) => i % labelEvery === 0 ? (
          <text key={`x${i}`} x={x(i)} y={height - 8} textAnchor="middle" style={i > xLast ? { fontStyle: 'italic' } : undefined}>{q}</text>
        ) : null)}
        {/* direct label at the last reliable point only */}
        {(() => {
          const last = ok.lastIndexOf(true)
          return last >= 0 ? (
            <text x={x(px[last]) - 8} y={y(points[last].pct_resistant) - 10} textAnchor="end" style={{ fill: 'var(--text)', fontWeight: 600 }}>
              {pct(points[last].pct_resistant)}
            </text>
          ) : null
        })()}
      </svg>
      {tip.node}
    </div>
  )
}
