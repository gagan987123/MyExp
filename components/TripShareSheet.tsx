import { useSQLiteContext } from "expo-sqlite";
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useCallback, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { loadLogoDataUri } from "@/lib/logo";
import { buildTripReportHtml } from "@/lib/report";
import {
  fetchTrip,
  getTripBalances,
  getTripSettlements,
  getTripExpenses,
  listTripMembers,
  type DebtTransfer,
  type MemberBalance,
  type Trip,
  type TripExpense,
  type TripMember,
  type TripSettlement,
} from "@/lib/service";
import { findCategory, useCategories } from "@/hooks/useCategories";

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

/** Export modal for one trip: full PDF sheet + pasteable settle-up text. */
export default function TripShareSheet({
  visible,
  onClose,
  tripId,
}: {
  visible: boolean;
  onClose: () => void;
  tripId: string;
}) {
  const db = useSQLiteContext();
  const categories = useCategories();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [balances, setBalances] = useState<MemberBalance[]>([]);
  const [transfers, setTransfers] = useState<DebtTransfer[]>([]);
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [settlements, setSettlements] = useState<TripSettlement[]>([]);
  const [spent, setSpent] = useState(0);
  const [busy, setBusy] = useState<"pdf" | "text" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!visible || !tripId) return;
    try {
      const [t, ms, bal, es, ss] = await Promise.all([
        fetchTrip(db, tripId),
        listTripMembers(db, tripId),
        getTripBalances(db, tripId),
        getTripExpenses(db, tripId),
        getTripSettlements(db, tripId),
      ]);
      setTrip(t);
      setNames(new Map(ms.map((m: TripMember) => [m.id, m.name] as const)));
      setBalances(bal.balances);
      setTransfers(bal.transfers);
      setExpenses(es);
      setSettlements(ss);
      setSpent(bal.spent);
    } catch {
      // modal shows what it has
    }
  }, [db, tripId, visible]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const nameOf = (id: string) => names.get(id) ?? id;
  const catName = (id: string) => findCategory(categories, id).name;

  function summaryText(): string {
    const lines = [`${trip?.name ?? "Trip"} — settle up`];
    if (transfers.length === 0) {
      lines.push("Everyone is settled.");
    } else {
      for (const t of transfers) {
        lines.push(`${t.fromName} → ${t.toName} ${formatINR(t.amount)}`);
      }
    }
    lines.push(
      `Total spent ${formatINR(spent)} · ${expenses.length} expense${expenses.length === 1 ? "" : "s"}`
    );
    return lines.join("\n");
  }

  async function onSharePdf() {
    if (busy || !trip) return;
    setBusy("pdf");
    setError(null);
    try {
      const logo = await loadLogoDataUri();
      const html = buildTripReportHtml({
        tripName: trip.name,
        spent,
        balances: balances.map((b) => ({
          name: b.name,
          paidPaise: b.paid,
          sharePaise: b.share,
          netPaise: b.net,
        })),
        transfers: transfers.map((t) => ({
          fromName: t.fromName,
          toName: t.toName,
          amount: t.amount,
        })),
        expenses: expenses.map((e) => ({
          date: e.date,
          categoryName: catName(e.category),
          note: e.note,
          paidByName: nameOf(e.paidBy),
          amount: e.amount,
        })),
        settlements: settlements.map((s) => ({
          fromName: nameOf(s.fromMember),
          toName: nameOf(s.toMember),
          amount: s.amount,
          date: s.date,
        })),
        logoDataUri: logo,
      });
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        dialogTitle: `${trip.name} settlement`,
        mimeType: "application/pdf",
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't build the PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function onShareText() {
    if (busy) return;
    setBusy("text");
    setError(null);
    try {
      const file = new File(Paths.cache, `trip-${tripId}-settle.txt`);
      try {
        if (file.exists) file.delete();
      } catch {
        // fresh file
      }
      file.create();
      file.write(summaryText());
      await Sharing.shareAsync(file.uri, {
        dialogTitle: "Trip settlement",
        mimeType: "text/plain",
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't share. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="modal-overlay">
        <View className="modal-container">
          <View className="modal-header">
            <Text className="modal-title">Share trip</Text>
            <Pressable className="modal-close" onPress={onClose}>
              <Text className="modal-close-text">✕</Text>
            </Pressable>
          </View>
          <View className="modal-body">
            <Text className="auth-helper" style={{ marginBottom: 12 }}>
              {transfers.length === 0
                ? "Everyone is settled."
                : transfers
                    .map(
                      (t) =>
                        `${t.fromName} → ${t.toName} ${formatINR(t.amount)}`
                    )
                    .join("\n")}
            </Text>
            {error ? <Text className="auth-error">{error}</Text> : null}
            <Pressable
              className="auth-button"
              onPress={onSharePdf}
              disabled={busy !== null}
              style={{ marginBottom: 10 }}
            >
              <Text className="auth-button-text">
                {busy === "pdf" ? "Preparing…" : "Download PDF sheet"}
              </Text>
            </Pressable>
            <Pressable
              className="auth-secondary-button"
              onPress={onShareText}
              disabled={busy !== null}
            >
              <Text className="auth-secondary-button-text">
                {busy === "text" ? "Preparing…" : "Share settle-up text"}
              </Text>
            </Pressable>
            <Text className="auth-helper" style={{ marginTop: 8 }}>
              The text pastes straight into WhatsApp.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
