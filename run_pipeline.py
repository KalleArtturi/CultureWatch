"""Run the whole CultureWatch pipeline with one command:  python run_pipeline.py
Stops at the first failing step, so bad data never reaches the outputs."""
import runpy
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent

STEPS = [
    ("Preprocess raw data", "preprocess.py"),
    ("Antibiograms", "antibiogram.py"),
    ("Treatment guide", "treatment_guide.py"),
    ("Hospital & trends", "hospital_trends.py"),
]


def main():
    start = time.time()
    for k, (name, script) in enumerate(STEPS, 1):
        print(f"\n{'=' * 60}\n[{k}/{len(STEPS)}] {name}  ({script})\n{'=' * 60}")
        t0 = time.time()
        try:
            runpy.run_path(str(ROOT / script), run_name="__main__")  # runs the script as if started directly
        except Exception as e:
            print(f"\nPIPELINE STOPPED at step {k} ({name}):\n{type(e).__name__}: {e}")
            sys.exit(1)
        print(f"--> done in {time.time() - t0:.1f}s")
    print(f"\nPipeline finished in {time.time() - start:.1f}s. Results in outputs/, app reads data/processed/.")


if __name__ == "__main__":
    main()