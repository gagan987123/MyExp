import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import CategoryIcon from "@/components/CategoryIcon";
import {
  DEFAULT_CATEGORIES,
  ValidationError,
  type CategoryEntry,
  type EntryKind,
} from "@/lib/service";

export type ExpenseFormValue = {
  amount: number;
  category: string;
  note: string | null;
  date: Date;
  kind: EntryKind;
};

export type ExpenseFormInitial = {
  amount?: number;
  category?: string;
  note?: string | null;
  date?: Date | string;
  kind?: EntryKind;
};

function toDate(input?: Date | string): Date {
  if (input instanceof Date) return new Date(input);
  if (typeof input === "string") {
    const d = new Date(input);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function shiftDay(date: Date, delta: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ExpenseForm({
  initial,
  submitLabel,
  onSubmit,
  autoSubmit,
  categories = DEFAULT_CATEGORIES,
}: {
  initial?: ExpenseFormInitial;
  submitLabel: string;
  onSubmit: (value: ExpenseFormValue) => Promise<void>;
  /** Submit once on mount (deep-link / Siri intake). Only fires when valid. */
  autoSubmit?: boolean;
  categories?: CategoryEntry[];
}) {
  const [amountText, setAmountText] = useState(
    initial?.amount != null ? String(initial.amount) : ""
  );
  const [category, setCategory] = useState<string | null>(
    initial?.category ?? null
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [date, setDate] = useState<Date>(() => toDate(initial?.date));
  const [kind, setKind] = useState<EntryKind>(initial?.kind ?? "expense");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const autoSubmitted = useRef(false);

  const amount = Number(amountText.replace(/[^0-9.]/g, ""));
  const canSave =
    !saving && category !== null && Number.isFinite(amount) && amount > 0;

  async function handleSubmit() {
    if (!canSave || !category) {
      setError("Enter an amount above ₹0 and pick a category.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        amount,
        category,
        note: note.trim() === "" ? null : note,
        date,
        kind,
      });
    } catch (e) {
      setError(
        e instanceof ValidationError
          ? e.message
          : "Couldn't save. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (autoSubmit && !autoSubmitted.current) {
      autoSubmitted.current = true;
      const t = setTimeout(() => {
        handleSubmit();
      }, 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View className="auth-card">
      <View className="auth-form">
        <View className="picker-row">
          {(["expense", "income"] as EntryKind[]).map((k) => {
            const active = kind === k;
            return (
              <Pressable
                key={k}
                className={`picker-option ${active ? "picker-option-active" : ""}`}
                onPress={() => {
                  setKind(k);
                  if (k === "income") setCategory("salary");
                  else if (category === "salary") setCategory(null);
                }}
              >
                <Text
                  className={`picker-option-text ${active ? "picker-option-text-active" : ""}`}
                >
                  {k === "expense" ? "Money out" : "Money in"}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
              style={{ flex: 1, fontSize: 24 }}
              value={amountText}
              onChangeText={setAmountText}
              placeholder="100"
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
          <Text className="auth-label">Note (optional)</Text>
          <TextInput
            className="auth-input"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. chai"
            placeholderTextColor="rgba(244,241,234,0.35)"
            returnKeyType="done"
          />
        </View>

        <View className="auth-field">
          <Text className="auth-label">Date</Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Pressable
              className="list-action"
              onPress={() => setDate((d) => shiftDay(d, -1))}
            >
              <Text className="list-action-text">‹</Text>
            </Pressable>
            <Text
              style={{ fontSize: 16, fontWeight: "600", color: "#F4F1EA" }}
            >
              {formatDay(date)}
            </Text>
            <Pressable
              className="list-action"
              onPress={() => setDate((d) => shiftDay(d, 1))}
            >
              <Text className="list-action-text">›</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => setDate(new Date())}>
            <Text className="auth-link" style={{ marginTop: 8 }}>
              Reset to today
            </Text>
          </Pressable>
        </View>

        {error ? <Text className="auth-error">{error}</Text> : null}

        <Pressable
          className={`auth-button ${canSave ? "" : "auth-button-disabled"}`}
          onPress={handleSubmit}
          disabled={!canSave}
        >
          <Text className="auth-button-text">
            {saving ? "Saving…" : submitLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
