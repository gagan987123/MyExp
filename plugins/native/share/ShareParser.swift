import Foundation

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
      "(?:₹|Rs\\.?|INR)\\s*([\\d,]+(?:\\.\\d{1,2})?)",
      "([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:rupees?|INR)",
    ]
    let verbGlued = [
      "\\bpaid\\s+(?:₹|Rs\\.?|INR|\\bR\\b)?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
      "\\bsent\\s+(?:₹|Rs\\.?|INR|\\bR\\b)?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
      "\\bpayment\\s+of\\s+(?:₹|Rs\\.?|INR|\\bR\\b)?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
      "\\bamount\\s*:?\\s*(?:₹|Rs\\.?|INR|\\bR\\b)?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
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
    let wordPattern = "\\b((?:" + numWords + ")(?:[\\s-]+(?:" + numWords + "))*)\\s+rupees?\\b"
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
    let toPattern = "\\bto\\s+([A-Za-z][A-Za-z0-9 .&'\\-]{0,39}?)(?=\\s+(?:successfully|successful|completed|via|using|through|with|on|from|UPI)\\b|[.,;]|$)"
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
    let pattern = "([A-Za-z][A-Za-z .\\'\\-]{0,38}?)\\s*[\\w.\\-]*\\s*@\\s*[a-zA-Z]{2,}"
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
    let keyword = "(?:UTR|UPI\\s*Ref(?:erence)?(?:\\s*No\\.?)?|Transaction\\s*(?:ID|No\\.?)|Order\\s*ID|Ref(?:erence)?(?:\\s*No\\.?)?)\\s*[:#]?\\s*"
    if let re = try? NSRegularExpression(pattern: keyword + "(\\d[\\d\\s]{4,24}\\d)", options: [.caseInsensitive]) {
      for m in re.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
        guard m.numberOfRanges > 1, let r = Range(m.range(at: 1), in: text) else { continue }
        let digits = String(text[r]).replacingOccurrences(of: "\\s+", with: "", options: .regularExpression)
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
    let text = "\(payee ?? "") \(note)".lowercased()
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
    let flat = text.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return flat.count > 160 ? String(flat.prefix(160)) + "…" : flat
  }
}
