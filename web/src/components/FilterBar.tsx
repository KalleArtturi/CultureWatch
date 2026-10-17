import { ALL, useMeta, useT, type FilterKey, type Filters } from '../state'

/** One filter row above everything it scopes. Filters a view ignores are dimmed and named. */
export function FilterBar({ filters, onChange, ignore = [], note }: {
  filters: Filters
  onChange: (f: Filters) => void
  ignore?: FilterKey[]
  note?: string
}) {
  const { meta, wardName, specimenName } = useMeta()
  const { t } = useT()
  const set = (k: FilterKey, v: string) => onChange({ ...filters, [k]: v })
  const cls = (k: FilterKey) => `field${ignore.includes(k) ? ' ignored' : ''}`

  const times = [
    { value: '4w', label: t.filters.last4w },
    { value: '12m', label: t.filters.last12m },
    ...meta.periods.map(p => ({ value: p, label: p.split(' ')[0] })),
    { value: 'all', label: t.filters.allTime },
  ]

  return (
    <div className="filter-bar" role="group" aria-label="Filters">
      <div className={cls('time')}>
        <span>{t.filters.time}</span>
        <div className="segmented">
          {times.map(o => (
            <button
              key={o.value}
              type="button"
              aria-pressed={filters.time === o.value}
              title={meta.periods.includes(o.value) ? t.filters.year(o.value) : undefined}
              onClick={() => set('time', o.value)}
              disabled={ignore.includes('time')}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <Select label={t.filters.specimen} all={t.filters.all} cls={cls('specimen')} value={filters.specimen} onChange={v => set('specimen', v)}
        options={meta.specimens.map(s => ({ value: s, label: specimenName(s) }))} />
      <Select label={t.filters.setting} all={t.filters.all} cls={cls('setting')} value={filters.setting} onChange={v => set('setting', v)}
        options={Object.entries(t.filters.settings).map(([value, label]) => ({ value, label }))} />
      <Select label={t.filters.ward} all={t.filters.all} cls={cls('ward')} value={filters.ward} onChange={v => set('ward', v)}
        options={meta.wards.map(w => ({ value: w.ward_code, label: `${wardName(w.ward_code)} (${w.ward_code})` }))} />
      <Select label={t.filters.sex} all={t.filters.all} cls={cls('sex')} value={filters.sex} onChange={v => set('sex', v)}
        options={[{ value: 'F', label: t.filters.female }, { value: 'M', label: t.filters.male }]} />
      <Select label={t.filters.age} all={t.filters.all} cls={cls('age_group')} value={filters.age_group} onChange={v => set('age_group', v)}
        options={meta.age_groups.map(a => ({ value: a, label: a }))} />
      {note && <span className="ignored-note">{note}</span>}
    </div>
  )
}

function Select({ label, all, cls, value, onChange, options }: {
  label: string
  all: string
  cls: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className={cls}>
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value={ALL}>{all}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}
