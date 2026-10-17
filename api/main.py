"""CultureWatch JSON API for the TypeScript UI (web/).
Thin layer on purpose: every number comes from cw_utils / antibiogram / treatment_guide / hospital_trends,
so the web UI and the Streamlit app always agree.
Run from the CultureWatch folder:  uvicorn api.main:app --reload --port 8000"""
import json
from datetime import date
from functools import lru_cache
from typing import Literal, NamedTuple

import pandas as pd
from fastapi import Depends, FastAPI, HTTPException

import cw_utils as cw
import antibiogram as ab
import treatment_guide as tg
import hospital_trends as ht

app = FastAPI(title="CultureWatch API")

PHENOTYPES = ["esbl", "mrsa", "vre", "cpe"]
PHENOTYPE_BASE = {  # organisms a phenotype % is calculated over (VRE/CPE are reported as case counts)
    "esbl": ["Escherichia coli", "Klebsiella pneumoniae"],
    "mrsa": ["Staphylococcus aureus"],
}
Window = Literal["4w", "12m"]
Setting = Literal["community", "inpatient", "hospital_onset"]


# ---------- Data (loaded once per process) ----------
@lru_cache(maxsize=1)
def data():
    ast = cw.load_ast()
    iso = ht.load_isolates()
    iso["age_group"] = pd.cut(iso.age_years, cw.AGE_BINS, right=False, labels=cw.AGE_LABELS)
    wards = pd.read_csv(cw.RAW_DIR / "wards.csv")
    abx = pd.read_csv(cw.RAW_DIR / "antibiotics.csv")
    return ast, iso, wards, abx


def latest():
    return data()[0].sample_date.max()


# ---------- Time machine: the data as it looked on a given day ----------
class Snap(NamedTuple):
    ast: pd.DataFrame
    iso: pd.DataFrame
    latest: pd.Timestamp


@lru_cache(maxsize=16)
def _snapshot(as_of: str):
    ast, iso, _, _ = data()
    end = pd.Timestamp(as_of)
    # Safe to cut: the first-isolate flag only depends on earlier samples, never later ones.
    return ast[ast.sample_date <= end], iso[iso.sample_date <= end]


def snap(as_of: date | None = None) -> Snap:
    """Shared dependency. With ?as_of=YYYY-MM-DD every endpoint sees only samples up to that day,
    so rolling windows, baselines and alerts are exactly what the app would have shown then."""
    if as_of is None:
        ast, iso, _, _ = data()
        return Snap(ast, iso, latest())
    lo, hi = data()[0].sample_date.min().date(), latest().date()
    if not lo <= as_of <= hi:
        raise HTTPException(422, f"as_of must be between {lo} and {hi}")
    ast, iso = _snapshot(as_of.isoformat())
    return Snap(ast, iso, pd.Timestamp(as_of))


def records(df):
    """DataFrame -> list of dicts with NaN as null and ISO dates."""
    return json.loads(df.to_json(orient="records", date_format="iso"))


def filter_params(period: str | None = None, specimen: str | None = None, setting: Setting | None = None,
                  ward: str | None = None, sex: Literal["F", "M"] | None = None,
                  age_group: str | None = None, window: Window | None = None,
                  s: Snap = Depends(snap)) -> dict:
    """Shared query parameters. `window` is a rolling period (last 4 weeks / 12 months) ending at the
    latest sample; it can be combined with `period` but the UI sends one or the other."""
    f = dict(period=period, specimen=specimen, setting=setting, ward=ward, sex=sex, age_group=age_group)
    if window:
        f["date_from"], f["date_to"] = cw.window_dates(s.latest, window)
    return f


def without(filters, *keys):
    return {**filters, **{k: None for k in keys}}


def phenotype_rate(iso, phenotype):
    """Share of the base organisms carrying the phenotype, with the 30-isolate rule."""
    base = iso[iso.organism.isin(PHENOTYPE_BASE[phenotype])]
    k, n = int(base[phenotype].sum()), len(base)
    lo, hi = cw.wilson_ci(k, n) if n else (None, None)
    ok = n >= cw.MIN_ISOLATES
    return dict(cases=k, n=n, pct=k / n if ok else None,
                ci_low=float(lo) if ok else None, ci_high=float(hi) if ok else None)


