#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WASM_CRATE="${SCRIPT_DIR}/src/wasm/ofm_engine_wasm"
OUT_DIR="${SCRIPT_DIR}/public/wasm"

mkdir -p "$OUT_DIR"

echo "🦀 Compilando Rust → WebAssembly..."
wasm-pack build \
  "$WASM_CRATE" \
  --target web \
  --out-dir "$OUT_DIR" \
  --out-name "ofm_engine_wasm" \
  --release \
  --no-typescript

rm -f "$OUT_DIR/package.json" "$OUT_DIR/.gitignore" "$OUT_DIR/README.md"

echo "✅ WASM generado en ${OUT_DIR}/"
ls -lh "$OUT_DIR"