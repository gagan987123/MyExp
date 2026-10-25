import AppIntents

/// Exposes "Hey Siri, log expense in MyExp" without any manual Shortcut.
struct MyExpShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AddExpenseIntent(),
      phrases: [
        "Log expense in \(.applicationName)",
        "Add expense in \(.applicationName)",
      ],
      shortTitle: "Add Expense",
      systemImageName: "indianrupeesign.circle"
    )
  }
}
