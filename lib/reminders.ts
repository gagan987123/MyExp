import { Linking } from "react-native";
import { deleteKv, getKv, setKv } from "./queries";
import {
  cancelRemindersWithPrefix,
  ensureReminderPermission,
  pendingReminderIds,
  scheduleDailyReminder,
  scheduleOnceReminder,
} from "debt-reminders";
import {
  getMyReceivables,
  isValidPhone,
  normalizePhone,
  type Receivable,
} from "./service";
import type { SQLiteDatabase } from "expo-sqlite";

const TOGGLE_KEY = "debt-reminders-on";
const AUTO_PREFIX = "debt-auto-";

/** On unless explicitly switched off. */
export async function areDebtRemindersOn(db: SQLiteDatabase): Promise<boolean> {
  try {
    return (await getKv(db, TOGGLE_KEY)) !== "0";
  } catch {
    return true;
  }
}

export async function setDebtRemindersOn(
  db: SQLiteDatabase,
  on: boolean
): Promise<void> {
  try {
    if (on) await deleteKv(db, TOGGLE_KEY);
    else await setKv(db, TOGGLE_KEY, "0");
  } catch {
    // best effort
  }
}

function formatINR(amount: number): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `Rs.${amount}`;
  }
}

function autoId(r: Receivable): string {
  return `${AUTO_PREFIX}${r.key}`;
}

/**
 * Reconciles the daily 9 AM alarms with reality: cancels alarms for
 * settled debts, schedules alarms for new ones. Idempotent — safe to
 * run on every screen focus. Never prompts; callers handle permission.
 */
export async function syncDebtReminders(db: SQLiteDatabase): Promise<void> {
  try {
    if (!(await areDebtRemindersOn(db))) {
      await cancelRemindersWithPrefix(AUTO_PREFIX);
      return;
    }
    if (!(await ensureReminderPermission())) return;
    const receivables = await getMyReceivables(db);
    const wanted = new Set(receivables.map((r) => autoId(r)));
    const pending = await pendingReminderIds();
    const have = new Set(pending.filter((id) => id.startsWith(AUTO_PREFIX)));
    await Promise.all(
      [...have]
        .filter((id) => !wanted.has(id))
        .map((id) =>
          cancelRemindersWithPrefix(id).catch(() => {})
        )
    );
    await Promise.all(
      receivables
        .filter((r) => !have.has(autoId(r)))
        .map((r) =>
          scheduleDailyReminder(
            autoId(r),
            `${r.person} owes you ${formatINR(r.amount)}`,
            `${r.context} — tap to open and nudge.`
          ).catch(() => {})
        )
    );
  } catch {
    // Native module missing (Expo Go): silent.
  }
}

/** One-shot "remind me tomorrow 9 AM" for a single debt. Survives syncs. */
export async function remindOnce(db: SQLiteDatabase, r: Receivable): Promise<boolean> {
  try {
    if (!(await ensureReminderPermission())) return false;
    const when = new Date();
    when.setDate(when.getDate() + 1);
    when.setHours(9, 0, 0, 0);
    await scheduleOnceReminder(
      `debt-once-${r.key}-${Date.now()}`,
      `Follow up: ${r.person} owes you ${formatINR(r.amount)}`,
      `${r.context} — tap to open and nudge.`,
      when
    );
    return true;
  } catch {
    return false;
  }
}

export function nudgeMessage(r: Receivable): string {
  const amount = formatINR(r.amount);
  return r.kind === "trip"
    ? `Hi ${r.person}! Quick reminder — ${amount} is still pending from our ${r.context} trip 🙂`
    : `Hi ${r.person}! Quick reminder — ${amount} I lent you${r.context && r.context !== "Personal loan" ? ` (${r.context})` : ""} is still pending 🙂`;
}

/** Opens the Messages composer with recipient + text. False = unavailable. */
export async function openSmsNudge(phone: string, text: string): Promise<boolean> {
  try {
    const to = normalizePhone(phone);
    if (!isValidPhone(to)) return false;
    const url = `sms:${to}&body=${encodeURIComponent(text)}`;
    if (!(await Linking.canOpenURL(url))) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Opens WhatsApp's share picker with the nudge prefilled. False = not installed. */
export async function openWhatsAppNudge(text: string): Promise<boolean> {
  try {
    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    if (!(await Linking.canOpenURL(url))) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
