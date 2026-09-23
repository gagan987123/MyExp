import "@/global.css";
import { useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { clearAllExpenses } from "@/lib/service";

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [cleared, setCleared] = useState(false);

  async function onClear() {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    try {
      await clearAllExpenses(db);
      setCleared(true);
    } finally {
      setConfirmingClear(false);
    }
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#0B0E17" }}
      edges={["top", "bottom"]}
    >
      <ScrollView style={{ flex: 1, padding: 20 }}>
        <Text className="list-title">Settings</Text>

        <View className="sub-card" style={{ marginTop: 16 }}>
          <View className="sub-details">
            <View className="sub-row">
              <Text className="sub-label">Currency</Text>
              <Text className="sub-value">INR (₹)</Text>
            </View>
            <View className="sub-row">
              <Text className="sub-label">Storage</Text>
              <Text className="sub-value">On-device only</Text>
            </View>
            <View className="sub-row">
              <Text className="sub-label">Version</Text>
              <Text className="sub-value">1.0.0</Text>
            </View>
          </View>
        </View>

        <Pressable
          className="sub-card"
          style={{ marginTop: 16 }}
          onPress={() => router.push("/recurring")}
        >
          <View className="sub-head">
            <View className="sub-copy">
              <Text className="sub-title">Recurring</Text>
              <Text className="sub-meta">
                Salary and EMIs that post themselves monthly.
              </Text>
            </View>
            <Text className="auth-link">›</Text>
          </View>
        </Pressable>

        <View className="sub-card" style={{ marginTop: 16 }}>
          <Text className="sub-title">Danger zone</Text>
          <Text className="sub-meta" style={{ marginBottom: 12 }}>
            Delete every expense on this device. This cannot be undone.
          </Text>
          <Pressable
            style={{
              alignItems: "center",
              borderRadius: 16,
              paddingVertical: 14,
              backgroundColor: confirmingClear ? "#f87171" : "transparent",
              borderWidth: 1,
              borderColor: "#f87171",
            }}
            onPress={onClear}
          >
            <Text
              style={{
                fontWeight: "700",
                color: confirmingClear ? "#fff" : "#f87171",
              }}
            >
              {confirmingClear ? "Tap again to delete everything" : "Clear all data"}
            </Text>
          </Pressable>
          {cleared ? (
            <Text className="auth-helper" style={{ marginTop: 8 }}>
              All expenses deleted.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
