#!/usr/bin/env bash
# build-wasm.sh — Compile the Rust engine to WebAssembly
#
# Prerequisites:
#   cargo install wasm-pack
#   rustup target add wasm32-unknown-unknown
#
# Run from the project root (ofm-pwa/):
#   chmod +x build-wasm.sh && ./build-wasm.sh

set -euo pipefail

WASM_CRATE="src/wasm/ofm_engine_wasm"
OUT_DIR="public/wasm"

echo "🦀 Building Rust → WebAssembly..."
wasm-pack build \
  "$WASM_CRATE" \
  --target web \
  --out-dir "../../../${OUT_DIR}" \
  --out-name "ofm_engine_wasm" \
  --release \
  --no-typescript

echo "✅ WASM output → ${OUT_DIR}/"
echo ""
echo "Files generated:"
ls -lh "$OUT_DIR"

echo ""
echo "🌐 You can now run: npm run dev"
