# rules.py
"""Plausibility rules and reference vocabularies. Shared by generator and filter."""

from itertools import product
from datetime import date

WARDS = {
    "MED-A": ("Sisätaudit A",           "Internal medicine A",  "in",  "hospital"),
    "MED-B": ("Sisätaudit B",           "Internal medicine B",  "in",  "hospital"),
    "ED":    ("Päivystys",              "Emergency department", "out", "hospital"),
    "PHC-S": ("Terveysasema Etelä",     "Health centre South",  "out", "primary_care"),
    "PHC-N": ("Terveysasema Pohjoinen", "Health centre North",  "out", "primary_care"),
    "ICU":   ("Teho-osasto",            "Intensive care unit",  "in",  "hospital"),
    "SURG":  ("Kirurgia",               "Surgery",              "in",  "hospital"),
    "GER":   ("Geriatria",              "Geriatrics",           "in",  "hospital"),
    "URO":   ("Urologia",               "Urology",              "in",  "hospital"),
}

SPECIMENS = {"urine": "virtsa", "blood": "veri", "wound": "haava"}
RESULTS = ["positive", "negative", "mixed_growth"]
ISOLATE_COUNTS = [0, 1, 2, 3]
AGE_BRACKETS = [
    (0, 1, "infant"), (2, 17, "child"), (18, 40, "young_adult"),
    (41, 65, "adult"), (66, 85, "older_adult"), (86, 120, "elderly"),
]
DAY_TYPES = ["weekday", "weekend"]


def plausible_ward_specimen(ward, specimen):
    if specimen == "blood" and ward in ("PHC-S", "PHC-N"):
        return False
    return True


def plausible_specimen_result(specimen, result, n_isolates):
    if specimen == "blood" and result == "mixed_growth":
        return False
    if result != "positive" and n_isolates != 0:
        return False
    if result == "positive" and n_isolates == 0:
        return False
    if specimen == "blood" and result == "positive" and n_isolates > 2:
        return False
    return True


def plausible_ward_age(ward, age_bracket):
    if ward == "GER" and age_bracket in ("infant", "child"):
        return False
    return True


def plausible_ward_specimen_result(ward, specimen, result, n_isolates):
    if specimen == "urine" and ward == "ICU" and result != "negative":
        return False
    return True


def is_plausible(ward, specimen, result, n_isolates, age_bracket, day_type):
    return (
        plausible_ward_specimen(ward, specimen)
        and plausible_specimen_result(specimen, result, n_isolates)
        and plausible_ward_age(ward, age_bracket)
        and plausible_ward_specimen_result(ward, specimen, result, n_isolates)
    )


def enumerate_plausible_space():
    cells = []
    for ward, specimen, result, n_iso, bracket, day in product(
        WARDS.keys(), SPECIMENS.keys(), RESULTS, ISOLATE_COUNTS,
        [b[2] for b in AGE_BRACKETS], DAY_TYPES,
    ):
        if is_plausible(ward, specimen, result, n_iso, bracket, day):
            cells.append((ward, specimen, result, n_iso, bracket, day))
    return cells


def age_to_bracket(age):
    for lo, hi, name in AGE_BRACKETS:
        if lo <= age <= hi:
            return name
    return None


def date_to_day_type(d):
    return "weekend" if d.weekday() >= 5 else "weekday"