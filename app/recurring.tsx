import "@/global.css";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CategoryIcon from "@/components/CategoryIcon";
import { useCategories, findCategory } from "@/hooks/useCategories";
import {
  ValidationError,
  addRecurringTemplate,
  listRecurringTemplates,
  removeRecurringTemplate,
  setRecurringTemplateActive,
  type EntryKind,
  type RecurringTemplate,
} from "@/lib/service";

function formatINR(amount: number): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `Rs.${amount}`;
  }
}

function ordinal(n: number): string {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

export default function RecurringScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const categories = useCategories();
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [kind, setKind] = useState<EntryKind>("expense");
  const [amountText, setAmountText] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [day, setDay] = useState(5);
  const [installmentsText, setInstallmentsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setTemplates(await listRecurringTemplates(db));
    } catch {
      setTemplates([]);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onSave() {
    const amount = Number(amountText.replace(/[^0-9.]/g, ""));
    const installments =
      installmentsText.trim() === "" ? null : Number(installmentsText);
    const now = new Date();
    setSaving(true);
    setError(null);
    try {
      await addRecurringTemplate(db, {
        kind,
        amount,
        category: category ?? "",
        note: note.trim() === "" ? null : note,
        dayOfMonth: day,
        startYear: now.getFullYear(),
        startMonth: now.getMonth() + 1,
        totalInstallments: installments,
      });
      setAmountText("");
      setCategory(null);
      setNote("");
      setDay(5);
      setInstallmentsText("");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(
        e instanceof ValidationError ? e.message : "Couldn't save. Try again."
      );
    } finally {
      setSaving(false);
    }
  }

  function describe(t: RecurringTemplate): string {
    const left =
      t.totalInstallments == null
        ? "ongoing"
        : `${Math.max(t.totalInstallments - t.postedCount, 0)} left`;
    return `${t.dayOfMonth}${ordinal(t.dayOfMonth)} monthly · ${left}${t.active ? "" : " · paused"}`;
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#0B0E17" }}
      edges={["top", "bottom"]}
    >
      <ScrollView
        style={{ flex: 1, padding: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} style={{ marginBottom: 12 }}>
          <Text className="auth-link">‹ Back</Text>
        </Pressable>
        <Text className="list-title">Recurring</Text>
        <Text className="home-empty-state">
          Salary and EMIs post themselves every month when you open the app.
        </Text>

        {templates.map((t) => {
          const meta = findCategory(categories, t.category);
          return (
            <View key={t.id} className="sub-card" style={{ marginBottom: 12 }}>
              <View className="sub-head">
                <View className="sub-main">
                  <CategoryIcon
                    name={meta.icon}
                    tone={t.kind === "income" ? "income" : "default"}
                  />
                  <View className="sub-copy">
                    <Text className="sub-title">
                      {t.note ?? meta.name} · {formatINR(t.amount)}
                    </Text>
                    <Text className="sub-meta">
                      {t.kind === "income" ? "Money in" : "Money out"} ·{" "}
                      {meta.name} · {describe(t)}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Pressable
                  className="list-action"
                  onPress={async () => {
                    await setRecurringTemplateActive(db, t.id, !t.active);
                    await load();
                  }}
                >
                  <Text className="list-action-text">
                    {t.active ? "Pause" : "Resume"}
                  </Text>
                </Pressable>
                <Pressable
                  className="list-action"
                  onPress={async () => {
                    await removeRecurringTemplate(db, t.id);
                    await load();
                  }}
                >
                  <Text className="list-action-text">Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        {!showForm ? (
          <Pressable className="auth-button" onPress={() => setShowForm(true)}>
            <Text className="auth-button-text">＋ New recurring</Text>
          </Pressable>
        ) : (
          <View className="auth-card">
            <View className="auth-form">
              <View className="picker-row">
                {(["expense", "income"] as EntryKind[]).map((k) => (
                  <Pressable
                    key={k}
                    className={`picker-option ${kind === k ? "picker-option-active" : ""}`}
                    onPress={() => {
                      setKind(k);
                      if (k === "income") setCategory("salary");
                      else if (category === "salary") setCategory(null);
                    }}
                  >
                    <Text
                      className={`picker-option-text ${kind === k ? "picker-option-text-active" : ""}`}
                    >
                      {k === "expense" ? "Money out" : "Money in"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View className="auth-field">
                <Text className="auth-label">Amount</Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    style={{ fontSize: 24, fontWeight: "bold", color: "#F4F1EA", marginRight: 4 }}
                  >
                    ₹
                  </Text>
                  <TextInput
                    className="auth-input"
                    style={{ flex: 1, fontSize: 24 }}
                    value={amountText}
                    onChangeText={setAmountText}
                    placeholder="12000"
                    placeholderTextColor="rgba(244,241,234,0.35)"
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                </View>
              </View>

              <View className="auth-field">
                <Text className="auth-label">Category</Text>
                <View className="category-scroll">
                  {categories.map((c) => {
                    const active = category === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        className={`category-chip ${active ? "category-chip-active" : ""}`}
                        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                        onPress={() => setCategory(c.id)}
                      >
                        <CategoryIcon name={c.icon} size={15} box={26} />
                        <Text
                          className={`category-chip-text ${active ? "category-chip-text-active" : ""}`}
                        >
                          {c.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View className="auth-field">
                <Text className="auth-label">Note (e.g. HDFC EMI)</Text>
                <TextInput
                  className="auth-input"
                  value={note}
                  onChangeText={setNote}
                  placeholder="HDFC EMI"
                  placeholderTextColor="rgba(244,241,234,0.35)"
                  returnKeyType="done"
                />
              </View>

              <View className="auth-field">
                <Text className="auth-label">Day of month: {day}</Text>
                <View
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                >
                  <Pressable
                    className="list-action"
                    onPress={() => setDay((d) => Math.max(1, d - 1))}
                  >
                    <Text className="list-action-text">‹</Text>
                  </Pressable>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: "#F4F1EA" }}>
                    {day} of every month
                  </Text>
                  <Pressable
                    className="list-action"
                    onPress={() => setDay((d) => Math.min(28, d + 1))}
                  >
                    <Text className="list-action-text">›</Text>
                  </Pressable>
                </View>
              </View>

              <View className="auth-field">
                <Text className="auth-label">Months (empty = forever)</Text>
                <TextInput
                  className="auth-input"
                  value={installmentsText}
                  onChangeText={setInstallmentsText}
                  placeholder="e.g. 18"
                  placeholderTextColor="rgba(244,241,234,0.35)"
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </View>

              {error ? <Text className="auth-error">{error}</Text> : null}

              <Pressable className="auth-button" onPress={onSave} disabled={saving}>
                <Text className="auth-button-text">
                  {saving ? "Saving…" : "Start recurring"}
                </Text>
              </Pressable>
              <Pressable
                className="auth-secondary-button"
                style={{ marginTop: 4 }}
                onPress={() => setShowForm(false)}
              >
                <Text className="auth-secondary-button-text">Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
