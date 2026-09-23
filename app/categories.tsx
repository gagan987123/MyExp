import "@/global.css";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CategoryIcon from "@/components/CategoryIcon";
import {
  CATEGORY_ICON_CHOICES,
  ValidationError,
  addCustomCategory,
  getCategories,
  removeCustomCategory,
  type CategoryEntry,
  type EntryKind,
} from "@/lib/service";

export default function CategoriesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryEntry[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<EntryKind>("expense");
  const [icon, setIcon] = useState("dots-horizontal");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setCategories(await getCategories(db));
    } catch {
      setCategories([]);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      await addCustomCategory(db, { name, icon, kind });
      setName("");
      setIcon("dots-horizontal");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(
        e instanceof ValidationError ? e.message : "Couldn't save. Try again."
      );
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await removeCustomCategory(db, id);
      await load();
    } catch (e) {
      setError(
        e instanceof ValidationError ? e.message : "Couldn't delete. Try again."
      );
    }
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#0B0E17" }}
      edges={["top", "bottom"]}
    >
      <ScrollView
        style={{ flex: 1, padding: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} style={{ marginBottom: 12 }}>
          <Text className="auth-link">‹ Back</Text>
        </Pressable>
        <Text className="list-title">Categories</Text>
        <Text className="home-empty-state">
          Built-ins are locked. Yours work everywhere — forms, lists, stats
          and Siri.
        </Text>

        {categories.map((c) => (
          <View key={c.id} className="sub-card" style={{ marginBottom: 12 }}>
            <View className="sub-head">
              <View className="sub-main">
                <CategoryIcon
                  name={c.icon}
                  tone={c.kind === "income" ? "income" : "default"}
                />
                <View className="sub-copy">
                  <Text className="sub-title">{c.name}</Text>
                  <Text className="sub-meta">
                    {c.builtin ? "Built-in" : "Yours"} ·{" "}
                    {c.kind === "income" ? "Money in" : "Money out"}
                  </Text>
                </View>
              </View>
              {!c.builtin ? (
                <Pressable
                  className="list-action"
                  onPress={() => onDelete(c.id)}
                >
                  <Text className="list-action-text">Delete</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}

        {!showForm ? (
          <Pressable className="auth-button" onPress={() => setShowForm(true)}>
            <Text className="auth-button-text">＋ New category</Text>
          </Pressable>
        ) : (
          <View className="auth-card">
            <View className="auth-form">
              <View className="picker-row">
                {(["expense", "income"] as EntryKind[]).map((k) => (
                  <Pressable
                    key={k}
                    className={`picker-option ${kind === k ? "picker-option-active" : ""}`}
                    onPress={() => setKind(k)}
                  >
                    <Text
                      className={`picker-option-text ${kind === k ? "picker-option-text-active" : ""}`}
                    >
                      {k === "expense" ? "Money out" : "Money in"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View className="auth-field">
                <Text className="auth-label">Name</Text>
                <TextInput
                  className="auth-input"
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Chai"
                  placeholderTextColor="rgba(244,241,234,0.35)"
                  returnKeyType="done"
                />
              </View>

              <View className="auth-field">
                <Text className="auth-label">Icon</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {CATEGORY_ICON_CHOICES.map((glyph) => {
                    const active = icon === glyph;
                    return (
                      <Pressable
                        key={glyph}
                        onPress={() => setIcon(glyph)}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: active
                            ? "#ff7a45"
                            : "rgba(244,241,234,0.12)",
                          backgroundColor: active
                            ? "rgba(255,122,69,0.14)"
                            : "transparent",
                        }}
                      >
                        <CategoryIcon
                          name={glyph}
                          size={18}
                          box={36}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {error ? <Text className="auth-error">{error}</Text> : null}

              <Pressable
                className="auth-button"
                onPress={onSave}
                disabled={saving}
              >
                <Text className="auth-button-text">
                  {saving ? "Saving…" : "Add category"}
                </Text>
              </Pressable>
              <Pressable
                className="auth-secondary-button"
                style={{ marginTop: 4 }}
                onPress={() => setShowForm(false)}
              >
                <Text className="auth-secondary-button-text">Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
