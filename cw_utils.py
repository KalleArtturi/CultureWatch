
"""Shared CultureWatch helpers. Everyone imports these instead of re-implementing the rules."""
from pathlib import Path
import numpy as np
import pandas as pd

PROCESSED = Path("data/processed")
MIN_ISOLATES = 30
AGE_BINS = [0, 18, 65, 200]
AGE_LABELS = ["0-17", "18-64", "65+"]


def load_ast(path=PROCESSED / "ast_joined.csv", first_only=True):
    """Load the processed susceptibility table (first isolates only by default)."""
    ast = pd.read_csv(path, parse_dates=["sample_date"])
    ast["age_group"] = pd.cut(ast.age_years, AGE_BINS, right=False, labels=AGE_LABELS)
    return ast[ast.first_isolate].copy() if first_only else ast


def apply_filters(df, period=None, specimen=None, setting=None, ward=None, sex=None, age_group=None):
    """Filter the AST table. Each argument takes one value or a list; None means no filter.
    setting: 'community' (outpatients), 'inpatient', or 'hospital_onset' (sampled day 3+)."""
    def pick(d, col, val):
        if val is None:
            return d
        return d[d[col].isin(val if isinstance(val, (list, tuple, set)) else [val])]

    df = pick(df, "period", period)
    df = pick(df, "specimen", specimen)
    df = pick(df, "ward_code", ward)
    df = pick(df, "sex", sex)
    df = pick(df, "age_group", age_group)
    if setting == "community":
        df = df[df.ward_type == "out"]
    elif setting == "inpatient":
        df = df[df.ward_type == "in"]
    elif setting == "hospital_onset":
        df = df[df.hospital_onset == True]
    elif setting is not None:
        raise ValueError("setting must be None, 'community', 'inpatient' or 'hospital_onset'")
    return df


def wilson_ci(r, n, z=1.96):
    """95% Wilson confidence interval for a proportion (works well for small n and 0%/100%)."""
    r, n = np.asarray(r, float), np.asarray(n, float)
    with np.errstate(invalid="ignore", divide="ignore"):
        p = r / n
        denom = 1 + z**2 / n
        centre = (p + z**2 / (2 * n)) / denom
        half = z * np.sqrt(p * (1 - p) / n + z**2 / (4 * n**2)) / denom
    return np.clip(centre - half, 0, 1).round(6), np.clip(centre + half, 0, 1).round(6)


def resistance_table(df, by=("organism", "antibiotic_code"), min_n=MIN_ISOLATES):
    """Resistance % per group with counts, 95% CI and reporting rules applied.
    'label' is what the interface should display: a %, 'IR' (intrinsic) or 'n<30'."""
    by = list(by)
    out = (df.groupby(by, observed=True)
             .agg(n_tested=("resistant", "size"),
                  n_resistant=("resistant", "sum"),
                  intrinsic=("intrinsic", "any"))
             .reset_index())
    out["pct_resistant"] = out.n_resistant / out.n_tested
    out["ci_low"], out["ci_high"] = wilson_ci(out.n_resistant, out.n_tested)
    out["reportable"] = (out.n_tested >= min_n) & ~out.intrinsic
    out["label"] = np.where(out.intrinsic, "IR",
                   np.where(out.n_tested < min_n, f"n<{min_n}",
                            (out.pct_resistant * 100).round(1).astype(str) + "%"))
    return out