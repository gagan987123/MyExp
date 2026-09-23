import "@/global.css";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CategoryIcon from "@/components/CategoryIcon";
import { getMonthCategoryTotals, getMonthIncome, listExpenses, type Expense } from "@/lib/service";
import { useCategories, findCategory } from "@/hooks/useCategories";

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

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function groupLabel(dateISO: string, now: Date): string {
  const day = startOfDay(new Date(dateISO)).getTime();
  const today = startOfDay(now).getTime();
  const diffDays = Math.round((today - day) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return new Date(dateISO).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type Group = { label: string; total: number; items: Expense[] };

function groupByDay(expenses: Expense[], now: Date): Group[] {
  const map = new Map<string, Group>();
  for (const e of expenses) {
    const label = groupLabel(e.date, now);
    const group = map.get(label) ?? { label, total: 0, items: [] };
    group.items.push(e);
    group.total += e.amount;
    map.set(label, group);
  }
  return [...map.values()];
}

export default function ExpensesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const categories = useCategories();
  const [groups, setGroups] = useState<Group[]>([]);
  const [count, setCount] = useState(0);
  const [monthTotal, setMonthTotal] = useState(0);
  const [monthIncome, setMonthIncome] = useState(0);
  const [monthBreakdown, setMonthBreakdown] = useState<
    { id: string; amount: number }[]
  >([]);

  const load = useCallback(async () => {
    try {
      const [all, month, income] = await Promise.all([
        listExpenses(db),
        getMonthCategoryTotals(db),
        getMonthIncome(db),
      ]);
      setGroups(groupByDay(all, new Date()));
      setCount(all.length);
      setMonthTotal(month.total);
      setMonthIncome(income);
      setMonthBreakdown(month.byCategory);
    } catch {
      setGroups([]);
      setCount(0);
      setMonthTotal(0);
      setMonthIncome(0);
      setMonthBreakdown([]);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#0B0E17" }}
      edges={["top", "bottom"]}
    >
      <ScrollView style={{ flex: 1, padding: 20 }}>
        <View className="list-head" style={{ marginTop: 0 }}>
          <Text className="list-title">Expenses</Text>
          <Text className="list-action-text">{count} total</Text>
        </View>

        <View className="home-balance-card">
          <Text className="home-balance-label">
            Spent in{" "}
            {new Date().toLocaleString("en-IN", { month: "long" })}
          </Text>
          <Text className="home-balance-amount">{formatINR(monthTotal)}</Text>
          {monthIncome > 0 ? (
            <Text className="home-balance-date" style={{ marginTop: 4 }}>
              Earned {formatINR(monthIncome)}
            </Text>
          ) : null}
          {monthBreakdown.map((b) => {
            const meta = categoryMeta(categories, b.id);
            const pct =
              monthTotal > 0 ? Math.round((b.amount / monthTotal) * 100) : 0;
            return (
              <Pressable
                key={b.id}
                className="home-balance-row"
                style={{ marginTop: 8 }}
                onPress={() => router.push(`/expense/category/${b.id}`)}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <CategoryIcon name={meta.icon} size={16} box={30} tone="dark" />
                  <Text className="home-balance-date">
                    {meta.name} · {pct}%
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text className="home-balance-date">
                    {formatINR(b.amount)}
                  </Text>
                  <Text className="home-balance-date">›</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {groups.length === 0 ? (
          <Text className="home-empty-state">
            Nothing here yet. Add your first expense from the ＋ tab.
          </Text>
        ) : (
          groups.map((g) => (
            <View key={g.label} style={{ marginBottom: 16 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: "rgba(244,241,234,0.6)",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  {g.label}
                </Text>
                <Text style={{ fontWeight: "700", color: "#F4F1EA" }}>
                  {formatINR(g.total)}
                </Text>
              </View>
              <View className="my-5 gap-3" style={{ marginTop: 0, marginBottom: 0 }}>
                {g.items.map((e) => {
                  const meta = categoryMeta(categories, e.category);
                  return (
                    <Pressable
                      key={e.id}
                      className="sub-card"
                      onPress={() => router.push(`/expense/${e.id}`)}
                    >
                      <View className="sub-head">
                        <View className="sub-main">
                          <CategoryIcon
                            name={meta.icon}
                            tone={e.kind === "income" ? "income" : "default"}
                          />
                          <View className="sub-copy">
                            <Text className="sub-title">{meta.name}</Text>
                            <Text className="sub-meta" numberOfLines={1}>
                              {e.note ?? "No note"}
                            </Text>
                          </View>
                        </View>
                        <View className="sub-price-box">
                          <Text className="sub-price">
                            {formatINR(e.amount)}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
