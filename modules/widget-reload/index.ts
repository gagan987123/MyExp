import { requireNativeModule } from "expo-modules-core";
import { widget } from "../../config";

type WidgetReloadModuleType = {
  reloadTimelines: (kind: string) => Promise<void>;
};

/**
 * Asks iOS to redraw the MyExp widget now. Safe to call anywhere:
 * resolves silently on platforms/builds without the native module
 * (Expo Go) or when widgets are unavailable.
 */
export async function reloadWidgetTimelines(
  kind: string = widget.kind
): Promise<void> {
  try {
    const mod =
      requireNativeModule<WidgetReloadModuleType>("WidgetReload");
    await mod.reloadTimelines(kind);
  } catch {
    // No native module (Expo Go) or reload denied — widget falls back
    // to its scheduled timeline refreshes.
  }
}
