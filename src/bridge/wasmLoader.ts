/**
 * wasmLoader.ts — Lazy singleton loader for the WASM engine module.
 *
 * The WASM binary is compiled from src/wasm/ofm_engine_wasm with wasm-pack
 * and placed in /public/wasm/ofm_engine_wasm.js + .wasm.
 * We load it once and cache the instance.
 */

export interface OFMEngineWasm {
  invoke(command: string, args: unknown): unknown;
  start_new_game(worldJson: string, options: unknown): unknown;
  load_game_from_snapshot(snapshotJson: string): unknown;
  export_game_snapshot(): string;
  get_player_advanced_stats(playerId: string): unknown;
  get_player_recent_matches(playerId: string): unknown;
  get_renewal_projection(playerId: string): unknown;
}

let wasmInstance: OFMEngineWasm | null = null;
let loadPromise: Promise<OFMEngineWasm> | null = null;

export async function getWasm(): Promise<OFMEngineWasm> {
  if (wasmInstance) return wasmInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // Dynamic import — Vite will handle the /public asset reference
    const module = await import(/* @vite-ignore */ "/wasm/ofm_engine_wasm.js");
    // wasm-pack generated init() must be called before using exports
    await module.default();
    wasmInstance = module as unknown as OFMEngineWasm;
    return wasmInstance;
  })();

  return loadPromise;
}

/** Preload the WASM module in the background (call on app mount). */
export function preloadWasm(): void {
  void getWasm();
}
