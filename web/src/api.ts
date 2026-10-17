import { createContext, useContext, useEffect, useState } from 'react'

type Params = Record<string, string | number | null | undefined>

/** Time machine: when set (YYYY-MM-DD), every request sees only data up to that day. */
export const AsOfContext = createContext<string | null>(null)

export function buildUrl(path: string, params: Params = {}): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `${path}?${s}` : path
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal })
  if (!r.ok) {
    const body = await r.json().catch(() => null)
    const detail = body?.detail
    throw new Error(typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : `${r.status} ${r.statusText}`)
  }
  return r.json() as Promise<T>
}

export interface ApiState<T> {
  data: T | undefined
  error: string | undefined
  loading: boolean
}

/** Fetch JSON and keep the previous result while a new one loads (no skeleton flash on refetch).
 *  Pass path=null to skip the request. Adds the time machine's as_of unless `live` is set. */
// Requests in flight, so the historical replay can wait for each week to finish loading before moving on.
let inflight = 0
const inflightListeners = new Set<(n: number) => void>()
function setInflight(delta: number) {
  inflight += delta
  inflightListeners.forEach(l => l(inflight))
}

export function useInflight(): number {
  const [n, setN] = useState(inflight)
  useEffect(() => {
    inflightListeners.add(setN)
    return () => { inflightListeners.delete(setN) }
  }, [])
  return n
}

export function useApi<T>(path: string | null, params: Params = {}, opts: { live?: boolean } = {}): ApiState<T> {
  const asOf = useContext(AsOfContext)
  const url = path ? buildUrl(path, opts.live ? params : { ...params, as_of: asOf }) : null
  const [state, setState] = useState<ApiState<T>>({ data: undefined, error: undefined, loading: url !== null })

  useEffect(() => {
    if (!url) return
    const ctrl = new AbortController()
    setState(s => ({ ...s, loading: true, error: undefined }))
    setInflight(1)
    getJson<T>(url, ctrl.signal)
      .then(data => setState({ data, error: undefined, loading: false }))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setState(s => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }))
      })
      .finally(() => setInflight(-1))
    return () => ctrl.abort()
  }, [url])

  return state
}
