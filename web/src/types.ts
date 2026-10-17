// Shapes returned by the Python API (api/main.py). Nullable numbers are hidden by the 30-isolate rule.

export type WindowKey = '4w' | '12m'
export type Phenotype = 'esbl' | 'mrsa' | 'vre' | 'cpe'
export type Setting = 'community' | 'inpatient' | 'hospital_onset'

export interface Ward {
  ward_code: string
  ward_fi: string
  ward_en: string
  ward_type: 'in' | 'out'
  institution: string
}

export interface Antibiotic {
  antibiotic: string
  antibiotic_code: string
  antibiotic_fi: string
  class: string
  reported_for: string
}

export interface Meta {
  wards: Ward[]
  antibiotics: Antibiotic[]
  ab_order: string[]
  urine_only: string[]
  periods: string[]
  organisms: string[]
  specimens: string[]
  age_groups: string[]
  scenarios: { name: string; target: number }[]
  date_min: string
  date_max: string
  windows: Record<WindowKey, [string, string]>
  min_isolates: number
  key_pairs: { organism: string; antibiotic_code: string }[]
  /** week-ending Sundays the time machine can replay */
  replay_weeks: string[]
}

export interface TimelineAlert {
  phenotype: Phenotype
  week_end: string
  ward_code: string
  observed: number
  expected: number
  p_value: number
}

export interface Rate {
  cases: number
  n: number
  pct: number | null
  ci_low: number | null
  ci_high: number | null
}

export interface OverviewResp {
  kpis: { first_isolates: number; esbl: Rate; mrsa: Rate; vre_cases: number; cpe_cases: number }
  organism_mix: { organism: string; n: number }[]
  changes: { organism: string; antibiotic_code: string; pct_prev: number; pct_last: number; change_pp: number }[]
  change_periods: string[]
}

export interface AbCell {
  organism: string
  antibiotic_code: string
  n_tested: number
  n_resistant: number
  intrinsic: boolean
  pct_resistant: number | null
  ci_low: number | null
  ci_high: number | null
  reportable: boolean
  label: string
}

export interface AntibiogramResp {
  antibiotics: string[]
  organisms: string[]
  cells: AbCell[]
}

export interface Regimen {
  regimen: string
  n_drugs: number
  tier: number
  n_covered: number
  n_isolates: number
  coverage: number
  ci_low: number
  ci_high: number
  tier_name: string
  meets_target: boolean
  reportable: boolean
}

export interface TreatmentResp {
  scenario: string
  target: number
  n_isolates: number
  reportable: boolean
  recommended: string | null
  single: Regimen[]
  combos: Regimen[]
  organism_mix: { organism: string; share: number }[]
}

export interface SettingComparison {
  organism: string
  antibiotic_code: string
  n_community: number
  pct_community: number | null
  n_hospital: number
  pct_hospital: number | null
  diff_pp: number | null
  p_value: number | null
  significant: boolean
}

export interface WardProfileRow {
  ward_code: string
  first_isolates: number
  hospital_onset_share: number
  esbl_n: number
  esbl_base: number
  mrsa_n: number
  mrsa_base: number
  vre_n: number
  cpe_n: number
  esbl_pct: number | null
  mrsa_pct: number | null
  esbl_p_above: number | null
  mrsa_p_above: number | null
}

export interface TrendPoint {
  quarter: string
  /** position on the shared quarter axis */
  x?: number
  n_tested: number
  n_resistant: number
  pct_resistant: number
  ci_low: number
  ci_high: number
}

export type ExpiryStatus = 'crossing' | 'crossed' | 'rising' | 'above' | 'improving' | 'stable'

export interface Projection {
  a: number
  b: number
  x_last: number
  pct_now: number
  slope_pp_per_year: number
  p_value: number
  status: ExpiryStatus
  cross_x: number | null
  cross_date: string | null
  months_left: number | null
}

export interface TrendResp {
  points: TrendPoint[]
  z: number
  p_value: number
  direction: 'increasing' | 'decreasing'
  quarters: string[]
  limit: number
  projection: Projection | null
}

export interface ExpiryPair extends Projection {
  organism: string
  antibiotic_code: string
  n_tested: number
  tier: number
}

export interface ExpiryResp {
  limit: number
  quarters: string[]
  as_of: string
  pairs: ExpiryPair[]
}

export interface TrendSummaryRow {
  organism: string
  antibiotic_code: string
  first: number
  last: number
  z: number
  p_value: number
  direction: string
  significant: boolean
}

export interface Alert {
  ward_code: string
  window_end: string
  observed: number
  expected: number
  p_value: number
}

export interface WardStatus extends Alert {
  alert: boolean
}

export interface AlertsResp {
  alerts: Alert[]
  status: WardStatus[]
  weeks: string[]
  counts: Record<string, number[]>
}

export interface WardPhenotypeStatus {
  phenotype: Phenotype
  observed: number
  expected: number
  p_value: number
  alert: boolean
  weekly: number[]
  history: Alert[]
}

export interface WardPair {
  organism: string
  antibiotic_code: string
  n_tested: number
  pct_resistant: number | null
  ci_low: number
  ci_high: number
  reportable: boolean
  n_tested_prev: number | null
  pct_resistant_prev: number | null
  n_tested_all: number | null
  pct_resistant_all: number | null
  change_pp: number | null
  vs_all_pp: number | null
  p_change: number | null
  p_above: number | null
}

export interface RateTests {
  p_change: number | null
  p_above: number | null
}

export interface WardResp {
  ward: { code: string; name_en: string; name_fi: string; ward_type: 'in' | 'out'; institution: string }
  latest: string
  windows: { '4w': [string, string]; '12m': [string, string]; '12m_prev': [string, string] }
  four_weeks: {
    weeks: string[]
    isolates: { observed: number; expected: number; weekly: number[] }
    phenotypes: WardPhenotypeStatus[]
  }
  twelve_months: {
    first_isolates: number
    hospital_onset_share: number | null
    rates: {
      ward: Record<'esbl' | 'mrsa', Rate>
      ward_prev: Record<'esbl' | 'mrsa', Rate>
      all_sites: Record<'esbl' | 'mrsa', Rate>
      tests: Record<'esbl' | 'mrsa', RateTests>
    }
    organism_mix: { organism: string; n: number }[]
    pairs: WardPair[]
  }
}
