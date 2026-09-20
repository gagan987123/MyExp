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
import Foundation
import SQLite3

/// "Hey Siri, log expense in MyExp" — saves DIRECTLY to the shared
/// App Group SQLite file. The app stays closed; no JavaScript runs.
/// Same table and rules as the React Native side (single source of truth).
struct AddExpenseIntent: AppIntent {
  static var title: LocalizedStringResource = "Log expense in MyExp"
  static var description = IntentDescription(
    "Adds an expense to MyExp.",
    categoryName: "Finance"
  )

  @Parameter(title: "Amount", description: "How much was spent, in rupees.")
  var amount: Double

  @Parameter(title: "Note", description: "What it was for, e.g. chai.")
  var note: String

  @Parameter(title: "Category", description: "Optional. Food, Petrol, Transport, Shopping, Bills, Entertainment, Health, Travel or Other. Guessed from the note when skipped.")
  var category: String?

  static var parameterSummary: some ParameterSummary {
    Summary("Log an expense") {
      \\.$amount
      \\.$note
      \\.$category
    }
  }

  // Deterministic keyword rules (no AI) — mirrors matchCategory()
  // in lib/service.ts. Keep the two lists in sync.
  static func resolveCategory(note: String, hint: String?) -> String {
    let ids = ["food", "transport", "petrol", "shopping", "bills", "entertainment", "health", "travel", "other"]
    if let hint {
      let key = hint.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      if ids.contains(key) { return key }
      for id in ids {
        if id == key { return id }
      }
      let aliases: [String: String] = [
        "gas": "petrol", "fuel": "petrol", "diesel": "petrol",
        "cab": "transport", "taxi": "transport", "auto": "transport",
        "bus": "transport", "metro": "transport", "train": "transport",
        "flight": "travel", "hotel": "travel",
        "movie": "entertainment", "movies": "entertainment",
        "medicine": "health", "medical": "health", "doctor": "health",
        "hospital": "health", "groceries": "food", "grocery": "food",
        "restaurant": "food", "coffee": "food", "chai": "food",
        "lunch": "food", "dinner": "food", "breakfast": "food",
        "snacks": "food", "uber": "transport", "ola": "transport",
        "electricity": "bills", "water": "bills", "rent": "bills",
        "internet": "bills", "recharge": "bills", "mobile": "bills",
        "clothes": "shopping", "clothing": "shopping", "shoes": "shopping",
      ]
      if let hit = aliases[key] { return hit }
    }
    let text = note.lowercased()
    let rules: [(String, String)] = [
      ("petrol", "petrol"), ("diesel", "petrol"), ("fuel", "petrol"), ("gas", "petrol"),
      ("uber", "transport"), ("ola", "transport"), ("cab", "transport"), ("taxi", "transport"),
      ("auto", "transport"), ("bus", "transport"), ("metro", "transport"), ("train", "transport"),
      ("flight", "travel"), ("hotel", "travel"),
      ("movie", "entertainment"),
      ("medicine", "health"), ("medical", "health"), ("doctor", "health"), ("hospital", "health"), ("pharmacy", "health"),
      ("chai", "food"), ("coffee", "food"), ("lunch", "food"), ("dinner", "food"),
      ("breakfast", "food"), ("snack", "food"), ("restaurant", "food"), ("grocery", "food"),
      ("groceries", "food"), ("food", "food"), ("eat", "food"), ("meal", "food"),
      ("bill", "bills"), ("electricity", "bills"), ("rent", "bills"), ("recharge", "bills"),
      ("shop", "shopping"), ("clothes", "shopping"), ("shoe", "shopping"),
    ]
    for (keyword, category) in rules {
      if text.contains(keyword) { return category }
    }
    return "other"
  }

  static func sharedDatabaseURL() throws -> URL {
    guard let dir = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: "group.com.gagan987123.myexp"
    ) else {
      throw AddExpenseError.noSharedContainer
    }
    return dir.appendingPathComponent("expenses.db")
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    guard amount.isFinite && amount > 0 else {
      throw AddExpenseError.invalidAmount
    }
    let finalCategory = Self.resolveCategory(note: note, hint: category)
    let now = ISO8601DateFormatter().string(from: Date())
    let id = UUID().uuidString
    let cleanNote = note.trimmingCharacters(in: .whitespacesAndNewlines)

    let url = try Self.sharedDatabaseURL()
    var db: OpaquePointer?
    guard sqlite3_open_v2(url.path, &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK else {
      throw AddExpenseError.cannotOpenDatabase
    }
    defer { sqlite3_close(db) }
    sqlite3_busy_timeout(db, 5000)
    let create = """
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        note TEXT,
        date TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      """
    guard sqlite3_exec(db, create, nil, nil, nil) == SQLITE_OK else {
      throw AddExpenseError.writeFailed
    }
    let insert = "INSERT INTO expenses (id, amount, category, note, date, created_at) VALUES (?, ?, ?, ?, ?, ?);"
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, insert, -1, &stmt, nil) == SQLITE_OK else {
      throw AddExpenseError.writeFailed
    }
    defer { sqlite3_finalize(stmt) }
    sqlite3_bind_text(stmt, 1, (id as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    sqlite3_bind_double(stmt, 2, amount)
    sqlite3_bind_text(stmt, 3, (finalCategory as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    if cleanNote.isEmpty {
      sqlite3_bind_null(stmt, 4)
    } else {
      sqlite3_bind_text(stmt, 4, (cleanNote as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    }
    sqlite3_bind_text(stmt, 5, (now as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    sqlite3_bind_text(stmt, 6, (now as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    guard sqlite3_step(stmt) == SQLITE_DONE else {
      throw AddExpenseError.writeFailed
    }
    return .result(dialog: "Saved \\(Int(amount)) rupees for \\(cleanNote.isEmpty ? finalCategory : cleanNote).")
  }
}

enum AddExpenseError: Error, CustomLocalizedStringResourceConvertible {
  case noSharedContainer
  case cannotOpenDatabase
  case writeFailed
  case invalidAmount

  var localizedStringResource: LocalizedStringResource {
    switch self {
    case .noSharedContainer: return "MyExp shared storage isn't available."
    case .cannotOpenDatabase: return "Couldn't open the expense database."
    case .writeFailed: return "Couldn't save the expense."
    case .invalidAmount: return "The amount must be above zero."
    }
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
