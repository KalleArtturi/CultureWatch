"""Task 3: Treatment Guide - which antibiotic is most likely to work for an infection scenario.

Method (isolate-level combination antibiogram, a simple form of WISCA):
for a scenario, take every first isolate that caused that kind of infection and ask
"would this antibiotic have worked?". Coverage = covered isolates / all isolates in the scenario,
so the organism mix is built in automatically.
- Untested pairs count as NOT covered (in this dataset they are intrinsic resistance or not relevant),
  except two standard EUCAST inference rules (see infer_susceptibility).
- If no single antibiotic reaches the target, two-drug combinations are tried.
- Scenarios with fewer than 30 isolates get no recommendation (same rule as the antibiogram).
"""
from itertools import combinations
import pandas as pd
import cw_utils as cw

# Stewardship tiers - ILLUSTRATIVE, to be reviewed against local guidelines (e.g. Kaypa hoito)
TIERS = {"NIT": 1, "MEC": 1, "TMP": 1, "AMP": 1, "CLI": 1,
         "CXM": 2, "CRO": 2, "CAZ": 2, "CIP": 2, "TZP": 2,
         "MEM": 3, "VAN": 3}
TIER_NAMES = {1: "First choice", 2: "Alternative", 3: "Reserve"}
NOT_TREATMENT = {"FOX"}  # cefoxitin is an MRSA screening test, not a treatment option

SCENARIOS = {
    "Cystitis, woman, community": dict(filters=dict(specimen="urine", setting="community", sex="F"), target=0.80),
    "UTI, man": dict(filters=dict(specimen="urine", sex="M"), target=0.85),
    "UTI, hospital-onset": dict(filters=dict(specimen="urine", setting="hospital_onset"), target=0.85),
    "Bloodstream infection": dict(filters=dict(specimen="blood"), target=0.90),
    "Wound infection": dict(filters=dict(specimen="wound"), target=0.85),
}
##If you love pylance type checks un comment the scenarios under this one and delete upper one so u get it right and add this to imports: from typing import Any
"""
SCENARIOS: dict[str, dict[str, Any]] = {    "Cystitis, woman, community": dict(filters=dict(specimen="urine", setting="community", sex="F"), target=0.80),
    "UTI, man": dict(filters=dict(specimen="urine", sex="M"), target=0.85),
    "UTI, hospital-onset": dict(filters=dict(specimen="urine", setting="hospital_onset"), target=0.85),
    "Bloodstream infection": dict(filters=dict(specimen="blood"), target=0.90),
    "Wound infection": dict(filters=dict(specimen="wound"), target=0.85),
}
"""""

def susceptibility_matrix(df):
    """One row per isolate, one column per antibiotic: 1 = S, 0 = R, NaN = not tested."""
    m = (df.assign(s=(df.result == "S").astype(float))
           .pivot_table(index=["isolate_id", "organism"], columns="antibiotic_code", values="s"))
    return infer_susceptibility(m)


def infer_susceptibility(m):
    """Standard EUCAST expert-rule inferences for pairs the lab doesn't test directly.
    - S. aureus: cefoxitin screen S (not MRSA) -> susceptible to cefuroxime, ceftriaxone,
      piperacillin-tazobactam, meropenem; MRSA -> resistant to them.
    - E. faecalis: ampicillin result applies to piperacillin-tazobactam."""
    m = m.copy()
    org = m.index.get_level_values("organism")
    sa = org == "Staphylococcus aureus"
    if "FOX" in m:
        for ab in ["CXM", "CRO", "TZP", "MEM"]:
            if ab in m:
                m.loc[sa, ab] = m.loc[sa, "FOX"]
    ef = org == "Enterococcus faecalis"
    if {"AMP", "TZP"} <= set(m.columns):
        m.loc[ef, "TZP"] = m.loc[ef, "AMP"]
    return m


def organism_mix(ast, **filters):
    """Which bacteria cause infections in this scenario (share of first isolates)."""
    iso = cw.apply_filters(ast, **filters).drop_duplicates("isolate_id")
    return iso.organism.value_counts(normalize=True).rename("share")


def coverage_table(ast, target=0.85, combos=True, **filters):
    """Expected coverage per antibiotic (and two-drug combos) with 95% CI and stewardship tier."""
    df = cw.apply_filters(ast, **filters)
    if df.empty:  # no isolates match: return an empty table with the right columns instead of crashing
        return pd.DataFrame(columns=["regimen", "n_drugs", "tier", "n_covered", "n_isolates", "coverage",
                                     "ci_low", "ci_high", "tier_name", "meets_target", "reportable"])
    m = susceptibility_matrix(df)
    m = m.drop(columns=[c for c in NOT_TREATMENT if c in m]).fillna(0)
    n = len(m)
    regimens = {(ab,): m[ab] for ab in m.columns}
    if combos:
        regimens |= {(a, b): m[[a, b]].max(axis=1) for a, b in combinations(m.columns, 2)}
    out = pd.DataFrame({
        "regimen": [" + ".join(r) for r in regimens],
        "n_drugs": [len(r) for r in regimens],
        "tier": [max(TIERS.get(ab, 2) for ab in r) for r in regimens],
        "n_covered": [int(v.sum()) for v in regimens.values()],
    })
    out["n_isolates"] = n
    out["coverage"] = out.n_covered / n
    out["ci_low"], out["ci_high"] = cw.wilson_ci(out.n_covered, n)
    out["tier_name"] = out.tier.map(TIER_NAMES)
    out["meets_target"] = out.coverage >= target
    out["reportable"] = n >= cw.MIN_ISOLATES  # 30-isolate rule: same as the antibiogram
    return out.sort_values("coverage", ascending=False).reset_index(drop=True)


def recommend(cov):
    """Prefer one drug over two, then the narrowest tier, then the highest coverage.
    Returns None if the scenario has fewer than MIN_ISOLATES isolates (30-isolate rule)."""
    ok = cov[cov.meets_target & cov.reportable].sort_values(["n_drugs", "tier", "coverage"], ascending=[True, True, False])
    return ok.regimen.iloc[0] if len(ok) else None


if __name__ == "__main__":
    out = cw.OUTPUT_DIR; out.mkdir(parents=True, exist_ok=True)
    ast = cw.load_ast()
    rows = []
    for name, s in SCENARIOS.items():
        cov = coverage_table(ast, target=s["target"], **s["filters"])
        mix = organism_mix(ast, **s["filters"])# pylance does not understand but we know so if you want to be pretty about it fix it look at line 30
        pick = recommend(cov)
        print(f"\n=== {name}  (target {s['target']:.0%}, {cov.n_isolates.iloc[0]:,} isolates)")
        print("Organism mix:", ", ".join(f"{o} {p:.0%}" for o, p in mix.head(4).items()))
        print(cov[cov.n_drugs == 1][["regimen", "coverage", "ci_low", "ci_high", "tier_name"]].round(3).to_string(index=False))
        print("Suggested empirical choice:", pick or "none reaches the target")
        rows.append(cov.assign(scenario=name, recommended=cov.regimen == pick))
    pd.concat(rows).to_csv(out / "treatment_guide.csv", index=False)