# ---------- Endpoints ----------
@app.get("/api/meta")
def meta():
    """Everything the UI needs to build its filter controls and labels."""
    ast, _, wards, abx = data()
    end = latest()
    return dict(
        wards=records(wards),
        antibiotics=records(abx),
        ab_order=ab.AB_ORDER,
        urine_only=sorted(ab.URINE_ONLY),
        periods=sorted(ast.period.unique()),
        organisms=sorted(ast.organism.unique()),
        specimens=sorted(ast.specimen.unique()),
        age_groups=cw.AGE_LABELS,
        scenarios=[dict(name=k, target=v["target"]) for k, v in tg.SCENARIOS.items()],
        date_min=ast.sample_date.min().date().isoformat(),
        date_max=end.date().isoformat(),
        windows={w: [d.date().isoformat() for d in cw.window_dates(end, w)] for w in cw.WINDOWS},
        min_isolates=cw.MIN_ISOLATES,
        key_pairs=[dict(organism=o, antibiotic_code=a) for o, a in ht.KEY_PAIRS],
        # Time machine: week-ending Sundays from the first week with a full 52+4 week alert baseline
        replay_weeks=[d.date().isoformat() for d in pd.date_range(
            ast.sample_date.min() + pd.Timedelta(weeks=56), end, freq="W-SUN")],
    )


@app.get("/api/alert-timeline")
def alert_timeline():
    """Every cluster alert ever raised (all phenotypes, all wards), for the time machine's markers.
    Uses all data on purpose: the timeline is the answer key the replay walks through."""
    iso = data()[1]
    rows = []
    for ph in PHENOTYPES:
        a = ht.detect_clusters(ht.weekly_counts(iso, ph))
        rows += [dict(phenotype=ph, week_end=r.window_end[11:21], ward_code=r.ward_code, observed=int(r.observed),
                      expected=float(r.expected), p_value=float(r.p_value)) for r in a.itertuples()]
    return sorted(rows, key=lambda r: r["week_end"])


@app.get("/api/overview")
def overview(f: dict = Depends(filter_params), s: Snap = Depends(snap)):
    ast, iso = s.ast, s.iso
    f_iso = cw.apply_filters(iso, **f)
    kpis = dict(first_isolates=len(f_iso), esbl=phenotype_rate(f_iso, "esbl"), mrsa=phenotype_rate(f_iso, "mrsa"),
                vre_cases=int(f_iso.vre.sum()), cpe_cases=int(f_iso.cpe.sum()))
    mix = f_iso.organism.value_counts().rename_axis("organism").reset_index(name="n")

    # Biggest changes: same pairs and rules as the Streamlit overview, previous vs latest surveillance year
    by_year = cw.resistance_table(cw.apply_filters(ast, **without(f, "period", "date_from", "date_to")),
                                  by=["period", "organism", "antibiotic_code"])
    years = sorted(by_year.period.unique())
    changes = []
    if len(years) >= 2:
        prev, last = years[-2], years[-1]
        wide = (by_year[by_year.reportable & by_year.period.isin([prev, last])]
                .pivot_table(index=["organism", "antibiotic_code"], columns="period", values="pct_resistant")
                .dropna())
        if {prev, last} <= set(wide.columns) and len(wide):
            wide = wide.rename(columns={prev: "pct_prev", last: "pct_last"})
            wide["change_pp"] = (wide.pct_last - wide.pct_prev) * 100
            top = wide.reindex(wide.change_pp.abs().sort_values(ascending=False).index).head(8)
            changes = records(top.reset_index())
    return dict(kpis=kpis, organism_mix=records(mix), changes=changes,
                change_periods=years[-2:] if len(years) >= 2 else [])


@app.get("/api/antibiogram")
def antibiogram(f: dict = Depends(filter_params), s: Snap = Depends(snap)):
    ast = s.ast
    t = cw.resistance_table(cw.apply_filters(ast, **f))
    t["pct_resistant"] = t.pct_resistant.where(t.reportable)
    t[["ci_low", "ci_high"]] = t[["ci_low", "ci_high"]].where(t.reportable, axis=0)
    cols = [a for a in ab.AB_ORDER if a in set(t.antibiotic_code)]
    orgs = t.groupby("organism").n_tested.max().sort_values(ascending=False).index.tolist()
    return dict(antibiotics=cols, organisms=orgs, cells=records(t))


