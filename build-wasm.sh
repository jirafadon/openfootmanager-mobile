#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(pwd)"
OUT_DIR="$ROOT_DIR/public/wasm"
mkdir -p "$OUT_DIR"

echo "🦀 Compilando Rust → WebAssembly..."
# Ejecutamos wasm-pack desde el directorio del crate
cd "$ROOT_DIR/src/wasm/ofm_engine_wasm"
wasm-pack build \
  --target web \
  --out-dir "$OUT_DIR" \
  --out-name "ofm_engine_wasm" \
  --release \
  --no-typescript

# Limpiar archivos innecesarios de wasm-pack
cd "$OUT_DIR"
rm -f package.json .gitignore README.md

echo "✅ Listo. Archivos generados en $OUT_DIR"
ls -lh "$OUT_DIR"
