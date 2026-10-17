export const DASH = '—'

export function pct(x: number | null | undefined, digits = 1): string {
  return x === null || x === undefined || Number.isNaN(x) ? DASH : `${(x * 100).toFixed(digits)}%`
}

/** Signed percentage-point change, e.g. +3.2 pp */
export function pp(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || Number.isNaN(x)) return DASH
  const s = x.toFixed(digits)
  return `${x > 0 ? '+' : x < 0 ? '−' : ''}${s.replace('-', '')} pp`
}

export function num(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || Number.isNaN(x)) return DASH
  return x.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function pValue(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return DASH
  return p < 0.001 ? '<0.001' : p.toFixed(3)
}

/** 'p < 0.001' or 'p = 0.046', for use in sentences */
export function pText(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return 'p unavailable'
  return p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`
}

const MONTHS =['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-09-27' -> '27 Sep 2026' (parsed as a calendar date, no timezone shift) */
export function date(iso: string, withYear = true): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`
}

export function dateRange([a, b]: [string, string]): string {
  return `${date(a, a.slice(0, 4) !== b.slice(0, 4))} – ${date(b)}`
}

/** pandas weekly period '2026-09-21/2026-09-27' -> its start date */
export function weekStart(period: string): string {
  return period.slice(0, 10)
}

/** 'Escherichia coli' -> 'E. coli' */
export function shortOrg(name: string): string {
  const [genus, ...rest] = name.split(' ')
  return rest.length ? `${genus[0]}. ${rest.join(' ')}` : name
}

export const PHENOTYPE_LABEL: Record<string, string> = { esbl: 'ESBL', mrsa: 'MRSA', vre: 'VRE', cpe: 'CPE' }
