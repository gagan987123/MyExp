import SQLite3
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
      self.handle(text: kept.joined(separator: "\n"))
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
        self.fail("Couldn't find an amount in this. Got: \(ShareParser.preview(text)) Tip: screenshot the receipt and share the photo instead.")
      }
    }
  }

  private func loadCustoms() {
    customs = []
    guard let dir = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: "group.com.gagan987123.myexp")
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
      forSecurityApplicationGroupIdentifier: "group.com.gagan987123.myexp")
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
      "state": "User spent money on: \(text)",
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
    request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
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
      note = "\(base) · UPI \(ref)"
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
          text: "\(payment.payee ?? "") \(note)",
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
      forSecurityApplicationGroupIdentifier: "group.com.gagan987123.myexp")
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
    amountLabel.text = inr.string(from: NSNumber(value: payment.amount)) ?? "₹\(Int(payment.amount))"
    payeeLabel.text = payment.payee ?? "Unknown payee"
    if let payee = payment.payee {
      noteField.text = payee
    }
    categoryLabel.text = "Category: \(category(for: payment, note: noteField.text ?? ""))"
    if let ref = payment.ref {
      refLabel.text = "UPI ref \(ref)"
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
    categoryLabel.text = "Category: \(category(for: payment, note: noteField.text ?? ""))"
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
