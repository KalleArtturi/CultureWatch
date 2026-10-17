"""Split the REAL dataset at a date, to demo the CSV import with real records only (nothing is invented).

  data/demo_batch/base/   every record sampled before the batch    -> load first: Import > Replace all data
  data/demo_batch/batch/  the real records of the weeks ending --until -> import live: Import > Add new results

Default --until 2026-03-08 with --weeks 2: the batch holds the two weeks in which the ICU MRSA cluster appears,
so importing it makes that real alert fire. Afterwards "Restore original dataset" brings back the full data.
Run:  python make_demo_batch.py [--until 2026-03-08] [--weeks 2]"""
import argparse
import shutil

import pandas as pd

import cw_utils as cw

OUT = cw.DATA_DIR / "demo_batch"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--until", default="2026-03-08", help="last day of the batch (YYYY-MM-DD)")
    ap.add_argument("--weeks", type=int, default=2, help="length of the batch in weeks")
    args = ap.parse_args()
    until = pd.Timestamp(args.until)
    start = until - pd.Timedelta(weeks=args.weeks) + pd.Timedelta(days=1)

    raw = cw.RAW_DIR
    patients = pd.read_csv(raw / "patients.csv")
    cultures = pd.read_csv(raw / "cultures.csv", parse_dates=["sample_date", "admission_date"])
    isolates = pd.read_csv(raw / "isolates.csv")
    sus = pd.read_csv(raw / "susceptibility.csv")

    parts = {"base": cultures[cultures.sample_date < start],
             "batch": cultures[(cultures.sample_date >= start) & (cultures.sample_date <= until)]}
    shutil.rmtree(OUT, ignore_errors=True)
    for name, c in parts.items():
        d = OUT / name
        d.mkdir(parents=True)
        if name == "base":
            patients.to_csv(d / "patients.csv", index=False)  # all patients; batch cultures refer to them
        c.to_csv(d / "cultures.csv", index=False)
        isolates[isolates.culture_id.isin(c.culture_id)].to_csv(d / "isolates.csv", index=False)
        sus[sus.culture_id.isin(c.culture_id)].to_csv(d / "susceptibility.csv", index=False)
        print(f"{name:5}: {len(c):,} cultures, {c.sample_date.min():%Y-%m-%d} to {c.sample_date.max():%Y-%m-%d} -> {d}")


if __name__ == "__main__":
    main()
