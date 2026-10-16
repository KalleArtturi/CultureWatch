# filter.py
"""Validate data/generated/cultures.csv. Exits non-zero on failure."""

import argparse, sys
from datetime import datetime

import pandas as pd

from rules import (
    WARDS, SPECIMENS, is_plausible, enumerate_plausible_space,
    age_to_bracket, date_to_day_type,
)


class Report:
    def __init__(self):
        self.errors, self.warnings, self.info = [], [], []

    def error(self, m): self.errors.append(m)
    def warn(self, m):  self.warnings.append(m)
    def note(self, m):  self.info.append(m)

    def passed(self): return not self.errors

    def print(self):
        print("=" * 70)
        print("FILTER REPORT")
        print("=" * 70)
        for m in self.info:     print(f"  [info]  {m}")
        for m in self.warnings: print(f"  [warn]  {m}")
        for m in self.errors:   print(f"  [ERROR] {m}")
        print("-" * 70)
        print("RESULT:", "PASS" if self.passed() else "FAIL")


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--real", required=True)
    p.add_argument("--generated", required=True)
    p.add_argument("--strict", action="store_true")
    return p.parse_args()


def check_schema(real, gen, r):
    if list(real.columns) != list(gen.columns):
        r.error(f"Column mismatch: real={list(real.columns)} gen={list(gen.columns)}")
    else:
        r.note(f"Schema OK ({len(real.columns)} columns)")


def check_vocabularies(real, gen, r):
    for col in ["ward_code", "ward_type", "institution", "specimen", "result"]:
        extra = set(gen[col].dropna()) - set(real[col].dropna())
        if extra:
            r.error(f"{col} has values not in original: {extra}")
        else:
            r.note(f"{col} vocabulary OK")


def check_id_collisions(real, gen, r):
    for col in ["culture_id", "patient_id"]:
        overlap = set(real[col].dropna()) & set(gen[col].dropna())
        if overlap:
            r.error(f"{col} collision ({len(overlap)}), e.g. {sorted(overlap)[:3]}")
        else:
            r.note(f"{col} no collision")


def check_plausibility(gen, r):
    bad = []
    for i, row in gen.iterrows():
        bracket = age_to_bracket(int(row["age_years"]))
        if bracket is None:
            bad.append((i, "age out of range"))
            continue
        d = datetime.fromisoformat(str(row["sample_date"])).date()
        cell = (row["ward_code"], row["specimen"], row["result"],
                int(row["n_isolates"]), bracket, date_to_day_type(d))
        if not is_plausible(*cell):
            bad.append((i, cell))
    if bad:
        r.error(f"{len(bad)} implausible rows, e.g. {bad[:3]}")
    else:
        r.note(f"All {len(gen)} rows pass plausibility")


def check_invariants(gen, r):
    g = gen.copy()
    g["n_isolates"] = g["n_isolates"].astype(int)
    g["sample_date"] = pd.to_datetime(g["sample_date"])
    g["admission_date"] = pd.to_datetime(g["admission_date"], errors="coerce")

    if ((g["result"] == "positive") != (g["n_isolates"] > 0)).any():
        r.error("result ↔ n_isolates mismatch")
    else:
        r.note("result ↔ n_isolates OK")

    if g.loc[g["ward_type"] == "out", "admission_date"].notna().any():
        r.error("outpatient rows with admission_date")
    else:
        r.note("outpatient admission_date blank OK")

    if g.loc[g["ward_type"] == "in", "admission_date"].isna().any():
        r.error("inpatient rows without admission_date")
    else:
        r.note("inpatient admission_date present OK")

    if (g["admission_date"].notna() & (g["admission_date"] > g["sample_date"])).any():
        r.error("admission_date > sample_date")
    else:
        r.note("admission_date ≤ sample_date OK")

    iso = g["sample_date"].dt.isocalendar()
    if (iso["year"] != g["iso_year"]).any() or (iso["week"] != g["iso_week"]).any():
        r.error("ISO year/week mismatch")
    else:
        r.note("ISO year/week OK")


def check_duplicates(gen, r):
    sig = ["patient_id", "sample_date", "ward_code",
           "specimen", "result", "n_isolates"]
    dup = gen.duplicated(subset=sig, keep=False).sum()
    if dup:
        r.warn(f"{dup} rows share a signature with another row")
    else:
        r.note("No duplicate signatures")


def check_cross_reference(gen, r):
    ward_meta = gen.groupby("ward_code")[
        ["ward_fi", "ward_en", "ward_type", "institution"]
    ].nunique().gt(1).any(axis=1)
    if ward_meta.any():
        r.error(f"ward_code maps to multiple metadata: {ward_meta[ward_meta].index.tolist()}")
    else:
        r.note("ward_code → metadata mapping consistent")

    spec_meta = gen.groupby("specimen")["specimen_fi"].nunique().gt(1)
    if spec_meta.any():
        r.error(f"specimen maps to multiple specimen_fi: {spec_meta[spec_meta].index.tolist()}")
    else:
        r.note("specimen → specimen_fi mapping consistent")


def check_coverage(gen, r):
    plausible = set(enumerate_plausible_space())

    def cell_of(row):
        bracket = age_to_bracket(int(row["age_years"]))
        d = datetime.fromisoformat(str(row["sample_date"])).date()
        return (row["ward_code"], row["specimen"], row["result"],
                int(row["n_isolates"]), bracket, date_to_day_type(d))

    seen = set(gen.apply(cell_of, axis=1)) & plausible
    cov = len(seen) / len(plausible)
    r.note(f"Coverage of plausible space: {cov:.1%} ({len(seen)}/{len(plausible)})")
    if cov < 0.85:
        r.warn("Coverage below 85%")


def main():
    args = parse_args()
    r = Report()
    real = pd.read_csv(args.real, dtype=str)
    gen = pd.read_csv(args.generated)

    check_schema(real, gen, r)
    check_vocabularies(real, gen, r)
    check_id_collisions(real, gen, r)
    check_plausibility(gen, r)
    check_invariants(gen, r)
    check_duplicates(gen, r)
    check_cross_reference(gen, r)
    check_coverage(gen, r)

    r.print()
    if not r.passed():
        sys.exit(1)
    if args.strict and r.warnings:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()