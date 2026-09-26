import type { SQLiteDatabase } from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import { deleteKv, getKv, setKv } from "./queries";

const KEY_ITEM = "openrouter_api_key";
const ENABLED_ITEM = "ai_siri_enabled";

const KV_ENABLED = "ai-enabled";
const KV_KEY = "ai-key";

/** The key, or null when never saved. Lives in the system keychain. */
export async function getAiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY_ITEM);
  } catch {
    return null;
  }
}

export async function isAiEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ENABLED_ITEM)) === "1";
  } catch {
    return false;
  }
}

export async function setAiEnabled(
  db: SQLiteDatabase,
  on: boolean
): Promise<void> {
  await SecureStore.setItemAsync(ENABLED_ITEM, on ? "1" : "0");
  try {
    if (on) await setKv(db, KV_ENABLED, "1");
    else await deleteKv(db, KV_ENABLED);
  } catch {
    // Shared DB unavailable (Expo Go): app-side toggle still applies.
  }
}

/**
 * Saves to the keychain AND mirrors into the shared database where the
 * Siri intent (separate sandbox) reads it. Personal-use tradeoff, stated
 * in Settings.
 */
export async function saveAiKey(
  db: SQLiteDatabase,
  key: string
): Promise<void> {
  const clean = key.trim();
  if (!clean) throw new Error("Paste a key first.");
  await SecureStore.setItemAsync(KEY_ITEM, clean);
  try {
    await setKv(db, KV_KEY, clean);
  } catch {
    // Shared DB unavailable (Expo Go): app-side AI still works,
    // Siri falls back to keyword rules.
  }
}

export async function clearAiKey(db: SQLiteDatabase): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_ITEM);
  } catch {}
  try {
    await SecureStore.deleteItemAsync(ENABLED_ITEM);
  } catch {}
  try {
    await deleteKv(db, KV_KEY);
  } catch {}
  try {
    await deleteKv(db, KV_ENABLED);
  } catch {}
}

/**
 * Self-heal: if the toggle/key exist in the keychain but the shared
 * mirrors are missing (old install, wiped folder), rewrite them so Siri
 * never silently degrades to word-list mode. Runs on every app start.
 */
export async function syncSharedAiFiles(db: SQLiteDatabase): Promise<void> {
  try {
    const [on, key] = await Promise.all([
      SecureStore.getItemAsync(ENABLED_ITEM),
      SecureStore.getItemAsync(KEY_ITEM),
    ]);
    if (on !== "1" || !key) return;
    try {
      await setKv(db, KV_ENABLED, "1");
    } catch {}
    try {
      await setKv(db, KV_KEY, key);
    } catch {}
  } catch {
    // best effort only
  }
}

/**
 * Diagnostic: what does the Siri side actually see? Shows whether the
 * shared mirrors exist in the database Siri reads.
 */
export async function diagnoseSharedAiFiles(
  db: SQLiteDatabase
): Promise<{ dir: boolean; flag: boolean; key: boolean }> {
  const out = { dir: false, flag: false, key: false };
  try {
    out.dir = true;
    out.flag = (await getKv(db, KV_ENABLED)) === "1";
    out.key = (await getKv(db, KV_KEY)) != null;
  } catch {}
  return out;
}
