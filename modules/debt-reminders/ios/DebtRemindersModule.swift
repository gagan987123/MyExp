import UserNotifications
import ExpoModulesCore

/// Foreground presentation: banners show even with the app open.
final class DebtRemindersDelegate: NSObject, UNUserNotificationCenterDelegate {
  static let shared = DebtRemindersDelegate()

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound, .list])
  }
}

/// Local-only scheduling via UserNotifications. No remote push, no
/// aps-environment entitlement — works with personal Apple IDs.
public class DebtRemindersModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DebtReminders")

    OnCreate {
      UNUserNotificationCenter.current().delegate = DebtRemindersDelegate.shared
    }

    AsyncFunction("getStatus") { () -> String in
      let settings = await UNUserNotificationCenter.current().notificationSettings()
      switch settings.authorizationStatus {
      case .authorized, .provisional, .ephemeral: return "granted"
      case .denied: return "denied"
      default: return "notDetermined"
      }
    }

    AsyncFunction("requestPermissions") { () -> Bool in
      do {
        return try await UNUserNotificationCenter.current()
          .requestAuthorization(options: [.alert, .sound])
      } catch {
        return false
      }
    }

    AsyncFunction("scheduleDaily", { (identifier: String, title: String, body: String, hour: Int, minute: Int) in
      let content = UNMutableNotificationContent()
      content.title = title
      content.body = body
      content.sound = .default
      var comps = DateComponents()
      comps.hour = hour
      comps.minute = minute
      let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: true)
      let center = UNUserNotificationCenter.current()
      center.removePendingNotificationRequests(withIdentifiers: [identifier])
      try await center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
    })

    AsyncFunction("scheduleOnce", { (identifier: String, title: String, body: String, timestampMs: Double) in
      let date = Date(timeIntervalSince1970: timestampMs / 1000)
      let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
      let content = UNMutableNotificationContent()
      content.title = title
      content.body = body
      content.sound = .default
      let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
      let center = UNUserNotificationCenter.current()
      center.removePendingNotificationRequests(withIdentifiers: [identifier])
      try await center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
    })

    AsyncFunction("cancel", { (identifier: String) in
      UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])
    })

    AsyncFunction("cancelWithPrefix", { (prefix: String) in
      let center = UNUserNotificationCenter.current()
      let pending = await center.pendingNotificationRequests()
      let ids = pending.map(\.identifier).filter { $0.hasPrefix(prefix) }
      center.removePendingNotificationRequests(withIdentifiers: ids)
    })

    AsyncFunction("pendingIdentifiers") { () -> [String] in
      await UNUserNotificationCenter.current().pendingNotificationRequests().map(\.identifier)
    }
  }
}
