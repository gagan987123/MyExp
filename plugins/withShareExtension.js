const fs = require("fs");
const path = require("path");
const { withXcodeProject } = require("@expo/config-plugins");

// Share-to-log: "Share → MyExp" on any receipt text / screenshot files
// the expense instantly (same shared SQLite file Siri writes to).
const SHARE_BUNDLE_ID = "com.gagan987123.myexp.share";
const APP_GROUP_ID = "group.com.gagan987123.myexp";
const TARGET_NAME = "MyExpShare";

// Foundation-only: unit-tested with `swift ShareParser.swift TestMain.swift`.
const SHARE_PARSER_SWIFT = `import Foundation

/// Pure parsing for the Share-to-log extension. No UIKit, no SQLite —
/// everything impure (DB, widget reload) lives in ShareViewController.
enum ShareParseError: Error {
  case notSuccessful
  case noAmount
}

struct SharedPayment {
  let amount: Double
  let payee: String?
  let ref: String?
}

struct ShareParser {
  static let successWords = ["paid", "successful", "success", "completed", "debited", "sent", "payment done"]
  static let failWords = ["failed", "failure", "declined", "cancelled", "canceled", "pending", "reversed", "refund", "unsuccessful"]

  /// Former gate, now a warning only: the sheet always shows the data
  /// and the user decides. Returns nil when nothing smells off.
  static func paymentWarning(_ text: String) -> String? {
    let lower = text.lowercased()
    if failWords.contains(where: { lower.contains($0) }) {
      return "Heads up: this mentions failure/cancel — save only if the money actually left your account."
    }
    return nil
  }

  /// Receipt screenshots are full of ads (scratch cards, SIP banners).
  /// Drop lines that are obviously promo so their amounts (₹500 SIP!)
  /// can never win over the real payment amount.
  static let adMarkers = ["scratchcard", "scratch & win", "sip", "invest now", "mutual fund", "bigger goals", "cashback", "refer and earn", "invite and earn"]

  static func withoutAdLines(_ lines: [String]) -> [String] {
    lines.filter { line in
      let lower = line.lowercased()
      return !adMarkers.contains(where: { lower.contains($0) })
    }
  }

  /// First currency-anchored number in (0, 10L]. Anchoring skips UTRs and
  /// 12-digit refs, which never sit next to a currency marker.
  /// Stage 2 (OCR often drops ₹): a number glued to a payment verb —
  /// "Paid 350", "Sent Rs 350", "Payment of 350", "Amount: 350". Only
  /// whitespace/currency may sit between verb and number, so dates
  /// ("Paid on 30 Sep") can never match.
  static func parseAmount(_ text: String) -> Double? {
    let anchored = [
      "(?:₹|Rs\\\\.?|INR)\\\\s*([\\\\d,]+(?:\\\\.\\\\d{1,2})?)",
      "([\\\\d,]+(?:\\\\.\\\\d{1,2})?)\\\\s*(?:rupees?|INR)",
    ]
    let verbGlued = [
      "\\\\bpaid\\\\s+(?:₹|Rs\\\\.?|INR|\\\\bR\\\\b)?\\\\s*([\\\\d,]+(?:\\\\.\\\\d{1,2})?)",
      "\\\\bsent\\\\s+(?:₹|Rs\\\\.?|INR|\\\\bR\\\\b)?\\\\s*([\\\\d,]+(?:\\\\.\\\\d{1,2})?)",
      "\\\\bpayment\\\\s+of\\\\s+(?:₹|Rs\\\\.?|INR|\\\\bR\\\\b)?\\\\s*([\\\\d,]+(?:\\\\.\\\\d{1,2})?)",
      "\\\\bamount\\\\s*:?\\\\s*(?:₹|Rs\\\\.?|INR|\\\\bR\\\\b)?\\\\s*([\\\\d,]+(?:\\\\.\\\\d{1,2})?)",
    ]
    for pattern in anchored + verbGlued {
      guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { continue }
      let matches = re.matches(in: text, range: NSRange(text.startIndex..., in: text))
      for m in matches {
        guard m.numberOfRanges > 1, let r = Range(m.range(at: 1), in: text) else { continue }
        let digits = String(text[r]).replacingOccurrences(of: ",", with: "")
        guard let n = Double(digits), n > 0, n <= 1_000_000 else { continue }
        return (n * 100).rounded() / 100
      }
    }
    // Stage 3: spelled-out amounts ("One Rupees") — screenshots where
    // the ₹ glyph didn't survive OCR carry no digits for the amount.
    let numWords = numberWordList.joined(separator: "|")
    let wordPattern = "\\\\b((?:" + numWords + ")(?:[\\\\s-]+(?:" + numWords + "))*)\\\\s+rupees?\\\\b"
    if let re = try? NSRegularExpression(pattern: wordPattern, options: [.caseInsensitive]) {
      for m in re.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
        guard m.numberOfRanges > 1, let r = Range(m.range(at: 1), in: text) else { continue }
        if let n = numberFromWords(String(text[r])), n > 0, n <= 1_000_000 {
          return (n * 100).rounded() / 100
        }
      }
    }
    return nil
  }

  static let numberWordList = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "lakh", "lac", "lacs", "lakhs", "crore", "crores", "and"]

  /// "two hundred fifty" → 250. Nil on any unknown word.
  static func numberFromWords(_ phrase: String) -> Double? {
    let ones = ["zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19]
    let tens = ["twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90]
    var total = 0.0
    var current = 0.0
    var seen = false
    for raw in phrase.lowercased().split(whereSeparator: { $0 == " " || $0 == "-" }) {
      let w = String(raw)
      if let v = ones[w] { current += Double(v); seen = true }
      else if let v = tens[w] { current += Double(v); seen = true }
      else if w == "hundred" { current = (current == 0 ? 1 : current) * 100; seen = true }
      else if w == "thousand" { total += (current == 0 ? 1 : current) * 1000; current = 0; seen = true }
      else if w == "lakh" || w == "lac" || w == "lacs" || w == "lakhs" { total += (current == 0 ? 1 : current) * 100000; current = 0; seen = true }
      else if w == "crore" || w == "crores" { total += (current == 0 ? 1 : current) * 10000000; current = 0; seen = true }
      else if w == "and" { continue }
      else { return nil }
    }
    total += current
    return seen && total > 0 ? total : nil
  }

  /// "Paid ₹350 to Rahul Restaurant successfully" → "Rahul Restaurant".
  /// Stops at outcome words (successfully/completed/via/…) or punctuation.
  static func parsePayee(_ text: String) -> String? {
    let toPattern = "\\\\bto\\\\s+([A-Za-z][A-Za-z0-9 .&'\\\\-]{0,39}?)(?=\\\\s+(?:successfully|successful|completed|via|using|through|with|on|from|UPI)\\\\b|[.,;]|$)"
    if let re = try? NSRegularExpression(pattern: toPattern, options: [.caseInsensitive]),
      let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
      m.numberOfRanges > 1, let r = Range(m.range(at: 1), in: text) {
      let name = String(text[r]).trimmingCharacters(in: .whitespacesAndNewlines)
      if !name.isEmpty { return name }
    }
    return parsePayeeViaVpa(text)
  }

  /// Fallback: the name sitting right before a VPA-shaped token —
  /// "Rupinder Kaur ruparora123 @okicici" (note OCR's space before @).
  /// Leading app/verb noise ("Paytm", "Pay to") is stripped.
  static let payeeNoiseWords: Set<String> = ["pay", "paid", "sent", "send", "to", "via", "on", "paytm", "gpay", "phonepe", "bhim", "upi", "google"]

  static func parsePayeeViaVpa(_ text: String) -> String? {
    let pattern = "([A-Za-z][A-Za-z .\\\\'\\\\-]{0,38}?)\\\\s*[\\\\w.\\\\-]*\\\\s*@\\\\s*[a-zA-Z]{2,}"
    guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
      let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
      m.numberOfRanges > 1, let r = Range(m.range(at: 1), in: text)
    else { return nil }
    var words = String(text[r]).split(separator: " ").map(String.init)
    while let first = words.first, payeeNoiseWords.contains(first.lowercased()) {
      words.removeFirst()
    }
    if words.isEmpty { return nil }
    let name = words.suffix(3).joined(separator: " ")
    return name.isEmpty ? nil : name
  }

  /// UTR / UPI Ref No / Transaction ID / Order ID / Ref No → the token.
  /// Tolerates OCR splitting the digits ("6275 04435298").
  static func parseRef(_ text: String) -> String? {
    let keyword = "(?:UTR|UPI\\\\s*Ref(?:erence)?(?:\\\\s*No\\\\.?)?|Transaction\\\\s*(?:ID|No\\\\.?)|Order\\\\s*ID|Ref(?:erence)?(?:\\\\s*No\\\\.?)?)\\\\s*[:#]?\\\\s*"
    if let re = try? NSRegularExpression(pattern: keyword + "(\\\\d[\\\\d\\\\s]{4,24}\\\\d)", options: [.caseInsensitive]) {
      for m in re.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
        guard m.numberOfRanges > 1, let r = Range(m.range(at: 1), in: text) else { continue }
        let digits = String(text[r]).replacingOccurrences(of: "\\\\s+", with: "", options: .regularExpression)
        if digits.count >= 6 && digits.count <= 25 && digits.allSatisfy({ $0.isNumber }) {
          return digits
        }
      }
    }
    let compact = keyword + "([A-Za-z0-9]{6,25})"
    guard let re = try? NSRegularExpression(pattern: compact, options: [.caseInsensitive]),
      let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
      m.numberOfRanges > 1, let r = Range(m.range(at: 1), in: text)
    else { return nil }
    let ref = String(text[r]).trimmingCharacters(in: .whitespacesAndNewlines)
    return ref.isEmpty ? nil : ref
  }

  // Deterministic keyword rules — mirrors matchCategory() in
  // lib/service.ts and resolveCategory() in AddExpenseIntent.swift.
  // Keep the three lists in sync.
  static let keywordRules: [(String, String)] = [
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

  /// User customs (expense kind only) beat keyword rules, like Siri.
  static func resolveCategory(payee: String?, note: String, customs: [(id: String, name: String)]) -> String {
    let text = "\\(payee ?? "") \\(note)".lowercased()
    for c in customs where c.name.count >= 3 && text.contains(c.name.lowercased()) {
      return c.id
    }
    for (keyword, category) in keywordRules {
      if text.contains(keyword) { return category }
    }
    return "other"
  }

  static let defaultNames: [String: String] = [
    "food": "Food", "transport": "Transport", "petrol": "Petrol",
    "shopping": "Shopping", "bills": "Bills", "entertainment": "Entertainment",
    "health": "Health", "travel": "Travel", "salary": "Salary", "other": "Other",
  ]

  /// Criteria map for the AI choice question: defaults + customs.
  /// Pure (no network) so it stays unit-testable.
  static func aiCriteria(customs: [(id: String, name: String)]) -> [String: String] {
    var criteria = defaultNames
    for c in customs { criteria[c.id] = c.name }
    return criteria
  }

  static func parse(_ text: String) throws -> SharedPayment {
    // No success gate by design: the sheet shows everything parsed and
    // the user taps Save or Cancel. paymentWarning() flags the smell.
    guard let amount = parseAmount(text) else { throw ShareParseError.noAmount }
    return SharedPayment(amount: amount, payee: parsePayee(text), ref: parseRef(text))
  }

  /// First 160 chars, flattened — shown in failure messages so a
  /// rejection is diagnosable. Receipt text only, no secrets.
  static func preview(_ text: String) -> String {
    let flat = text.replacingOccurrences(of: "\\\\s+", with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return flat.count > 160 ? String(flat.prefix(160)) + "…" : flat
  }
}
`;

