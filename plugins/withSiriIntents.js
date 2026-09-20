const fs = require("fs");
const path = require("path");
const { withXcodeProject } = require("@expo/config-plugins");

const SCENE_DELEGATE_SWIFT = `import UIKit

/// Attaches the window created by AppDelegate to the connecting scene.
/// Required on the iOS 27 SDK, which traps at launch for apps that declare
/// no scene adoption (NoSceneLifecycleAdoption). The React Native view
/// hierarchy itself is still built by AppDelegate / ExpoReactNativeFactory.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let window = appDelegate.window
    else { return }
    window.windowScene = windowScene
    window.makeKeyAndVisible()
  }
}
`;

const ADD_EXPENSE_INTENT_SWIFT = `import AppIntents
import UIKit

enum AddExpenseError: Error {
  case badURL
}

/// "Hey Siri, log expense in MyExp"
/// Collects amount / category / note via Siri dialog, then opens the app
/// through the system OpenURLIntent so the deep-link URL is reliably
/// delivered (a manual UIApplication.shared.open from intent context loses
/// it). The app saves through the SAME expenseService.addExpense().
struct AddExpenseIntent: AppIntent {
  static var title: LocalizedStringResource = "Log expense in MyExp"
  static var description = IntentDescription(
    "Adds an expense to MyExp.",
    categoryName: "Finance"
  )

  @Parameter(title: "Amount", description: "How much was spent, in rupees.")
  var amount: Double

  @Parameter(title: "Category", description: "Food, Petrol, Transport, Shopping, Bills, Entertainment, Health, Travel or Other.")
  var category: String?

  @Parameter(title: "Note", description: "Optional note, e.g. chai.")
  var note: String?

  static var parameterSummary: some ParameterSummary {
    Summary("Log an expense") {
      \\.$amount
      \\.$category
      \\.$note
    }
  }

  @MainActor
  func perform() async throws -> some IntentResult & OpensIntent {
    var items = [URLQueryItem(name: "amount", value: String(amount))]
    if let category, !category.isEmpty {
      items.append(URLQueryItem(name: "category", value: category))
    }
    if let note, !note.isEmpty {
      items.append(URLQueryItem(name: "note", value: note))
    }
    items.append(URLQueryItem(name: "save", value: "1"))
    var components = URLComponents()
    components.scheme = "expensetracker"
    components.host = "add-expense"
    components.queryItems = items
    guard let url = components.url else {
      throw AddExpenseError.badURL
    }
    return .result(opensIntent: OpenURLIntent(url))
  }
}
`;

const SHORTCUTS_SWIFT = `import AppIntents

/// Exposes "Hey Siri, log expense in MyExp" without any manual Shortcut.
struct MyExpShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AddExpenseIntent(),
      phrases: [
        "Log expense in \\(.applicationName)",
        "Add expense in \\(.applicationName)",
      ],
      shortTitle: "Log expense",
      systemImageName: "indianrupeesign.circle"
    )
  }
}
`;

const SWIFT_FILES = {
  "SceneDelegate.swift": SCENE_DELEGATE_SWIFT,
  "AddExpenseIntent.swift": ADD_EXPENSE_INTENT_SWIFT,
  "MyExpShortcuts.swift": SHORTCUTS_SWIFT,
};

/**
 * Writes our Swift sources into ios/<AppGroup>/ and adds them to the Xcode
 * target on every prebuild, so `npx expo prebuild` never drops them again.
 */
module.exports = function withSiriIntents(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectRoot = config.modRequest.projectRoot;

    // Find the PBXGroup that contains AppDelegate.swift.
    const groups = project.hash.project.objects.PBXGroup || {};
    let appGroupKey = null;
    let appGroupName = null;
    for (const [key, group] of Object.entries(groups)) {
      if (key.endsWith("_comment")) continue;
      const children = group.children || [];
      const hasDelegate = children.some(
        (c) => c.comment && c.comment.includes("AppDelegate.swift")
      );
      if (hasDelegate) {
        appGroupKey = key;
        appGroupName = group.name;
        break;
      }
    }
    if (!appGroupKey) {
      console.warn("[withSiriIntents] App group not found, skipping.");
      return config;
    }

    const target = project.getFirstTarget().uuid;
    for (const [fileName, contents] of Object.entries(SWIFT_FILES)) {
      const filePath = path.join(
        projectRoot,
        "ios",
        appGroupName,
        fileName
      );
      fs.writeFileSync(filePath, contents);
      const alreadyAdded = Object.values(
        project.hash.project.objects.PBXFileReference || {}
      ).some(
        (ref) =>
          typeof ref === "object" &&
          ref.path &&
          ref.path.endsWith(fileName)
      );
      if (!alreadyAdded) {
        project.addSourceFile(
          `${appGroupName}/${fileName}`,
          { target },
          appGroupKey
        );
      }
    }
    return config;
  });
};
