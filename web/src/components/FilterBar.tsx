import { ALL, useMeta, type FilterKey, type Filters } from '../state'

const SETTINGS = [
  { value: 'community', label: 'Community (outpatients)' },
  { value: 'inpatient', label: 'Inpatients' },
  { value: 'hospital_onset', label: 'Hospital-onset (day 3+)' },
]

/** One filter row above everything it scopes. Filters a view ignores are dimmed and named. */
export function FilterBar({ filters, onChange, ignore = [], note }: {
  filters: Filters
  onChange: (f: Filters) => void
  ignore?: FilterKey[]
  note?: string
}) {
  const { meta, wardName } = useMeta()
  const set = (k: FilterKey, v: string) => onChange({ ...filters, [k]: v })
  const cls = (k: FilterKey) => `field${ignore.includes(k) ? ' ignored' : ''}`

  const times = [
    { value: '4w', label: 'Last 4 weeks' },
    { value: '12m', label: 'Last 12 months' },
    ...meta.periods.map(p => ({ value: p, label: p.split(' ')[0] })),
    { value: 'all', label: 'All time' },
  ]

  return (
    <div className="filter-bar" role="group" aria-label="Filters">
      <div className={cls('time')}>
        <span>Time</span>
        <div className="segmented">
          {times.map(t => (
            <button
              key={t.value}
              type="button"
              aria-pressed={filters.time === t.value}
              title={meta.periods.includes(t.value) ? `Surveillance year ${t.value}` : undefined}
              onClick={() => set('time', t.value)}
              disabled={ignore.includes('time')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <Select label="Specimen" cls={cls('specimen')} value={filters.specimen} onChange={v => set('specimen', v)}
        options={meta.specimens.map(s => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
      <Select label="Setting" cls={cls('setting')} value={filters.setting} onChange={v => set('setting', v)} options={SETTINGS} />
      <Select label="Ward" cls={cls('ward')} value={filters.ward} onChange={v => set('ward', v)}
        options={meta.wards.map(w => ({ value: w.ward_code, label: `${wardName(w.ward_code)} (${w.ward_code})` }))} />
      <Select label="Sex" cls={cls('sex')} value={filters.sex} onChange={v => set('sex', v)}
        options={[{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }]} />
      <Select label="Age" cls={cls('age_group')} value={filters.age_group} onChange={v => set('age_group', v)}
        options={meta.age_groups.map(a => ({ value: a, label: a }))} />
      {note && <span className="ignored-note">{note}</span>}
    </div>
  )
}

function Select({ label, cls, value, onChange, options }: {
  label: string
  cls: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className={cls}>
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value={ALL}>All</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}
