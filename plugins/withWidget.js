const fs = require("fs");
const path = require("path");
const { withXcodeProject } = require("@expo/config-plugins");

const WIDGET_BUNDLE_ID = "com.gagan987123.myexp.widget";
const APP_GROUP_ID = "group.com.gagan987123.myexp";
const WIDGET_KIND = "MyExpWidget";
const TARGET_NAME = "MyExpWidget";

const WIDGET_SWIFT = `import SQLite3
import SwiftUI
import WidgetKit

struct MonthEntry: TimelineEntry {
  let date: Date
  let spent: Double
  let earned: Double
  let topName: String
  let topAmount: Double
  let topPct: Int
}

struct MonthProvider: TimelineProvider {
  func placeholder(in context: Context) -> MonthEntry {
    MonthEntry(date: Date(), spent: 8420, earned: 50000, topName: "Food", topAmount: 4200, topPct: 50)
  }

  func getSnapshot(in context: Context, completion: @escaping (MonthEntry) -> Void) {
    completion(readMonth())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<MonthEntry>) -> Void) {
    let entry = readMonth()
    var calendar = Calendar.current
    calendar.timeZone = TimeZone.current
    let tomorrow = calendar.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    let nextMidnight = calendar.startOfDay(for: tomorrow)
    completion(Timeline(entries: [entry], policy: .after(nextMidnight)))
  }

  private func readMonth() -> MonthEntry {
    let now = Date()
    let fallback = MonthEntry(date: now, spent: 0, earned: 0, topName: "No data", topAmount: 0, topPct: 0)
    guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "${APP_GROUP_ID}") else {
      return fallback
    }
    let dbPath = dir.appendingPathComponent("expenses.db").path
    var db: OpaquePointer?
    guard sqlite3_open_v2(dbPath, &db, SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK else {
      return fallback
    }
    defer { sqlite3_close(db) }
    sqlite3_busy_timeout(db, 2000)
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM"
    let prefix = formatter.string(from: now)
    let sql = "SELECT kind, category, SUM(amount) FROM expenses WHERE substr(date, 1, 7) = ? GROUP BY kind, category;"
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
      return fallback
    }
    defer { sqlite3_finalize(stmt) }
    sqlite3_bind_text(stmt, 1, (prefix as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    var spent = 0.0
    var earned = 0.0
    var topName = "No data"
    var topAmount = 0.0
    let names = ["food": "Food", "transport": "Transport", "petrol": "Petrol", "shopping": "Shopping", "bills": "Bills", "entertainment": "Entertainment", "health": "Health", "travel": "Travel", "salary": "Salary", "other": "Other"]
    while sqlite3_step(stmt) == SQLITE_ROW {
      let kind = String(cString: sqlite3_column_text(stmt, 0))
      let category = String(cString: sqlite3_column_text(stmt, 1))
      let sum = sqlite3_column_double(stmt, 2)
      if kind == "income" {
        earned += sum
      } else {
        spent += sum
        if sum > topAmount {
          topAmount = sum
          topName = names[category] ?? category
        }
      }
    }
    let pct = spent > 0 ? Int((topAmount / spent * 100).rounded()) : 0
    return MonthEntry(date: now, spent: spent, earned: earned, topName: topName, topAmount: topAmount, topPct: pct)
  }
}

struct SmallWidgetView: View {
  var entry: MonthEntry
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("MyExp").font(.caption).foregroundStyle(.secondary)
      Spacer()
      Text("₹\\(Int(entry.spent))").font(.title).bold()
      Text("spent this month").font(.caption).foregroundStyle(.secondary)
    }
    .padding()
  }
}

struct MediumWidgetView: View {
  var entry: MonthEntry
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack {
        Text("MyExp · this month").font(.caption).foregroundStyle(.secondary)
        Spacer()
        Text("Bal ₹\\(Int(entry.earned - entry.spent))").font(.caption).bold()
      }
      HStack(alignment: .firstTextBaseline, spacing: 12) {
        VStack(alignment: .leading) {
          Text("Spent").font(.caption).foregroundStyle(.secondary)
          Text("₹\\(Int(entry.spent))").font(.title2).bold()
        }
        Spacer()
        VStack(alignment: .trailing) {
          Text("Earned").font(.caption).foregroundStyle(.secondary)
          Text("₹\\(Int(entry.earned))").font(.title2).bold()
        }
      }
      Spacer()
      HStack {
        Text(entry.topName).font(.caption).bold()
        Text("\\(entry.topPct)% · ₹\\(Int(entry.topAmount))").font(.caption).foregroundStyle(.secondary)
        Spacer()
      }
    }
    .padding()
  }
}

struct MyExpWidgetView: View {
  @Environment(\\.widgetFamily) var family
  var entry: MonthEntry
  var body: some View {
    Group {
      if family == .systemSmall {
        SmallWidgetView(entry: entry)
      } else {
        MediumWidgetView(entry: entry)
      }
    }
    .containerBackground(.fill.tertiary, for: .widget)
    .widgetURL(URL(string: "expensetracker://"))
  }
}

struct MyExpWidget: Widget {
  let kind: String = "${WIDGET_KIND}"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: MonthProvider()) { entry in
      MyExpWidgetView(entry: entry)
    }
    .configurationDisplayName("MyExp Spending")
    .description("Month spending, earnings and top category.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct MyExpWidgetBundle: WidgetBundle {
  var body: some Widget {
    MyExpWidget()
  }
}
`;

