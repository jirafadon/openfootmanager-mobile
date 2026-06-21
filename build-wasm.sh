#!/usr/bin/env bash
set -euo pipefail

# Asegurar que estamos en la raíz del proyecto
cd "$(dirname "$0")"
ROOT_DIR="$(pwd)"
OUT_DIR="$ROOT_DIR/public/wasm"

mkdir -p "$OUT_DIR"

echo "🦀 Iniciando compilación Rust → WebAssembly..."

# Compilar usando wasm-pack
# Forzamos el directorio del crate para evitar ambigüedades
cd "$ROOT_DIR/src/wasm/ofm_engine_wasm"

wasm-pack build \
  --target web \
  --out-dir "$OUT_DIR" \
  --out-name "ofm_engine_wasm" \
  --release \
  --no-typescript

# Limpieza de artefactos de wasm-pack no necesarios para el despliegue
cd "$OUT_DIR"
rm -f package.json .gitignore README.md

echo "✅ Compilación completada con éxito."
echo "Archivos generados en public/wasm/:"
ls -lh "$OUT_DIR"
