"""Make a demo batch of 'next two weeks' lab results to try the web UI's CSV import (mode: add new results).

Copies the last 14 days of cultures with new IDs, 14 days later, and PLANTS a small MRSA cluster on Surgery
(4 new patients) so the import visibly triggers an alert and new carriers in the worklist.
Synthetic demo data only, like the rest of the dataset.
Run:  python make_demo_batch.py   ->  data/demo_batch/{patients,cultures,isolates,susceptibility}.csv"""
import pandas as pd
import cw_utils as cw

OUT = cw.DATA_DIR / "demo_batch"
SHIFT = pd.Timedelta(days=14)
CLUSTER_WARD, CLUSTER_CASES = "SURG", 4


def main():
    raw = cw.RAW_DIR
    patients = pd.read_csv(raw / "patients.csv")
    cultures = pd.read_csv(raw / "cultures.csv", parse_dates=["sample_date", "admission_date"])
    isolates = pd.read_csv(raw / "isolates.csv")
    sus = pd.read_csv(raw / "susceptibility.csv")
    wards = pd.read_csv(raw / "wards.csv").set_index("ward_code")

    # 1. Copy the last 14 days of cultures, two weeks later, with new culture and isolate IDs
    last = cultures.sample_date.max()
    c = cultures[cultures.sample_date > last - SHIFT].copy()
    next_id = int(cultures.culture_id.str[1:].astype(int).max()) + 1
    new_ids = {old: f"C{next_id + i:07d}" for i, old in enumerate(c.culture_id)}
    c["culture_id"] = c.culture_id.map(new_ids)
    c["sample_date"] += SHIFT
    c["admission_date"] += SHIFT
    iso_cal = c.sample_date.dt.isocalendar()
    c["iso_year"], c["iso_week"] = iso_cal.year.astype(int), iso_cal.week.astype(int)

    i = isolates[isolates.culture_id.isin(new_ids)].copy()
    s = sus[sus.culture_id.isin(new_ids)].copy()
    for df in (i, s):
        df["isolate_id"] = df.culture_id.map(new_ids) + df.isolate_id.str.split("-").str[1].radd("-")
        df["culture_id"] = df.culture_id.map(new_ids)

    # 2. Plant an MRSA cluster: S. aureus isolates from the batch, moved to Surgery, on new patients
    sa = i[i.organism == "Staphylococcus aureus"].culture_id.drop_duplicates().head(CLUSTER_CASES)
    if len(sa) < CLUSTER_CASES:
        raise SystemExit(f"Only {len(sa)} S. aureus cultures in the batch; cannot plant {CLUSTER_CASES} cases")
    first_new = int(patients.patient_id.str[1:].astype(int).max()) + 1
    new_patients = pd.DataFrame({"patient_id": [f"P{first_new + k:06d}" for k in range(len(sa))],
                                 "sex": ["M", "F", "M", "F"][:len(sa)], "birth_year": [1948, 1955, 1961, 1939][:len(sa)],
                                 "home_area": ["Centre", "North", "South", "Centre"][:len(sa)]})
    w = wards.loc[CLUSTER_WARD]
    for k, cid in enumerate(sa):
        row = c.culture_id == cid
        sample = c.loc[row, "sample_date"].iloc[0]
        c.loc[row, ["patient_id", "ward_code", "ward_fi", "ward_en", "ward_type", "institution"]] = [
            new_patients.patient_id[k], CLUSTER_WARD, w.ward_fi, w.ward_en, w.ward_type, w.institution]
        c.loc[row, "admission_date"] = sample - pd.Timedelta(days=5)  # day 6 of the stay: hospital-onset
        c.loc[row, "age_years"] = sample.year - new_patients.birth_year[k]
        i.loc[(i.culture_id == cid) & (i.organism == "Staphylococcus aureus"), "mrsa"] = 1
        s.loc[(s.culture_id == cid) & (s.organism == "Staphylococcus aureus") & (s.antibiotic_code == "FOX"), "result"] = "R"

    OUT.mkdir(parents=True, exist_ok=True)
    new_patients.to_csv(OUT / "patients.csv", index=False)
    c.to_csv(OUT / "cultures.csv", index=False)
    i.to_csv(OUT / "isolates.csv", index=False)
    s.to_csv(OUT / "susceptibility.csv", index=False)
    print(f"Demo batch {c.sample_date.min():%Y-%m-%d} to {c.sample_date.max():%Y-%m-%d}: "
          f"{len(c)} cultures, {len(i)} isolates, {len(s)} susceptibility results, "
          f"{len(new_patients)} new patients (planted MRSA cluster on {CLUSTER_WARD}) -> {OUT}")


if __name__ == "__main__":
    main()
