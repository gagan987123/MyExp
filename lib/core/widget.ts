import type { SQLiteDatabase } from "expo-sqlite";
import { reloadWidgetTimelines } from "widget-reload";

/** Flush the shared DB so the readonly widget reader sees this write,
 * then nudge WidgetKit. Fire-and-forget; warns in dev instead of
 * swallowing failures silently. */
export function pokeWidget(db: SQLiteDatabase): void {
  (async () => {
    try {
      await db.execAsync("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch {
      // DELETE-mode DBs have nothing to checkpoint — proceed to reload.
    }
    try {
      await reloadWidgetTimelines();
    } catch (e) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[widget] reloadTimelines failed", e);
      }
    }
  })();
}
