import "@/global.css";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CATEGORIES, getMonthCategoryTotals, listExpenses, type CategoryId, type Expense } from "@/lib/service";

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

function categoryMeta(id: string) {
  return CATEGORIES.find((c) => c.id === id) ?? { id, name: id, icon: "📦" };
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
  const [groups, setGroups] = useState<Group[]>([]);
  const [count, setCount] = useState(0);
  const [monthTotal, setMonthTotal] = useState(0);
  const [monthBreakdown, setMonthBreakdown] = useState<
    { id: CategoryId; amount: number }[]
  >([]);

  const load = useCallback(async () => {
    try {
      const [all, month] = await Promise.all([
        listExpenses(db),
        getMonthCategoryTotals(db),
      ]);
      setGroups(groupByDay(all, new Date()));
      setCount(all.length);
      setMonthTotal(month.total);
      setMonthBreakdown(month.byCategory);
    } catch {
      setGroups([]);
      setCount(0);
      setMonthTotal(0);
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
      style={{ flex: 1, backgroundColor: "#fff9e3" }}
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
          {monthBreakdown.map((b) => {
            const meta = categoryMeta(b.id);
            const pct =
              monthTotal > 0 ? Math.round((b.amount / monthTotal) * 100) : 0;
            return (
              <View key={b.id} className="home-balance-row" style={{ marginTop: 8 }}>
                <Text className="home-balance-date">
                  {meta.icon} {meta.name} · {pct}%
                </Text>
                <Text className="home-balance-date">
                  {formatINR(b.amount)}
                </Text>
              </View>
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
                    color: "rgba(0,0,0,0.6)",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  {g.label}
                </Text>
                <Text style={{ fontWeight: "700", color: "#081126" }}>
                  {formatINR(g.total)}
                </Text>
              </View>
              <View className="my-5 gap-3" style={{ marginTop: 0, marginBottom: 0 }}>
                {g.items.map((e) => {
                  const meta = categoryMeta(e.category);
                  return (
                    <Pressable
                      key={e.id}
                      className="sub-card"
                      onPress={() => router.push(`/expense/${e.id}`)}
                    >
                      <View className="sub-head">
                        <View className="sub-main">
                          <Text className="text-3xl">{meta.icon}</Text>
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
