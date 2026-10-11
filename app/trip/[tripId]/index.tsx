import "@/global.css";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CategoryIcon from "@/components/CategoryIcon";
import TripShareSheet from "@/components/TripShareSheet";
import { findCategory, useCategories } from "@/hooks/useCategories";
import {
  addTripMember,
  fetchTrip,
  getTripBalances,
  getTripMe,
  listTripMembers,
  getTripExpenses,
  getTripSettlements,
  removeTrip,
  removeTripExpense,
  removeTripMember,
  setTripArchived,
  setTripMe,
  settleTransfer,
  undoSettlement,
  ValidationError,
  type DebtTransfer,
  type MemberBalance,
  type Trip,
  type TripExpense,
  type TripMember,
  type TripSettlement,
} from "@/lib/service";

function formatINR(amount: number): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `Rs.${amount}`;
  }
}

export default function TripDetailScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const categories = useCategories();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [settlements, setSettlements] = useState<TripSettlement[]>([]);
  const [balances, setBalances] = useState<MemberBalance[]>([]);
  const [transfers, setTransfers] = useState<DebtTransfer[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [newMember, setNewMember] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!tripId) return;
    try {
      const [t, ms, es, ss, bal, meId] = await Promise.all([
        fetchTrip(db, tripId),
        listTripMembers(db, tripId),
        getTripExpenses(db, tripId),
        getTripSettlements(db, tripId),
        getTripBalances(db, tripId),
        getTripMe(db, tripId).catch(() => null),
      ]);
      setTrip(t);
      setMembers(ms);
      setExpenses(es);
      setSettlements(ss);
      setBalances(bal.balances);
      setTransfers(bal.transfers);
      setMe(meId);
    } catch {
      setTrip(null);
    }
  }, [db, tripId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function guard<T>(id: string, fn: () => Promise<T>): Promise<T | null> {
    if (busyId) return null;
    setBusyId(id);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(
        e instanceof ValidationError ? e.message : "Something went wrong."
      );
      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function handleAddMember() {
    const m = await guard("add-member", () =>
      addTripMember(db, tripId!, newMember)
    );
    if (m) {
      setNewMember("");
      load();
    }
  }

  async function handleRemoveMember(id: string) {
    const ok = await guard(`rm-${id}`, () => removeTripMember(db, tripId!, id));
    if (ok !== null) load();
  }

  async function handleSettle(t: DebtTransfer) {
    const s = await guard(`settle-${t.fromMemberId}-${t.toMemberId}`, () =>
      settleTransfer(db, {
        tripId: tripId!,
        from: t.fromMemberId,
        to: t.toMemberId,
        amount: t.amount,
      })
    );
    if (s) load();
  }

  async function handleUndoSettlement(id: string) {
    await guard(`undo-${id}`, () => undoSettlement(db, id));
    load();
  }

  async function handleRemoveExpense(id: string) {
    await guard(`rme-${id}`, () => removeTripExpense(db, id));
    load();
  }

  async function handlePickMe(id: string | null) {
    await guard("me", () => setTripMe(db, tripId!, id));
    load();
  }

  async function handleDeleteTrip() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    await guard("del-trip", () => removeTrip(db, tripId!));
    router.back();
  }

  async function handleArchiveTrip() {
    if (!confirmingArchive) {
      setConfirmingArchive(true);
      return;
    }
    await guard("arch-trip", () => setTripArchived(db, tripId!, true));
    router.back();
  }

  const visibleExpenses =
    search.trim() === ""
      ? expenses
      : expenses.filter((e) =>
          (e.note ?? "").toLowerCase().includes(search.trim().toLowerCase())
        );

  if (!trip) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#0B0E17" }}
        edges={["top", "bottom"]}
      >
        <View style={{ flex: 1, padding: 20 }}>
          <Pressable onPress={() => router.back()}>
            <Text className="auth-link">‹ Back</Text>
          </Pressable>
          <Text className="home-empty-state">Trip not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? id;

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

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <Text className="list-title" style={{ marginBottom: 0 }}>
            {trip.name}
          </Text>
          <Pressable
            className="home-add-icon"
            style={{ alignItems: "center", justifyContent: "center" }}
            onPress={() => setShowShare(true)}
          >
            <MaterialCommunityIcons name="share" size={24} color="#F4F1EA" />
          </Pressable>
        </View>

        <TripShareSheet
          visible={showShare}
          onClose={() => setShowShare(false)}
          tripId={tripId!}
        />

        <View className="home-balance-card" style={{ minHeight: 120 }}>
          <Text className="home-balance-label">Trip total</Text>
          <View className="home-balance-row">
            <Text className="home-balance-amount">
              {formatINR(
                expenses.reduce((s, e) => s + e.amount, 0)
              )}
            </Text>
            <Text className="home-balance-date">
              {members.length} member{members.length === 1 ? "" : "s"}
            </Text>
          </View>
        </View>

        {error ? (
          <Text className="auth-error" style={{ marginBottom: 12 }}>
            {error}
          </Text>
        ) : null}

        {/* Balances */}
        <View className="list-head">
          <Text className="list-title">Balances</Text>
        </View>
        {balances.length === 0 ? (
          <Text className="home-empty-state">
            Add members below to start splitting.
          </Text>
        ) : (
          balances.map((b) => (
            <View
              key={b.memberId}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(244,241,234,0.08)",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: "#F4F1EA",
                  }}
                >
                  {b.name}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: "rgba(244,241,234,0.55)",
                  }}
                >
                  paid {formatINR(b.paid / 100)} · share{" "}
                  {formatINR(b.share / 100)}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color:
                    b.net > 0
                      ? "#4ade80"
                      : b.net < 0
                        ? "#ff7a45"
                        : "rgba(244,241,234,0.5)",
                }}
              >
                {b.net > 0
                  ? `gets ${formatINR(b.net / 100)}`
                  : b.net < 0
                    ? `owes ${formatINR(-b.net / 100)}`
                    : "settled"}
              </Text>
            </View>
          ))
        )}

        {/* Settle up */}
        {transfers.length > 0 ? (
          <View style={{ marginTop: 16 }}>
            <Text className="list-title">Settle up</Text>
            {transfers.map((t) => (
              <View
                key={`${t.fromMemberId}-${t.toMemberId}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: "rgba(255,122,69,0.1)",
                  borderWidth: 1,
                  borderColor: "rgba(255,122,69,0.4)",
                  borderRadius: 14,
                  padding: 12,
                  marginTop: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: "#F4F1EA",
                    }}
                  >
                    {t.fromName} → {t.toName}
                  </Text>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: "#ff7a45",
                    }}
                  >
                    {formatINR(t.amount)}
                  </Text>
                </View>
                <Pressable
                  className="list-action"
                  disabled={busyId !== null}
                  onPress={() => handleSettle(t)}
                >
                  <Text className="list-action-text">
                    {busyId === `settle-${t.fromMemberId}-${t.toMemberId}`
                      ? "…"
                      : "Mark paid"}
                  </Text>
                </Pressable>
              </View>
            ))}
            <Text className="auth-helper" style={{ marginTop: 8 }}>
              Tracks the payback — the money itself moves in your UPI apps.
            </Text>
          </View>
        ) : null}

        {/* Members */}
        <View className="list-head" style={{ marginTop: 16 }}>
          <Text className="list-title">Members</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          <TextInput
            className="auth-input"
            style={{ flex: 1 }}
            value={newMember}
            onChangeText={setNewMember}
            placeholder="Add name"
            placeholderTextColor="rgba(244,241,234,0.35)"
            returnKeyType="done"
            onSubmitEditing={handleAddMember}
          />
          <Pressable
            className="home-add-icon"
            style={{ alignItems: "center", justifyContent: "center" }}
            onPress={handleAddMember}
          >
            <MaterialCommunityIcons name="plus" size={26} color="#F4F1EA" />
          </Pressable>
        </View>
        {members.length === 0 ? (
          <Text className="home-empty-state">No members yet.</Text>
        ) : (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 4,
            }}
          >
            {members.map((m) => {
              const active = me === m.id;
              return (
                <View
                  key={m.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: active
                      ? "#ff7a45"
                      : "rgba(244,241,234,0.2)",
                    backgroundColor: active
                      ? "rgba(255,122,69,0.14)"
                      : "transparent",
                    borderRadius: 999,
                    paddingVertical: 8,
                    paddingLeft: 14,
                    paddingRight: 6,
                  }}
                >
                  <Pressable
                    onPress={() => handlePickMe(active ? null : m.id)}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: active ? "700" : "500",
                        color: active ? "#ff7a45" : "#F4F1EA",
                      }}
                    >
                      {m.name}
                      {active ? " (you)" : ""}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleRemoveMember(m.id)}
                    hitSlop={10}
                    style={{ padding: 4 }}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={16}
                      color="rgba(244,241,234,0.45)"
                    />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
        <Text className="auth-helper">
          Tap a name to mark which one is you — your shares can auto-post to
          your expenses.
        </Text>

        {/* Expenses */}
        <View className="list-head" style={{ marginTop: 16 }}>
          <Text className="list-title">Expenses</Text>
          <Pressable
            className="list-action"
            onPress={() => router.push(`/trip/${tripId}/add`)}
          >
            <Text className="list-action-text">+ Add</Text>
          </Pressable>
        </View>
        <TextInput
          className="auth-input"
          style={{ marginBottom: 10 }}
          value={search}
          onChangeText={setSearch}
          placeholder="Search notes…"
          placeholderTextColor="rgba(244,241,234,0.35)"
          returnKeyType="done"
        />
        {visibleExpenses.length === 0 ? (
          <Text className="home-empty-state">
            {expenses.length === 0
              ? "Nothing logged yet."
              : "No matches for this search."}
          </Text>
        ) : (
          visibleExpenses.map((e) => {
            const meta = findCategory(categories, e.category);
            return (
              <View key={e.id} className="sub-card" style={{ marginBottom: 10 }}>
                <View className="sub-head">
                  <View className="sub-main">
                    <CategoryIcon name={meta.icon} />
                    <View className="sub-copy">
                      <Text className="sub-title">{meta.name}</Text>
                      <Text className="sub-meta" numberOfLines={1}>
                        {e.note ?? "No note"} · paid by {nameOf(e.paidBy)}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                  >
                    <Text className="sub-price">{formatINR(e.amount)}</Text>
                    <Pressable onPress={() => handleRemoveExpense(e.id)}>
                      <MaterialCommunityIcons
                        name="trash-can-outline"
                        size={20}
                        color="rgba(248,113,113,0.8)"
                      />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })
        )}

        {/* Settlements */}
        {settlements.length > 0 ? (
          <View style={{ marginTop: 16 }}>
            <Text className="list-title">Settled</Text>
            {settlements.map((s) => (
              <View
                key={s.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 6,
                }}
              >
                <MaterialCommunityIcons
                  name="check-circle"
                  size={20}
                  color="#4ade80"
                />
                <Text
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: "rgba(244,241,234,0.8)",
                  }}
                >
                  {nameOf(s.fromMember)} paid {nameOf(s.toMember)}{" "}
                  {formatINR(s.amount)}
                </Text>
                <Pressable onPress={() => handleUndoSettlement(s.id)}>
                  <Text className="auth-link">undo</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <Pressable
          style={{
            alignItems: "center",
            borderRadius: 16,
            paddingVertical: 14,
            marginTop: 16,
            backgroundColor: confirmingArchive ? "#ff7a45" : "transparent",
            borderWidth: 1,
            borderColor: "#ff7a45",
          }}
          onPress={handleArchiveTrip}
        >
          <Text
            style={{
              fontWeight: "700",
              color: confirmingArchive ? "#0B0E17" : "#ff7a45",
            }}
          >
            {confirmingArchive ? "Tap again to archive trip" : "Archive trip"}
          </Text>
        </Pressable>
        <Pressable
          style={{
            alignItems: "center",
            borderRadius: 16,
            paddingVertical: 14,
            marginTop: 10,
            marginBottom: 8,
            backgroundColor: confirmingDelete ? "#f87171" : "transparent",
            borderWidth: 1,
            borderColor: "#f87171",
          }}
          onPress={handleDeleteTrip}
        >
          <Text
            style={{
              fontWeight: "700",
              color: confirmingDelete ? "#fff" : "#f87171",
            }}
          >
            {confirmingDelete ? "Tap again to delete trip" : "Delete trip"}
          </Text>
        </Pressable>
        <Text className="auth-helper" style={{ marginBottom: 24 }}>
          Deleting removes the trip, members and splits. Expenses already
          posted to your ledger stay.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
