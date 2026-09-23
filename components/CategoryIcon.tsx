import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { View } from "react-native";

type GlyphName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/**
 * Category glyph: vector icon on an orange-tinted disc.
 * Single tint across categories keeps the fintech look cohesive.
 */
export default function CategoryIcon({
  name,
  size = 22,
  box = 44,
  tone = "default",
}: {
  name: string;
  size?: number;
  box?: number;
  /** "dark" is for use on orange backgrounds (invisible otherwise). */
  tone?: "default" | "dark" | "income";
}) {
  const bg =
    tone === "dark"
      ? "rgba(11,14,23,0.20)"
      : tone === "income"
        ? "rgba(52,211,153,0.14)"
        : "rgba(255,122,69,0.14)";
  const fg = tone === "dark" ? "#0B0E17" : tone === "income" ? "#34d399" : "#ff7a45";
  return (
    <View
      style={{
        width: box,
        height: box,
        borderRadius: box / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <MaterialCommunityIcons
        name={name as GlyphName}
        size={size}
        color={fg}
      />
    </View>
  );
}
