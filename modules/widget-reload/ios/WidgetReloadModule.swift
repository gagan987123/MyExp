import WidgetKit
import ExpoModulesCore

public class WidgetReloadModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WidgetReload")

    AsyncFunction("reloadTimelines") {
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadTimelines(ofKind: "MyExpWidget")
      }
    }
  }
}
