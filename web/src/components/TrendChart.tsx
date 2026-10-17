import { useState } from 'react'
import { num, pct } from '../format'
import type { TrendPoint } from '../types'
import { useTooltip } from './Tooltip'
import { useWidth } from './useWidth'

/**
 * Quarterly % resistant with a 95% CI wash. The line only joins quarters with n >= minN;
 * smaller quarters are hollow grey points (shown, but flagged as unreliable).
 */
export function TrendChart({ points, minN, threshold = 0.2, label }: {
  points: TrendPoint[]
  minN: number
  threshold?: number
  label: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>(800)
  const tip = useTooltip()
  const [hover, setHover] = useState<number | null>(null)
  const height = 280
  const m = { t: 12, r: 16, b: 30, l: 42 }
  const iw = Math.max(width - m.l - m.r, 10)
  const ih = height - m.t - m.b
  const n = points.length
  const ok = points.map(p => p.n_tested >= minN)
  const maxV = Math.max(threshold + 0.05, ...points.map((p, i) => (ok[i] ? p.ci_high : p.pct_resistant)))
  const top = Math.min(1, Math.ceil(maxV * 10) / 10)
  const x = (i: number) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw)
  const y = (v: number) => m.t + ih - (v / top) * ih
  const ticks = Array.from({ length: Math.round(top / 0.1) + 1 }, (_, k) => k * 0.1).filter((_, k, a) => a.length <= 6 || k % 2 === 0)

  // Line and CI band only through reliable quarters; break the path at unreliable ones.
  const segments: number[][] = []
  points.forEach((_, i) => {
    if (!ok[i]) return
    const last = segments[segments.length - 1]
    if (last && last[last.length - 1] === i - 1) last.push(i)
    else segments.push([i])
  })
  const linePath = (seg: number[]) => seg.map((i, k) => `${k ? 'L' : 'M'}${x(i)},${y(points[i].pct_resistant)}`).join('')
  const bandPath = (seg: number[]) =>
    seg.map((i, k) => `${k ? 'L' : 'M'}${x(i)},${y(points[i].ci_high)}`).join('') +
    [...seg].reverse().map(i => `L${x(i)},${y(points[i].ci_low)}`).join('') + 'Z'

  const nearest = (clientX: number, svg: SVGSVGElement) => {
    const px = clientX - svg.getBoundingClientRect().left
    return Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))))
  }
  const labelEvery = Math.ceil(n / Math.max(Math.floor(iw / 64), 1))

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
              <div className="tt-value">{pct(p.pct_resistant)} resistant</div>
              <div>{num(p.n_resistant)} of {num(p.n_tested)} tested</div>
              {ok[i] ? <div className="secondary">95% CI {pct(p.ci_low)}–{pct(p.ci_high)}</div>
                : <div className="secondary">n&lt;{minN}: too few to be reliable</div>}
            </>
          ))
        }}
        onPointerLeave={() => { setHover(null); tip.hide() }}
      >
        {ticks.map(t => (
          <g key={t}>
            <line x1={m.l} x2={m.l + iw} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} shapeRendering="crispEdges" />
            <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end">{Math.round(t * 100)}%</text>
          </g>
        ))}
        <line x1={m.l} x2={m.l + iw} y1={y(threshold)} y2={y(threshold)} stroke="var(--critical)" strokeDasharray="4 3" strokeWidth={1} />
        {/* threshold label sits at the left end so it never meets the direct label on the latest point */}
        <text x={m.l + 6} y={y(threshold) - 5} style={{ fill: 'var(--text-2)' }}>{Math.round(threshold * 100)}% empirical-use limit</text>
        {segments.map((s, k) => <path key={`b${k}`} d={bandPath(s)} fill="var(--series-1-wash)" />)}
        {segments.map((s, k) => s.length > 1 && (
          <path key={`l${k}`} d={linePath(s)} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} stroke="var(--axis)" shapeRendering="crispEdges" />}
        {points.map((p, i) => ok[i] ? (
          <circle key={i} cx={x(i)} cy={y(p.pct_resistant)} r={hover === i ? 5.5 : 4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
        ) : (
          <circle key={i} cx={x(i)} cy={y(p.pct_resistant)} r={4} fill="var(--surface)" stroke="var(--muted)" strokeWidth={1.5} />
        ))}
        {points.map((p, i) => i % labelEvery === 0 ? (
          <text key={`x${i}`} x={x(i)} y={height - 8} textAnchor="middle">{p.quarter}</text>
        ) : null)}
        {/* direct label at the last reliable point only */}
        {(() => {
          const last = ok.lastIndexOf(true)
          return last >= 0 ? (
            <text x={x(last) - 8} y={y(points[last].pct_resistant) - 10} textAnchor="end" style={{ fill: 'var(--text)', fontWeight: 600 }}>
              {pct(points[last].pct_resistant)}
            </text>
          ) : null
        })()}
      </svg>
      {tip.node}
    </div>
  )
}
