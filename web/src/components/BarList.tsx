import type { CSSProperties, ReactNode } from 'react'
import { useTooltip } from './Tooltip'

export interface BarItem {
  key: string
  label: ReactNode
  value: number
  display: string
  tooltip?: ReactNode
  ciLow?: number
  ciHigh?: number
  deEmph?: boolean
  picked?: boolean
}

/** Horizontal single-series bars with the value at the tip. `max` fixes the scale (e.g. 1 for shares). */
export function BarList({ items, max, target, ariaLabel, labelWidth }: {
  items: BarItem[]
  max?: number
  target?: number
  ariaLabel: string
  /** CSS width of the label column, e.g. '46%' for long labels */
  labelWidth?: string
}) {
  const tip = useTooltip()
  const scale = max ?? Math.max(...items.map(i => i.ciHigh ?? i.value), 1e-9)
  const w = (v: number) => `${Math.max(0, Math.min(1, v / scale)) * 100}%`

  return (
    <div className="bars" role="list" aria-label={ariaLabel} style={labelWidth ? ({ '--label-w': labelWidth } as CSSProperties) : undefined}>
      {items.map(it => (
        <div
          key={it.key}
          role="listitem"
          tabIndex={it.tooltip ? 0 : undefined}
          className={`bar-row${it.picked ? ' picked' : ''}`}
          onPointerMove={it.tooltip ? e => tip.show(e, it.tooltip) : undefined}
          onPointerLeave={tip.hide}
          onFocus={it.tooltip ? e => tip.showAt(e.currentTarget, it.tooltip) : undefined}
          onBlur={tip.hide}
        >
          <span className="label">{it.label}</span>
          <span className="bar-track">
            <span className={`bar-fill${it.deEmph ? ' de-emph' : ''}`} style={{ width: w(it.value) }} />
            {it.ciLow !== undefined && it.ciHigh !== undefined && (
              <span className="bar-ci" style={{ left: w(it.ciLow), width: `calc(${w(it.ciHigh)} - ${w(it.ciLow)})` }} />
            )}
            {target !== undefined && <span className="bar-target" style={{ left: w(target) }} />}
          </span>
          <span className="value">{it.display}</span>
        </div>
      ))}
      {tip.node}
    </div>
  )
}
