import "@/global.css";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CategoryIcon from "@/components/CategoryIcon";
import ExportSheet from "@/components/ExportSheet";
import MonthInsights from "@/components/MonthInsights";
import { syncSharedAiFiles } from "@/lib/aiKey";
import { useCategories, findCategory } from "@/hooks/useCategories";
import {
  getMonthCategoryTotals,
  getMonthIncome,
  getMonthTotal,
  getMonthlyHistory,
  listExpenses,
  listRecurringTemplates,
  postDueRecurring,
  type Expense,
  type MonthlyPoint,
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

function categoryMeta(categories: ReturnType<typeof useCategories>, id: string) {
  return findCategory(categories, id);
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const categories = useCategories();
  const [monthTotal, setMonthTotal] = useState(0);
  const [monthIncome, setMonthIncome] = useState(0);
  const [recent, setRecent] = useState<Expense[]>([]);
  const [hasRecurring, setHasRecurring] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [breakdown, setBreakdown] = useState<
    { id: string; amount: number }[]
  >([]);
  const [history, setHistory] = useState<MonthlyPoint[]>([]);

  const load = useCallback(async () => {
    try {
      // Keep Siri's shared key copies in sync (self-heal old installs).
      await syncSharedAiFiles(db).catch(() => {});
      // Post any due recurring salary/EMIs first (idempotent catch-up).
      await postDueRecurring(db).catch(() => []);
      const [total, income, all, templates, month, hist] = await Promise.all([
        getMonthTotal(db),
        getMonthIncome(db),
        listExpenses(db),
        listRecurringTemplates(db),
        getMonthCategoryTotals(db),
        getMonthlyHistory(db, 6),
      ]);
      setMonthTotal(total);
      setMonthIncome(income);
      setRecent(all.slice(0, 4));
      setHasRecurring(templates.length > 0);
      setBreakdown(month.byCategory);
      setHistory(hist);
    } catch {
      // v1: silent fail, empty state covers it
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Siri can save while we're suspended; foregrounding doesn't refire
  // navigation focus, so refetch explicitly on wake.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => sub.remove();
  }, [load]);

  const monthName = new Date().toLocaleString("en-IN", { month: "long" });

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#0B0E17" }}
      edges={["top", "bottom"]}
    >
      <ScrollView style={{ flex: 1, padding: 20 }}>
        <View className="home-header mt-2">
          <View className="home-user">
            <View
              className="home-avatar"
              style={{
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#ff7a45",
              }}
            >
              <MaterialCommunityIcons name="wallet" size={30} color="#0B0E17" />
            </View>
            <Text className="home-user-name">MyExp</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Pressable
              className="home-add-icon"
              style={{ alignItems: "center", justifyContent: "center" }}
              onPress={() => setShowExport(true)}
            >
              <MaterialCommunityIcons
                name="download"
                size={26}
                color="#F4F1EA"
              />
            </Pressable>
            <Pressable
              className="home-add-icon"
              style={{ alignItems: "center", justifyContent: "center" }}
              onPress={() => router.push("/(tabs)/add-expense")}
            >
              <MaterialCommunityIcons name="plus" size={30} color="#F4F1EA" />
            </Pressable>
          </View>
        </View>

        <ExportSheet
          visible={showExport}
          onClose={() => setShowExport(false)}
        />

        <View className="home-balance-card" style={{ minHeight: 168 }}>
          <Text className="home-balance-label">Spent in {monthName}</Text>
          <View className="home-balance-row">
            <Text className="home-balance-amount">
              {formatINR(monthTotal)}
            </Text>
            <Text className="home-balance-date">{monthName}</Text>
          </View>
          <View className="home-balance-row" style={{ marginTop: 4 }}>
            <Text className="home-balance-date">
              Earned {formatINR(monthIncome)}
            </Text>
            <Text className="home-balance-date">
              Balance {formatINR(monthIncome - monthTotal)}
            </Text>
          </View>
        </View>

        <View className="list-head">
          <Text className="list-title">Recent</Text>
          <Pressable
            className="list-action"
            onPress={() => router.push("/(tabs)/expenses")}
          >
            <Text className="list-action-text">See all</Text>
          </Pressable>
        </View>

        {!hasRecurring ? (
          <Pressable
            onPress={() => router.push("/recurring")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              backgroundColor: "rgba(255,122,69,0.12)",
              borderWidth: 1,
              borderColor: "rgba(255,122,69,0.45)",
              borderRadius: 16,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <MaterialCommunityIcons
              name="autorenew"
              size={28}
              color="#ff7a45"
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontWeight: "700", fontSize: 15, color: "#F4F1EA" }}
              >
                Salary & EMIs on autopilot
              </Text>
              <Text style={{ fontSize: 13, color: "rgba(244,241,234,0.65)" }}>
                Set it once — they post every month. Tap to start ›
              </Text>
            </View>
          </Pressable>
        ) : null}

        {recent.length === 0 ? (
          <Text className="home-empty-state">
            No expenses yet. Tap ＋ to add your first one — e.g. ₹100 chai.
          </Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {recent.map((e) => {
              const meta = categoryMeta(categories, e.category);
              return (
                <View
                  key={e.id}
                  className="upcoming-card"
                  style={{ marginRight: 0, width: "48%", aspectRatio: 1 }}
                >
                  <View className="upcoming-row">
                    <CategoryIcon
                      name={meta.icon}
                      tone={e.kind === "income" ? "income" : "default"}
                    />
                    <View>
                      <Text className="upcoming-price">
                        {formatINR(e.amount)}
                      </Text>
                      <Text className="upcoming-meta">{meta.name}</Text>
                    </View>
                  </View>
                  <Text className="upcoming-name" numberOfLines={1}>
                    {e.note ?? meta.name}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <MonthInsights
          total={monthTotal}
          byCategory={breakdown}
          history={history}
        />

      </ScrollView>
    </SafeAreaView>
  );
}
