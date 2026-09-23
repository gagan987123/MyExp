import { PieChart, BarChart } from "react-native-gifted-charts";
import { Text, View } from "react-native";
import CategoryIcon from "@/components/CategoryIcon";
import { useCategories, findCategory } from "@/hooks/useCategories";
import {
  type MonthlyPoint,
} from "@/lib/service";

export const CATEGORY_COLORS: Record<string, string> = {
  food: "#ff7a45",
  transport: "#60a5fa",
  petrol: "#fbbf24",
  shopping: "#c084fc",
  bills: "#34d399",
  entertainment: "#f472b6",
  health: "#2dd4bf",
  travel: "#818cf8",
  salary: "#34d399",
  other: "#94a3b8",
};

function formatShort(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}k`;
  return `₹${Math.round(amount)}`;
}

export default function MonthInsights({
  total,
  byCategory,
  history,
}: {
  total: number;
  byCategory: { id: string; amount: number }[];
  history: MonthlyPoint[];
}) {
  const categories = useCategories();
  if (total <= 0) return null;

  const top = byCategory.slice(0, 5);
  const rest = byCategory.slice(5);
  const restTotal = rest.reduce((s, b) => s + b.amount, 0);
  const pieData = [
    ...top.map((b) => ({
      value: b.amount,
      color: CATEGORY_COLORS[b.id] ?? "#94a3b8",
    })),
    ...(restTotal > 0
      ? [{ value: restTotal, color: CATEGORY_COLORS.other }]
      : []),
  ];
  const legend = [
    ...top.map((b) => {
      const meta = findCategory(categories, b.id);
      return {
        ...b,
        name: meta.name,
        icon: meta.icon,
        color: CATEGORY_COLORS[b.id] ?? "#94a3b8",
      };
    }),
    ...(restTotal > 0
      ? [
          {
            id: "other",
            amount: restTotal,
            name: "Other",
            icon: "dots-horizontal",
            color: CATEGORY_COLORS.other,
          },
        ]
      : []),
  ];

  const maxBar = Math.max(...history.map((h) => h.spent), 1);
  const barData = history.map((h, i) => ({
    value: h.spent,
    label: h.label,
    frontColor: i === history.length - 1 ? "#ff7a45" : "#3a4358",
  }));

  return (
    <View style={{ marginTop: 8 }}>
      <Text className="list-title" style={{ marginBottom: 12 }}>
        Insights
      </Text>

      <View className="sub-card">
        <View style={{ alignItems: "center" }}>
          <PieChart
            data={pieData}
            donut
            radius={90}
            innerRadius={58}
            innerCircleColor="#141926"
            strokeWidth={2}
            strokeColor="#0B0E17"
            centerLabelComponent={() => (
              <View style={{ alignItems: "center" }}>
                <Text style={{ color: "#F4F1EA", fontWeight: "700", fontSize: 18 }}>
                  {formatShort(total)}
                </Text>
                <Text style={{ color: "rgba(244,241,234,0.6)", fontSize: 12 }}>
                  this month
                </Text>
              </View>
            )}
          />
        </View>
        <View style={{ marginTop: 12, gap: 10 }}>
          {legend.map((l) => {
            const pct =
              total > 0 ? Math.round((l.amount / total) * 100) : 0;
            return (
              <View
                key={l.id + l.name}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <CategoryIcon name={l.icon} size={15} box={28} />
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: l.color,
                  }}
                />
                <Text style={{ flex: 1, color: "#F4F1EA", fontSize: 14 }}>
                  {l.name} · {pct}%
                </Text>
                <Text style={{ color: "#F4F1EA", fontWeight: "700", fontSize: 14 }}>
                  {formatShort(l.amount)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {maxBar > 0 && history.length > 1 ? (
        <View className="sub-card" style={{ marginTop: 12 }}>
          <Text className="sub-title" style={{ marginBottom: 12 }}>
            Spending · last {history.length} months
          </Text>
          <BarChart
            data={barData}
            barWidth={26}
            barBorderRadius={6}
            noOfSections={4}
            maxValue={maxBar * 1.15}
            yAxisTextStyle={{ color: "rgba(244,241,234,0.5)", fontSize: 10 }}
            xAxisLabelTextStyle={{ color: "rgba(244,241,234,0.6)", fontSize: 11 }}
            yAxisThickness={0}
            xAxisThickness={0}
            hideRules
            isAnimated
          />
        </View>
      ) : null}
    </View>
  );
}
