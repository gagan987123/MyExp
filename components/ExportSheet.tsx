import { useSQLiteContext } from "expo-sqlite";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  filterByRange,
  rangeLabel,
  type DateRange,
} from "@/lib/csv";
import { buildReportHtml } from "@/lib/report";
import { loadLogoDataUri } from "@/lib/logo";
import { getCategories, listExpenses, type Expense } from "@/lib/service";

function startOfMonth(y: number, m: number): Date {
  return new Date(y, m, 1);
}

function endOfMonth(y: number, m: number): Date {
  return new Date(y, m + 1, 0, 23, 59, 59, 999);
}

function lastMonths(n: number): { y: number; m: number; label: string }[] {
  const now = new Date();
  const out: { y: number; m: number; label: string }[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      y: d.getFullYear(),
      m: d.getMonth(),
      label: d.toLocaleString("en-IN", { month: "short", year: "numeric" }),
    });
  }
  return out;
}

function shiftDay(date: Date, delta: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const MONTHS = lastMonths(12);

export default function ExportSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const db = useSQLiteContext();
  const [all, setAll] = useState<Expense[]>([]);
  const [from, setFrom] = useState(() => {
    const now = new Date();
    return startOfMonth(now.getFullYear(), now.getMonth());
  });
  const [to, setTo] = useState(() => new Date());
  const [pickedMonths, setPickedMonths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    listExpenses(db).then(setAll).catch(() => setAll([]));
  }, [db, visible]);

  const range: DateRange = { from, to };
  const rows = filterByRange(all, range);

  function applyPreset(kind: "month" | "last" | "three" | "all") {
    const now = new Date();
    if (kind === "month") {
      setFrom(startOfMonth(now.getFullYear(), now.getMonth()));
      setTo(now);
    } else if (kind === "last") {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setFrom(startOfMonth(d.getFullYear(), d.getMonth()));
      setTo(endOfMonth(d.getFullYear(), d.getMonth()));
    } else if (kind === "three") {
      const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      setFrom(startOfMonth(d.getFullYear(), d.getMonth()));
      setTo(now);
    } else {
      setFrom(new Date(2020, 0, 1));
      setTo(now);
    }
    setPickedMonths([]);
  }

  function toggleMonth(key: string, y: number, m: number) {
    const next = pickedMonths.includes(key)
      ? pickedMonths.filter((k) => k !== key)
      : [...pickedMonths, key];
    setPickedMonths(next);
    if (next.length === 0) return;
    const picks = MONTHS.filter((x) => next.includes(`${x.y}-${x.m}`));
    const sorted = [...picks].sort((a, b) =>
      a.y === b.y ? a.m - b.m : a.y - b.y
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    setFrom(startOfMonth(first.y, first.m));
    setTo(endOfMonth(last.y, last.m));
  }

  function nudge(which: "from" | "to", delta: number) {
    if (which === "from") setFrom((d) => shiftDay(d, delta));
    else setTo((d) => shiftDay(d, delta));
    setPickedMonths([]);
  }

  async function onDownloadPdf() {
    if (rows.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const cats = await getCategories(db);
      const names = new Map(cats.map((c) => [c.id, c.name] as const));
      const logo = await loadLogoDataUri();
      const html = buildReportHtml(all, range, logo, (id) =>
        names.get(id) ?? id
      );
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        dialogTitle: "MyExp report",
        mimeType: "application/pdf",
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't build the PDF.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="modal-overlay">
        <View className="modal-container">
          <View className="modal-header">
            <Text className="modal-title">Export</Text>
            <Pressable className="modal-close" onPress={onClose}>
              <Text className="modal-close-text">✕</Text>
            </Pressable>
          </View>
          <ScrollView>
            <View className="modal-body">
              <View className="picker-row">
                {(
                  [
                    ["month", "This month"],
                    ["last", "Last month"],
                    ["three", "3 months"],
                    ["all", "All"],
                  ] as const
                ).map(([key, label]) => (
                  <Pressable
                    key={key}
                    className="picker-option"
                    onPress={() => applyPreset(key)}
                  >
                    <Text className="picker-option-text">{label}</Text>
                  </Pressable>
                ))}
              </View>

              <View className="auth-field">
                <Text className="auth-label">From</Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Pressable
                    className="list-action"
                    onPress={() => nudge("from", -1)}
                  >
                    <Text className="list-action-text">‹</Text>
                  </Pressable>
                  <Text
                    style={{ fontSize: 16, fontWeight: "600", color: "#F4F1EA" }}
                  >
                    {formatDay(from)}
                  </Text>
                  <Pressable
                    className="list-action"
                    onPress={() => nudge("from", 1)}
                  >
                    <Text className="list-action-text">›</Text>
                  </Pressable>
                </View>
              </View>

              <View className="auth-field">
                <Text className="auth-label">To</Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Pressable
                    className="list-action"
                    onPress={() => nudge("to", -1)}
                  >
                    <Text className="list-action-text">‹</Text>
                  </Pressable>
                  <Text
                    style={{ fontSize: 16, fontWeight: "600", color: "#F4F1EA" }}
                  >
                    {formatDay(to)}
                  </Text>
                  <Pressable
                    className="list-action"
                    onPress={() => nudge("to", 1)}
                  >
                    <Text className="list-action-text">›</Text>
                  </Pressable>
                </View>
              </View>

              <View className="auth-field">
                <Text className="auth-label">Or pick months</Text>
                <View className="category-scroll">
                  {MONTHS.map((x) => {
                    const key = `${x.y}-${x.m}`;
                    const active = pickedMonths.includes(key);
                    return (
                      <Pressable
                        key={key}
                        className={`category-chip ${active ? "category-chip-active" : ""}`}
                        onPress={() => toggleMonth(key, x.y, x.m)}
                      >
                        <Text
                          className={`category-chip-text ${active ? "category-chip-text-active" : ""}`}
                        >
                          {x.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Text className="auth-helper">
                {rangeLabel(range)} · {rows.length} expense
                {rows.length === 1 ? "" : "s"}
              </Text>

              {error ? <Text className="auth-error">{error}</Text> : null}

              <Pressable
                className="auth-button"
                onPress={onDownloadPdf}
                disabled={busy || rows.length === 0}
                style={rows.length === 0 ? { opacity: 0.45 } : undefined}
              >
                <Text className="auth-button-text">
                  {busy ? "Preparing…" : `Download PDF (${rows.length})`}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
