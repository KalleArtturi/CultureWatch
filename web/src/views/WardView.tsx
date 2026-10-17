import { useState } from 'react'
import { useApi } from '../api'
import { BarList } from '../components/BarList'
import { DataTable, type Column } from '../components/DataTable'
import { Status } from '../components/Status'
import { WeeklyColumns } from '../components/WeeklyColumns'
import { date, dateRange, num, pct, PHENOTYPE_LABEL, pp, pText, pValue, shortOrg } from '../format'
import { useMeta } from '../state'
import type { Rate, RateTests, WardPair, WardResp } from '../types'

const SIG = 0.05

const PHENOTYPE_HELP: Record<string, string> = {
  esbl: 'ESBL-producing E. coli / K. pneumoniae',
  mrsa: 'Methicillin-resistant S. aureus',
  vre: 'Vancomycin-resistant Enterococcus',
  cpe: 'Carbapenemase-producing Enterobacterales',
}

const rising = (cur: number | null, prev: number | null, p: number | null) =>
  p !== null && p < SIG && cur !== null && prev !== null && cur > prev
const above = (p: number | null) => p !== null && p < SIG

interface Signal {
  key: string
  what: string
  value: string
  reasons: string[]
  p: number
}

/** Annual anomalies: rates significantly up on the previous 12 months, or above the all-sites rate. */
function annualSignals(data: WardResp, abLabel: (c: string) => string): Signal[] {
  const tm = data.twelve_months
  const out: Signal[] = []
  for (const ph of ['esbl', 'mrsa'] as const) {
    const r = tm.rates.ward[ph], prev = tm.rates.ward_prev[ph], all = tm.rates.all_sites[ph], t = tm.rates.tests[ph]
    const reasons: string[] = []
    if (rising(r.pct, prev.pct, t.p_change)) reasons.push(`up from ${pct(prev.pct)} in the previous 12 months (${pText(t.p_change)})`)
    if (above(t.p_above)) reasons.push(`above the all-sites rate of ${pct(all.pct)} (${pText(t.p_above)})`)
    if (reasons.length) out.push({ key: ph, what: PHENOTYPE_LABEL[ph], value: pct(r.pct), reasons, p: Math.min(t.p_change ?? 1, t.p_above ?? 1) })
  }
  for (const r of tm.pairs) {
    if (r.antibiotic_code === 'FOX') continue // the cefoxitin screen is MRSA, already covered above
    const reasons: string[] = []
    if (rising(r.pct_resistant, r.pct_resistant_prev, r.p_change)) reasons.push(`up from ${pct(r.pct_resistant_prev)} (${pText(r.p_change)})`)
    if (above(r.p_above)) reasons.push(`above all sites, ${pct(r.pct_resistant_all)} (${pText(r.p_above)})`)
    if (reasons.length) out.push({
      key: r.organism + r.antibiotic_code,
      what: `${shortOrg(r.organism)} · ${abLabel(r.antibiotic_code)}`,
      value: `${pct(r.pct_resistant)} resistant`,
      reasons,
      p: Math.min(r.p_change ?? 1, r.p_above ?? 1),
    })
  }
  return out.sort((a, b) => a.p - b.p)
}

