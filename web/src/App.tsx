import { useEffect, useMemo, useState } from 'react'
import { AsOfContext, useApi } from './api'
import { TimeMachine } from './components/TimeMachine'
import { date } from './format'
import { DEFAULT_FILTERS, loadMyWard, makeMetaHelpers, MetaContext, saveMyWard, type Filters } from './state'
import type { Meta, Ward } from './types'
import { AlertsView } from './views/AlertsView'
import { AntibiogramView } from './views/AntibiogramView'
import { HospitalView } from './views/HospitalView'
import { MethodsView } from './views/MethodsView'
import { TreatmentView } from './views/TreatmentView'
import { TrendsView } from './views/TrendsView'
import { WardView } from './views/WardView'

const ROUTES = [
  { id: 'ward', label: 'My ward' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'hospital', label: 'Hospital' },
  { id: 'antibiogram', label: 'Antibiogram' },
  { id: 'treatment', label: 'Treatment guide' },
  { id: 'trends', label: 'Trends' },
  { id: 'methods', label: 'Methods' },
] as const
type Route = (typeof ROUTES)[number]['id']

function readRoute(): Route {
  const id = window.location.hash.replace(/^#\/?/, '')
  return (ROUTES.find(r => r.id === id)?.id ?? 'ward') as Route
}

export function App() {
  const meta = useApi<Meta>('/api/meta')
  const helpers = useMemo(() => (meta.data ? makeMetaHelpers(meta.data) : null), [meta.data])
  const [route, setRoute] = useState<Route>(readRoute)
  const [myWard, setMyWardState] = useState<string | null>(loadMyWard)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [asOf, setAsOf] = useState<string | null>(null)

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const setMyWard = (code: string | null) => {
    setMyWardState(code)
    saveMyWard(code)
  }
  const go = (r: Route) => { window.location.hash = `/${r}` }

  if (meta.error) {
    return (
      <main>
        <h1>CultureWatch</h1>
        <p className="error">Cannot reach the API: {meta.error}</p>
        <p className="secondary">Start it from the CultureWatch folder: <code>uvicorn api.main:app --port 8000</code></p>
      </main>
    )
  }
  if (!helpers) return <main><p className="muted">Loading…</p></main>
  const known = myWard && helpers.meta.wards.some(w => w.ward_code === myWard) ? myWard : null

  const weeks = helpers.meta.replay_weeks

  return (
    <MetaContext.Provider value={helpers}>
      <AsOfContext.Provider value={asOf}>
        <div className={`top${asOf ? ' replaying' : ''}`}>
          <header className="app-header">
            <div className="brand"><span className="brand-mark" aria-hidden="true" />CultureWatch</div>
            <span className="muted small">{asOf ? `Replaying ${date(asOf)}` : `Data through ${date(helpers.meta.date_max)}`}</span>
            <span className="header-spacer" />
            <button type="button" className="btn" aria-pressed={asOf !== null}
              onClick={() => setAsOf(asOf ? null : weeks[weeks.length - 1])}
              title="Replay the data week by week and watch alerts fire">
              {asOf ? 'Exit time machine' : 'Time machine'}
            </button>
            <div className="my-ward">
              <label htmlFor="my-ward">My ward</label>
              <select id="my-ward" value={known ?? ''} onChange={e => { setMyWard(e.target.value || null); go('ward') }}>
                <option value="">Choose…</option>
                {helpers.meta.wards.map(w => <option key={w.ward_code} value={w.ward_code}>{w.ward_en} ({w.ward_code})</option>)}
              </select>
            </div>
            <span className="synthetic" title="Invented patients and results, not a real hospital">Synthetic data</span>
          </header>
          <nav className="nav" aria-label="Views">
            {ROUTES.map(r => (
              <a key={r.id} href={`#/${r.id}`} aria-current={route === r.id ? 'page' : undefined}>
                {r.id === 'ward' && known ? helpers.wardName(known) : r.label}
              </a>
            ))}
          </nav>
          {asOf && <TimeMachine asOf={asOf} setAsOf={setAsOf} myWard={known} onExit={() => setAsOf(null)} />}
        </div>
        <main>
          {route === 'ward' && (known
            ? <WardView key={known} code={known} onChangeWard={() => setMyWard(null)} />
            : <WardPicker wards={helpers.meta.wards} onPick={setMyWard} />)}
          {route === 'alerts' && <AlertsView myWard={known} />}
          {route === 'hospital' && <HospitalView filters={filters} setFilters={setFilters} onOpenWard={c => { setMyWard(c); go('ward') }} />}
          {route === 'antibiogram' && <AntibiogramView filters={filters} setFilters={setFilters} />}
          {route === 'treatment' && <TreatmentView filters={filters} setFilters={setFilters} />}
          {route === 'trends' && <TrendsView filters={filters} setFilters={setFilters} />}
          {route === 'methods' && <MethodsView />}
        </main>
      </AsOfContext.Provider>
    </MetaContext.Provider>
  )
}

function WardPicker({ wards, onPick }: { wards: Ward[]; onPick: (code: string) => void }) {
  const groups = [
    { title: 'Hospital wards', items: wards.filter(w => w.ward_type === 'in') },
    { title: 'Outpatient units', items: wards.filter(w => w.ward_type === 'out') },
  ]
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="view-head">
        <h1>Which ward are you on?</h1>
        <span className="sub">CultureWatch opens on your ward's last 4 weeks and last 12 months. You can change it any time.</span>
      </div>
      {groups.map(g => (
        <section key={g.title} style={{ display: 'grid', gap: 10 }}>
          <h2>{g.title}</h2>
          <div className="ward-grid">
            {g.items.map(w => (
              <button key={w.ward_code} type="button" className="ward-card" onClick={() => onPick(w.ward_code)}>
                <strong>{w.ward_en}</strong>
                <span className="code">{w.ward_code} · {w.ward_fi}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
