import { dateRange } from '../format'
import { useMeta } from '../state'

export function MethodsView() {
  const { meta } = useMeta()
  return (
    <div className="card methods">
      <h1 style={{ marginBottom: 12 }}>Methods</h1>
      <ul>
        <li><strong>Data:</strong> fully synthetic microbiology dataset, 10,000 patients, 46,792 cultures, {dateRange([meta.date_min, meta.date_max])}.</li>
        <li><strong>First isolate rule:</strong> first isolate per patient, organism, specimen type and 12-month surveillance year (Oct–Sep).</li>
        <li><strong>Rolling windows:</strong> "Last 4 weeks" and "Last 12 months" end at the latest sample date ({meta.date_max}). The first-isolate
          rule still uses surveillance years, so a 12-month window that spans two years can count a patient's organism twice.</li>
        <li><strong>Minimum {meta.min_isolates}:</strong> a % is shown only with at least {meta.min_isolates} isolates; otherwise "n&lt;{meta.min_isolates}".</li>
        <li><strong>Intrinsic resistance (IR):</strong> Klebsiella and Citrobacter – ampicillin; Proteus mirabilis – nitrofurantoin. Not shown as a %.</li>
        <li><strong>Hospital-onset:</strong> sample taken on day 3 or later of the hospital stay. <strong>Community:</strong> outpatients (health centres, emergency department).</li>
        <li><strong>Confidence intervals:</strong> 95% Wilson intervals.</li>
        <li><strong>Treatment guide:</strong> isolate-level combination antibiogram (simplified WISCA). Untested pairs count as not covered, except EUCAST
          inferences (S. aureus beta-lactams from the cefoxitin screen; E. faecalis piperacillin-tazobactam from ampicillin).</li>
        <li><strong>Trends:</strong> Cochran–Armitage test for a linear trend over quarters.</li>
        <li><strong>Cluster alerts:</strong> each ward's cases in the last 4 weeks vs the mean of its previous 52 weeks (Poisson test). An alert needs
          at least 3 cases and p &lt; 0.01. "Usual" on the ward page is that 52-week mean scaled to 4 weeks.</li>
        <li><strong>Ward hotspots:</strong> one-sided binomial test of each ward's ESBL / MRSA rate against the overall rate.</li>
        <li><strong>Colours:</strong> green &lt;10%, amber 10–20%, red &gt;20% resistant. Every colour is paired with a number or label.</li>
      </ul>
      <p className="secondary" style={{ marginTop: 12 }}>
        All data is synthetic. Results illustrate how the tool works, not the situation in any real hospital.
        The tool supports guideline-writing and infection control; it does not prescribe for individual patients.
      </p>
    </div>
  )
}
