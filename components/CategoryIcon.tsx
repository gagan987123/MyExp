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
}: {
  name: string;
  size?: number;
  box?: number;
}) {
  return (
    <View
      style={{
        width: box,
        height: box,
        borderRadius: box / 2,
        backgroundColor: "rgba(255,122,69,0.14)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <MaterialCommunityIcons
        name={name as GlyphName}
        size={size}
        color="#ff7a45"
      />
    </View>
  );
}
