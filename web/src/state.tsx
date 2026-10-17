import { createContext, useContext } from 'react'
import type { Meta } from './types'

// ---------- Meta (loaded once; labels and filter options) ----------
export interface MetaHelpers {
  meta: Meta
  abName: (code: string) => string
  abLabel: (code: string) => string
  wardName: (code: string) => string
}

export const MetaContext = createContext<MetaHelpers | null>(null)

export function makeMetaHelpers(meta: Meta): MetaHelpers {
  const ab = new Map(meta.antibiotics.map(a => [a.antibiotic_code, a.antibiotic]))
  const wards = new Map(meta.wards.map(w => [w.ward_code, w.ward_en]))
  return {
    meta,
    abName: code => ab.get(code) ?? code,
    abLabel: code => `${code} · ${ab.get(code) ?? code}`,
    wardName: code => wards.get(code) ?? code,
  }
}

export function useMeta(): MetaHelpers {
  const m = useContext(MetaContext)
  if (!m) throw new Error('useMeta outside MetaContext')
  return m
}

// ---------- Filters (shared by every view; each view says which ones it ignores) ----------
/** time: '4w' | '12m' (rolling windows), a surveillance period label like 'Y3 (2025/26)', or 'all' */
export interface Filters {
  time: string
  specimen: string
  setting: string
  ward: string
  sex: string
  age_group: string
}

export const ALL = ''

export const DEFAULT_FILTERS: Filters = { time: '12m', specimen: ALL, setting: ALL, ward: ALL, sex: ALL, age_group: ALL }

export type FilterKey = keyof Filters

export function filterParams(f: Filters, ignore: FilterKey[] = []): Record<string, string> {
  const p: Record<string, string> = {}
  const use = (k: FilterKey) => !ignore.includes(k) && f[k] !== ALL
  if (use('time') && f.time !== 'all') {
    if (f.time === '4w' || f.time === '12m') p.window = f.time
    else p.period = f.time
  }
  for (const k of ['specimen', 'setting', 'ward', 'sex', 'age_group'] as const) {
    if (use(k)) p[k] = f[k]
  }
  return p
}

// ---------- My ward (remembered per browser) ----------
const WARD_KEY = 'culturewatch.myWard'

export function loadMyWard(): string | null {
  try {
    return localStorage.getItem(WARD_KEY)
  } catch {
    return null
  }
}

export function saveMyWard(code: string | null): void {
  try {
    if (code) localStorage.setItem(WARD_KEY, code)
    else localStorage.removeItem(WARD_KEY)
  } catch {
    /* storage unavailable (private window): the choice just isn't remembered */
  }
}
