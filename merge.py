# merge.py
"""Merge original + generated. Refuses to run if filter.py fails."""

import argparse, os, subprocess, sys
import pandas as pd


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--original-dir", required=True)
    p.add_argument("--generated-dir", required=True)
    p.add_argument("--merged-dir", required=True)
    return p.parse_args()


def main():
    args = parse_args()
    orig = os.path.join(args.original_dir, "cultures.csv")
    gen = os.path.join(args.generated_dir, "cultures.csv")

    print("Running filter...")
    rc = subprocess.call([
        sys.executable, "filter.py",
        "--real", orig, "--generated", gen, "--strict",
    ])
    if rc != 0:
        sys.exit("Filter failed — refusing to merge.")

    real_df = pd.read_csv(orig, dtype=str)
    gen_df = pd.read_csv(gen, dtype=str)
    real_df["source"] = "original"
    gen_df["source"] = "generated"

    combined = pd.concat([real_df, gen_df], ignore_index=True)
    os.makedirs(args.merged_dir, exist_ok=True)
    out = os.path.join(args.merged_dir, "cultures.csv")
    combined.to_csv(out, index=False)
    print(f"Merged {len(real_df)} + {len(gen_df)} = {len(combined)} rows → {out}")


if __name__ == "__main__":
    main()