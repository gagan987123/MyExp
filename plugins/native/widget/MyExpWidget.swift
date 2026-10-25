import SQLite3
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
    guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.gagan987123.myexp") else {
      return fallback
    }
    // Local-month boundaries as UTC ISO strings. The app stores
    // toISOString() (UTC) dates, so a local "yyyy-MM" prefix wrongly
    // drops rows near month edges (e.g. Oct 1 00:30 IST == Sep 30 UTC).
    // ISO-8601 UTC strings sort lexicographically == chronologically,
    // so a closed-open range matches the app's isThisMonth() exactly.
    let calendar = Calendar.current
    let comps = calendar.dateComponents([.year, .month], from: now)
    guard let monthStart = calendar.date(from: comps),
      let nextMonthStart = calendar.date(byAdding: .month, value: 1, to: monthStart)
    else {
      return fallback
    }
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    iso.timeZone = TimeZone(secondsFromGMT: 0)
    let lower = iso.string(from: monthStart)
    let upper = iso.string(from: nextMonthStart)
    let dbPath = dir.appendingPathComponent("expenses.db").path
    var db: OpaquePointer?
    // Shared DB runs in DELETE journal mode (see lib/db.ts) so a
    // readonly cross-process reader always sees committed writes.
    guard sqlite3_open_v2(dbPath, &db, SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK else {
      return fallback
    }
    defer { sqlite3_close(db) }
    sqlite3_busy_timeout(db, 2000)
    // True month total across ALL categories. The slice query below is
    // LIMITed to what fits, so summing its rows would silently drop
    // overflow categories from the headline number.
    let totalSql = "SELECT SUM(amount) FROM expenses WHERE kind = 'expense' AND date >= ? AND date < ?;"
    var totalStmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, totalSql, -1, &totalStmt, nil) == SQLITE_OK else {
      return fallback
    }
    defer { sqlite3_finalize(totalStmt) }
    sqlite3_bind_text(totalStmt, 1, (lower as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    sqlite3_bind_text(totalStmt, 2, (upper as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    var spent = 0.0
    if sqlite3_step(totalStmt) == SQLITE_ROW {
      spent = sqlite3_column_double(totalStmt, 0)
    }
    let sql = "SELECT category, SUM(amount) FROM expenses WHERE kind = 'expense' AND date >= ? AND date < ? GROUP BY category ORDER BY SUM(amount) DESC LIMIT 4;"
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
      return fallback
    }
    defer { sqlite3_finalize(stmt) }
    sqlite3_bind_text(stmt, 1, (lower as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    sqlite3_bind_text(stmt, 2, (upper as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    var shown = 0.0
    var rows: [(String, Double)] = []
    while sqlite3_step(stmt) == SQLITE_ROW {
      guard let cText = sqlite3_column_text(stmt, 0) else { continue }
      let category = String(cString: cText)
      let sum = sqlite3_column_double(stmt, 1)
      shown += sum
      rows.append((category, sum))
    }
    // Overflow bucket: anything outside the top 4 still counts in the
    // total. Fold it into the "other" slice when present, else append
    // one, so slices always reconcile with the headline.
    let remainder = spent - shown
    if remainder > 0.005 {
      if let i = rows.firstIndex(where: { $0.0 == "other" }) {
        rows[i].1 += remainder
      } else {
        rows.append(("other", remainder))
      }
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
      Text("₹\(Int(entry.spent))").font(.title).bold()
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
        Text("₹\(Int(entry.spent))").font(.title2).bold()
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
            Text("₹\(Int(slice.amount))").font(.caption).bold()
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
  @Environment(\.widgetFamily) var family
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
  let kind: String = "MyExpWidget"

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
