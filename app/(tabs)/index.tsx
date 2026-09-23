import "@/global.css";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CategoryIcon from "@/components/CategoryIcon";
import {
  CATEGORIES,
  getMonthTotal,
  listExpenses,
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

function categoryMeta(id: string) {
  return CATEGORIES.find((c) => c.id === id) ?? { id, name: id, icon: "dots-horizontal" };
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [monthTotal, setMonthTotal] = useState(0);
  const [recent, setRecent] = useState<Expense[]>([]);

  const load = useCallback(async () => {
    try {
      const [total, all] = await Promise.all([
        getMonthTotal(db),
        listExpenses(db),
      ]);
      setMonthTotal(total);
      setRecent(all.slice(0, 3));
    } catch {
      // v1: silent fail, empty state covers it
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
          <Pressable
            className="home-add-icon"
            style={{ alignItems: "center", justifyContent: "center" }}
            onPress={() => router.push("/(tabs)/add-expense")}
          >
            <MaterialCommunityIcons name="plus" size={30} color="#F4F1EA" />
          </Pressable>
        </View>

        <View className="home-balance-card" style={{ minHeight: 168 }}>
          <Text className="home-balance-label">Spent in {monthName}</Text>
          <View className="home-balance-row">
            <Text className="home-balance-amount">
              {formatINR(monthTotal)}
            </Text>
            <Text className="home-balance-date">{monthName}</Text>
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

        {recent.length === 0 ? (
          <Text className="home-empty-state">
            No expenses yet. Tap ＋ to add your first one — e.g. ₹100 chai.
          </Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {recent.map((e) => {
              const meta = categoryMeta(e.category);
              return (
                <View key={e.id} className="upcoming-card" style={{ marginRight: 0 }}>
                  <View className="upcoming-row">
                    <CategoryIcon name={meta.icon} />
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

      </ScrollView>
    </SafeAreaView>
  );
}
