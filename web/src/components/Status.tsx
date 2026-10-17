import type { ReactNode } from 'react'

/** Status = icon + label + colour, never colour alone. */
export type StatusKind = 'good' | 'critical' | 'muted'

function Icon({ kind }: { kind: StatusKind }) {
  if (kind === 'critical')
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.5 15 14H1z" fill="currentColor" />
        <path d="M8 6v3.5M8 11.3v.2" stroke="var(--surface)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  if (kind === 'good')
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path d="m4.8 8.2 2.2 2.2 4.2-4.6" stroke="var(--surface)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export function Status({ kind, children }: { kind: StatusKind; children: ReactNode }) {
  return (
    <span className={`status ${kind}`}>
      <Icon kind={kind} />
      {children}
    </span>
  )
}
