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

struct CategorySlice: Identifiable {
  let id: String
  let name: String
  let amount: Double
  let pct: Int
  let color: Color
}

let CATEGORY_COLORS: [String: Color] = [
  "food": .orange, "transport": .blue, "petrol": .yellow,
  "shopping": .purple, "bills": .green, "entertainment": .pink,
  "health": .teal, "travel": .indigo, "salary": .green, "other": .gray,
]
let CATEGORY_NAMES = ["food": "Food", "transport": "Transport", "petrol": "Petrol", "shopping": "Shopping", "bills": "Bills", "entertainment": "Entertainment", "health": "Health", "travel": "Travel", "salary": "Salary", "other": "Other"]

struct MonthEntry: TimelineEntry {
  let date: Date
  let spent: Double
  let slices: [CategorySlice]
}

struct MonthProvider: TimelineProvider {
  func placeholder(in context: Context) -> MonthEntry {
    MonthEntry(date: Date(), spent: 8420, slices: [
      CategorySlice(id: "food", name: "Food", amount: 4200, pct: 50, color: .orange),
      CategorySlice(id: "bills", name: "Bills", amount: 2500, pct: 30, color: .green),
      CategorySlice(id: "transport", name: "Transport", amount: 1720, pct: 20, color: .blue),
    ])
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
    let fallback = MonthEntry(date: now, spent: 0, slices: [])
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
    let sql = "SELECT category, SUM(amount) FROM expenses WHERE kind = 'expense' AND substr(date, 1, 7) = ? GROUP BY category ORDER BY SUM(amount) DESC LIMIT 4;"
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
      return fallback
    }
    defer { sqlite3_finalize(stmt) }
    sqlite3_bind_text(stmt, 1, (prefix as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    var spent = 0.0
    var rows: [(String, Double)] = []
    while sqlite3_step(stmt) == SQLITE_ROW {
      let category = String(cString: sqlite3_column_text(stmt, 0))
      let sum = sqlite3_column_double(stmt, 1)
      spent += sum
      rows.append((category, sum))
    }
    let slices = rows.map { (category, sum) in
      CategorySlice(
        id: category,
        name: CATEGORY_NAMES[category] ?? category,
        amount: sum,
        pct: spent > 0 ? Int((sum / spent * 100).rounded()) : 0,
        color: CATEGORY_COLORS[category] ?? .gray
      )
    }
    return MonthEntry(date: now, spent: spent, slices: slices)
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
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text("Spent").font(.caption).foregroundStyle(.secondary)
        Text("₹\\(Int(entry.spent))").font(.title2).bold()
        Spacer()
        Text("this month").font(.caption2).foregroundStyle(.secondary)
      }
      Spacer()
      VStack(alignment: .leading, spacing: 6) {
        ForEach(entry.slices.prefix(4)) { slice in
          HStack(spacing: 6) {
            Circle().fill(slice.color).frame(width: 8, height: 8)
            Text(slice.name).font(.caption).lineLimit(1)
            Spacer()
            Text("₹\\(Int(slice.amount))").font(.caption).bold()
          }
        }
        if entry.slices.isEmpty {
          Text("No spending yet").font(.caption).foregroundStyle(.secondary)
        }
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
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundleDisplayName</key>
  <string>MyExp</string>
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
    const targetKey = Object.keys(targets).find(
      (k) =>
        !k.endsWith("_comment") &&
        typeof targets[k] === "object" &&
        (targets[k].name === `"${TARGET_NAME}"` ||
          targets[k].name === TARGET_NAME)
    );

    let widgetUuid;
    if (!targetKey) {
      const created = project.addTarget(
        TARGET_NAME,
        "app_extension",
        TARGET_NAME,
        WIDGET_BUNDLE_ID
      );
      widgetUuid = created.uuid;
      const widgetGroup = project.addPbxGroup([], TARGET_NAME, TARGET_NAME);
      project.addSourceFile(
        `${TARGET_NAME}/MyExpWidget.swift`,
        { target: widgetUuid },
        widgetGroup.uuid
      );

      const targetObj = objects.PBXNativeTarget[widgetUuid] || {};
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
    } else {
      widgetUuid = targetKey;
    }

    // Repair pass (always runs): every MyExpWidget.swift build entry belongs
    // in the widget target's own Sources phase and nowhere else. The xcode
    // lib otherwise drops new entries into the main target's phase.
    // NOTE: re-read the objects fresh — addTarget above may have replaced
    // the containers, making the earlier `objects` const stale.
    const fresh = project.hash.project.objects;
    const makeUuid = () =>
      "0123456789ABCDEF".split("")
        .map(() => "0123456789ABCDEF"[Math.floor(Math.random() * 16)])
        .join("")
        .slice(0, 24);
    let widgetTarget = fresh.PBXNativeTarget[widgetUuid] || null;
    // Ensure the widget target owns a Sources phase (addTarget does not
    // create build phases, and expo may add them only after plugins run).
    if (widgetTarget) {
      widgetTarget.buildPhases = widgetTarget.buildPhases || [];
      let hasSources = widgetTarget.buildPhases.some(
        (r) => (fresh.PBXSourcesBuildPhase || {})[r.value]
      );
      if (!hasSources) {
        const phaseUuid = makeUuid();
        fresh.PBXSourcesBuildPhase = fresh.PBXSourcesBuildPhase || {};
        fresh.PBXSourcesBuildPhase[phaseUuid] = {
          isa: "PBXSourcesBuildPhase",
          buildActionMask: 2147483647,
          files: [],
          runOnlyForDeploymentPostprocessing: 0,
        };
        fresh.PBXSourcesBuildPhase[`${phaseUuid}_comment`] = "Sources";
        widgetTarget.buildPhases.push({
          value: phaseUuid,
          comment: "Sources",
        });
        console.log(
          `[withWidget] created Sources phase ${phaseUuid.slice(0, 8)}`
        );
      }
    }
    let widgetSourcesUuid = null;
    for (const ref of widgetTarget.buildPhases || []) {
      if ((fresh.PBXSourcesBuildPhase || {})[ref.value]) {
        widgetSourcesUuid = ref.value;
      }
    }
    if (widgetSourcesUuid) {
      const fileRefKeys = Object.entries(fresh.PBXFileReference || {})
        .filter(
          ([k, r]) =>
            !k.endsWith("_comment") &&
            typeof r === "object" &&
            typeof r.path === "string" &&
            r.path.includes("MyExpWidget.swift")
        )
        .map(([k]) => k);
      const buildFileKeys = Object.entries(fresh.PBXBuildFile || {})
        .filter(
          ([k, b]) =>
            !k.endsWith("_comment") &&
            typeof b === "object" &&
            fileRefKeys.includes(b.fileRef)
        )
        .map(([k]) => k);
      console.log(
        `[withWidget] repairing placement: ${buildFileKeys.length} entries → phase ${widgetSourcesUuid.slice(0, 8)}`
      );
      // Dedup: one build entry per file wins; extras cause duplicate-symbol
      // and duplicate-@main build failures.
      const keep = buildFileKeys.slice(0, 1);
      const drop = buildFileKeys.slice(1);
      for (const gone of drop) {
        delete fresh.PBXBuildFile[gone];
        delete fresh.PBXBuildFile[`${gone}_comment`];
      }
      for (const [phaseUuid, phase] of Object.entries(
        fresh.PBXSourcesBuildPhase || {}
      )) {
        if (phaseUuid.endsWith("_comment")) continue;
        if (phaseUuid === widgetSourcesUuid) continue;
        phase.files = (phase.files || []).filter(
          (f) => !buildFileKeys.includes(f.value)
        );
      }
      const widgetPhase = fresh.PBXSourcesBuildPhase[widgetSourcesUuid];
      widgetPhase.files = widgetPhase.files || [];
      for (const bf of keep) {
        if (!widgetPhase.files.some((f) => f.value === bf)) {
          widgetPhase.files.push({
            value: bf,
            comment: "MyExpWidget.swift in Sources",
          });
        }
      }
    } else {
      console.log("[withWidget] WARNING: widget Sources phase not found");
    }
    return config;
  });
};
