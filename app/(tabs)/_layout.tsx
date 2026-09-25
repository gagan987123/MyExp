import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Tabs } from "expo-router";
import { View } from "react-native";

type GlyphName = ComponentProps<typeof MaterialCommunityIcons>["name"];

function TabIcon({ name, focused }: { name: GlyphName; focused: boolean }) {
  return (
    <View className="tabs-item">
      <MaterialCommunityIcons
        name={name}
        size={26}
        color={focused ? "#ff7a45" : "rgba(244,241,234,0.45)"}
      />
      <View
        className={`tabs-underline ${focused ? "tabs-underline-active" : ""}`}
      />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: "#0B0E17",
          borderTopWidth: 1,
          borderTopColor: "rgba(244,241,234,0.1)",
          height: 68,
          paddingTop: 4,
          paddingBottom: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <View className="tabs-icon">
              <TabIcon name="home" focused={focused} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="add-expense"
        options={{
          title: "Add",
          tabBarIcon: ({ focused }) => (
            <View className="tabs-icon">
              <TabIcon name="plus" focused={focused} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: "Expenses",
          tabBarIcon: ({ focused }) => (
            <View className="tabs-icon">
              <TabIcon name="receipt-text" focused={focused} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ focused }) => (
            <View className="tabs-icon">
              <TabIcon name="cog" focused={focused} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
