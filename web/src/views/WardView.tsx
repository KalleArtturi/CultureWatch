import { useState } from 'react'
import { useApi } from '../api'
import { BarList } from '../components/BarList'
import { DataTable, type Column } from '../components/DataTable'
import { Status } from '../components/Status'
import { WeeklyColumns } from '../components/WeeklyColumns'
import { date, dateRange, num, pct, PHENOTYPE_LABEL, pp, pText, pValue, shortOrg } from '../format'
import { useMeta, useT } from '../state'
import type { Strings } from '../strings'
import type { Rate, RateTests, WardPair, WardResp } from '../types'

const SIG = 0.05

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
function annualSignals(data: WardResp, t: Strings, abLabel: (c: string) => string): Signal[] {
  const tm = data.twelve_months
  const out: Signal[] = []
  for (const ph of ['esbl', 'mrsa'] as const) {
    const r = tm.rates.ward[ph], prev = tm.rates.ward_prev[ph], all = tm.rates.all_sites[ph], ts = tm.rates.tests[ph]
    const reasons: string[] = []
    if (rising(r.pct, prev.pct, ts.p_change)) reasons.push(t.ward.upFrom(pct(prev.pct), pText(ts.p_change)))
    if (above(ts.p_above)) reasons.push(t.ward.aboveRate(pct(all.pct), pText(ts.p_above)))
    if (reasons.length) out.push({ key: ph, what: PHENOTYPE_LABEL[ph], value: pct(r.pct), reasons, p: Math.min(ts.p_change ?? 1, ts.p_above ?? 1) })
  }
  for (const r of tm.pairs) {
    if (r.antibiotic_code === 'FOX') continue // the cefoxitin screen is MRSA, already covered above
    const reasons: string[] = []
    if (rising(r.pct_resistant, r.pct_resistant_prev, r.p_change)) reasons.push(t.ward.pairUp(pct(r.pct_resistant_prev), pText(r.p_change)))
    if (above(r.p_above)) reasons.push(t.ward.pairAbove(pct(r.pct_resistant_all), pText(r.p_above)))
    if (reasons.length) out.push({
      key: r.organism + r.antibiotic_code,
      what: `${shortOrg(r.organism)} · ${abLabel(r.antibiotic_code)}`,
      value: t.ward.pctResistantValue(pct(r.pct_resistant)),
      reasons,
      p: Math.min(r.p_change ?? 1, r.p_above ?? 1),
    })
  }
  return out.sort((a, b) => a.p - b.p)
}

/** Plain-language summary built only from the numbers on this page (nothing generated, nothing invented). */
function plainSummary(data: WardResp, t: Strings, signals: Signal[]): string[] {
  const fw = data.four_weeks, tm = data.twelve_months
  const lines: string[] = []
  const alerts = fw.phenotypes.filter(p => p.alert)
  if (alerts.length) alerts.forEach(a => lines.push(t.ward.sumAlert(t.phenotypePlain[a.phenotype], a.observed, num(a.expected, 1))))
  else lines.push(t.ward.sumCalm)

  let any = false
  for (const ph of ['esbl', 'mrsa'] as const) {
    const r = tm.rates.ward[ph], prev = tm.rates.ward_prev[ph], all = tm.rates.all_sites[ph], ts = tm.rates.tests[ph]
    const up = rising(r.pct, prev.pct, ts.p_change), hi = above(ts.p_above)
    if (!up && !hi) continue
    any = true
    lines.push(`${t.ward.sumRate(PHENOTYPE_LABEL[ph], pct(r.pct), pct(prev.pct), pct(all.pct))} ${up && hi ? t.ward.sumUpAbove : up ? t.ward.sumUp : t.ward.sumAbove}`)
  }
  const pairSignals = signals.filter(s => s.key !== 'esbl' && s.key !== 'mrsa').length
  if (pairSignals) { any = true; lines.push(t.ward.sumPairs(pairSignals)) }
  if (!any) lines.push(t.ward.sumSteady)
  return lines
}