@app.get("/api/treatment")
def treatment(scenario: str, target: float | None = None, f: dict = Depends(filter_params),
              s: Snap = Depends(snap)):
    """Coverage per regimen for a preset scenario, or scenario='custom' to use the shared filters."""
    ast = s.ast
    preset = tg.SCENARIOS.get(scenario)
    if preset is None and scenario != "custom":
        raise HTTPException(404, f"Unknown scenario {scenario!r}")
    target = target if target is not None else (preset["target"] if preset else 0.85)
    s_filters = preset["filters"] if preset else f
    cov = tg.coverage_table(ast, target=target, **s_filters)
    n = int(cov.n_isolates.iloc[0]) if len(cov) else 0
    mix = tg.organism_mix(ast, **s_filters).rename_axis("organism").reset_index()
    pick = tg.recommend(cov) if n >= cw.MIN_ISOLATES else None
    return dict(scenario=scenario, target=target, n_isolates=n, reportable=n >= cw.MIN_ISOLATES,
                recommended=pick, single=records(cov[cov.n_drugs == 1]),
                combos=records(cov[cov.n_drugs == 2].head(10)), organism_mix=records(mix))


@app.get("/api/hospital-vs-community")
def hospital_vs_community(f: dict = Depends(filter_params), s: Snap = Depends(snap)):
    return records(ht.compare_settings(s.ast, **without(f, "setting")))


@app.get("/api/ward-profile")
def ward_profile(f: dict = Depends(filter_params), s: Snap = Depends(snap)):
    iso = s.iso
    wp = ht.ward_profile(cw.apply_filters(iso, **without(f, "ward", "setting")))
    return records(wp.reset_index())


@app.get("/api/trend")
def trend(organism: str, antibiotic: str, f: dict = Depends(filter_params), s: Snap = Depends(snap)):
    """Quarterly resistance for one pair. Time filters are ignored: this view shows all time."""
    t = ht.trend_table(s.ast, organism, antibiotic, **without(f, "period", "date_from", "date_to"))
    return dict(points=records(t), z=float(t.attrs["z"]), p_value=float(t.attrs["p_value"]),
                direction=t.attrs["direction"])


@app.get("/api/trend-summary")
def trend_summary(f: dict = Depends(filter_params), s: Snap = Depends(snap)):
    return records(ht.trend_summary(s.ast, **without(f, "period", "date_from", "date_to")))


@app.get("/api/alerts")
def alerts(phenotype: Literal["esbl", "mrsa", "vre", "cpe"] = "mrsa", specimen: str | None = None,
           s: Snap = Depends(snap)):
    """Cluster alerts over all wards and dates (only the specimen filter applies), plus weekly counts."""
    iso = s.iso
    counts = ht.weekly_counts(cw.apply_filters(iso, specimen=specimen), phenotype)
    return dict(alerts=records(ht.detect_clusters(counts)),
                status=records(ht.current_status(counts)),
                weeks=[str(w) for w in counts.columns],
                counts={w: [int(x) for x in row] for w, row in counts.iterrows()})


