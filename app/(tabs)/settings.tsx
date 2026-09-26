import "@/global.css";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  clearAiKey,
  getAiKey,
  isAiEnabled,
  saveAiKey,
  setAiEnabled,
} from "@/lib/aiKey";
import { checkApiKey } from "@/lib/ai";
import { clearAllExpenses } from "@/lib/service";

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [aiOn, setAiOn] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState<{
    ok: boolean;
    detail: string;
  } | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [cleared, setCleared] = useState(false);

  async function refreshAi() {
    try {
      setAiOn(await isAiEnabled());
      setHasKey((await getAiKey()) != null);
    } catch {
      // unavailable (Expo Go without SecureStore): leave defaults
    }
  }

  useFocusEffect(
    useCallback(() => {
      refreshAi();
    }, [])
  );

  async function onToggleAi(value: boolean) {
    setAiOn(value);
    try {
      await setAiEnabled(db, value);
    } catch {
      setAiOn(!value);
    }
  }

  async function onSaveKey() {
    setAiBusy(true);
    setAiStatus(null);
    try {
      await saveAiKey(db, keyInput);
      setKeyInput("");
      await refreshAi();
      setAiStatus({ ok: true, detail: "Key saved on this phone only." });
    } catch (e) {
      setAiStatus({
        ok: false,
        detail: e instanceof Error ? e.message : "Couldn't save key.",
      });
    } finally {
      setAiBusy(false);
    }
  }

  async function onClearKey() {
    setAiBusy(true);
    try {
      await clearAiKey(db);
      await refreshAi();
      setAiStatus({
        ok: true,
        detail: "Key deleted. Siri uses word-list mode.",
      });
    } finally {
      setAiBusy(false);
    }
  }

  async function onTestAi() {
    setAiBusy(true);
    setAiStatus(null);
    try {
      setAiStatus(await checkApiKey());
    } catch (e) {
      setAiStatus({
        ok: false,
        detail: e instanceof Error ? e.message : "Test failed.",
      });
    } finally {
      setAiBusy(false);
    }
  }

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
          onPress={() => router.push("/categories")}
        >
          <View className="sub-head">
            <View className="sub-copy">
              <Text className="sub-title">Categories</Text>
              <Text className="sub-meta">
                Built-ins plus your own, for forms and Siri.
              </Text>
            </View>
            <Text className="auth-link">›</Text>
          </View>
        </Pressable>

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
          <View className="sub-head">
            <View className="sub-copy">
              <Text className="sub-title">Smarter Siri (AI)</Text>
              <Text className="sub-meta">
                Normally Siri files by fixed words. Turn this on and Siri
                asks AI instead — it understands new items with no list
                needed. Costs about a tenth of a paise per
                save. Off means everything works exactly as before.
              </Text>
            </View>
            <Switch
              value={aiOn}
              onValueChange={onToggleAi}
              trackColor={{ true: "#ff7a45", false: "#3a4358" }}
            />
          </View>

          <View className="auth-field" style={{ marginTop: 12 }}>
            <Text className="auth-label">
              Your OpenRouter key {hasKey ? "(saved ••••)" : "(not set)"}
            </Text>
            <TextInput
              className="auth-input"
              value={keyInput}
              onChangeText={setKeyInput}
              placeholder="sk-or-…"
              placeholderTextColor="rgba(244,241,234,0.35)"
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="done"
            />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Pressable
              className="list-action"
              onPress={onSaveKey}
              disabled={aiBusy}
            >
              <Text className="list-action-text">Save key</Text>
            </Pressable>
            {hasKey ? (
              <Pressable
                className="list-action"
                onPress={onClearKey}
                disabled={aiBusy}
              >
                <Text className="list-action-text">Delete key</Text>
              </Pressable>
            ) : null}
            <Pressable
              className="list-action"
              onPress={onTestAi}
              disabled={aiBusy}
            >
              <Text className="list-action-text">
                {aiBusy ? "…" : "Test connection"}
              </Text>
            </Pressable>
          </View>
          {aiStatus ? (
            <View
              style={{
                marginTop: 12,
                borderRadius: 12,
                padding: 12,
                backgroundColor: aiStatus.ok
                  ? "rgba(52,211,153,0.12)"
                  : "rgba(248,113,113,0.12)",
                borderWidth: 1,
                borderColor: aiStatus.ok ? "#34d399" : "#f87171",
              }}
            >
              <Text
                style={{
                  fontWeight: "700",
                  color: aiStatus.ok ? "#34d399" : "#f87171",
                }}
              >
                {aiStatus.ok ? "✓ AI connected" : "✕ AI not connected"}
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 13,
                  color: "rgba(244,241,234,0.75)",
                }}
              >
                {aiStatus.detail}
              </Text>
            </View>
          ) : null}
          <Text className="sub-meta" style={{ marginTop: 8 }}>
            The key stays in this phone's keychain, with a Siri-only copy
            beside your data. No key, no internet, or timeout → Siri quietly
            uses word-list mode.
          </Text>
        </View>

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
