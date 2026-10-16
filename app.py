"""CultureWatch - antimicrobial resistance surveillance dashboard (Task 5).
Run from the CultureWatch folder:  streamlit run app.py"""
import matplotlib.pyplot as plt
import pandas as pd
import streamlit as st

import cw_utils as cw
import antibiogram as ab
import treatment_guide as tg
import hospital_trends as ht

st.set_page_config(page_title="CultureWatch", page_icon="🧫", layout="wide")


# ---------- Data (cached so it loads once) ----------
@st.cache_data
def load_data():
    ast = cw.load_ast()
    iso = ht.load_isolates()
    iso["age_group"] = pd.cut(iso.age_years, cw.AGE_BINS, right=False, labels=cw.AGE_LABELS)
    names = ast.drop_duplicates("antibiotic_code").set_index("antibiotic_code").antibiotic.to_dict()
    return ast, iso, names


ast, iso, AB_NAMES = load_data()


def ab_label(code):
    return f"{code} – {AB_NAMES.get(code, code)}"


# ---------- Sidebar: shared filters ----------
st.sidebar.title("🧫 CultureWatch")
st.sidebar.caption("Filters apply to every view unless a view says otherwise.")

ALL = "All"
period = st.sidebar.selectbox("Period", [ALL] + sorted(ast.period.unique()))
specimen = st.sidebar.selectbox("Specimen", [ALL, "urine", "blood", "wound"])
setting_label = st.sidebar.selectbox("Setting", [ALL, "Community (outpatients)", "Inpatients", "Hospital-onset (day 3+)"])
ward = st.sidebar.selectbox("Ward", [ALL] + sorted(ast.ward_code.unique()))
sex = st.sidebar.selectbox("Sex", [ALL, "F", "M"])
age_group = st.sidebar.selectbox("Age group", [ALL] + cw.AGE_LABELS)

SETTINGS = {"Community (outpatients)": "community", "Inpatients": "inpatient", "Hospital-onset (day 3+)": "hospital_onset"}
filters = {k: (None if v == ALL else v) for k, v in dict(
    period=period, specimen=specimen, ward=ward, sex=sex, age_group=age_group).items()}
filters["setting"] = SETTINGS.get(setting_label)
active = {k: v for k, v in filters.items() if v is not None}

st.sidebar.divider()
st.sidebar.caption(f"First isolates only · minimum {cw.MIN_ISOLATES} isolates per reported %")
st.sidebar.warning("Synthetic data: invented patients, not a real hospital.", icon="⚠️")

f_ast = cw.apply_filters(ast, **filters)
f_iso = cw.apply_filters(iso, **filters)

st.title("CultureWatch")
st.caption("Antimicrobial resistance surveillance · " +
           (" · ".join(f"{k}: {v}" for k, v in active.items()) if active else "all data"))

if f_iso.empty:
    st.error("No isolates match these filters. Try widening them.")
    st.stop()

tabs = st.tabs(["Overview", "Antibiogram", "Treatment Guide", "Hospital & Wards", "Trends & Alerts", "Methods"])

# ---------- 1. Overview ----------
with tabs[0]:
    esbl_base = f_iso[f_iso.organism.isin(["Escherichia coli", "Klebsiella pneumoniae"])]
    mrsa_base = f_iso[f_iso.organism == "Staphylococcus aureus"]
    c = st.columns(5)
    c[0].metric("First isolates", f"{len(f_iso):,}")
    c[1].metric("ESBL (E. coli + K. pneumoniae)", f"{esbl_base.esbl.mean():.1%}" if len(esbl_base) >= cw.MIN_ISOLATES else "n<30")
    c[2].metric("MRSA (S. aureus)", f"{mrsa_base.mrsa.mean():.1%}" if len(mrsa_base) >= cw.MIN_ISOLATES else "n<30")
    c[3].metric("VRE cases", int(f_iso.vre.sum()))
    c[4].metric("CPE cases", int(f_iso.cpe.sum()))

    left, right = st.columns(2)
    with left:
        st.subheader("Organism mix")
        st.bar_chart(f_iso.organism.value_counts(), horizontal=True)
    with right:
        st.subheader("Biggest changes vs previous year")
        by_year = cw.resistance_table(cw.apply_filters(ast, **{**filters, "period": None}),
                                      by=["period", "organism", "antibiotic_code"])
        years = sorted(by_year.period.unique())
        if len(years) >= 2:
            last, prev = years[-1], years[-2]
            wide = (by_year[by_year.reportable & by_year.period.isin([prev, last])]
                    .pivot_table(index=["organism", "antibiotic_code"], columns="period", values="pct_resistant")
                    .dropna())
            wide["change (pp)"] = (wide[last] - wide[prev]) * 100
            top = wide.reindex(wide["change (pp)"].abs().sort_values(ascending=False).index).head(5)
            st.dataframe(top.style.format({prev: "{:.1%}", last: "{:.1%}", "change (pp)": "{:+.1f}"}),
                         width="stretch")
            st.caption(f"{prev} → {last}. Period filter is ignored here.")
        else:
            st.info("Need at least two periods to compare.")

