"""Task 4: Hospital & Trends - hospital vs community, ward hotspots, trends over time, cluster alerts."""
from pathlib import Path
import numpy as np
import pandas as pd
from scipy import stats
import cw_utils as cw

KEY_PAIRS = [  # clinically important organism-antibiotic pairs to monitor
    ("Escherichia coli", "CIP"), ("Escherichia coli", "CRO"), ("Escherichia coli", "TMP"),
    ("Escherichia coli", "MEC"), ("Klebsiella pneumoniae", "CRO"), ("Klebsiella pneumoniae", "CIP"),
    ("Klebsiella pneumoniae", "TZP"), ("Pseudomonas aeruginosa", "TZP"),
    ("Pseudomonas aeruginosa", "MEM"), ("Staphylococcus aureus", "FOX"),
]


def load_isolates(path=cw.PROCESSED / "isolates_joined.csv"):
    """First isolates with phenotype flags (ESBL/MRSA/VRE/CPE)."""
    iso = pd.read_csv(path, parse_dates=["sample_date"])
    return iso[iso.first_isolate].copy()


# ---------- 1. Hospital-onset vs community ----------
def compare_settings(ast, pairs=KEY_PAIRS, **filters):
    """Resistance in community (outpatients) vs hospital-onset (day 3+), with a significance test."""
    rows = []
    for org, ab in pairs:
        d = cw.apply_filters(ast, **filters)
        d = d[(d.organism == org) & (d.antibiotic_code == ab)]
        com, hosp = d[d.ward_type == "out"].resistant, d[d.hospital_onset == True].resistant
        if len(com) == 0 or len(hosp) == 0:
            continue
        table = [[com.sum(), len(com) - com.sum()], [hosp.sum(), len(hosp) - hosp.sum()]]
        p = stats.fisher_exact(table)[1]
        rows.append(dict(organism=org, antibiotic_code=ab,
                         n_community=len(com), pct_community=com.mean(),
                         n_hospital=len(hosp), pct_hospital=hosp.mean(),
                         diff_pp=(hosp.mean() - com.mean()) * 100, p_value=p))
    out = pd.DataFrame(rows, columns=["organism", "antibiotic_code", "n_community", "pct_community",
                                      "n_hospital", "pct_hospital", "diff_pp", "p_value"])
    # 30-isolate rule: hide % and test result when either group is too small
    small = (out.n_community < cw.MIN_ISOLATES) | (out.n_hospital < cw.MIN_ISOLATES)
    out.loc[small, ["pct_community", "pct_hospital", "diff_pp", "p_value"]] = np.nan
    out["significant"] = out.p_value < 0.05
    return out


# ---------- 2. Ward hotspots ----------
def ward_profile(iso):
    """Per ward: first isolates, hospital-onset share, ESBL %, MRSA %, VRE and CPE counts."""
    esbl_base = iso.organism.isin(["Escherichia coli", "Klebsiella pneumoniae"])
    mrsa_base = iso.organism == "Staphylococcus aureus"
    g = iso.groupby("ward_code")
    out = pd.DataFrame({
        "first_isolates": g.size(),
        "hospital_onset_share": g.hospital_onset.mean(),
        "esbl_n": iso[esbl_base].groupby("ward_code").esbl.sum(),
        "esbl_base": iso[esbl_base].groupby("ward_code").size(),
        "mrsa_n": iso[mrsa_base].groupby("ward_code").mrsa.sum(),
        "mrsa_base": iso[mrsa_base].groupby("ward_code").size(),
        "vre_n": g.vre.sum(), "cpe_n": g.cpe.sum(),
    }).fillna(0)
    out["esbl_pct"] = out.esbl_n / out.esbl_base
    out["mrsa_pct"] = out.mrsa_n / out.mrsa_base
    for ph in ["esbl", "mrsa"]:  # flag wards clearly above the hospital-wide rate
        overall = out[f"{ph}_n"].sum() / out[f"{ph}_base"].sum()
        out[f"{ph}_p_above"] = [stats.binomtest(int(k), int(n), overall, alternative="greater").pvalue if n else np.nan
                                for k, n in zip(out[f"{ph}_n"], out[f"{ph}_base"])]
        # 30-isolate rule: no % or test for wards with too few isolates in the base group
        small = out[f"{ph}_base"] < cw.MIN_ISOLATES
        out.loc[small, [f"{ph}_pct", f"{ph}_p_above"]] = np.nan
    return out.sort_values("esbl_pct", ascending=False)


# ---------- 3. Trends over time ----------
def add_quarter(df):
    return df.assign(quarter=df.sample_date.dt.to_period("Q").astype(str))


def trend_table(ast, organism, antibiotic, time_col="quarter", **filters):
    """Resistance per time step with CI, plus a Cochran-Armitage test for a linear trend."""
    d = add_quarter(cw.apply_filters(ast, **filters))
    d = d[(d.organism == organism) & (d.antibiotic_code == antibiotic)]
    t = cw.resistance_table(d, by=[time_col], min_n=1).sort_values(time_col)
    z, p = cochran_armitage(t.n_resistant.values, t.n_tested.values)
    t.attrs.update(organism=organism, antibiotic=antibiotic, z=z, p_value=p,
                   direction="increasing" if z > 0 else "decreasing")
    return t


