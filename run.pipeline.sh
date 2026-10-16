#!/usr/bin/env bash
# run_pipeline.sh
set -euo pipefail

ORIG=data/original
GEN=data/generated
MERGED=data/merged

mkdir -p "$ORIG" "$GEN" "$MERGED"

echo "Checksumming original..."
sha256sum "$ORIG"/*.csv > /tmp/original.sha256

echo "Generating..."
python generator.py \
    --real "$ORIG/cultures.csv" \
    --outdir "$GEN" \
    --n 5000 \
    --min-per-cell 2 \
    --seed 42 \
    --start-id 900000

echo "Filtering..."
python filter.py \
    --real "$ORIG/cultures.csv" \
    --generated "$GEN/cultures.csv" \
    --strict

echo "Merging..."
python merge.py \
    --original-dir "$ORIG" \
    --generated-dir "$GEN" \
    --merged-dir "$MERGED"

echo "Verifying original is untouched..."
sha256sum -c /tmp/original.sha256

echo "Done."