# ---------- 2. Antibiogram ----------
with tabs[1]:
    st.subheader("Antibiogram: % resistant per organism and antibiotic")
    labels, pct, n = ab.build_antibiogram(ast, **filters)
    st.pyplot(ab.plot_antibiogram(labels, pct, n, title="Antibiogram"), width="stretch")
    with st.expander("Table and download"):
        st.dataframe(labels, width="stretch")
        st.download_button("Download CSV", labels.to_csv().encode(), "antibiogram.csv", "text/csv")

# ---------- 3. Treatment Guide ----------
with tabs[2]:
    st.subheader("Which antibiotic is most likely to work?")
    st.caption("Uses its own scenario selector. 'Custom' uses the sidebar filters.")
    col1, col2 = st.columns([2, 1])
    scenario = col1.selectbox("Scenario", list(tg.SCENARIOS) + ["Custom (sidebar filters)"])
    preset = tg.SCENARIOS.get(scenario)
    target = col2.slider("Coverage target", 0.5, 0.99, preset["target"] if preset else 0.85, 0.01, format="%.2f")
    s_filters = preset["filters"] if preset else filters

    cov = tg.coverage_table(ast, target=target, **s_filters)
    pick = tg.recommend(cov)
    mix = tg.organism_mix(ast, **s_filters)

    if pick:
        row = cov[cov.regimen == pick].iloc[0]
        st.success(f"**Suggested empirical choice: {' + '.join(ab_label(x) for x in pick.split(' + '))}** — "
                   f"covers {row.coverage:.0%} (95% CI {row.ci_low:.0%}–{row.ci_high:.0%}) · {row.tier_name}")
    else:
        st.warning("No single antibiotic or two-drug combination reaches the target.")

    left, right = st.columns([3, 2])
    with left:
        single = cov[cov.n_drugs == 1].sort_values("coverage")
        colors = single.tier.map({1: "#4CAF50", 2: "#FFB300", 3: "#E53935"})
        fig, axis = plt.subplots(figsize=(7, 0.4 * len(single) + 1))
        axis.barh([ab_label(r) for r in single.regimen], single.coverage, color=colors)
        axis.errorbar(single.coverage, range(len(single)),
                      xerr=[single.coverage - single.ci_low, single.ci_high - single.coverage],
                      fmt="none", ecolor="black", capsize=2, lw=0.8)
        axis.axvline(target, ls="--", color="grey")
        axis.set_xlim(0, 1); axis.set_xlabel("Expected coverage")
        axis.set_title("Green = first choice · Amber = alternative · Red = reserve", fontsize=9)
        st.pyplot(fig, width="stretch")
    with right:
        st.markdown(f"**Bacteria causing these infections** ({cov.n_isolates.iloc[0]:,} isolates)")
        st.dataframe(mix.to_frame().style.format("{:.0%}"), width="stretch")
        with st.expander("Two-drug combinations"):
            combos = cov[cov.n_drugs == 2].head(10)[["regimen", "coverage", "tier_name"]]
            st.dataframe(combos.style.format({"coverage": "{:.0%}"}), width="stretch", hide_index=True)
    st.info("Coverage for a patient group, not a prescription. Choice depends on the patient, severity "
            "and local guidelines; adjust when the culture result arrives. Stewardship tiers are illustrative.")

# ---------- 4. Hospital & Wards ----------
with tabs[3]:
    st.subheader("Hospital-onset vs community")
    st.caption("Setting filter is ignored here, since this view compares settings.")
    comp = ht.compare_settings(ast, **{**filters, "setting": None})
    if comp.empty:
        st.info("Not enough data for this comparison with the current filters.")
    else:
        st.dataframe(comp.assign(antibiotic=comp.antibiotic_code.map(ab_label))
                     [["organism", "antibiotic", "n_community", "pct_community", "n_hospital",
                       "pct_hospital", "diff_pp", "p_value", "significant"]]
                     .style.format({"pct_community": "{:.1%}", "pct_hospital": "{:.1%}",
                                    "diff_pp": "{:+.1f}", "p_value": "{:.3f}"}),
                     width="stretch", hide_index=True)

    st.subheader("Ward profile")
    st.caption("Ward and setting filters are ignored here, so all wards can be compared.")
    wp = ht.ward_profile(cw.apply_filters(iso, **{**filters, "ward": None, "setting": None}))
    st.dataframe(wp[["first_isolates", "hospital_onset_share", "esbl_pct", "esbl_p_above",
                     "mrsa_pct", "mrsa_p_above", "vre_n", "cpe_n"]]
                 .style.format({"hospital_onset_share": "{:.0%}", "esbl_pct": "{:.1%}", "mrsa_pct": "{:.1%}",
                                "esbl_p_above": "{:.3f}", "mrsa_p_above": "{:.3f}"})
                 .highlight_between(subset=["esbl_p_above", "mrsa_p_above"], right=0.05, color="#FFC7CE"),
                 width="stretch")
    st.caption("Red p-values: ward rate significantly above the overall rate (p < 0.05).")

