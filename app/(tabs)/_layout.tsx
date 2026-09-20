import { Tabs } from "expo-router";
import { Text, View } from "react-native";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View className="tabs-item">
      <Text className="tabs-emoji">{label}</Text>
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
          backgroundColor: "#fff9e3",
          borderTopWidth: 0,
          height: 76,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <View className="tabs-icon">
              <TabIcon label="🏠" focused={focused} />
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
              <TabIcon label="＋" focused={focused} />
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
              <TabIcon label="🧾" focused={focused} />
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
              <TabIcon label="⚙️" focused={focused} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