const SHARE_VC_SWIFT = `import SQLite3
import UniformTypeIdentifiers
import UIKit
import Vision
import WidgetKit

/// Share-to-log sheet: parses a shared receipt text (or screenshot via
/// on-device OCR) and files the expense straight into the shared SQLite
/// file — same table and rules as the app and Siri. No network, no AI:
/// deterministic parsing only, user reviews before saving.
class ShareViewController: UIViewController {
  private var parsed: SharedPayment?
  private var customs: [(id: String, name: String)] = []

  private let amountLabel = UILabel()
  private let payeeLabel = UILabel()
  private let categoryLabel = UILabel()
  private let refLabel = UILabel()
  private let noteField = UITextField()
  private let statusLabel = UILabel()
  private let warnLabel = UILabel()
  private let saveButton = UIButton(type: .system)
  private let openAppButton = UIButton(type: .system)

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(red: 0x0B / 255, green: 0x0E / 255, blue: 0x17 / 255, alpha: 1)
    buildUI()
    extractInput()
  }

  // MARK: - Input (text that parses wins; else image via OCR)

  private func extractInput() {
    guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
      return fail("Nothing shared.")
    }
    let providers = items.flatMap { $0.attachments ?? [] }
    let texts = providers.filter { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }
    let images = providers.filter { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }
    guard !texts.isEmpty || !images.isEmpty else {
      fail("Share text or a receipt screenshot to log it.")
      return
    }
    // UPI apps (Paytm especially) attach promo text ALONGSIDE the real
    // receipt image. Text that parses wins; otherwise fall to OCR.
    tryTextProviders(texts, images: images)
  }

  private func tryTextProviders(_ texts: [NSItemProvider], images: [NSItemProvider]) {
    guard let first = texts.first else {
      tryImageProviders(images, fallbackText: nil)
      return
    }
    first.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] item, _ in
      guard let self else { return }
      if let text = item as? String, (try? ShareParser.parse(text)) != nil {
        self.handle(text: text)
      } else if !images.isEmpty {
        self.tryImageProviders(images, fallbackText: item as? String)
      } else if let text = item as? String {
        self.handle(text: text) // surfaces the Got: preview + tip
      } else {
        self.fail("Couldn't read the shared text.")
      }
    }
  }

  private func tryImageProviders(_ images: [NSItemProvider], fallbackText: String?) {
    guard let first = images.first else {
      if let text = fallbackText {
        handle(text: text)
      } else {
        fail("Share text or a receipt screenshot to log it.")
      }
      return
    }
    status("Reading screenshot…")
    first.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { [weak self] item, _ in
      guard let self else { return }
      let image: UIImage?
      if let uiImage = item as? UIImage {
        image = uiImage
      } else if let url = item as? URL, let data = try? Data(contentsOf: url) {
        image = UIImage(data: data)
      } else {
        image = nil
      }
      guard let image, let cgImage = image.cgImage else {
        if let text = fallbackText { return self.handle(text: text) }
        return self.fail("Couldn't read the shared image.")
      }
      self.recognize(cgImage: cgImage)
    }
  }

  private func recognize(cgImage: CGImage) {
    let request = VNRecognizeTextRequest { [weak self] req, error in
      guard let self else { return }
      if error != nil {
        return self.fail("Couldn't read text from the image.")
      }
      let strings = (req.results as? [VNRecognizedTextObservation] ?? [])
        .compactMap { $0.topCandidates(1).first?.string }
      let kept = ShareParser.withoutAdLines(strings)
      if kept.isEmpty {
        return self.fail("No text found in the image.")
      }
      self.handle(text: kept.joined(separator: "\\n"))
    }
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    DispatchQueue.global(qos: .userInitiated).async {
      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      do {
        try handler.perform([request])
      } catch {
        DispatchQueue.main.async { [weak self] in self?.fail("Couldn't read text from the image.") }
      }
    }
  }

  // MARK: - Parse + form

  private func handle(text: String) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      do {
        let payment = try ShareParser.parse(text)
        self.parsed = payment
        self.loadCustoms()
        self.render(payment: payment, warning: ShareParser.paymentWarning(text))
      } catch {
        self.fail("Couldn't find an amount in this. Got: \\(ShareParser.preview(text)) Tip: screenshot the receipt and share the photo instead.")
      }
    }
  }

  private func loadCustoms() {
    customs = []
    guard let dir = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: "${APP_GROUP_ID}")
    else { return }
    var db: OpaquePointer?
    let path = dir.appendingPathComponent("expenses.db").path
    guard sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK else { return }
    defer { sqlite3_close(db) }
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, "SELECT id, name FROM categories WHERE kind = 'expense';", -1, &stmt, nil) == SQLITE_OK else { return }
    defer { sqlite3_finalize(stmt) }
    while sqlite3_step(stmt) == SQLITE_ROW {
      guard let idRaw = sqlite3_column_text(stmt, 0), let nameRaw = sqlite3_column_text(stmt, 1) else { continue }
      customs.append((id: String(cString: idRaw), name: String(cString: nameRaw)))
    }
  }

  private func category(for payment: SharedPayment, note: String) -> String {
    ShareParser.resolveCategory(payee: payment.payee, note: note, customs: customs)
  }

  // MARK: - AI categorization (same toggle + key as Siri)

  private func kvValue(db: OpaquePointer?, key: String) -> String? {
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, "SELECT value FROM app_kv WHERE key = ?;", -1, &stmt, nil) == SQLITE_OK else {
      return nil
    }
    defer { sqlite3_finalize(stmt) }
    sqlite3_bind_text(stmt, 1, (key as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    guard sqlite3_step(stmt) == SQLITE_ROW,
      let raw = sqlite3_column_text(stmt, 0)
    else { return nil }
    return String(cString: raw)
  }

  /// Siri's AI toggle + shared key, read from the shared DB.
  /// Nil when AI is off — callers fall back to keyword rules.
  private func aiConfig() -> (key: String, criteria: [String: String])? {
    guard let dir = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: "${APP_GROUP_ID}")
    else { return nil }
    var db: OpaquePointer?
    let path = dir.appendingPathComponent("expenses.db").path
    guard sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK else { return nil }
    defer { sqlite3_close(db) }
    guard kvValue(db: db, key: "ai-enabled") == "1",
      let key = kvValue(db: db, key: "ai-key"),
      !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { return nil }
    return (key.trimmingCharacters(in: .whitespacesAndNewlines), ShareParser.aiCriteria(customs: customs))
  }

  /// Mirrors AddExpenseIntent.tryAiCategory: Jev choice, 70% min
  /// confidence, nil on any failure (network, key, timeout, low conf).
  static func askAi(text: String, criteria: [String: String], key: String) async -> String? {
    guard let payload = try? JSONSerialization.data(withJSONObject: [
      "model": "typesafe/jev-1.13",
      "state": "User spent money on: \\(text)",
      "questions": [
        "category": [
          "type": "choice",
          "instructions": "Which expense category fits best?",
          "criteria": criteria,
        ] as [String: Any],
      ],
    ]) else { return nil }
    var request = URLRequest(url: URL(string: "https://openrouter.ai/api/alpha/decisions")!)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("Bearer \\(key)", forHTTPHeaderField: "Authorization")
    request.httpBody = payload
    request.timeoutInterval = 12
    guard let (data, response) = try? await URLSession.shared.data(for: request),
      let http = response as? HTTPURLResponse, http.statusCode == 200,
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let answers = json["answers"] as? [String: Any],
      let pick = answers["category"] as? [String: Any],
      let choice = pick["choice"] as? String,
      criteria[choice] != nil
    else { return nil }
    let confidence = (pick["confidence"] as? Double) ?? 0
    return confidence >= 0.7 ? choice : nil
  }

  // MARK: - Save (direct SQLite write, same as Siri)

  @objc private func onSave() {
    performSave(openApp: false)
  }

  @objc private func onSaveAndOpenApp() {
    performSave(openApp: true)
  }

  private func performSave(openApp: Bool) {
    guard let payment = parsed else { return }
    let noteText = noteField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let base = noteText.isEmpty ? (payment.payee ?? "Shared payment") : noteText
    let note: String
    if let ref = payment.ref, !base.localizedCaseInsensitiveContains(ref) {
      note = "\\(base) · UPI \\(ref)"
    } else {
      note = base
    }
    setBusy(true)
    status("Saving…")
    // AI runs HERE and only here — on the final note text the user
    // confirmed with Save. Toggle off / no key / offline / unsure →
    // keyword category stands. Nothing runs while typing.
    Task { [weak self] in
      guard let self else { return }
      var category = ShareParser.resolveCategory(payee: payment.payee, note: note, customs: self.customs)
      if let config = self.aiConfig() {
        await MainActor.run { [weak self] in self?.status("Asking AI…") }
        if let pick = await Self.askAi(
          text: "\\(payment.payee ?? "") \\(note)",
          criteria: config.criteria,
          key: config.key
        ) {
          category = pick
        }
      }
      do {
        try self.insertExpense(amount: payment.amount, category: category, note: note)
        WidgetCenter.shared.reloadTimelines(ofKind: "MyExpWidget")
        await MainActor.run { [weak self] in self?.complete(openApp: openApp) }
      } catch {
        await MainActor.run { [weak self] in
          self?.setBusy(false)
          self?.fail("Couldn't save. Try again.")
        }
      }
    }
  }

  private func setBusy(_ busy: Bool) {
    saveButton.isEnabled = !busy
    openAppButton.isEnabled = !busy
  }

  private func insertExpense(amount: Double, category: String, note: String) throws {
    guard let dir = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: "${APP_GROUP_ID}")
    else { throw ShareSaveError.noSharedContainer }
    var db: OpaquePointer?
    let path = dir.appendingPathComponent("expenses.db").path
    guard sqlite3_open_v2(path, &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK
    else { throw ShareSaveError.cannotOpenDatabase }
    defer { sqlite3_close(db) }
    sqlite3_busy_timeout(db, 5000)
    // Same journaling contract as the app (see lib/db.ts): DELETE mode
    // so the readonly widget reader always sees committed writes.
    sqlite3_exec(db, "PRAGMA journal_mode = DELETE;", nil, nil, nil)
    let create = "CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY NOT NULL, amount REAL NOT NULL, category TEXT NOT NULL, note TEXT, date TEXT NOT NULL, created_at TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'expense'); CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);"
    guard sqlite3_exec(db, create, nil, nil, nil) == SQLITE_OK else { throw ShareSaveError.writeFailed }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    let now = formatter.string(from: Date())
    let id = UUID().uuidString
    let insert = "INSERT INTO expenses (id, amount, category, note, date, created_at, kind) VALUES (?, ?, ?, ?, ?, ?, 'expense');"
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, insert, -1, &stmt, nil) == SQLITE_OK else { throw ShareSaveError.writeFailed }
    defer { sqlite3_finalize(stmt) }
    sqlite3_bind_text(stmt, 1, (id as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    sqlite3_bind_double(stmt, 2, amount)
    sqlite3_bind_text(stmt, 3, (category as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    sqlite3_bind_text(stmt, 4, (note as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    sqlite3_bind_text(stmt, 5, (now as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    sqlite3_bind_text(stmt, 6, (now as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    guard sqlite3_step(stmt) == SQLITE_DONE else { throw ShareSaveError.writeFailed }
    sqlite3_exec(db, "PRAGMA wal_checkpoint(TRUNCATE);", nil, nil, nil)
    // WidgetKit throttles reload requests from extensions — they are
    // silently dropped over budget. Leave a dirty flag the app consumes
    // on next foreground (exactly one guaranteed reload) as backup.
    sqlite3_exec(db, "INSERT INTO app_kv (key, value) VALUES ('widget-dirty', '1') ON CONFLICT(key) DO UPDATE SET value = '1';", nil, nil, nil)
  }

  private func complete(openApp: Bool = false) {
    guard let ctx = extensionContext else { return }
    if openApp, let url = URL(string: "expensetracker://") {
      ctx.completeRequest(returningItems: [], completionHandler: { _ in
        ctx.open(url, completionHandler: nil)
      })
    } else {
      ctx.completeRequest(returningItems: [], completionHandler: nil)
    }
  }

  @objc private func onCancel() {
    extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
  }

  // MARK: - UI (compact dark sheet matching the app)

  private func buildUI() {
    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = 10
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
      stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
      stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
    ])

    let title = UILabel()
    title.text = "Log in MyExp"
    title.font = .boldSystemFont(ofSize: 20)
    title.textColor = .white
    stack.addArrangedSubview(title)

    amountLabel.font = .boldSystemFont(ofSize: 34)
    amountLabel.textColor = .white
    stack.addArrangedSubview(amountLabel)

    for label in [payeeLabel, categoryLabel, refLabel, statusLabel] {
      label.font = .systemFont(ofSize: 14)
      label.textColor = .lightGray
      label.numberOfLines = 0
      stack.addArrangedSubview(label)
    }
    warnLabel.font = .systemFont(ofSize: 13, weight: .semibold)
    warnLabel.textColor = UIColor(red: 1, green: 0xBF / 255, blue: 0x24 / 255, alpha: 1)
    warnLabel.numberOfLines = 0
    stack.addArrangedSubview(warnLabel)
    refLabel.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
    status("Reading shared content…")

    noteField.placeholder = "Note (optional)"
    noteField.borderStyle = .roundedRect
    noteField.keyboardType = .default
    noteField.autocorrectionType = .no
    noteField.addTarget(self, action: #selector(noteChanged), for: .editingChanged)
    stack.addArrangedSubview(noteField)

    let row = UIStackView()
    row.axis = .horizontal
    row.spacing = 10
    row.distribution = .fillEqually
    stack.addArrangedSubview(row)

    let cancel = UIButton(type: .system)
    cancel.setTitle("Cancel", for: .normal)
    cancel.addTarget(self, action: #selector(onCancel), for: .touchUpInside)
    row.addArrangedSubview(cancel)

    saveButton.setTitle("Save expense", for: .normal)
    saveButton.backgroundColor = UIColor(red: 1, green: 0x7A / 255, blue: 0x45 / 255, alpha: 1)
    saveButton.setTitleColor(.white, for: .normal)
    saveButton.layer.cornerRadius = 12
    saveButton.contentEdgeInsets = UIEdgeInsets(top: 12, left: 0, bottom: 12, right: 0)
    saveButton.addTarget(self, action: #selector(onSave), for: .touchUpInside)
    row.addArrangedSubview(saveButton)

    openAppButton.setTitle("Save & open MyExp", for: .normal)
    openAppButton.addTarget(self, action: #selector(onSaveAndOpenApp), for: .touchUpInside)
    stack.addArrangedSubview(openAppButton)
    setFormVisible(false)
  }

  private func setFormVisible(_ visible: Bool) {
    for v in [amountLabel, payeeLabel, categoryLabel, refLabel, warnLabel, noteField, saveButton, openAppButton] {
      v.isHidden = !visible
    }
  }

  private func render(payment: SharedPayment, warning: String?) {
    let inr = NumberFormatter()
    inr.numberStyle = .currency
    inr.currencyCode = "INR"
    inr.maximumFractionDigits = 2
    amountLabel.text = inr.string(from: NSNumber(value: payment.amount)) ?? "₹\\(Int(payment.amount))"
    payeeLabel.text = payment.payee ?? "Unknown payee"
    if let payee = payment.payee {
      noteField.text = payee
    }
    categoryLabel.text = "Category: \\(category(for: payment, note: noteField.text ?? ""))"
    if let ref = payment.ref {
      refLabel.text = "UPI ref \\(ref)"
      refLabel.isHidden = false
    } else {
      refLabel.isHidden = true
    }
    if let warning {
      warnLabel.text = warning
      warnLabel.isHidden = false
    } else {
      warnLabel.isHidden = true
    }
    status("")
    setFormVisible(true)
    updateCategoryLive()
  }

  private func updateCategoryLive() {
    guard let payment = parsed else { return }
    categoryLabel.text = "Category: \\(category(for: payment, note: noteField.text ?? ""))"
  }

  @objc private func noteChanged() {
    // Live keyword preview only — AI runs once on Save, on the final note.
    updateCategoryLive()
  }

  private func status(_ text: String) {
    // Load callbacks arrive off-main; keep every label write on main.
    DispatchQueue.main.async { [weak self] in self?.statusLabel.text = text }
  }

  private func fail(_ text: String) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.setFormVisible(false)
      self.status(text)
    }
  }
}

enum ShareSaveError: Error {
  case noSharedContainer
  case cannotOpenDatabase
  case writeFailed
}
`;

