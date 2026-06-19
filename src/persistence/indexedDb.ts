/**
 * indexedDb.ts — Replaces Tauri's SQLite persistence with IndexedDB (via idb).
 *
 * Database: "ofm-pwa"  |  version: 1
 * Object stores:
 *   - saves          → SaveEntry (keyed by id)
 *   - manager_profiles → ManagerProfile (keyed by id)
 *   - settings       → AppSettings (singleton key = "settings")
 */

import { openDB, DBSchema, IDBPDatabase } from "idb";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SaveEntry {
  id: string;
  name: string;
  manager_name: string;
  team_name: string;
  created_at: string;
  last_played_at: string;
  /** Full JSON game snapshot from wasm.export_game_snapshot() */
  snapshot: string;
}

export interface ManagerProfile {
  id: string;
  first_name: string;
  last_name: string;
  nationality: string;
  date_of_birth: string;
  created_at: string;
  last_used_at: string;
}

interface OFMSchema extends DBSchema {
  saves: {
    key: string;
    value: SaveEntry;
    indexes: { by_last_played: string };
  };
  manager_profiles: {
    key: string;
    value: ManagerProfile;
  };
  settings: {
    key: string;
    value: unknown;
  };
}

// ── DB singleton ──────────────────────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase<OFMSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<OFMSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<OFMSchema>("ofm-pwa", 1, {
      upgrade(db) {
        const savesStore = db.createObjectStore("saves", { keyPath: "id" });
        savesStore.createIndex("by_last_played", "last_played_at");

        db.createObjectStore("manager_profiles", { keyPath: "id" });
        db.createObjectStore("settings", { keyPath: "_key" });
      },
    });
  }
  return dbPromise;
}

// ── Saves ─────────────────────────────────────────────────────────────────

export async function getAllSaves(): Promise<Omit<SaveEntry, "snapshot">[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("saves", "by_last_played");
  // Return metadata only (no snapshot — keeps the list fast)
  return all.reverse().map(({ snapshot: _snap, ...meta }) => meta);
}

export async function getSave(id: string): Promise<SaveEntry | undefined> {
  const db = await getDb();
  return db.get("saves", id);
}

export async function upsertSave(entry: SaveEntry): Promise<void> {
  const db = await getDb();
  await db.put("saves", entry);
}

export async function deleteSave(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("saves", id);
}

export async function clearAllSaves(): Promise<void> {
  const db = await getDb();
  await db.clear("saves");
}

// ── Manager profiles ──────────────────────────────────────────────────────

export async function getAllManagerProfiles(): Promise<ManagerProfile[]> {
  const db = await getDb();
  return db.getAll("manager_profiles");
}

export async function saveManagerProfile(profile: ManagerProfile): Promise<void> {
  const db = await getDb();
  await db.put("manager_profiles", profile);
}

export async function deleteManagerProfile(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("manager_profiles", id);
}

export async function touchManagerProfile(id: string): Promise<void> {
  const db = await getDb();
  const profile = await db.get("manager_profiles", id);
  if (profile) {
    await db.put("manager_profiles", {
      ...profile,
      last_used_at: new Date().toISOString(),
    });
  }
}

// ── Settings ──────────────────────────────────────────────────────────────

export async function getSettings(): Promise<unknown | null> {
  const db = await getDb();
  const record = await db.get("settings", "settings") as { _key: string; value: unknown } | undefined;
  return record?.value ?? null;
}

export async function saveSettings(settings: unknown): Promise<void> {
  const db = await getDb();
  await db.put("settings", { _key: "settings", value: settings });
}

// ── OPFS export helper (optional — for larger saves on supported browsers) ─

export async function exportSaveToOPFS(saveId: string): Promise<void> {
  if (!("storage" in navigator && "getDirectory" in navigator.storage)) {
    console.warn("[ofm-pwa] OPFS not supported; skipping export");
    return;
  }
  const save = await getSave(saveId);
  if (!save) return;

  const root = await navigator.storage.getDirectory();
  const savesDir = await root.getDirectoryHandle("saves", { create: true });
  const fileHandle = await savesDir.getFileHandle(`${saveId}.json`, { create: true });
  const writable = await (fileHandle as FileSystemFileHandle & {
    createWritable(): Promise<FileSystemWritableFileStream>;
  }).createWritable();
  await writable.write(JSON.stringify(save));
  await writable.close();
}
