# generator.py
"""Generate synthetic cultures.csv. Never writes into an 'original' directory."""

import argparse, csv, os, random
from datetime import date, datetime, timedelta

import pandas as pd

from rules import (
    WARDS, SPECIMENS, RESULTS, AGE_BRACKETS,
    is_plausible, enumerate_plausible_space,
    age_to_bracket, date_to_day_type,
)

WARD_LOOKUP = {
    code: {"fi": fi, "en": en, "type": wt, "institution": inst}
    for code, (fi, en, wt, inst) in WARDS.items()
}
BRACKET_BOUNDS = {name: (lo, hi) for lo, hi, name in AGE_BRACKETS}

COLUMNS = [
    "culture_id", "patient_id", "age_years", "sample_date",
    "iso_year", "iso_week", "ward_code", "ward_fi", "ward_en",
    "ward_type", "institution", "admission_date",
    "specimen", "specimen_fi", "result", "n_isolates",
]


class PatientPool:
    def __init__(self, size):
        self.patients = []
        for n in range(1, size + 1):
            age = int(random.triangular(0, 100, 65))
            self.patients.append({"pid": f"P{n:06d}", "birth_year": 2024 - age})

    def sample(self):
        return random.choice(self.patients)

    def age_at(self, patient, year):
        return max(0, min(120, year - patient["birth_year"]))


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--real", required=True)
    p.add_argument("--outdir", required=True)
    p.add_argument("--n", type=int, default=5000)
    p.add_argument("--min-per-cell", type=int, default=2)
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--start-id", type=int, default=900000)
    p.add_argument("--start-date", default=None)
    p.add_argument("--end-date", default=None)
    return p.parse_args()


def load_original(path):
    df = pd.read_csv(path)
    df["sample_date"] = pd.to_datetime(df["sample_date"]).dt.date
    return df


def build_sampling_weights(plausible_cells, real_df):
    counts = {}
    for cell in plausible_cells:
        ward, spec, res, n_iso, bracket, day = cell
        mask = (
            (real_df["ward_code"] == ward) &
            (real_df["specimen"] == spec) &
            (real_df["result"] == res) &
            (real_df["n_isolates"] == n_iso)
        )
        counts[cell] = int(mask.sum())
    weights = {c: 1.0 / (1.0 + counts[c]) for c in plausible_cells}
    total = sum(weights.values())
    return {c: w / total for c, w in weights.items()}


def randomize_sample_date(start, end, day_type):
    while True:
        delta = (end - start).days
        d = start + timedelta(days=random.randint(0, delta))
        if date_to_day_type(d) == day_type:
            return d


def randomize_admission_offset():
    return min(30, int(random.expovariate(1 / 7)))


def materialize(cell, patient_pool, start_date, end_date,
                id_counter, seen_signatures):
    ward, specimen, result, n_isolates, bracket, day_type = cell

    patient = None
    for _ in range(30):
        cand = patient_pool.sample()
        for y in range(start_date.year, end_date.year + 1):
            if age_to_bracket(patient_pool.age_at(cand, y)) == bracket:
                patient = cand
                break
        if patient:
            break
    if patient is None:
        patient = patient_pool.sample()

    year_lo = start_date.year
    year_hi = end_date.year
    for y in range(year_lo, year_hi + 1):
        if age_to_bracket(patient_pool.age_at(patient, y)) == bracket:
            ystart = max(start_date, date(y, 1, 1))
            yend = min(end_date, date(y, 12, 31))
            sample_date = randomize_sample_date(ystart, yend, day_type)
            age = patient_pool.age_at(patient, sample_date.year)
            break
    else:
        sample_date = randomize_sample_date(start_date, end_date, day_type)
        age = patient_pool.age_at(patient, sample_date.year)

    ward_meta = WARD_LOOKUP[ward]
    if ward_meta["type"] == "in":
        admission_date = sample_date - timedelta(days=randomize_admission_offset())
        admission_str = admission_date.isoformat()
    else:
        admission_str = ""

    iso = sample_date.isocalendar()
    culture_id = f"C{id_counter:07d}"

    row = {
        "culture_id": culture_id,
        "patient_id": patient["pid"],
        "age_years": age,
        "sample_date": sample_date.isoformat(),
        "iso_year": iso[0],
        "iso_week": iso[1],
        "ward_code": ward,
        "ward_fi": ward_meta["fi"],
        "ward_en": ward_meta["en"],
        "ward_type": ward_meta["type"],
        "institution": ward_meta["institution"],
        "admission_date": admission_str,
        "specimen": specimen,
        "specimen_fi": SPECIMENS[specimen],
        "result": result,
        "n_isolates": n_isolates,
    }

    sig = (row["patient_id"], row["sample_date"], row["ward_code"],
           row["specimen"], row["result"], row["n_isolates"])
    if sig in seen_signatures:
        for delta in (-1, 1, -2, 2, -3, 3):
            alt = sample_date + timedelta(days=delta)
            if not (start_date <= alt <= end_date):
                continue
            sig2 = (row["patient_id"], alt.isoformat(), row["ward_code"],
                    row["specimen"], row["result"], row["n_isolates"])
            if sig2 not in seen_signatures:
                row["sample_date"] = alt.isoformat()
                iso = alt.isocalendar()
                row["iso_year"], row["iso_week"] = iso[0], iso[1]
                if row["admission_date"]:
                    adm = alt - timedelta(days=randomize_admission_offset())
                    row["admission_date"] = adm.isoformat()
                sig = sig2
                break
    seen_signatures.add(sig)
    return row


def write_csv(path, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)


def main():
    args = parse_args()
    if args.seed is not None:
        random.seed(args.seed)

    outdir_abs = os.path.abspath(args.outdir)
    if "original" in outdir_abs.split(os.sep):
        raise SystemExit("Refusing to write into an 'original' directory.")

    real_df = load_original(args.real)
    start_date = (datetime.fromisoformat(args.start_date).date()
                  if args.start_date else real_df["sample_date"].min())
    end_date = (datetime.fromisoformat(args.end_date).date()
                if args.end_date else real_df["sample_date"].max())

    plausible = enumerate_plausible_space()
    print(f"Plausible cells: {len(plausible)}")

    seeds = []
    for cell in plausible:
        for _ in range(args.min_per_cell):
            seeds.append(cell)

    remaining = max(0, args.n - len(seeds))
    if remaining:
        weights = build_sampling_weights(plausible, real_df)
        fill = random.choices(list(weights.keys()),
                              weights=list(weights.values()), k=remaining)
    else:
        fill = []

    all_cells = seeds + fill
    random.shuffle(all_cells)

    pool = PatientPool(size=max(500, args.n // 3))
    seen = set()
    rows = []
    id_counter = args.start_id
    for cell in all_cells:
        assert is_plausible(*cell)
        rows.append(materialize(cell, pool, start_date, end_date,
                                id_counter, seen))
        id_counter += 1

    out_csv = os.path.join(args.outdir, "cultures.csv")
    write_csv(out_csv, rows)
    print(f"Wrote {len(rows)} rows to {out_csv}")


if __name__ == "__main__":
    main()