# ---------- 5. Trends & Alerts ----------
with tabs[4]:
    st.subheader("Resistance over time")
    st.caption("Period filter is ignored here, since this view shows all periods.")
    t_filters = {**filters, "period": None}
    c1, c2 = st.columns(2)
    org = c1.selectbox("Organism", sorted(ast.organism.unique()),
                       index=sorted(ast.organism.unique()).index("Escherichia coli"))
    abs_for_org = sorted(ast[(ast.organism == org) & ~ast.intrinsic].antibiotic_code.unique())
    abx = c2.selectbox("Antibiotic", abs_for_org, format_func=ab_label,
                       index=abs_for_org.index("TMP") if "TMP" in abs_for_org else 0)
    tt = ht.trend_table(ast, org, abx, **t_filters)
    if len(tt) >= 2:
        fig, axis = plt.subplots(figsize=(9, 3.5))
        axis.plot(tt.quarter, tt.pct_resistant, marker="o")
        axis.fill_between(tt.quarter, tt.ci_low, tt.ci_high, alpha=0.2)
        axis.axhline(0.20, ls="--", color="red", lw=0.8)
        axis.set_ylabel("% resistant"); axis.yaxis.set_major_formatter(lambda v, _: f"{v:.0%}")
        axis.tick_params(axis="x", rotation=45)
        st.pyplot(fig, width="stretch")
        verdict = "significant" if tt.attrs["p_value"] < 0.05 else "not significant"
        st.write(f"Trend: **{tt.attrs['direction']}**, {verdict} (p = {tt.attrs['p_value']:.3f}). "
                 "Dashed line = 20%, a common limit for empirical use.")
    else:
        st.info("Not enough data over time for this selection.")

    with st.expander("Trend summary for key pairs"):
        st.dataframe(ht.trend_summary(ast, **t_filters).style.format(
            {"first": "{:.1%}", "last": "{:.1%}", "z": "{:.2f}", "p_value": "{:.3f}"}),
            width="stretch", hide_index=True)

    st.subheader("Cluster alerts")
    st.caption("Uses all wards and dates; sidebar filters other than specimen are ignored.")
    phen = st.radio("Phenotype", ["mrsa", "esbl"], horizontal=True, format_func=str.upper)
    a_iso = cw.apply_filters(iso, specimen=filters["specimen"])
    counts = ht.weekly_counts(a_iso, phen)
    alerts = ht.detect_clusters(counts)
    if alerts.empty:
        st.success("No alerts.")
    else:
        st.dataframe(alerts.style.format({"p_value": "{:.4f}"}), width="stretch", hide_index=True)
        w = st.selectbox("Show weekly cases for ward", alerts.ward_code.unique())
        st.bar_chart(counts.loc[w].set_axis(counts.columns.astype(str)))
    st.caption("An alert means 'look into this', not a confirmed outbreak; some alerts are expected by chance.")

# ---------- 6. Methods ----------
with tabs[5]:
    st.markdown(f"""
### Methods
- **Data:** fully synthetic microbiology dataset, 10,000 patients, 46,792 cultures, Oct 2023 – Sep 2026.
- **First isolate rule:** first isolate per patient, organism, specimen type and 12-month period (Oct–Sep).
- **Minimum:** a % is shown only with at least {cw.MIN_ISOLATES} isolates; otherwise "n<30".
- **Intrinsic resistance (IR):** Klebsiella and Citrobacter – ampicillin; Proteus mirabilis – nitrofurantoin.
- **Hospital-onset:** sample taken on day 3 or later of the hospital stay.
- **Confidence intervals:** 95% Wilson intervals.
- **Treatment guide:** isolate-level combination antibiogram (simplified WISCA). Untested pairs count as not covered,
  except EUCAST inferences (S. aureus beta-lactams from cefoxitin screen; E. faecalis piperacillin-tazobactam from ampicillin).
- **Trends:** Cochran–Armitage test for a linear trend over quarters.
- **Alerts:** cases in the last 4 weeks vs the ward's previous 52 weeks (Poisson test, p < 0.01, at least 3 cases).
- **Colours:** green <10%, amber 10–20%, red >20% resistant.

⚠️ All data is synthetic. Results illustrate how the tool works, not the situation in any real hospital.
""")