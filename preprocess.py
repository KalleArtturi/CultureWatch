"""Pipeline step 1: raw CSVs -> validated, joined, first-isolate tables in processed/.
Same logic as the preprocessing notebook, as a script that stops on bad data.
Run:  python preprocess.py"""
import pandas as pd
import cw_utils as cw

DATA_DIR = cw.RAW_DIR
OUT_DIR = cw.PROCESSED

REQUIRED_COLUMNS = {
    "patients": ["patient_id", "sex", "birth_year"],
    "cultures": ["culture_id", "patient_id", "age_years", "sample_date", "ward_code", "ward_type",
                 "institution", "admission_date", "specimen", "result", "n_isolates"],
    "isolates": ["isolate_id", "culture_id", "isolate_no", "organism", "esbl", "mrsa", "vre", "cpe"],
    "susceptibility": ["isolate_id", "organism", "antibiotic", "antibiotic_code", "result"],
}
INTRINSIC = {("Klebsiella pneumoniae", "AMP"), ("Klebsiella oxytoca", "AMP"),
             ("Citrobacter freundii", "AMP"), ("Proteus mirabilis", "NIT")}


class DataValidationError(Exception):
    """Raised when the raw data fails a check; the pipeline stops instead of publishing bad numbers."""


def load_raw(data_dir=DATA_DIR):
    tables = {
        "patients": pd.read_csv(data_dir / "patients.csv"),
        "cultures": pd.read_csv(data_dir / "cultures.csv", parse_dates=["sample_date", "admission_date"]),
        "isolates": pd.read_csv(data_dir / "isolates.csv"),
        "susceptibility": pd.read_csv(data_dir / "susceptibility.csv"),
    }
    for optional in ["wards", "antibiotics"]:  # code lists, used for warnings if present
        path = data_dir / f"{optional}.csv"
        tables[optional] = pd.read_csv(path) if path.exists() else None
    return tables


def validate(t):
    """Hard checks raise DataValidationError; soft checks only print warnings."""
    errors = []
    for name, cols in REQUIRED_COLUMNS.items():
        missing = set(cols) - set(t[name].columns)
        if missing:
            errors.append(f"{name}: missing columns {sorted(missing)}")
    if errors:  # can't run the other checks without the columns
        raise DataValidationError("\n".join(errors))

    p, c, i, s = t["patients"], t["cultures"], t["isolates"], t["susceptibility"]
    checks = {
        "duplicate patient_id": p.patient_id.duplicated().sum(),
        "duplicate culture_id": c.culture_id.duplicated().sum(),
        "duplicate isolate_id": i.isolate_id.duplicated().sum(),
        "cultures with unknown patient": (~c.patient_id.isin(p.patient_id)).sum(),
        "isolates with unknown culture": (~i.culture_id.isin(c.culture_id)).sum(),
        "susceptibility with unknown isolate": (~s.isolate_id.isin(i.isolate_id)).sum(),
        "duplicate isolate+antibiotic": s.duplicated(["isolate_id", "antibiotic"]).sum(),
        "n_isolates mismatches": (i.groupby("culture_id").size()
                                  .reindex(c.culture_id, fill_value=0).values != c.n_isolates.values).sum(),
        "missing sample_date": c.sample_date.isna().sum(),
        "inpatients without admission_date": ((c.ward_type == "in") & c.admission_date.isna()).sum(),
        "admission after sample": (c.admission_date > c.sample_date).sum(),
        "results other than S/R": (~s.result.isin(["S", "R"])).sum(),
    }
    errors += [f"{k}: {v}" for k, v in checks.items() if v > 0]
    if errors:
        raise DataValidationError("Data validation failed:\n  " + "\n  ".join(errors))

    # Soft checks: new codes should be noticed, not silently break a view
    if t["wards"] is not None:
        new = set(c.ward_code) - set(t["wards"].ward_code)
        if new: print(f"  WARNING: unknown ward codes {sorted(new)}")
    if t["antibiotics"] is not None:
        new = set(s.antibiotic_code) - set(t["antibiotics"].antibiotic_code)
        if new: print(f"  WARNING: unknown antibiotic codes {sorted(new)}")
    print(f"  {len(REQUIRED_COLUMNS)} column checks and {len(checks)} data checks passed")


def surveillance_year(dates):
    """12-month periods running October to September, e.g. 'Y1 (2023/24)'."""
    start = dates.dt.year.where(dates.dt.month >= 10, dates.dt.year - 1)
    return ("Y" + (start - 2022).astype(str) + " ("
            + start.astype(str) + "/" + (start + 1).astype(str).str[-2:] + ")")


def build(t):
    """Join tables, add period and hospital-onset, apply the first-isolate rule."""
    c = t["cultures"].copy()
    c["period"] = surveillance_year(c.sample_date)
    c["days_in_hospital"] = (c.sample_date - c.admission_date).dt.days
    c["hospital_onset"] = c.days_in_hospital >= 2  # day 3 or later; admission day = day 1

    iso = (t["isolates"].merge(c, on="culture_id", how="left")
                        .merge(t["patients"], on="patient_id", how="left")
                        .sort_values(["sample_date", "culture_id", "isolate_no"]))
    iso["first_isolate"] = ~iso.duplicated(["patient_id", "organism", "specimen", "period"])

    iso_cols = ["isolate_id", "patient_id", "period", "sample_date", "specimen", "ward_code", "ward_type",
                "institution", "hospital_onset", "sex", "age_years", "first_isolate"]
    s = t["susceptibility"].drop(columns="culture_id", errors="ignore")
    ast = s.merge(iso[iso_cols], on="isolate_id", how="left")
    ast["resistant"] = (ast.result == "R").astype(int)
    ast["intrinsic"] = [(o, a) in INTRINSIC for o, a in zip(ast.organism, ast.antibiotic_code)]
    return iso, ast


def save(iso, ast, out_dir=OUT_DIR):
    out_dir.mkdir(parents=True, exist_ok=True)
    iso.to_csv(out_dir / "isolates_joined.csv", index=False)
    ast.to_csv(out_dir / "ast_joined.csv", index=False)


def main():
    print("Loading raw data...")
    t = load_raw()
    for name in REQUIRED_COLUMNS:
        print(f"  {name:15} {len(t[name]):>8,} rows")
    print("Validating...")
    validate(t)
    print("Building tables...")
    iso, ast = build(t)
    print(f"  {len(iso):,} isolates, {iso.first_isolate.sum():,} first isolates "
          f"({iso.first_isolate.mean():.1%})")
    save(iso, ast)
    print(f"Saved to {OUT_DIR.resolve()}")


if __name__ == "__main__":
    main()