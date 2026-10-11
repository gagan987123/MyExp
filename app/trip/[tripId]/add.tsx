import "@/global.css";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CategoryIcon from "@/components/CategoryIcon";
import { useCategories } from "@/hooks/useCategories";
import {
  addTripExpense,
  getTripMe,
  listTripMembers,
  setTripMe,
  splitPercentToPaise,
  ValidationError,
  type TripMember,
} from "@/lib/service";

export default function TripAddExpenseScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const categories = useCategories();
  const [members, setMembers] = useState<TripMember[]>([]);
  const [amountText, setAmountText] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [split, setSplit] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<"equal" | "amount" | "percent">(
    "equal"
  );
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(
    {}
  );
  const [customPcts, setCustomPcts] = useState<Record<string, string>>({});
  const [me, setMe] = useState<string | null>(null);
  const [postPersonal, setPostPersonal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!tripId) return;
    try {
      const [ms, meId] = await Promise.all([
        listTripMembers(db, tripId),
        getTripMe(db, tripId).catch(() => null),
      ]);
      setMembers(ms);
      setMe(meId);
      setSplit((prev) =>
        prev.length === 0 ? ms.map((m) => m.id) : prev.filter((id) => ms.some((m) => m.id === id))
      );
      if (!paidBy && ms.length > 0) setPaidBy(ms[0].id);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, tripId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function toggleSplit(id: string) {
    setSplit((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const amount = Number(amountText.replace(/[^0-9.]/g, ""));
  const amountPaise = Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;

  /** Custom paise map for the selected members, or null when unusable. */
  function customPaise(): Record<string, number> | null {
    if (splitMode === "equal" || amountPaise <= 0) return null;
    if (splitMode === "amount") {
      const out: Record<string, number> = {};
      for (const id of split) {
        const n = Number((customAmounts[id] ?? "").replace(/[^0-9.]/g, ""));
        if (!Number.isFinite(n) || n <= 0) return null;
        out[id] = Math.round(n * 100);
      }
      return out;
    }
    const entries: { id: string; pct: number }[] = [];
    for (const id of split) {
      const n = Number((customPcts[id] ?? "").replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(n) || n <= 0) return null;
      entries.push({ id, pct: n });
    }
    const conv = splitPercentToPaise(amountPaise, entries);
    return Object.fromEntries(conv.map((c) => [c.id, c.paise]));
  }

  const customMap = customPaise();
  const customSumPaise =
    customMap == null
      ? 0
      : split.reduce((s, id) => s + (customMap[id] ?? 0), 0);
  const amountLeft = (amountPaise - customSumPaise) / 100;
  const pctSum = split.reduce(
    (s, id) => s + (Number((customPcts[id] ?? "").replace(/[^0-9.]/g, "")) || 0),
    0
  );
  const pctLeft = 100 - pctSum;
  const customValid =
    splitMode === "equal" ||
    (splitMode === "amount" &&
      customMap !== null &&
      customSumPaise === amountPaise) ||
    (splitMode === "percent" &&
      customMap !== null &&
      Math.abs(pctLeft) < 0.005);

  const canSave =
    !saving &&
    categoryId !== null &&
    paidBy !== null &&
    Number.isFinite(amount) &&
    amount > 0 &&
    split.length > 0 &&
    customValid &&
    (!postPersonal || me !== null);

  async function handleSave() {
    if (!canSave || !categoryId || !paidBy) {
      setError(
        postPersonal && me === null
          ? "Pick which member is you (for your personal copy)."
          : "Enter an amount above ₹0, a category, payer and split."
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setTripMe(db, tripId!, me);
      await addTripExpense(db, {
        tripId: tripId!,
        amount,
        category: categoryId,
        note: note.trim() === "" ? null : note.trim(),
        paidBy,
        splitBetween: split,
        splitCustomPaise: splitMode === "equal" ? undefined : (customMap ?? undefined),
        postPersonal,
        myMemberId: me,
      });
      router.back();
    } catch (e) {
      setError(
        e instanceof ValidationError ? e.message : "Couldn't save. Try again."
      );
    } finally {
      setSaving(false);
    }
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
        <Text className="list-title">Trip expense</Text>

        <View className="auth-card" style={{ marginTop: 12 }}>
          <View className="auth-form">
            <View className="auth-field">
              <Text className="auth-label">Amount</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 24,
                    fontWeight: "bold",
                    color: "#F4F1EA",
                    marginRight: 4,
                  }}
                >
                  ₹
                </Text>
                <TextInput
                  className="auth-input"
                  style={{
                    flex: 1,
                    fontSize: 26,
                    lineHeight: 34,
                    minHeight: 62,
                    textAlignVertical: "center",
                    color: "#F4F1EA",
                  }}
                  value={amountText}
                  onChangeText={setAmountText}
                  placeholder="500"
                  placeholderTextColor="rgba(244,241,234,0.35)"
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
            </View>

            <View className="auth-field">
              <Text className="auth-label">Category</Text>
              <View className="category-scroll">
                {categories
                  .filter((c) => c.kind === "expense")
                  .map((c) => {
                    const active = categoryId === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        className={`category-chip ${active ? "category-chip-active" : ""}`}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                        onPress={() => setCategoryId(c.id)}
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
              <Text className="auth-label">Note (optional)</Text>
              <TextInput
                className="auth-input"
                value={note}
                onChangeText={setNote}
                placeholder="e.g. dinner"
                placeholderTextColor="rgba(244,241,234,0.35)"
                returnKeyType="done"
              />
            </View>

            <View className="auth-field">
              <Text className="auth-label">Paid by</Text>
              <View
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
              >
                {members.map((m) => {
                  const active = paidBy === m.id;
                  return (
                    <Pressable
                      key={m.id}
                      className={`category-chip ${active ? "category-chip-active" : ""}`}
                      onPress={() => setPaidBy(m.id)}
                    >
                      <Text
                        className={`category-chip-text ${active ? "category-chip-text-active" : ""}`}
                      >
                        {m.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View className="auth-field">
              <Text className="auth-label">
                Split between ({split.length})
              </Text>
              <View
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
              >
                {members.map((m) => {
                  const active = split.includes(m.id);
                  return (
                    <Pressable
                      key={m.id}
                      className={`category-chip ${active ? "category-chip-active" : ""}`}
                      onPress={() => toggleSplit(m.id)}
                    >
                      <Text
                        className={`category-chip-text ${active ? "category-chip-text-active" : ""}`}
                      >
                        {m.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text className="auth-helper">
                Split equally — extra paise go to the first names listed.
              </Text>
            </View>

            <View className="auth-field">
              <Text className="auth-label">Split style</Text>
              <View className="picker-row">
                {(
                  [
                    ["equal", "Equal"],
                    ["amount", "₹ amounts"],
                    ["percent", "% percent"],
                  ] as const
                ).map(([key, label]) => {
                  const active = splitMode === key;
                  return (
                    <Pressable
                      key={key}
                      className={`picker-option ${active ? "picker-option-active" : ""}`}
                      onPress={() => setSplitMode(key)}
                    >
                      <Text
                        className={`picker-option-text ${active ? "picker-option-text-active" : ""}`}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {splitMode !== "equal" ? (
                <View style={{ marginTop: 8, gap: 8 }}>
                  {split.map((id) => {
                    const m = members.find((x) => x.id === id);
                    if (!m) return null;
                    const isAmount = splitMode === "amount";
                    return (
                      <View
                        key={id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Text
                          style={{
                            flex: 1,
                            fontSize: 15,
                            color: "#F4F1EA",
                          }}
                          numberOfLines={1}
                        >
                          {m.name}
                        </Text>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "600",
                            color: "#F4F1EA",
                          }}
                        >
                          {isAmount ? "₹" : "%"}
                        </Text>
                        <TextInput
                          className="auth-input"
                          style={{ width: 110, textAlign: "right" }}
                          value={
                            isAmount
                              ? (customAmounts[id] ?? "")
                              : (customPcts[id] ?? "")
                          }
                          onChangeText={(t) =>
                            isAmount
                              ? setCustomAmounts((prev) => ({ ...prev, [id]: t }))
                              : setCustomPcts((prev) => ({ ...prev, [id]: t }))
                          }
                          placeholder="0"
                          placeholderTextColor="rgba(244,241,234,0.35)"
                          keyboardType="decimal-pad"
                          returnKeyType="done"
                        />
                      </View>
                    );
                  })}
                  <Text
                    className="auth-helper"
                    style={
                      customValid
                        ? undefined
                        : { color: "#f87171" }
                    }
                  >
                    {splitMode === "amount"
                      ? amountLeft === 0 && customMap !== null
                        ? "Splits add up exactly."
                        : `₹${Math.abs(amountLeft).toFixed(2)} ${amountLeft >= 0 ? "left" : "over"} of ₹${(amountPaise / 100).toFixed(2)}.`
                      : Math.abs(pctLeft) < 0.005 && customMap !== null
                        ? "Splits add up to 100%."
                        : `${Math.abs(pctLeft).toFixed(2)}% ${pctLeft >= 0 ? "left" : "over"} of 100%.`}
                  </Text>
                </View>
              ) : null}
            </View>

            <View className="auth-field">
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text className="auth-label" style={{ marginBottom: 0 }}>
                  Log my share personally
                </Text>
                <Switch
                  value={postPersonal}
                  onValueChange={setPostPersonal}
                  trackColor={{ true: "#ff7a45", false: "#3a4358" }}
                />
              </View>
              {postPersonal ? (
                <View>
                  <Text className="auth-label" style={{ marginTop: 12 }}>
                    Which one is you?
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {members.map((m) => {
                      const active = me === m.id;
                      return (
                        <Pressable
                          key={m.id}
                          className={`category-chip ${active ? "category-chip-active" : ""}`}
                          onPress={() => setMe(active ? null : m.id)}
                        >
                          <Text
                            className={`category-chip-text ${active ? "category-chip-text-active" : ""}`}
                          >
                            {m.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>

            {error ? <Text className="auth-error">{error}</Text> : null}

            <Pressable
              className={`auth-button ${canSave ? "" : "auth-button-disabled"}`}
              disabled={!canSave}
              onPress={handleSave}
            >
              <Text className="auth-button-text">
                {saving ? "Saving…" : "Add to trip"}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
