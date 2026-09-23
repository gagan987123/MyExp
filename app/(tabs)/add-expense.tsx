import "@/global.css";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ExpenseForm from "@/components/ExpenseForm";
import { useCategories } from "@/hooks/useCategories";
import { addExpense, matchCategory } from "@/lib/service";

/**
 * Deep-link intake for Siri / Shortcuts (Phase A voice).
 *
 *   expensetracker://add-expense?amount=100&category=petrol&note=chai&save=1
 *
 * - amount / category / note prefill the form (category is fuzzy-matched).
 * - save=1 auto-submits via the SAME addExpense() service the UI uses.
 * - Without save=1 the user reviews and taps once.
 */
export default function AddExpenseScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const categories = useCategories();
  const params = useLocalSearchParams<{
    amount?: string;
    category?: string;
    note?: string;
    save?: string;
  }>();

  const paramAmount = params.amount != null ? Number(params.amount) : undefined;
  // Voice intake defaults an unmatched/missing category to Other so a
  // Siri command with just an amount still saves (user recategorizes later).
  const paramCategory =
    matchCategory(params.category) ??
    (params.amount != null || params.note != null ? "other" : undefined);
  const hasParams =
    params.amount != null || params.category != null || params.note != null;
  const autoSubmit =
    params.save === "1" &&
    hasParams &&
    paramAmount != null &&
    Number.isFinite(paramAmount) &&
    paramAmount > 0 &&
    paramCategory != null;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#0B0E17" }}
      edges={["top", "bottom"]}
    >
      <ScrollView
        style={{ flex: 1, padding: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="list-title">Add expense</Text>
        {hasParams && !autoSubmit ? (
          <Text className="home-empty-state">
            Prefilled from voice — review and tap Add expense.
          </Text>
        ) : null}
        <ExpenseForm
          key={`${params.amount ?? ""}|${params.category ?? ""}|${params.note ?? ""}`}
          initial={{
            amount: paramAmount,
            category: paramCategory,
            note: params.note,
            date: new Date(),
          }}
          categories={categories}
          submitLabel="Add expense"
          autoSubmit={autoSubmit}
          onSubmit={async (value) => {
            await addExpense(db, value);
            router.push("/(tabs)");
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
