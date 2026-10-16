"""Task 2: Antibiogram - resistance % per organism x antibiotic, with display rules."""
from pathlib import Path
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
import numpy as np
import pandas as pd
import cw_utils as cw

# Column order: grouped by antibiotic class, urine-only agents last
AB_ORDER = ["AMP", "MEC", "TZP", "CXM", "CRO", "CAZ", "MEM", "CIP", "FOX", "CLI", "VAN", "TMP", "NIT"]
URINE_ONLY = {"MEC", "TMP", "NIT"}
GREEN_MAX, AMBER_MAX = 0.10, 0.20  # <10% green, 10-20% amber, >20% red


def build_antibiogram(ast, **filters):
    """Return (labels, pct, n): three organism x antibiotic tables for the given filters.
    pct is NaN where a % must not be shown (IR, n<30, not tested)."""
    t = cw.resistance_table(cw.apply_filters(ast, **filters))
    cols = [a for a in AB_ORDER if a in set(t.antibiotic_code)]
    labels = t.pivot(index="organism", columns="antibiotic_code", values="label").reindex(columns=cols).fillna("")
    pct = (t.assign(pct=t.pct_resistant.where(t.reportable))
             .pivot(index="organism", columns="antibiotic_code", values="pct").reindex(columns=cols))
    n = t.pivot(index="organism", columns="antibiotic_code", values="n_tested").reindex(columns=cols)
    return labels, pct, n


def plot_antibiogram(labels, pct, n, title="Antibiogram", path=None):
    """Colour-coded heatmap: green/amber/red by resistance, grey for IR and n<30, blank if not tested."""
    category = np.select([pct < GREEN_MAX, pct <= AMBER_MAX, pct > AMBER_MAX], [0, 1, 2], default=np.nan)
    category = np.where((labels.values != "") & np.isnan(category), 3, category)  # IR / n<30 -> grey
    cmap = ListedColormap(["#C6EFCE", "#FFEB9C", "#FFC7CE", "#E0E0E0"])

    fig, ax = plt.subplots(figsize=(1.0 * len(labels.columns) + 3, 0.55 * len(labels) + 2))
    ax.imshow(np.ma.masked_invalid(category), cmap=cmap, vmin=0, vmax=3, aspect="auto")
    for i in range(labels.shape[0]):
        for j in range(labels.shape[1]):
            text = labels.iat[i, j]
            if text and text not in ("IR",) and not text.startswith("n<"):
                text = f"{text}\nn={int(n.iat[i, j])}"
            ax.text(j, i, text, ha="center", va="center", fontsize=7)
    ax.set_xticks(range(len(labels.columns)),
                  [f"{c}*" if c in URINE_ONLY else c for c in labels.columns])
    ax.set_yticks(range(len(labels.index)), labels.index, style="italic")
    ax.xaxis.tick_top()
    ax.set_title(title, pad=30)
    fig.text(0.01, 0.01, "Green <10%  ·  Amber 10-20%  ·  Red >20%  ·  Grey: IR = intrinsic resistance, "
             f"n<{cw.MIN_ISOLATES} = too few isolates  ·  * urine samples only", fontsize=7)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    if path:
        fig.savefig(path, dpi=200)
    return fig


if __name__ == "__main__":
    out = Path("outputs"); out.mkdir(exist_ok=True)
    ast = cw.load_ast()
    examples = {
        "all_years_all_specimens": {},
        "urine_community_women": dict(specimen="urine", setting="community", sex="F"),
        "blood_all_years": dict(specimen="blood"),
    }
    for name, filters in examples.items():
        labels, pct, n = build_antibiogram(ast, **filters)
        labels.to_csv(out / f"antibiogram_{name}.csv")
        plot_antibiogram(labels, pct, n, title=f"Antibiogram: {name.replace('_', ' ')}",
                         path=out / f"antibiogram_{name}.png")
        print(f"Saved {name}")