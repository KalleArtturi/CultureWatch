"""Result checks before release: rules a lab scientist applies to susceptibility results, run on every isolate.

Each rule says which isolates it applies to and which of them need a second look:
  contradiction - the resistance flag and its marker antibiotic disagree: check before release
  impossible    - reported susceptible to a drug the species is naturally resistant to (EUCAST expected
                  resistant phenotypes; the same list preprocess.py uses)
  confirm       - unusual resistance that needs a confirmatory test or a reference laboratory
Run:  python result_checks.py   (summary for the whole dataset)"""
import pandas as pd

import cw_utils as cw
from preprocess import INTRINSIC

ESBL_SPECIES = ["Escherichia coli", "Klebsiella pneumoniae"]  # the species this dataset records ESBL for
ENTEROBACTERALES = ["Escherichia coli", "Klebsiella pneumoniae", "Klebsiella oxytoca", "Proteus mirabilis",
                    "Citrobacter freundii"]
ENTEROCOCCI = ["Enterococcus faecalis", "Enterococcus faecium"]

RULES = {  # id: (category, basis)
    "mrsa_fox_s": ("contradiction", "EUCAST: the cefoxitin screen detects MRSA"),
    "fox_r_not_mrsa": ("contradiction", "EUCAST: the cefoxitin screen detects MRSA"),
    "esbl_cro_s": ("contradiction", "ESBL enzymes break down 3rd-generation cephalosporins"),
    "vre_van_s": ("contradiction", "VRE is defined by vancomycin resistance"),
    "van_r_not_vre": ("contradiction", "VRE is defined by vancomycin resistance"),
    "intrinsic_s": ("impossible", "EUCAST Expected Resistant Phenotypes v1.2"),
    "esc_r_unconfirmed": ("confirm", "EUCAST guideline for detection of resistance mechanisms"),
    "mem_r_unconfirmed": ("confirm", "EUCAST guideline for detection of resistance mechanisms"),
    "vrsa": ("confirm", "EUCAST expert rules: exceptional phenotype"),
}


def evaluate(isolates, susceptibility):
    """One row per (isolate, rule) the rule applies to, with flagged=True where the isolate needs a second look.
    isolates: isolate_id, organism and the esbl/mrsa/vre/cpe flags; susceptibility: isolate_id, antibiotic_code,
    result (S/R)."""
    iso = isolates.drop_duplicates("isolate_id").set_index("isolate_id")
    wide = (susceptibility.pivot_table(index="isolate_id", columns="antibiotic_code", values="result", aggfunc="first")
            .reindex(iso.index))
    res = lambda code: wide[code] if code in wide else pd.Series(pd.NA, index=wide.index, dtype=object)
    org = iso.organism
    flag = lambda col: iso[col].fillna(0).astype(int) == 1
    rows = []

    def add(rule, applies, flagged, antibiotic):
        applies = applies.fillna(False).astype(bool)
        rows.append(pd.DataFrame({"isolate_id": iso.index[applies], "rule": rule, "antibiotic_code": antibiotic,
                                  "result": res(antibiotic)[applies].values,
                                  "flagged": flagged[applies].fillna(False).astype(bool).values}))

    sa, ent, entero = org.eq("Staphylococcus aureus"), org.isin(ENTEROBACTERALES), org.isin(ENTEROCOCCI)
    esbl_sp = org.isin(ESBL_SPECIES)
    fox, cro, mem, van = res("FOX"), res("CRO"), res("MEM"), res("VAN")
    add("mrsa_fox_s", sa & fox.notna(), flag("mrsa") & fox.eq("S"), "FOX")
    add("fox_r_not_mrsa", sa & fox.notna(), fox.eq("R") & ~flag("mrsa"), "FOX")
    add("esbl_cro_s", esbl_sp & cro.notna(), flag("esbl") & cro.eq("S"), "CRO")
    add("vre_van_s", entero & van.notna(), flag("vre") & van.eq("S"), "VAN")
    add("van_r_not_vre", entero & van.notna(), van.eq("R") & ~flag("vre"), "VAN")
    for o, code in sorted(INTRINSIC):
        add("intrinsic_s", org.eq(o) & res(code).notna(), res(code).eq("S"), code)
    add("esc_r_unconfirmed", esbl_sp & cro.notna(), cro.eq("R") & ~flag("esbl") & ~flag("cpe"), "CRO")
    add("mem_r_unconfirmed", ent & mem.notna(), mem.eq("R") & ~flag("cpe"), "MEM")
    add("vrsa", sa & van.notna(), van.eq("R"), "VAN")
    out = pd.concat(rows, ignore_index=True)
    out["category"] = out.rule.map(lambda r: RULES[r][0])
    return out


def summary(ev):
    """Per rule: how many isolates it was checked on and how many it flagged."""
    s = ev.groupby("rule").agg(checked=("isolate_id", "nunique"), flagged=("flagged", "sum")).reindex(RULES).fillna(0)
    s["category"] = [RULES[r][0] for r in s.index]
    s["basis"] = [RULES[r][1] for r in s.index]
    return s.astype({"checked": int, "flagged": int}).reset_index()


def category_counts(ev):
    """Distinct isolates flagged per category, plus how many isolates were checked at all."""
    f = ev[ev.flagged]
    counts = {c: int(f[f.category == c].isolate_id.nunique()) for c in ("contradiction", "impossible", "confirm")}
    return dict(checked=int(ev.isolate_id.nunique()), **counts)


if __name__ == "__main__":
    iso = pd.read_csv(cw.PROCESSED / "isolates_joined.csv")
    sus = pd.read_csv(cw.RAW_DIR / "susceptibility.csv")
    ev = evaluate(iso, sus)
    print(summary(ev).to_string(index=False))
    print(category_counts(ev))
