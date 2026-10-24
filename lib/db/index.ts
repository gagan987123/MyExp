import { File, Paths } from "expo-file-system";
import { copyAsync } from "expo-file-system/legacy";

export const DATABASE_NAME = "expenses.db";

/** Must match the App Group in app.json + the Swift intent. */
export const APP_GROUP_ID = "group.com.gagan987123.myexp";

/**
 * Returns the shared App Group directory when available (device builds
 * with the entitlement), otherwise undefined (default sandbox dir).
 * On first shared run, migrates the existing sandbox database file over,
 * so no expenses are lost in the move. One file, one truth, both targets.
 */
export async function resolveDatabaseDirectory(): Promise<string | undefined> {
  try {
    const shared = Paths.appleSharedContainers?.[APP_GROUP_ID];
    if (!shared) return undefined;
    const dest = new File(shared, DATABASE_NAME);
    if (!dest.exists) {
      const legacy = new File(Paths.document, "SQLite", DATABASE_NAME);
      if (legacy.exists) {
        await copyAsync({ from: legacy.uri, to: dest.uri });
      }
    }
    return shared.uri;
  } catch {
    return undefined;
  }
}

export { migrateDbIfNeeded } from "./migrations";
