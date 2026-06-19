/**
 * invoke.ts — Drop-in replacement for @tauri-apps/api/core `invoke()`
 *
 * Routes every command either to the WASM engine (game logic) or to the
 * IndexedDB persistence layer (saves, profiles, settings).
 *
 * Usage: replace every `import { invoke } from "invoke"`
 * with    `import { invoke } from "./wasmLoader"`
 */

import { getWasm } from "./wasmLoader";
import * as db from "../persistence/indexedDb";

export async function invoke<T = unknown>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const wasm = await getWasm();

  // 1. Try the WASM engine first
  try {
    const result = wasm.invoke(command, args ?? {});
    return result as T;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    // Engine signals that this command is persistence-only
    if (msg.startsWith("PASSTHROUGH:")) {
      return handlePersistenceCommand<T>(command, args ?? {});
    }

    throw new Error(msg);
  }
}

// ── Persistence-only commands (IndexedDB) ─────────────────────────────────

async function handlePersistenceCommand<T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  switch (command) {
    // ── Manager profiles ───────────────────────────────────────────────
    case "get_manager_profiles":
      return (await db.getAllManagerProfiles()) as T;

    case "save_manager_profile": {
      const profile = args.profile as db.ManagerProfile;
      await db.saveManagerProfile(profile);
      return null as T;
    }
    case "update_manager_profile": {
      const profile = args.profile as db.ManagerProfile;
      await db.saveManagerProfile(profile);
      return null as T;
    }
    case "delete_manager_profile": {
      await db.deleteManagerProfile(args.profileId as string);
      return null as T;
    }
    case "touch_manager_profile": {
      await db.touchManagerProfile(args.profileId as string);
      return null as T;
    }

    // ── Saves ──────────────────────────────────────────────────────────
    case "get_saves":
      return (await db.getAllSaves()) as T;

    case "save_game": {
      const wasm = await getWasm();
      const snapshot = wasm.export_game_snapshot();
      const entry: db.SaveEntry = {
        id: args.saveId as string ?? crypto.randomUUID(),
        name: args.saveName as string ?? "Save",
        manager_name: args.managerName as string ?? "",
        team_name: args.teamName as string ?? "",
        created_at: new Date().toISOString(),
        last_played_at: new Date().toISOString(),
        snapshot,
      };
      await db.upsertSave(entry);
      return null as T;
    }
    case "load_game": {
      const save = await db.getSave(args.saveId as string);
      if (!save) throw new Error("be.error.saveNotFound");
      const wasm = await getWasm();
      const gs = wasm.load_game_from_snapshot(save.snapshot);
      return gs as T;
    }
    case "delete_save": {
      await db.deleteSave(args.saveId as string);
      return null as T;
    }
    case "clear_all_saves": {
      await db.clearAllSaves();
      return null as T;
    }

    // ── World databases (bundled JSON files served as static assets) ───
    case "list_world_databases": {
      // World databases are bundled in /public/worlds/
      const index = await fetch("/worlds/index.json").then((r) => r.json());
      return index as T;
    }
    case "export_world_database":
    case "write_temp_database":
      // Not applicable in web version
      return null as T;

    default:
      throw new Error(`be.error.unknownCommand:${command}`);
  }
}