const SHARE_INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
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
  <string>MyExp Log</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.share-services</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).ShareViewController</string>
    <key>NSExtensionAttributes</key>
    <dict>
      <key>NSExtensionActivationRule</key>
      <dict>
        <key>NSExtensionActivationSupportsText</key>
        <true/>
        <key>NSExtensionActivationSupportsImageWithMaxCount</key>
        <integer>1</integer>
      </dict>
    </dict>
  </dict>
</dict>
</plist>
`;

const SHARE_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
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
 * Creates the MyExpShare Share extension target on every prebuild.
 * Mirrors withWidget: writes sources, creates the target once, then a
 * repair pass keeps BOTH Swift files in the share target's own Sources
 * phase and nowhere else.
 */
module.exports = function withShareExtension(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectRoot = config.modRequest.projectRoot;
    const dir = path.join(projectRoot, "ios", TARGET_NAME);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "ShareViewController.swift"),
      SHARE_VC_SWIFT
    );
    fs.writeFileSync(path.join(dir, "ShareParser.swift"), SHARE_PARSER_SWIFT);
    fs.writeFileSync(
      path.join(dir, "MyExpShare-Info.plist"),
      SHARE_INFO_PLIST
    );
    fs.writeFileSync(
      path.join(dir, "MyExpShare.entitlements"),
      SHARE_ENTITLEMENTS
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

    let shareUuid;
    if (!targetKey) {
      const created = project.addTarget(
        TARGET_NAME,
        "app_extension",
        TARGET_NAME,
        SHARE_BUNDLE_ID
      );
      shareUuid = created.uuid;
      const shareGroup = project.addPbxGroup([], TARGET_NAME, TARGET_NAME);
      for (const file of ["ShareViewController.swift", "ShareParser.swift"]) {
        project.addSourceFile(
          `${TARGET_NAME}/${file}`,
          { target: shareUuid },
          shareGroup.uuid
        );
      }

      const targetObj = objects.PBXNativeTarget[shareUuid] || {};
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
        cfg.buildSettings.INFOPLIST_FILE = `"${TARGET_NAME}/${TARGET_NAME}-Info.plist"`;
      }
    } else {
      shareUuid = targetKey;
    }

    // Repair pass (always runs): both Swift files belong in the share
    // target's own Sources phase and nowhere else.
    const fresh = project.hash.project.objects;
    const makeUuid = () =>
      "0123456789ABCDEF".split("")
        .map(() => "0123456789ABCDEF"[Math.floor(Math.random() * 16)])
        .join("")
        .slice(0, 24);
    const shareTarget = fresh.PBXNativeTarget[shareUuid] || null;
    if (shareTarget) {
      shareTarget.buildPhases = shareTarget.buildPhases || [];
      let hasSources = shareTarget.buildPhases.some(
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
        shareTarget.buildPhases.push({
          value: phaseUuid,
          comment: "Sources",
        });
        console.log(
          `[withShareExtension] created Sources phase ${phaseUuid.slice(0, 8)}`
        );
      }
    }
    let shareSourcesUuid = null;
    for (const ref of (shareTarget && shareTarget.buildPhases) || []) {
      if ((fresh.PBXSourcesBuildPhase || {})[ref.value]) {
        shareSourcesUuid = ref.value;
      }
    }
    if (shareSourcesUuid) {
      const wanted = ["ShareViewController.swift", "ShareParser.swift"];
      const fileRefKeys = Object.entries(fresh.PBXFileReference || {})
        .filter(
          ([k, r]) =>
            !k.endsWith("_comment") &&
            typeof r === "object" &&
            typeof r.path === "string" &&
            wanted.some((w) => r.path.includes(w))
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
        `[withShareExtension] repairing placement: ${buildFileKeys.length} entries → phase ${shareSourcesUuid.slice(0, 8)}`
      );
      // Dedup: one build entry per file wins.
      const seen = new Set();
      const drop = [];
      for (const bf of buildFileKeys) {
        const ref = fresh.PBXBuildFile[bf].fileRef;
        if (seen.has(ref)) drop.push(bf);
        else seen.add(ref);
      }
      for (const gone of drop) {
        delete fresh.PBXBuildFile[gone];
        delete fresh.PBXBuildFile[`${gone}_comment`];
      }
      for (const [phaseUuid, phase] of Object.entries(
        fresh.PBXSourcesBuildPhase || {}
      )) {
        if (phaseUuid.endsWith("_comment")) continue;
        if (phaseUuid === shareSourcesUuid) continue;
        phase.files = (phase.files || []).filter(
          (f) => !buildFileKeys.includes(f.value)
        );
      }
      const sharePhase = fresh.PBXSourcesBuildPhase[shareSourcesUuid];
      sharePhase.files = sharePhase.files || [];
      for (const bf of buildFileKeys) {
        if (drop.includes(bf)) continue;
        if (!sharePhase.files.some((f) => f.value === bf)) {
          sharePhase.files.push({ value: bf, comment: "share in Sources" });
        }
      }
    } else {
      console.log("[withShareExtension] WARNING: share Sources phase not found");
    }
    return config;
  });
};