export function WardView({ code, onChangeWard }: { code: string; onChangeWard: () => void }) {
  const { meta, abLabel } = useMeta()
  const [specimen, setSpecimen] = useState('')
  const { data, error, loading } = useApi<WardResp>(`/api/ward/${encodeURIComponent(code)}`, { specimen })
  const [showSmall, setShowSmall] = useState(false)

  if (error) return <p className="error">Could not load ward: {error}</p>
  if (!data) return <p className="muted">Loading ward…</p>

  const { ward, four_weeks: fw, twelve_months: tm } = data
  const alerts = fw.phenotypes.filter(p => p.alert)
  const signals = annualSignals(data, abLabel)
  const reportable = tm.pairs.filter(p => p.reportable)
  const small = tm.pairs.filter(p => !p.reportable)
  const pairSignal = (r: WardPair) => rising(r.pct_resistant, r.pct_resistant_prev, r.p_change) || above(r.p_above)

  const pairCols: Column<WardPair>[] = [
    { key: 'org', header: 'Organism', render: r => <span className="italic">{shortOrg(r.organism)}</span>, sort: r => r.organism },
    { key: 'ab', header: 'Antibiotic', render: r => abLabel(r.antibiotic_code), sort: r => r.antibiotic_code },
    { key: 'pct', header: '% resistant', numeric: true, render: r => pct(r.pct_resistant), sort: r => r.pct_resistant },
    { key: 'n', header: 'n', numeric: true, render: r => num(r.n_tested), sort: r => r.n_tested },
    { key: 'prev', header: 'Prev. 12 m', numeric: true, render: r => r.pct_resistant_prev === null ? <span className="muted">n&lt;{meta.min_isolates}</span> : pct(r.pct_resistant_prev), sort: r => r.pct_resistant_prev },
    { key: 'chg', header: 'Change', numeric: true, render: r => pp(r.change_pp), sort: r => r.change_pp },
    { key: 'all', header: 'All sites', numeric: true, render: r => pct(r.pct_resistant_all), sort: r => r.pct_resistant_all },
    { key: 'sig', header: 'Signal', sort: r => (pairSignal(r) ? Math.min(r.p_change ?? 1, r.p_above ?? 1) : 2), render: r => {
      const up = rising(r.pct_resistant, r.pct_resistant_prev, r.p_change), hi = above(r.p_above)
      return up || hi ? <Status kind="critical">{[up && 'Rising', hi && 'Above all sites'].filter(Boolean).join(' · ')}</Status> : null
    } },
  ]

  return (
    <div className={loading ? 'loading' : undefined} style={{ display: 'grid', gap: 20 }}>
      <div className="view-head">
        <h1>{ward.name_en}</h1>
        <span className="sub">
          {ward.code} · {ward.name_fi} · {ward.ward_type === 'in' ? 'inpatient ward' : 'outpatient unit'} · data through {date(data.latest)}
        </span>
        <button type="button" className="link-btn" onClick={onChangeWard}>Change ward</button>
      </div>

      <div className="filter-bar">
        <div className="field">
          <span>Specimen</span>
          <div className="segmented">
            {['', ...meta.specimens].map(s => (
              <button key={s || 'all'} type="button" aria-pressed={specimen === s} onClick={() => setSpecimen(s)}>
                {s ? s[0].toUpperCase() + s.slice(1) : 'All specimens'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------- Last 4 weeks ---------------- */}
      <section style={{ display: 'grid', gap: 12 }}>
        <div className="section-title">
          <h2>Last 4 weeks</h2>
          <span className="range">{dateRange(fw.weeks.length >= 4 ? [fw.weeks[fw.weeks.length - 4].slice(0, 10), data.latest] : data.windows['4w'])}</span>
        </div>

        {alerts.length ? (
          <div className="banner critical" role="alert">
            <Status kind="critical">Alert</Status>
            <div>
              <strong>Unusual cluster{alerts.length > 1 ? 's' : ''} on this ward. Look into {alerts.length > 1 ? 'these' : 'this'}.</strong>
              <ul>
                {alerts.map(a => (
                  <li key={a.phenotype}>
                    {PHENOTYPE_LABEL[a.phenotype]}: {a.observed} new cases in 4 weeks, usually about {a.expected.toFixed(1)} ({pText(a.p_value)})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="banner good">
            <Status kind="good">Normal</Status>
            <span>No unusual ESBL, MRSA, VRE or CPE clusters compared with this ward's previous 52 weeks.</span>
          </div>
        )}

        <div className="tiles">
          <div className="tile">
            <span className="tile-label">New first isolates</span>
            <span className="tile-value">{num(fw.isolates.observed)}</span>
            <span className="tile-sub">usually about {fw.isolates.expected.toFixed(0)} in 4 weeks</span>
            <WeeklyColumns compact height={44} values={fw.isolates.weekly} weeks={fw.weeks}
              usualPerWeek={fw.isolates.expected / 4} label="New first isolates per week, last 26 weeks" />
          </div>
          {fw.phenotypes.map(p => (
            <div key={p.phenotype} className={`tile${p.alert ? ' alert' : ''}`} title={PHENOTYPE_HELP[p.phenotype]}>
              <span className="tile-label">{PHENOTYPE_LABEL[p.phenotype]} cases</span>
              <span className="tile-value">{p.observed}</span>
              <span className="tile-sub">usually about {p.expected.toFixed(1)} in 4 weeks</span>
              {p.alert ? <Status kind="critical">Alert · {pText(p.p_value)}</Status> : <Status kind="good">Normal</Status>}
              <WeeklyColumns compact height={44} values={p.weekly} weeks={fw.weeks}
                alertWeeks={new Set(p.history.map(h => h.window_end))}
                usualPerWeek={p.expected / 4} label={`${PHENOTYPE_LABEL[p.phenotype]} cases per week, last 26 weeks`} />
            </div>
          ))}
        </div>
        <p className="small muted">
          Bars: weekly cases over the last 26 weeks; blue = the 4 weeks being tested. Dashed line = this ward's usual weekly level
          (mean of the previous 52 weeks). Alert = at least 3 cases and Poisson p &lt; 0.01.
        </p>
      </section>

      {/* ---------------- Last 12 months ---------------- */}
      <section style={{ display: 'grid', gap: 12 }}>
        <div className="section-title">
          <h2>Last 12 months</h2>
          <span className="range">{dateRange(data.windows['12m'])}, compared with {dateRange(data.windows['12m_prev'])}</span>
        </div>

        {signals.length ? (
          <div className="banner critical">
            <Status kind="critical">Signal</Status>
            <div>
              <strong>Resistance on this ward has risen or is above the rest of the hospital.</strong>
              <ul>
                {signals.slice(0, 6).map(s => (
                  <li key={s.key}><strong style={{ display: 'inline' }}>{s.what}: {s.value}</strong>, {s.reasons.join(' and ')}</li>
                ))}
              </ul>
              {signals.length > 6 && <span className="secondary">+{signals.length - 6} more in the table below.</span>}
            </div>
          </div>
        ) : (
          <div className="banner good">
            <Status kind="good">No signal</Status>
            <span>No resistance rate is significantly up on the previous 12 months or above the all-sites rate.</span>
          </div>
        )}

        <div className="tiles">
          <RateTile label="ESBL (E. coli + K. pneumoniae)" rate={tm.rates.ward.esbl} prev={tm.rates.ward_prev.esbl} all={tm.rates.all_sites.esbl} tests={tm.rates.tests.esbl} minN={meta.min_isolates} />
          <RateTile label="MRSA (S. aureus)" rate={tm.rates.ward.mrsa} prev={tm.rates.ward_prev.mrsa} all={tm.rates.all_sites.mrsa} tests={tm.rates.tests.mrsa} minN={meta.min_isolates} />
          <div className="tile">
            <span className="tile-label">First isolates</span>
            <span className="tile-value">{num(tm.first_isolates)}</span>
            <span className="tile-sub">one per patient, organism, specimen and surveillance year</span>
          </div>
          {ward.ward_type === 'in' && (
            <div className="tile">
              <span className="tile-label">Hospital-onset share</span>
              <span className="tile-value">{pct(tm.hospital_onset_share, 0)}</span>
              <span className="tile-sub">sampled on day 3 or later of the stay</span>
            </div>
          )}
        </div>

        <div className="grid-3-2">
          <div className="card">
            <div className="card-head">
              <h3>Resistance on this ward</h3>
              <p>{reportable.length} organism–antibiotic pairs with at least {meta.min_isolates} isolates</p>
            </div>
            <DataTable rows={reportable} columns={pairCols} rowKey={r => r.organism + r.antibiotic_code}
              initialSort={{ key: 'n', desc: true }} highlight={pairSignal}
              empty={`No pair reaches ${meta.min_isolates} isolates on this ward in the last 12 months. Try "All specimens".`} />
            {small.length > 0 && (
              <p className="small muted" style={{ marginTop: 8 }}>
                {small.length} more pairs have fewer than {meta.min_isolates} isolates, too few for a reliable %.{' '}
                <button type="button" className="link-btn" onClick={() => setShowSmall(s => !s)}>{showSmall ? 'Hide' : 'Show counts'}</button>
              </p>
            )}
            {showSmall && (
              <DataTable rows={small} rowKey={r => r.organism + r.antibiotic_code} initialSort={{ key: 'n', desc: true }} columns={[
                pairCols[0], pairCols[1],
                { key: 'n', header: 'n tested', numeric: true, render: r => num(r.n_tested), sort: r => r.n_tested },
                { key: 'r', header: 'Resistant', numeric: true, render: () => <span className="muted">n&lt;{meta.min_isolates}</span> },
              ]} />
            )}
          </div>
          <div className="card">
            <div className="card-head"><h3>Organisms found</h3><p>first isolates, last 12 months</p></div>
            <BarList ariaLabel="Organism mix" items={tm.organism_mix.slice(0, 10).map(o => ({
              key: o.organism,
              label: <span className="italic">{shortOrg(o.organism)}</span>,
              value: o.n,
              display: num(o.n),
              tooltip: <><div className="tt-title italic">{o.organism}</div><div className="tt-value">{num(o.n)} isolates</div><div>{pct(o.n / tm.first_isolates)} of this ward's first isolates</div></>,
            }))} />
          </div>
        </div>
        <p className="small muted">
          Signal = significantly higher than the previous 12 months (Fisher's exact test) or than the all-sites rate (one-sided
          binomial test), p &lt; 0.05. Each comparison is tested on its own, so with many pairs an occasional signal is expected
          by chance: treat it as a prompt to look, not proof.
        </p>
      </section>

      {/* ---------------- Alert history ---------------- */}
      <section className="card">
        <div className="card-head"><h3>Alert history on this ward</h3><p>all 4-week clusters flagged since monitoring could start (52-week baseline)</p></div>
        <DataTable
          rows={fw.phenotypes.flatMap(p => p.history.map(h => ({ ...h, phenotype: p.phenotype })))}
          rowKey={r => r.phenotype + r.window_end}
          initialSort={{ key: 'week', desc: true }}
          empty="No clusters have been flagged on this ward."
          columns={[
            { key: 'ph', header: 'Type', render: r => PHENOTYPE_LABEL[r.phenotype], sort: r => r.phenotype },
            { key: 'week', header: '4-week window ending', render: r => date(r.window_end.slice(11, 21)), sort: r => r.window_end },
            { key: 'obs', header: 'Cases', numeric: true, render: r => r.observed, sort: r => r.observed },
            { key: 'exp', header: 'Usual', numeric: true, render: r => r.expected.toFixed(1), sort: r => r.expected },
            { key: 'p', header: 'p', numeric: true, render: r => pValue(r.p_value), sort: r => r.p_value },
          ]}
        />
      </section>
    </div>
  )
}

function RateTile({ label, rate, prev, all, tests, minN }: {
  label: string; rate: Rate; prev: Rate; all: Rate; tests: RateTests; minN: number
}) {
  const change = rate.pct !== null && prev.pct !== null ? (rate.pct - prev.pct) * 100 : null
  const up = rising(rate.pct, prev.pct, tests.p_change), hi = above(tests.p_above)
  return (
    <div className={`tile${up || hi ? ' alert' : ''}`}>
      <span className="tile-label">{label}</span>
      <span className="tile-value">
        {rate.pct === null ? <span className="muted">n&lt;{minN}</span> : pct(rate.pct)}
      </span>
      <span className="tile-sub">
        {rate.cases} of {rate.n} isolates
        {rate.pct !== null && rate.ci_low !== null && <> · 95% CI {pct(rate.ci_low, 0)}–{pct(rate.ci_high, 0)}</>}
      </span>
      <span className="tile-sub">
        Prev. 12 m {prev.pct === null ? `n<${minN}` : pct(prev.pct)}{change !== null && ` (${pp(change)})`} · all sites {pct(all.pct)}
      </span>
      {rate.pct !== null && (up || hi
        ? <Status kind="critical">{[up && 'Rising', hi && 'Above all sites'].filter(Boolean).join(' · ')}</Status>
        : <Status kind="good">No signal</Status>)}
    </div>
  )
}
