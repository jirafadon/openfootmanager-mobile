#!/usr/bin/env bash
set -euo pipefail
OUT_DIR="$(pwd)/public/wasm"
mkdir -p "$OUT_DIR"
echo "🦀 Compilando Rust → WebAssembly..."
cd src/wasm
wasm-pack build ofm_engine_wasm \
  --target web \
  --out-dir "../../public/wasm" \
  --out-name "ofm_engine_wasm" \
  --release \
  --no-typescript
cd ../..
rm -f "$OUT_DIR/package.json" "$OUT_DIR/.gitignore" "$OUT_DIR/README.md"
echo "✅ Listo"
