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
import WidgetKit

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

  @Parameter(title: "Category", description: "Optional. Food, Petrol, Transport, Shopping, Bills, Entertainment, Health, Travel, Salary or Other. Guessed from the note when skipped.")
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
    let ids = ["food", "transport", "petrol", "shopping", "bills", "entertainment", "health", "travel", "salary", "other"]
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
        "salary": "salary", "pay": "salary", "paycheck": "salary",
        "income": "salary", "wages": "salary",
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
      ("salary", "salary"), ("pay", "salary"), ("income", "salary"), ("wage", "salary"),
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

  /// User-created categories from the shared table. Checked before the
  /// keyword rules so a "Chai" category beats the food rule for "chai".
  /// Returns id + kind (customs can be income too).
  static func fetchCustoms(db: OpaquePointer?) -> [(String, String, String)] {
    var rows: [(String, String, String)] = []
    let sql = "SELECT id, name, kind FROM categories;"
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
      return rows
    }
    defer { sqlite3_finalize(stmt) }
    while sqlite3_step(stmt) == SQLITE_ROW {
      let id = String(cString: sqlite3_column_text(stmt, 0))
      let name = String(cString: sqlite3_column_text(stmt, 1))
      let kind = String(cString: sqlite3_column_text(stmt, 2))
      rows.append((id, name, kind))
    }
    return rows
  }

  static func matchCustom(_ rows: [(String, String, String)], hint: String?, note: String) -> (String, String)? {
    if let hint {
      let key = hint.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      if !key.isEmpty {
        for (id, name, kind) in rows {
          if id.lowercased() == key || name.lowercased() == key { return (id, kind) }
        }
      }
    }
    let text = note.lowercased()
    for (id, name, kind) in rows {
      let n = name.lowercased()
      if n.count >= 3 && text.contains(n) { return (id, kind) }
    }
    return nil
  }

  static let defaultNames: [String: String] = [
    "food": "Food", "transport": "Transport", "petrol": "Petrol",
    "shopping": "Shopping", "bills": "Bills", "entertainment": "Entertainment",
    "health": "Health", "travel": "Travel", "salary": "Salary", "other": "Other",
  ]

  /// AI categorization via Jev. Reads toggle + key from the shared folder,
  /// 5s timeout, min 70% confidence. Any failure → nil (keyword rules win).
  static func tryAiCategory(note: String, customs: [(String, String, String)]) async -> (String?, String) {
    guard let dir = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: "group.com.gagan987123.myexp"
    ) else { return (nil, "nocontainer") }
    let flag = dir.appendingPathComponent("ai-enabled.txt")
    let keyFile = dir.appendingPathComponent("ai-key.txt")
    guard FileManager.default.fileExists(atPath: flag.path) else { return (nil, "off") }
    guard let key = try? String(contentsOf: keyFile, encoding: .utf8),
      !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { return (nil, "nokey") }
    var criteria = defaultNames
    for (id, name, _) in customs { criteria[id] = name }
    let body: [String: Any] = [
      "model": "typesafe/jev-1.13",
      "state": "User spent money on: \\(note)",
      "questions": [
        "category": [
          "type": "choice",
          "instructions": "Which expense category fits best?",
          "criteria": criteria,
        ]
      ],
    ]
    guard let payload = try? JSONSerialization.data(withJSONObject: body) else { return (nil, "badjson") }
    let sessionConfig = URLSessionConfiguration.default
    sessionConfig.waitsForConnectivity = true
    sessionConfig.timeoutIntervalForRequest = 15
    sessionConfig.timeoutIntervalForResource = 20
    let session = URLSession(configuration: sessionConfig)
    var request = URLRequest(url: URL(string: "https://openrouter.ai/api/alpha/decisions")!)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("Bearer \\(key.trimmingCharacters(in: .whitespacesAndNewlines))", forHTTPHeaderField: "Authorization")
    request.httpBody = payload
    request.timeoutInterval = 15
    guard let (data, response) = try? await session.data(for: request) else { return (nil, "netfail") }
    guard let http = response as? HTTPURLResponse else { return (nil, "noresponse") }
    guard http.statusCode == 200 else { return (nil, "http\\(http.statusCode)") }
    guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let answers = json["answers"] as? [String: Any],
      let pick = answers["category"] as? [String: Any],
      let choice = pick["choice"] as? String,
      criteria[choice] != nil
    else { return (nil, "badanswer") }
    let confidence = (pick["confidence"] as? Double) ?? 0
    if confidence < 0.7 { return (nil, "lowconf\\(Int(confidence * 100))") }
    return (choice, "AI")
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    guard amount.isFinite && amount > 0 else {
      throw AddExpenseError.invalidAmount
    }
    var finalCategory = Self.resolveCategory(note: note, hint: category)
    var aiTag = "rules:keywords"
    let now = ISO8601DateFormatter().string(from: Date())
    let id = UUID().uuidString
    let cleanNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
    var finalKind = finalCategory == "salary" ? "income" : "expense"

    let url = try Self.sharedDatabaseURL()
    var db: OpaquePointer?
    guard sqlite3_open_v2(url.path, &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK else {
      throw AddExpenseError.cannotOpenDatabase
    }
    defer { sqlite3_close(db) }
    sqlite3_busy_timeout(db, 5000)
    let customs = Self.fetchCustoms(db: db)
    if let custom = Self.matchCustom(customs, hint: category, note: note) {
      finalCategory = custom.0
      finalKind = custom.1 == "income" ? "income" : "expense"
    } else {
      let aiRes = await Self.tryAiCategory(note: note, customs: customs)
      aiTag = "rules:" + aiRes.1
      if let aiPick = aiRes.0 {
        finalCategory = aiPick
        if aiPick == "salary" {
          finalKind = "income"
        } else {
          for (id, _, kind) in customs where id == aiPick {
            finalKind = kind == "income" ? "income" : "expense"
          }
        }
        aiTag = "AI"
      }
    }
    let create = """
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        note TEXT,
        date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'expense'
      );
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'expense',
        created_at TEXT NOT NULL
      );
      """
    guard sqlite3_exec(db, create, nil, nil, nil) == SQLITE_OK else {
      throw AddExpenseError.writeFailed
    }
    let insert = "INSERT INTO expenses (id, amount, category, note, date, created_at, kind) VALUES (?, ?, ?, ?, ?, ?, ?);"
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
    sqlite3_bind_text(stmt, 7, (finalKind as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    guard sqlite3_step(stmt) == SQLITE_DONE else {
      throw AddExpenseError.writeFailed
    }
    WidgetCenter.shared.reloadTimelines(ofKind: "MyExpWidget")
    let kindWord = finalKind == "income" ? "earned" : "spent"
    return .result(dialog: "Saved \\(Int(amount)) rupees \\(kindWord) for \\(cleanNote.isEmpty ? finalCategory : cleanNote) (\\(aiTag)).")
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
