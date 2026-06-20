#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(pwd)"
OUT_DIR="$ROOT_DIR/public/wasm"
mkdir -p "$OUT_DIR"

echo "🦀 Compilando Rust → WebAssembly..."
# Ejecutamos wasm-pack desde el directorio del crate para evitar problemas de ruta
cd "$ROOT_DIR/src/wasm/ofm_engine_wasm"
wasm-pack build \
  --target web \
  --out-dir "$OUT_DIR" \
  --out-name "ofm_engine_wasm" \
  --release \
  --no-typescript

cd "$ROOT_DIR"
rm -f "$OUT_DIR/package.json" "$OUT_DIR/.gitignore" "$OUT_DIR/README.md"
echo "✅ Listo"