const WIDGET_INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>XPC!</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.widgetkit-extension</string>
  </dict>
</dict>
</plist>
`;

const WIDGET_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${APP_GROUP_ID}</string>
  </array>
</dict>
</plist>
`;

/**
 * Creates the MyExpWidget WidgetKit extension target on every prebuild:
 * SwiftUI widget (small + medium) reading the shared SQLite file, plus
 * App Group entitlement. Re-runnable: skips creation if the target exists.
 */
module.exports = function withWidget(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectRoot = config.modRequest.projectRoot;
    const dir = path.join(projectRoot, "ios", "MyExpWidget");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "MyExpWidget.swift"), WIDGET_SWIFT);
    fs.writeFileSync(
      path.join(dir, "MyExpWidget-Info.plist"),
      WIDGET_INFO_PLIST
    );
    fs.writeFileSync(
      path.join(dir, "MyExpWidget.entitlements"),
      WIDGET_ENTITLEMENTS
    );

    const objects = project.hash.project.objects;
    const targets = objects.PBXNativeTarget || {};
    const exists = Object.values(targets).some(
      (t) => typeof t === "object" && t.name === `"${TARGET_NAME}"`
    );
    if (exists) return config;

    const created = project.addTarget(
      TARGET_NAME,
      "app_extension",
      TARGET_NAME,
      WIDGET_BUNDLE_ID
    );
    const widgetGroup = project.addPbxGroup(
      [],
      TARGET_NAME,
      TARGET_NAME
    );
    project.addSourceFile(`${TARGET_NAME}/MyExpWidget.swift`, {
      target: created.uuid,
    }, widgetGroup.uuid);
    // The xcode lib drops new entries into the main target's Sources phase.
    // Relocate every MyExpWidget.swift build entry into the widget target's
    // own Sources phase (found via the target's buildPhases refs).
    const objects2 = project.hash.project.objects;
    const widgetTarget =
      objects2.PBXNativeTarget[created.uuid] || {};
    let widgetSourcesUuid = null;
    for (const ref of widgetTarget.buildPhases || []) {
      const phase = (objects2.PBXSourcesBuildPhase || {})[ref.value];
      if (phase) widgetSourcesUuid = ref.value;
    }
    if (widgetSourcesUuid) {
      const fileRefs = Object.entries(objects2.PBXFileReference || {})
        .filter(
          ([k, r]) =>
            !k.endsWith("_comment") &&
            typeof r === "object" &&
            typeof r.path === "string" &&
            r.path.includes("MyExpWidget.swift")
        )
        .map(([k]) => k);
      const buildFiles = Object.entries(objects2.PBXBuildFile || {})
        .filter(
          ([k, b]) =>
            !k.endsWith("_comment") &&
            typeof b === "object" &&
            fileRefs.includes(b.fileRef)
        )
        .map(([k]) => k);
      for (const [phaseUuid, phase] of Object.entries(
        objects2.PBXSourcesBuildPhase || {}
      )) {
        if (phaseUuid.endsWith("_comment")) continue;
        if (phaseUuid === widgetSourcesUuid) continue;
        phase.files = (phase.files || []).filter(
          (f) => !buildFiles.includes(f.value)
        );
      }
      const widgetPhase = objects2.PBXSourcesBuildPhase[widgetSourcesUuid];
      widgetPhase.files = widgetPhase.files || [];
      for (const bf of buildFiles) {
        if (!widgetPhase.files.some((f) => f.value === bf)) {
          widgetPhase.files.push({
            value: bf,
            comment: "MyExpWidget.swift in Sources",
          });
        }
      }
    }

    const targetObj =
      objects.PBXNativeTarget[created.uuid] || {};
    const listUuid = targetObj.buildConfigurationList;
    const list = (objects.XCConfigurationList || {})[listUuid] || {};
    for (const entry of list.buildConfigurations || []) {
      const cfg = (objects.XCBuildConfiguration || {})[entry.value] || {};
      cfg.buildSettings = cfg.buildSettings || {};
      cfg.buildSettings.SWIFT_VERSION = '"5.0"';
      cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '"18.0"';
      cfg.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
      cfg.buildSettings.CODE_SIGN_ENTITLEMENTS = `"${TARGET_NAME}/${TARGET_NAME}.entitlements"`;
      cfg.buildSettings.APPLICATION_EXTENSION_API_ONLY = "YES";
    }
    return config;
  });
};
