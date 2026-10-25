import WidgetKit
import ExpoModulesCore

public class WidgetReloadModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WidgetReload")

    AsyncFunction("reloadTimelines") { (kind: String) in
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
      }
    }
  }
}