export function WardView({ code, onChangeWard }: { code: string; onChangeWard: () => void }) {
  const { meta, abLabel, specimenName } = useMeta()
  const { t, lang } = useT()
  const [specimen, setSpecimen] = useState('')
  const { data, error, loading } = useApi<WardResp>(`/api/ward/${encodeURIComponent(code)}`, { specimen })
  const [showSmall, setShowSmall] = useState(false)

  if (error) return <p className="error">{t.ward.loadError} {error}</p>
  if (!data) return <p className="muted">{t.ward.loading}</p>

  const { ward, four_weeks: fw, twelve_months: tm } = data
  const alerts = fw.phenotypes.filter(p => p.alert)
  const signals = annualSignals(data, t, abLabel)
  const summary = plainSummary(data, t, signals)
  const reportable = tm.pairs.filter(p => p.reportable)
  const small = tm.pairs.filter(p => !p.reportable)
  const pairSignal = (r: WardPair) => rising(r.pct_resistant, r.pct_resistant_prev, r.p_change) || above(r.p_above)
  const nLow = t.common.nLow(meta.min_isolates)
  const wardName = lang === 'fi' ? ward.name_fi : ward.name_en
  const otherName = lang === 'fi' ? ward.name_en : ward.name_fi

  const pairCols: Column<WardPair>[] = [
    { key: 'org', header: t.common.organism, render: r => <span className="italic">{shortOrg(r.organism)}</span>, sort: r => r.organism },
    { key: 'ab', header: t.common.antibiotic, render: r => abLabel(r.antibiotic_code), sort: r => r.antibiotic_code },
    { key: 'pct', header: t.common.pctResistant, numeric: true, render: r => pct(r.pct_resistant), sort: r => r.pct_resistant },
    { key: 'n', header: t.common.n, numeric: true, render: r => num(r.n_tested), sort: r => r.n_tested },
    { key: 'prev', header: t.ward.colPrev, numeric: true, render: r => r.pct_resistant_prev === null ? <span className="muted">{nLow}</span> : pct(r.pct_resistant_prev), sort: r => r.pct_resistant_prev },
    { key: 'chg', header: t.common.change, numeric: true, render: r => pp(r.change_pp), sort: r => r.change_pp },
    { key: 'all', header: t.ward.colAll, numeric: true, render: r => pct(r.pct_resistant_all), sort: r => r.pct_resistant_all },
    { key: 'sig', header: t.ward.colSignal, sort: r => (pairSignal(r) ? Math.min(r.p_change ?? 1, r.p_above ?? 1) : 2), render: r => {
      const up = rising(r.pct_resistant, r.pct_resistant_prev, r.p_change), hi = above(r.p_above)
      return up || hi ? <Status kind="critical">{[up && t.status.rising, hi && t.status.aboveAll].filter(Boolean).join(' · ')}</Status> : null
    } },
  ]

  return (
    <div className={loading ? 'loading' : undefined} style={{ display: 'grid', gap: 20 }}>
      <div className="view-head">
        <h1>{wardName}</h1>
        <span className="sub">
          {ward.code} · {otherName} · {ward.ward_type === 'in' ? t.ward.inpatient : t.ward.outpatient} · {t.ward.dataThrough(date(data.latest))}
        </span>
        <button type="button" className="link-btn" onClick={onChangeWard}>{t.ward.change}</button>
      </div>

      <section className={`summary${alerts.length || signals.length ? ' attention' : ''}`} aria-label={t.ward.inShort}>
        <h2>{t.ward.inShort}</h2>
        {summary.map((line, i) => <p key={i}>{line}</p>)}
      </section>

      <div className="filter-bar">
        <div className="field">
          <span>{t.filters.specimen}</span>
          <div className="segmented">
            {['', ...meta.specimens].map(s => (
              <button key={s || 'all'} type="button" aria-pressed={specimen === s} onClick={() => setSpecimen(s)}>
                {s ? specimenName(s) : t.specimen.all}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------- Last 4 weeks ---------------- */}
      <section style={{ display: 'grid', gap: 12 }}>
        <div className="section-title">
          <h2>{t.ward.last4w}</h2>
          <span className="range">{dateRange(fw.weeks.length >= 4 ? [fw.weeks[fw.weeks.length - 4].slice(0, 10), data.latest] : data.windows['4w'])}</span>
        </div>

        {alerts.length ? (
          <div className="banner critical" role="alert">
            <Status kind="critical">{t.status.alert}</Status>
            <div>
              <strong>{t.ward.alertTitle(alerts.length)}</strong>
              <ul>
                {alerts.map(a => (
                  <li key={a.phenotype}>{t.ward.alertLine(PHENOTYPE_LABEL[a.phenotype], a.observed, num(a.expected, 1), pText(a.p_value))}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="banner good">
            <Status kind="good">{t.status.normal}</Status>
            <span>{t.ward.normal4w}</span>
          </div>
        )}

        <div className="tiles">
          <div className="tile">
            <span className="tile-label">{t.ward.newIsolates}</span>
            <span className="tile-value">{num(fw.isolates.observed)}</span>
            <span className="tile-sub">{t.ward.usuallyIn4w(num(fw.isolates.expected, 0))}</span>
            <WeeklyColumns compact height={44} values={fw.isolates.weekly} weeks={fw.weeks}
              usualPerWeek={fw.isolates.expected / 4} label={t.ward.newIsolates} />
          </div>
          {fw.phenotypes.map(p => (
            <div key={p.phenotype} className={`tile${p.alert ? ' alert' : ''}`} title={t.phenotypeHelp[p.phenotype]}>
              <span className="tile-label">{t.ward.phCases(PHENOTYPE_LABEL[p.phenotype])}</span>
              <span className="tile-value">{p.observed}</span>
              <span className="tile-sub">{t.ward.usuallyIn4w(num(p.expected, 1))}</span>
              {p.alert ? <Status kind="critical">{t.status.alert} · {pText(p.p_value)}</Status> : <Status kind="good">{t.status.normal}</Status>}
              <WeeklyColumns compact height={44} values={p.weekly} weeks={fw.weeks}
                alertWeeks={new Set(p.history.map(h => h.window_end))}
                usualPerWeek={p.expected / 4} label={t.ward.phCases(PHENOTYPE_LABEL[p.phenotype])} />
            </div>
          ))}
        </div>
        <p className="small muted">{t.ward.sparkNote}</p>
      </section>

      {/* ---------------- Last 12 months ---------------- */}
      <section style={{ display: 'grid', gap: 12 }}>
        <div className="section-title">
          <h2>{t.ward.last12m}</h2>
          <span className="range">{t.ward.comparedWith(dateRange(data.windows['12m']), dateRange(data.windows['12m_prev']))}</span>
        </div>

        {signals.length ? (
          <div className="banner critical">
            <Status kind="critical">{t.status.signal}</Status>
            <div>
              <strong>{t.ward.signalTitle}</strong>
              <ul>
                {signals.slice(0, 6).map(s => (
                  <li key={s.key}><strong style={{ display: 'inline' }}>{s.what}: {s.value}</strong>, {s.reasons.join(t.ward.and)}</li>
                ))}
              </ul>
              {signals.length > 6 && <span className="secondary">{t.ward.more(signals.length - 6)}</span>}
            </div>
          </div>
        ) : (
          <div className="banner good">
            <Status kind="good">{t.status.noSignal}</Status>
            <span>{t.ward.noSignal12m}</span>
          </div>
        )}

        <div className="tiles">
          <RateTile label={t.ward.esblLabel} rate={tm.rates.ward.esbl} prev={tm.rates.ward_prev.esbl} all={tm.rates.all_sites.esbl} tests={tm.rates.tests.esbl} minN={meta.min_isolates} />
          <RateTile label={t.ward.mrsaLabel} rate={tm.rates.ward.mrsa} prev={tm.rates.ward_prev.mrsa} all={tm.rates.all_sites.mrsa} tests={tm.rates.tests.mrsa} minN={meta.min_isolates} />
          <div className="tile">
            <span className="tile-label">{t.ward.firstIsolates}</span>
            <span className="tile-value">{num(tm.first_isolates)}</span>
            <span className="tile-sub">{t.ward.firstIsolatesSub}</span>
          </div>
          {ward.ward_type === 'in' && (
            <div className="tile">
              <span className="tile-label">{t.ward.hoShare}</span>
              <span className="tile-value">{pct(tm.hospital_onset_share, 0)}</span>
              <span className="tile-sub">{t.ward.hoSub}</span>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>{t.ward.resistanceHere}</h3>
            <p>{t.ward.pairsWithN(reportable.length, meta.min_isolates)}</p>
          </div>
          <DataTable rows={reportable} columns={pairCols} rowKey={r => r.organism + r.antibiotic_code}
            initialSort={{ key: 'n', desc: true }} highlight={pairSignal} empty={t.ward.noPairs(meta.min_isolates)} />
          {small.length > 0 && (
            <p className="small muted" style={{ marginTop: 8 }}>
              {t.ward.smallPairs(small.length, meta.min_isolates)}{' '}
              <button type="button" className="link-btn" onClick={() => setShowSmall(s => !s)}>{showSmall ? t.common.hide : t.common.showCounts}</button>
            </p>
          )}
          {showSmall && (
            <DataTable rows={small} rowKey={r => r.organism + r.antibiotic_code} initialSort={{ key: 'n', desc: true }} columns={[
              pairCols[0], pairCols[1],
              { key: 'n', header: t.common.nTested, numeric: true, render: r => num(r.n_tested), sort: r => r.n_tested },
              { key: 'r', header: t.common.resistant, numeric: true, render: () => <span className="muted">{nLow}</span> },
            ]} />
          )}
        </div>
        <p className="small muted">{t.ward.signalNote}</p>
      </section>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>{t.ward.organismsFound}</h3><p>{t.ward.organismsSub}</p></div>
          <BarList ariaLabel={t.ward.organismsFound} items={tm.organism_mix.slice(0, 10).map(o => ({
            key: o.organism,
            label: <span className="italic">{shortOrg(o.organism)}</span>,
            value: o.n,
            display: num(o.n),
            tooltip: <><div className="tt-title italic">{o.organism}</div><div className="tt-value">{num(o.n)} {t.common.isolates}</div><div>{t.ward.ofWard(pct(o.n / tm.first_isolates))}</div></>,
          }))} />
        </div>

        {/* ---------------- Alert history ---------------- */}
        <section className="card">
          <div className="card-head"><h3>{t.ward.historyTitle}</h3><p>{t.ward.historySub}</p></div>
          <DataTable
            rows={fw.phenotypes.flatMap(p => p.history.map(h => ({ ...h, phenotype: p.phenotype })))}
            rowKey={r => r.phenotype + r.window_end}
            initialSort={{ key: 'week', desc: true }}
            empty={t.ward.noHistory}
            columns={[
              { key: 'ph', header: t.common.type, render: r => PHENOTYPE_LABEL[r.phenotype], sort: r => r.phenotype },
              { key: 'week', header: t.ward.windowEnding, render: r => date(r.window_end.slice(11, 21)), sort: r => r.window_end },
              { key: 'obs', header: t.common.cases, numeric: true, render: r => r.observed, sort: r => r.observed },
              { key: 'exp', header: t.common.usual, numeric: true, render: r => num(r.expected, 1), sort: r => r.expected },
              { key: 'p', header: t.common.p, numeric: true, render: r => pValue(r.p_value), sort: r => r.p_value },
            ]}
          />
        </section>
      </div>
    </div>
  )
}

function RateTile({ label, rate, prev, all, tests, minN }: {
  label: string; rate: Rate; prev: Rate; all: Rate; tests: RateTests; minN: number
}) {
  const { t } = useT()
  const change = rate.pct !== null && prev.pct !== null ? (rate.pct - prev.pct) * 100 : null
  const up = rising(rate.pct, prev.pct, tests.p_change), hi = above(tests.p_above)
  const nLow = t.common.nLow(minN)
  return (
    <div className={`tile${up || hi ? ' alert' : ''}`}>
      <span className="tile-label">{label}</span>
      <span className="tile-value">{rate.pct === null ? <span className="muted">{nLow}</span> : pct(rate.pct)}</span>
      <span className="tile-sub">
        {t.common.ofIsolates(num(rate.cases), num(rate.n))}
        {rate.pct !== null && rate.ci_low !== null && <> · {t.common.ci(pct(rate.ci_low, 0), pct(rate.ci_high, 0))}</>}
      </span>
      <span className="tile-sub">
        {t.ward.prev12(prev.pct === null ? nLow : pct(prev.pct), change !== null ? ` (${pp(change)})` : '', pct(all.pct))}
      </span>
      {rate.pct !== null && (up || hi
        ? <Status kind="critical">{[up && t.status.rising, hi && t.status.aboveAll].filter(Boolean).join(' · ')}</Status>
        : <Status kind="good">{t.status.noSignal}</Status>)}
    </div>
  )
}
