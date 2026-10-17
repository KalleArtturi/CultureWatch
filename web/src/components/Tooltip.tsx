import { useCallback, useState, type ReactNode } from 'react'

interface TipState {
  x: number
  y: number
  content: ReactNode
}

/** One floating tooltip per chart. React escapes text, so API-provided names are rendered safely. */
export function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null)

  const show = useCallback((e: { clientX: number; clientY: number }, content: ReactNode) => {
    setTip({ x: e.clientX, y: e.clientY, content })
  }, [])

  /** For keyboard focus: anchor the tooltip to the focused element. */
  const showAt = useCallback((el: Element, content: ReactNode) => {
    const r = el.getBoundingClientRect()
    setTip({ x: r.left + r.width / 2, y: r.top, content })
  }, [])

  const hide = useCallback(() => setTip(null), [])

  const node = tip ? (
    <div
      className="tooltip"
      role="tooltip"
      style={{
        left: Math.min(tip.x + 14, window.innerWidth - 300),
        top: Math.max(tip.y - 12, 8),
        transform: 'translateY(-100%)',
      }}
    >
      {tip.content}
    </div>
  ) : null

  return { node, show, showAt, hide }
}
