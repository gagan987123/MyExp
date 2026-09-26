import * as SecureStore from "expo-secure-store";
import { File, Paths } from "expo-file-system";
import { deleteAsync, writeAsStringAsync } from "expo-file-system/legacy";
import { APP_GROUP_ID } from "./db";

const KEY_ITEM = "openrouter_api_key";
const ENABLED_ITEM = "ai_siri_enabled";
const SHARED_FILE = "ai-key.txt";
const SHARED_FLAG = "ai-enabled.txt";

function sharedKeyUri(): string | null {
  try {
    const shared = Paths.appleSharedContainers?.[APP_GROUP_ID];
    if (!shared) return null;
    return new File(shared, SHARED_FILE).uri;
  } catch {
    return null;
  }
}

function sharedFlagUri(): string | null {
  try {
    const shared = Paths.appleSharedContainers?.[APP_GROUP_ID];
    if (!shared) return null;
    return new File(shared, SHARED_FLAG).uri;
  } catch {
    return null;
  }
}

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

export async function setAiEnabled(on: boolean): Promise<void> {
  await SecureStore.setItemAsync(ENABLED_ITEM, on ? "1" : "0");
  const uri = sharedFlagUri();
  if (!uri) return;
  try {
    if (on) await writeAsStringAsync(uri, "1");
    else await deleteAsync(uri);
  } catch {
    // Shared folder unavailable: app-side toggle still applies.
  }
}

/**
 * Saves to the keychain AND drops a copy in the shared folder so the
 * Siri intent (separate sandbox) can spend paise with your permission.
 * Personal-use tradeoff, stated in Settings.
 */
export async function saveAiKey(key: string): Promise<void> {
  const clean = key.trim();
  if (!clean) throw new Error("Paste a key first.");
  await SecureStore.setItemAsync(KEY_ITEM, clean);
  const uri = sharedKeyUri();
  if (uri) {
    try {
      await writeAsStringAsync(uri, clean);
    } catch {
      // Shared folder unavailable (Expo Go): app-side AI still works,
      // Siri falls back to keyword rules.
    }
  }
}

export async function clearAiKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_ITEM);
  } catch {}
  try {
    await SecureStore.deleteItemAsync(ENABLED_ITEM);
  } catch {}
  const keyUri = sharedKeyUri();
  if (keyUri) {
    try {
      await deleteAsync(keyUri);
    } catch {}
  }
  const flagUri = sharedFlagUri();
  if (flagUri) {
    try {
      await deleteAsync(flagUri);
    } catch {}
  }
}

/**
 * Diagnostic: what does the Siri side actually see? Shows whether the
 * shared folder resolves and whether the flag/key copies exist there.
 */
export async function diagnoseSharedAiFiles(): Promise<{
  dir: boolean;
  flag: boolean;
  key: boolean;
}> {
  const out = { dir: false, flag: false, key: false };
  try {
    const shared = Paths.appleSharedContainers?.[APP_GROUP_ID];
    if (!shared) return out;
    out.dir = true;
    try {
      out.flag = new File(shared, SHARED_FLAG).exists;
    } catch {}
    try {
      out.key = new File(shared, SHARED_FILE).exists;
    } catch {}
  } catch {}
  return out;
}
export async function syncSharedAiFiles(): Promise<void> {
  try {
    const [on, key] = await Promise.all([
      SecureStore.getItemAsync(ENABLED_ITEM),
      SecureStore.getItemAsync(KEY_ITEM),
    ]);
    if (on !== "1" || !key) return;
    const flagUri = sharedFlagUri();
    if (flagUri) {
      try {
        await writeAsStringAsync(flagUri, "1");
      } catch {}
    }
    const keyUri = sharedKeyUri();
    if (keyUri) {
      try {
        await writeAsStringAsync(keyUri, key);
      } catch {}
    }
  } catch {
    // best effort only
  }
}
