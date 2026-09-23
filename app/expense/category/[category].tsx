import "@/global.css";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CategoryIcon from "@/components/CategoryIcon";
import {
  CATEGORIES,
  listExpenses,
  type CategoryId,
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

export default function CategoryExpensesScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [items, setItems] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);

  const meta = CATEGORIES.find((c) => c.id === category) ?? {
    id: category ?? "other",
    name: category ?? "Other",
    icon: "dots-horizontal",
  };
  const monthName = new Date().toLocaleString("en-IN", { month: "long" });

  const load = useCallback(async () => {
    try {
      const all = await listExpenses(db);
      const now = new Date();
      const mine = all.filter((e) => {
        const d = new Date(e.date);
        return (
          e.category === category &&
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth()
        );
      });
      setItems(mine);
      setTotal(mine.reduce((sum, e) => sum + e.amount, 0));
    } catch {
      setItems([]);
      setTotal(0);
    }
  }, [db, category]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const groups = new Map<string, Expense[]>();
  for (const e of items) {
    const label = groupLabel(e.date, new Date());
    groups.set(label, [...(groups.get(label) ?? []), e]);
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#0B0E17" }}
      edges={["top", "bottom"]}
    >
      <ScrollView style={{ flex: 1, padding: 20 }}>
        <Pressable onPress={() => router.back()} style={{ marginBottom: 12 }}>
          <Text className="auth-link">‹ Back</Text>
        </Pressable>

        <View className="home-balance-card">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <CategoryIcon
              name={meta.icon}
              size={20}
              box={40}
              tone="dark"
            />
            <Text className="home-balance-label">
              {meta.name} · {monthName}
            </Text>
          </View>
          <Text className="home-balance-amount">{formatINR(total)}</Text>
          <Text className="home-balance-date">
            {items.length} expense{items.length === 1 ? "" : "s"} this month
          </Text>
        </View>

        {items.length === 0 ? (
          <Text className="home-empty-state">
            No {meta.name} expenses this month yet.
          </Text>
        ) : (
          [...groups.entries()].map(([label, list]) => (
            <View key={label} style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: "rgba(244,241,234,0.6)",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 8,
                }}
              >
                {label}
              </Text>
              <View className="my-5 gap-3" style={{ marginTop: 0, marginBottom: 0 }}>
                {list.map((e) => (
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
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
