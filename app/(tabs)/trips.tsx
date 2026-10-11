import "@/global.css";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  createTrip,
  getTripBalances,
  listTripMembers,
  listTrips,
  setTripArchived,
  ValidationError,
  type Trip,
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

type TripCard = Trip & { spent: number; members: number };

export default function TripsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [trips, setTrips] = useState<TripCard[]>([]);
  const [archived, setArchived] = useState<Trip[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, all] = await Promise.all([
        listTrips(db),
        listTrips(db, true),
      ]);
      setArchived(all.filter((t) => t.archived));
      const cards = await Promise.all(
        list.map(async (t) => {
          const [bal, members] = await Promise.all([
            getTripBalances(db, t.id).catch(() => null),
            listTripMembers(db, t.id).catch(() => []),
          ]);
          return {
            ...t,
            spent: bal?.spent ?? 0,
            members: members.length,
          };
        })
      );
      setTrips(cards);
    } catch {
      setTrips([]);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleCreate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const trip = await createTrip(db, name);
      setName("");
      router.push(`/trip/${trip.id}`);
    } catch (e) {
      setError(
        e instanceof ValidationError ? e.message : "Couldn't create trip."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(id: string) {
    try {
      await setTripArchived(db, id, false);
      load();
    } catch {
      // ignore
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
        <Text className="list-title">Trips</Text>
        <Text className="home-empty-state" style={{ marginBottom: 12 }}>
          Split bills with friends. Balances settle here — money moves in
          your UPI apps.
        </Text>

        <View className="auth-card" style={{ marginBottom: 16 }}>
          <View className="auth-form">
            <View className="auth-field">
              <Text className="auth-label">New trip</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  className="auth-input"
                  style={{ flex: 1 }}
                  value={name}
                  onChangeText={setName}
                  placeholder="Goa Dec"
                  placeholderTextColor="rgba(244,241,234,0.35)"
                  returnKeyType="done"
                  onSubmitEditing={handleCreate}
                />
                <Pressable
                  className="home-add-icon"
                  style={{ alignItems: "center", justifyContent: "center" }}
                  onPress={handleCreate}
                >
                  <MaterialCommunityIcons
                    name="plus"
                    size={28}
                    color="#F4F1EA"
                  />
                </Pressable>
              </View>
            </View>
            {error ? <Text className="auth-error">{error}</Text> : null}
          </View>
        </View>

        {trips.length === 0 ? (
          <Text className="home-empty-state">
            No trips yet. Name one above to start splitting.
          </Text>
        ) : (
          trips.map((t) => (
            <Pressable
              key={t.id}
              className="sub-card"
              style={{ marginBottom: 12 }}
              onPress={() => router.push(`/trip/${t.id}`)}
            >
              <View className="sub-head">
                <View className="sub-copy">
                  <Text className="sub-title">{t.name}</Text>
                  <Text className="sub-meta">
                    {t.members} member{t.members === 1 ? "" : "s"} · spent{" "}
                    {formatINR(t.spent)}
                  </Text>
                </View>
                <Text className="auth-link">›</Text>
              </View>
            </Pressable>
          ))
        )}

        {archived.length > 0 ? (
          <View style={{ marginTop: 8, marginBottom: 24 }}>
            <Pressable
              className="list-action"
              style={{ alignSelf: "flex-start" }}
              onPress={() => setShowArchived((v) => !v)}
            >
              <Text className="list-action-text">
                {showArchived
                  ? "Hide archived"
                  : `Archived (${archived.length})`}
              </Text>
            </Pressable>
            {showArchived
              ? archived.map((t) => (
                  <View
                    key={t.id}
                    className="sub-card"
                    style={{
                      marginTop: 10,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      className="sub-title"
                      style={{ flex: 1 }}
                      numberOfLines={1}
                    >
                      {t.name}
                    </Text>
                    <Pressable
                      className="list-action"
                      onPress={() => handleRestore(t.id)}
                    >
                      <Text className="list-action-text">Restore</Text>
                    </Pressable>
                  </View>
                ))
              : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
