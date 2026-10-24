import { requireNativeModule } from "expo-modules-core";

type DebtRemindersModuleType = {
  getStatus: () => Promise<"granted" | "denied" | "notDetermined">;
  requestPermissions: () => Promise<boolean>;
  scheduleDaily: (
    identifier: string,
    title: string,
    body: string,
    hour: number,
    minute: number
  ) => Promise<void>;
  scheduleOnce: (
    identifier: string,
    title: string,
    body: string,
    timestampMs: number
  ) => Promise<void>;
  cancel: (identifier: string) => Promise<void>;
  cancelWithPrefix: (prefix: string) => Promise<void>;
  pendingIdentifiers: () => Promise<string[]>;
};

function mod(): DebtRemindersModuleType | null {
  try {
    return requireNativeModule<DebtRemindersModuleType>("DebtReminders");
  } catch {
    return null; // Expo Go / missing native build
  }
}

export async function getReminderStatus(): Promise<string> {
  const m = mod();
  if (!m) return "denied";
  try {
    return await m.getStatus();
  } catch {
    return "denied";
  }
}

/** True when allowed (requesting first if undecided). */
export async function ensureReminderPermission(): Promise<boolean> {
  const m = mod();
  if (!m) return false;
  try {
    const status = await m.getStatus();
    if (status === "granted") return true;
    if (status === "denied") return false;
    return await m.requestPermissions();
  } catch {
    return false;
  }
}

export async function scheduleDailyReminder(
  identifier: string,
  title: string,
  body: string,
  hour = 9,
  minute = 0
): Promise<void> {
  await mod()?.scheduleDaily(identifier, title, body, hour, minute);
}

export async function scheduleOnceReminder(
  identifier: string,
  title: string,
  body: string,
  when: Date
): Promise<void> {
  await mod()?.scheduleOnce(identifier, title, body, when.getTime());
}

export async function cancelReminder(identifier: string): Promise<void> {
  try {
    await mod()?.cancel(identifier);
  } catch {
    // ignore
  }
}

export async function cancelRemindersWithPrefix(prefix: string): Promise<void> {
  try {
    await mod()?.cancelWithPrefix(prefix);
  } catch {
    // ignore
  }
}

export async function pendingReminderIds(): Promise<string[]> {
  try {
    return (await mod()?.pendingIdentifiers()) ?? [];
  } catch {
    return [];
  }
}
