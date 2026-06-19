# Openfoot Manager — PWA Edition

Conversión de la app de escritorio Tauri a una **Progressive Web App** jugable desde el móvil.

---

## Arquitectura de la conversión

```
┌─────────────────────────────────────────────────────────────┐
│                    ANTES (Tauri)                            │
│                                                             │
│  React + TS  ──invoke()──▶  Rust (nativo)  ──SQLite──▶ 💾  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    DESPUÉS (PWA)                            │
│                                                             │
│  React + TS  ──invoke()──▶  Rust/WASM  +  IndexedDB──▶ 💾  │
│  (sin cambios │  (shim local)  │                            │
│   en lógica)  │                └──► engine corre en browser │
└─────────────────────────────────────────────────────────────┘
```

### Archivos nuevos / modificados

| Archivo | Qué hace |
|---------|----------|
| `src/bridge/invoke.ts` | Reemplaza `@tauri-apps/api/core` → enruta a WASM o IndexedDB |
| `src/bridge/wasmLoader.ts` | Carga el .wasm una sola vez (singleton lazy) |
| `src/bridge/noop.ts` | Stubs de `window`, `event`, `opener` de Tauri |
| `src/persistence/indexedDb.ts` | Reemplaza SQLite → IndexedDB (via `idb`) |
| `src/wasm/ofm_engine_wasm/` | Nuevo crate Rust compilado a WASM con wasm-bindgen |
| `src/components/mobile/MobileBottomNav.tsx` | Navegación inferior para móvil |
| `src/mobile.css` | CSS mobile-first (safe areas, touch targets, bottom nav) |
| `vite.config.ts` | Añade `vite-plugin-pwa` (manifest + service worker) |
| `index.html` | Meta tags PWA + viewport para móvil |
| `package.json` | Eliminadas deps de Tauri, añadidas `idb` y `vite-plugin-pwa` |
| `build-wasm.sh` | Script para compilar Rust → WASM |

---

## Setup rápido (paso a paso)

### 1. Instalar herramientas Rust para WASM

```bash
# Instalar wasm-pack
cargo install wasm-pack

# Añadir target WASM
rustup target add wasm32-unknown-unknown
```

### 2. Compilar el motor de juego a WASM

```bash
# Desde la raíz del proyecto
./build-wasm.sh
```

Esto genera `public/wasm/ofm_engine_wasm.js` y `public/wasm/ofm_engine_wasm_bg.wasm`.

### 3. Instalar dependencias JS

```bash
npm install
```

### 4. Desarrollo local

```bash
npm run dev
# Abrir http://localhost:1420 en el móvil (mismo WiFi)
```

### 5. Build de producción

```bash
npm run build
# El output en dist/ incluye el service worker y manifest PWA
```

### 6. Deploy

Cualquier hosting estático sirve (Vercel, Netlify, GitHub Pages):

```bash
# Ejemplo con Vercel
npx vercel deploy dist/

# Ejemplo con GitHub Pages (gh-pages branch)
npx gh-pages -d dist
```

### 7. Instalar como PWA en el móvil

1. Abrir la URL en Chrome/Safari
2. Chrome Android: menú → "Añadir a pantalla de inicio"
3. Safari iOS: compartir → "Añadir a pantalla de inicio"

---

## Persistencia: cómo funciona IndexedDB

La base de datos `ofm-pwa` en IndexedDB tiene tres object stores:

| Store | Clave | Contenido |
|-------|-------|-----------|
| `saves` | `id` | Snapshot JSON completo del juego (exportado desde WASM) |
| `manager_profiles` | `id` | Perfiles de manager |
| `settings` | `"settings"` | Configuración de la app |

El flujo de guardado es:
1. JS llama `invoke("save_game", { saveId, saveName, ... })`
2. El shim llama `wasm.export_game_snapshot()` → obtiene JSON del estado de memoria
3. Guarda ese JSON en IndexedDB bajo el `saveId`

El flujo de carga es:
1. JS llama `invoke("load_game", { saveId })`
2. El shim lee el JSON de IndexedDB
3. Llama `wasm.load_game_from_snapshot(json)` → restaura estado en memoria

---

## Adaptaciones UI/UX móvil

### Cambios en Tailwind

Patrón **mobile-first**: los estilos base son para pantallas pequeñas.
Los breakpoints `sm:`, `md:`, `lg:` restauran el layout desktop.

```tsx
// ANTES (desktop-first)
<div className="flex flex-row">

// DESPUÉS (mobile-first)
<div className="flex flex-col sm:flex-row">
```

### Bottom navigation

En pantallas < 640px, `DashboardSidebar` se oculta y `MobileBottomNav` toma su lugar:

```tsx
// En DashboardLayout:
<DashboardSidebar className="hidden sm:flex" />  // oculto en mobile
<MobileBottomNav tabs={navTabs} />               // visible en mobile
```

### CSS utilities nuevas (`src/mobile.css`)

- `mobile-bottom-nav` — nav fijo en la parte inferior
- `dashboard-content` — padding-bottom para no quedar tapado por el nav
- `table-responsive` — tablas con scroll horizontal
- `card-grid` — grilla que colapsa a 1 columna en mobile
- `modal-container` — modals como sheet desde abajo en mobile

---

## Notas sobre el crate WASM

El crate `src/wasm/ofm_engine_wasm` reutiliza **sin modificar** los tres crates puros de Rust:
- `domain` — tipos del dominio (Player, Team, etc.)
- `engine` — motor de simulación de partidos
- `ofm_core` — lógica del juego (contratos, fichajes, temporada, etc.)

Solo el crate `db` (SQLite) es **omitido**: la persistencia la maneja IndexedDB en el lado JS.

El `StateManager` de `ofm_core` mantiene el estado del juego en memoria WASM entre llamadas. La serialización/deserialización JSON ocurre solo en save/load.

### Comandos PASSTHROUGH

Algunos comandos (`get_saves`, `save_game`, `load_game`, `get_manager_profiles`, etc.) no tienen implementación en WASM porque involucran persistencia. El motor lanza un error con prefijo `PASSTHROUGH:comando` que el shim intercepta y redirige a `indexedDb.ts`.

---

## Posibles problemas

| Problema | Causa | Solución |
|----------|-------|----------|
| `wasm.invoke is not a function` | WASM no compilado | Ejecutar `./build-wasm.sh` |
| Partidas no guardadas entre sesiones | Safari Private Mode bloquea IndexedDB | Usar modo normal |
| App sin instalar (no PWA) | HTTPS requerido para service worker | Deploy en HTTPS o usar `localhost` |
| `rand` no funciona en WASM | `getrandom` necesita feature `wasm_js` | Ya configurado en Cargo.toml |
| `chrono` no tiene hora en WASM | Necesita feature `wasmbind` | Ya configurado en Cargo.toml |

---

## Diferencias con la versión Tauri

| Feature | Tauri | PWA |
|---------|-------|-----|
| Motor de juego | Rust nativo | Rust/WASM (misma lógica) |
| Persistencia | SQLite (archivos en disco) | IndexedDB (browser storage) |
| Updates | Auto-update de Tauri | Service Worker auto-update |
| Acceso a archivos | Sí (fs plugin) | Solo OPFS (opcional) |
| Notificaciones | Nativas del OS | Web Notifications API |
| Rendimiento | Máximo (nativo) | ~80-90% del nativo (WASM) |
