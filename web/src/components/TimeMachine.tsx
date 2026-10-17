import { useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from '../api'
import { date, PHENOTYPE_LABEL } from '../format'
import { useMeta } from '../state'
import type { TimelineAlert } from '../types'
import { Status } from './Status'

const STEP_MS = 900

/**
 * Replays the data week by week: the whole app shows what it would have shown on `asOf`.
 * Playing pauses by itself when an alert fires on your ward (any ward if none is chosen),
 * so a demo can start a few weeks early and let the detector "catch" the cluster live.
 */
export function TimeMachine({ asOf, setAsOf, myWard, onExit }: {
  asOf: string
  setAsOf: (d: string) => void
  myWard: string | null
  onExit: () => void
}) {
  const { meta, wardName } = useMeta()
  const weeks = meta.replay_weeks
  const timeline = useApi<TimelineAlert[]>('/api/alert-timeline', {}, { live: true })
  const [playing, setPlaying] = useState(false)
  const positioned = useRef(false)
  const idx = Math.max(0, weeks.indexOf(asOf))

  const relevant = (a: TimelineAlert) => !myWard || a.ward_code === myWard
  const byWeek = useMemo(() => {
    const m = new Map<string, TimelineAlert[]>()
    for (const a of timeline.data ?? []) m.set(a.week_end, [...(m.get(a.week_end) ?? []), a])
    return m
  }, [timeline.data])
  const mine = (timeline.data ?? []).filter(relevant)

  // On opening, start 3 weeks before the latest alert that matters, ready to press play.
  useEffect(() => {
    if (positioned.current || !timeline.data) return
    positioned.current = true
    const last = mine[mine.length - 1] ?? timeline.data[timeline.data.length - 1]
    if (last) {
      const i = weeks.indexOf(last.week_end)
      if (i >= 0) setAsOf(weeks[Math.max(0, i - 3)])
    }
  }, [timeline.data])

  useEffect(() => {
    if (!playing) return
    if (idx >= weeks.length - 1) { setPlaying(false); return }
    const t = setTimeout(() => {
      const next = weeks[idx + 1]
      setAsOf(next)
      if ((byWeek.get(next) ?? []).some(relevant)) setPlaying(false)
    }, STEP_MS)
    return () => clearTimeout(t)
  }, [playing, idx])

  const go = (i: number) => { setPlaying(false); setAsOf(weeks[Math.max(0, Math.min(weeks.length - 1, i))]) }
  const nextAlert = mine.find(a => weeks.indexOf(a.week_end) > idx)
  const here = byWeek.get(asOf) ?? []
  const pos = (week: string) => `${(weeks.indexOf(week) / Math.max(weeks.length - 1, 1)) * 100}%`

  return (
    <div className="replay-bar" role="region" aria-label="Time machine">
      <div className="replay-when">
        <span className="replay-kicker">Time machine · viewing the app as it was on</span>
        <span className="replay-date">{date(asOf)}</span>
      </div>

      <div className="replay-controls">
        <button type="button" className="btn" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous week">◀</button>
        <button type="button" className="btn primary" onClick={() => setPlaying(p => !p)} disabled={idx >= weeks.length - 1}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn" onClick={() => go(idx + 1)} disabled={idx >= weeks.length - 1} aria-label="Next week">▶</button>
        <button type="button" className="btn" onClick={() => nextAlert && go(weeks.indexOf(nextAlert.week_end))} disabled={!nextAlert}>
          Next {myWard ? 'ward ' : ''}alert
        </button>
      </div>

      <div className="replay-track">
        <input
          type="range"
          min={0}
          max={weeks.length - 1}
          value={idx}
          onChange={e => go(Number(e.target.value))}
          aria-label="Week"
          aria-valuetext={date(asOf)}
        />
        <div className="replay-marks">
          {(timeline.data ?? []).map(a => (
            <button
              key={a.phenotype + a.ward_code + a.week_end}
              type="button"
              className={`replay-mark${relevant(a) ? ' mine' : ''}`}
              style={{ left: pos(a.week_end) }}
              title={`${date(a.week_end)}: ${PHENOTYPE_LABEL[a.phenotype]} alert on ${wardName(a.ward_code)}`}
              aria-label={`Jump to ${PHENOTYPE_LABEL[a.phenotype]} alert on ${wardName(a.ward_code)}, ${date(a.week_end)}`}
              onClick={() => go(weeks.indexOf(a.week_end))}
            />
          ))}
        </div>
        <div className="replay-ends small muted">
          <span>{date(weeks[0])}</span>
          <span>{myWard ? `red marks = alerts on ${wardName(myWard)}` : 'marks = past alerts'}</span>
          <span>{date(weeks[weeks.length - 1])}</span>
        </div>
      </div>

      <div className="replay-now" aria-live="polite">
        {here.length ? (
          <Status kind="critical">
            {here.map(a => `${PHENOTYPE_LABEL[a.phenotype]} alert on ${wardName(a.ward_code)}`).join(' · ')}
          </Status>
        ) : <span className="small muted">No new alert this week</span>}
      </div>

      <button type="button" className="btn" onClick={onExit}>Back to today</button>
    </div>
  )
}