@app.get("/api/ward/{code}")
def ward_view(code: str, specimen: str | None = None, s: Snap = Depends(snap)):
    """Own-ward page: last 4 weeks vs the ward's normal, rolling 12 months vs the year before and vs all sites."""
    ast, iso, wards = s.ast, s.iso, data()[2]
    if code not in set(wards.ward_code):
        raise HTTPException(404, f"Unknown ward {code!r}")
    end = s.latest
    w12, prev12 = cw.window_dates(end, "12m"), cw.window_dates(end, "12m", offset=1)
    w4 = cw.window_dates(end, "4w")

    # --- Last 4 weeks: new cases per phenotype vs this ward's previous 52 weeks (same test as alerts)
    s_iso = cw.apply_filters(iso, specimen=specimen)
    four_weeks = []
    for ph in PHENOTYPES:
        counts = ht.weekly_counts(s_iso, ph)
        st = ht.current_status(counts).set_index("ward_code").loc[code]
        four_weeks.append(dict(phenotype=ph, observed=int(st.observed), expected=float(st.expected),
                               p_value=float(st.p_value), alert=bool(st.alert),
                               weekly=[int(x) for x in counts.loc[code].values[-26:]],
                               history=records(ht.detect_clusters(counts).query("ward_code == @code"))))
    all_counts = s_iso.assign(flag=1).pipe(ht.weekly_counts, "flag")
    st = ht.current_status(all_counts).set_index("ward_code").loc[code]
    isolates_4w = dict(observed=int(st.observed), expected=float(st.expected),
                       weekly=[int(x) for x in all_counts.loc[code].values[-26:]])
    weeks = [str(w) for w in all_counts.columns[-26:]]

    # --- Rolling 12 months: phenotype rates and ward antibiogram, vs previous 12 months and vs all sites
    def rates(df):
        return {ph: phenotype_rate(df, ph) for ph in PHENOTYPE_BASE}

    ward_12 = cw.apply_filters(s_iso, ward=code, date_from=w12[0], date_to=w12[1])
    rates_12 = dict(ward=rates(ward_12),
                    ward_prev=rates(cw.apply_filters(s_iso, ward=code, date_from=prev12[0], date_to=prev12[1])),
                    all_sites=rates(cw.apply_filters(s_iso, date_from=w12[0], date_to=w12[1])))
    # Annual anomaly tests (only where both sides pass the 30-isolate rule):
    # p_change = ward vs its previous 12 months, p_above = ward above the all-sites rate
    tests = {}
    for ph in PHENOTYPE_BASE:
        c, p, a = rates_12["ward"][ph], rates_12["ward_prev"][ph], rates_12["all_sites"][ph]
        tests[ph] = dict(
            p_change=ht.rate_change_p(c["cases"], c["n"], p["cases"], p["n"]) if c["pct"] is not None and p["pct"] is not None else None,
            p_above=ht.above_rate_p(c["cases"], c["n"], a["cases"] / a["n"]) if c["pct"] is not None and a["pct"] is not None else None)
    rates_12["tests"] = tests

    def rt(**kw):
        return cw.resistance_table(cw.apply_filters(ast, specimen=specimen, **kw)).set_index(
            ["organism", "antibiotic_code"])

    cur, prev = rt(ward=code, date_from=w12[0], date_to=w12[1]), rt(ward=code, date_from=prev12[0], date_to=prev12[1])
    all_sites = rt(date_from=w12[0], date_to=w12[1])
    cols = ["n_tested", "n_resistant", "pct_resistant", "reportable"]
    pairs = cur[~cur.intrinsic][cols + ["ci_low", "ci_high"]].join(
        prev[cols].add_suffix("_prev")).join(all_sites[cols].add_suffix("_all"))
    for col in ["", "_prev", "_all"]:
        pairs[f"pct_resistant{col}"] = pairs[f"pct_resistant{col}"].where(pairs[f"reportable{col}"] == True)
    pairs["change_pp"] = (pairs.pct_resistant - pairs.pct_resistant_prev) * 100
    pairs["vs_all_pp"] = (pairs.pct_resistant - pairs.pct_resistant_all) * 100
    pairs["p_change"] = [ht.rate_change_p(r.n_resistant, r.n_tested, r.n_resistant_prev, r.n_tested_prev)
                         if pd.notna(r.change_pp) else None for r in pairs.itertuples()]
    pairs["p_above"] = [ht.above_rate_p(r.n_resistant, r.n_tested, r.pct_resistant_all)
                        if pd.notna(r.vs_all_pp) else None for r in pairs.itertuples()]
    pairs = pairs.sort_values("n_tested", ascending=False).reset_index()

    info = wards.set_index("ward_code").loc[code]
    return dict(
        ward=dict(code=code, name_en=info.ward_en, name_fi=info.ward_fi, ward_type=info.ward_type,
                  institution=info.institution),
        latest=end.date().isoformat(),
        windows={"4w": [d.date().isoformat() for d in w4], "12m": [d.date().isoformat() for d in w12],
                 "12m_prev": [d.date().isoformat() for d in prev12]},
        four_weeks=dict(weeks=weeks, isolates=isolates_4w, phenotypes=four_weeks),
        twelve_months=dict(first_isolates=len(ward_12),
                           hospital_onset_share=float(ward_12.hospital_onset.mean()) if len(ward_12) else None,
                           rates=rates_12,
                           organism_mix=records(ward_12.organism.value_counts().rename_axis("organism")
                                                .reset_index(name="n")),
                           pairs=records(pairs)),
    )