def cochran_armitage(r, n):
    """Test whether a proportion changes linearly over ordered time steps (two-sided)."""
    r, n = np.asarray(r, float), np.asarray(n, float)
    if len(r) < 2 or n.sum() == 0:
        return 0.0, 1.0
    x = np.arange(len(r))
    p_bar = r.sum() / n.sum()
    t_stat = np.sum(x * (r - n * p_bar))
    var = p_bar * (1 - p_bar) * (np.sum(n * x**2) - np.sum(n * x) ** 2 / n.sum())
    z = t_stat / np.sqrt(var) if var > 0 else 0.0
    return z, 2 * stats.norm.sf(abs(z))


def trend_summary(ast, pairs=KEY_PAIRS, **filters):
    rows = []
    for org, ab in pairs:
        t = trend_table(ast, org, ab, **filters)
        if len(t) < 2:
            continue  # not enough data over time for this pair with these filters
        rows.append(dict(organism=org, antibiotic_code=ab, first=t.pct_resistant.iloc[0],
                         last=t.pct_resistant.iloc[-1], z=t.attrs["z"], p_value=t.attrs["p_value"],
                         direction=t.attrs["direction"]))
    out = pd.DataFrame(rows, columns=["organism", "antibiotic_code", "first", "last", "z", "p_value", "direction"])
    out["significant"] = out.p_value < 0.05
    return out


# ---------- 4. Cluster alerts ----------
def weekly_counts(iso, phenotype):
    """New cases per ward per ISO week (first isolates with the phenotype flag)."""
    d = iso[iso[phenotype] == 1]
    weeks = pd.period_range(iso.sample_date.min(), iso.sample_date.max(), freq="W-SUN")
    d = d.assign(week=d.sample_date.dt.to_period("W-SUN"))
    counts = d.groupby(["ward_code", "week"]).size().unstack(fill_value=0)
    return counts.reindex(index=sorted(iso.ward_code.unique()), columns=weeks, fill_value=0)


def detect_clusters(counts, window=4, baseline=52, min_cases=3, alpha=0.01):
    """Flag ward-weeks where cases in the last `window` weeks exceed what the ward's previous
    `baseline` weeks predict (Poisson upper-tail test). Simple and explainable on purpose."""
    alerts = []
    for ward, s in counts.iterrows():
        v = s.values
        for t in range(baseline + window, len(v) + 1):
            observed = v[t - window:t].sum()
            expected = v[t - window - baseline:t - window].mean() * window
            p = stats.poisson.sf(observed - 1, max(expected, 0.1))  # P(X >= observed)
            if observed >= min_cases and p < alpha:
                alerts.append(dict(ward_code=ward, week_index=t, window_end=str(s.index[t - 1]),
                                   observed=int(observed), expected=round(expected, 2), p_value=p))
    out = pd.DataFrame(alerts, columns=["ward_code", "week_index", "window_end", "observed", "expected", "p_value"])
    # keep only the first week of each run of consecutive alerts on the same ward
    is_new_run = out.groupby("ward_code").week_index.diff().ne(1)
    return out[is_new_run].drop(columns="week_index").reset_index(drop=True)


def plant_outbreak(iso, ward, phenotype, organism, start, weeks=3, cases=6, seed=0):
    """TEST ONLY: add fake cases to check that detect_clusters catches a known outbreak."""
    rng = np.random.default_rng(seed)
    days = pd.Timestamp(start) + pd.to_timedelta(rng.integers(0, weeks * 7, cases), unit="D")
    template = iso[(iso.ward_code == ward) & (iso.organism == organism)].iloc[0]
    fake = pd.DataFrame([template] * cases).assign(sample_date=days.values, **{phenotype: 1})
    fake["isolate_id"] = [f"FAKE-{i}" for i in range(cases)]
    return pd.concat([iso, fake], ignore_index=True)


if __name__ == "__main__":
    out = cw.OUTPUT_DIR; out.mkdir(parents=True, exist_ok=True)
    ast, iso = cw.load_ast(), load_isolates()
    pd.set_option("display.width", 160)

    print("=== 1. Hospital-onset vs community (urine)")
    s = compare_settings(ast, specimen="urine"); s.to_csv(out / "hospital_vs_community.csv", index=False)
    print(s.round(3).to_string(index=False))

    print("\n=== 2. Ward profile")
    w = ward_profile(iso); w.to_csv(out / "ward_profile.csv")
    print(w[["first_isolates", "hospital_onset_share", "esbl_pct", "esbl_p_above",
             "mrsa_pct", "mrsa_p_above", "vre_n", "cpe_n"]].round(3).to_string())

    print("\n=== 3. Trends (quarterly, all specimens)")
    t = trend_summary(ast); t.to_csv(out / "trends.csv", index=False)
    print(t.round(3).to_string(index=False))

    print("\n=== 4. Cluster alerts (real data)")
    for ph in ["esbl", "mrsa"]:
        a = detect_clusters(weekly_counts(iso, ph)); a.to_csv(out / f"alerts_{ph}.csv", index=False)
        print(ph.upper(), "alerts:", len(a)); print(a.to_string(index=False) if len(a) else "  none")

    print("\n=== 4b. Detector test with a planted MRSA outbreak (Surgery, 6 cases in 3 weeks)")
    test = plant_outbreak(iso, "SURG", "mrsa", "Staphylococcus aureus", "2025-03-03")
    a = detect_clusters(weekly_counts(test, "mrsa"))
    print(a.to_string(index=False) if len(a) else "  not detected")