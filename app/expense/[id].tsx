import "@/global.css";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ExpenseForm from "@/components/ExpenseForm";
import CategoryIcon from "@/components/CategoryIcon";
import {
  CATEGORIES,
  editExpense,
  fetchExpenseById,
  removeExpense,
  type Expense,
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

export default function ExpenseDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setExpense(await fetchExpenseById(db, id));
      setMissing(false);
    } catch {
      setMissing(true);
    }
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onDelete() {
    if (!id) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    try {
      await removeExpense(db, id);
      router.back();
    } catch {
      setConfirmingDelete(false);
    }
  }

  const meta = expense
    ? (CATEGORIES.find((c) => c.id === expense.category) ?? {
        id: expense.category,
        name: expense.category,
        icon: "dots-horizontal",
      })
    : null;

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

        {missing ? (
          <Text className="home-empty-state">
            This expense no longer exists.
          </Text>
        ) : !expense || !meta ? (
          <Text className="home-empty-state">Loading…</Text>
        ) : editing ? (
          <>
            <Text className="list-title">Edit expense</Text>
            <ExpenseForm
              initial={{
                amount: expense.amount,
                category: expense.category,
                note: expense.note,
                date: expense.date,
              }}
              submitLabel="Save changes"
              onSubmit={async (value) => {
                const updated = await editExpense(db, { id: expense.id, ...value });
                setExpense(updated);
                setEditing(false);
              }}
            />
            <Pressable
              className="auth-secondary-button"
              style={{ marginTop: 12 }}
              onPress={() => setEditing(false)}
            >
              <Text className="auth-secondary-button-text">Cancel</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View className="home-balance-card">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <CategoryIcon name={meta.icon} size={20} box={40} />
                <Text className="home-balance-label">{meta.name}</Text>
              </View>
              <Text className="home-balance-amount">
                {formatINR(expense.amount)}
              </Text>
              <Text className="home-balance-date">
                {new Date(expense.date).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </Text>
            </View>

            <View className="sub-card" style={{ marginTop: 16 }}>
              <View className="sub-details">
                <View className="sub-row">
                  <Text className="sub-label">Note</Text>
                  <Text className="sub-value" numberOfLines={2}>
                    {expense.note ?? "—"}
                  </Text>
                </View>
                <View className="sub-row">
                  <Text className="sub-label">Added</Text>
                  <Text className="sub-value">
                    {new Date(expense.createdAt).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <Pressable
                className="auth-button"
                style={{ flex: 1 }}
                onPress={() => {
                  setConfirmingDelete(false);
                  setEditing(true);
                }}
              >
                <Text className="auth-button-text">Edit</Text>
              </Pressable>
              <Pressable
                style={{
                  flex: 1,
                  alignItems: "center",
                  borderRadius: 16,
                  paddingVertical: 16,
                  backgroundColor: confirmingDelete ? "#f87171" : "transparent",
                  borderWidth: 1,
                  borderColor: "#f87171",
                }}
                onPress={onDelete}
              >
                <Text
                  style={{
                    fontWeight: "700",
                    color: confirmingDelete ? "#fff" : "#f87171",
                  }}
                >
                  {confirmingDelete ? "Tap again to delete" : "Delete"}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
