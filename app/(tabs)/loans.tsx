import "@/global.css";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
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
  addLoan,
  getMyReceivables,
  listLoans,
  loanBalancePaise,
  removeLoan,
  repayLoan,
  ValidationError,
  type Loan,
  type LoanKind,
  type Receivable,
} from "@/lib/service";
import {
  areDebtRemindersOn,
  nudgeMessage,
  openSmsNudge,
  openWhatsAppNudge,
  remindOnce,
  setDebtRemindersOn,
  syncDebtReminders,
} from "@/lib/notifications/reminders";

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

type LoanCard = Loan & { duePaise: number };

export default function LoansScreen() {
  const db = useSQLiteContext();
  const [loans, setLoans] = useState<LoanCard[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [autoOn, setAutoOn] = useState(true);
  const [person, setPerson] = useState("");
  const [contact, setContact] = useState("");
  const [kind, setKind] = useState<LoanKind>("lent");
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [repayText, setRepayText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [all, auto] = await Promise.all([
        listLoans(db),
        areDebtRemindersOn(db).catch(() => true),
      ]);
      setAutoOn(auto);
      const cards: LoanCard[] = [];
      for (const loan of all) {
        const due = await loanBalancePaise(db, loan.id).catch(() => -1);
        cards.push({ ...loan, duePaise: due });
      }
      setLoans(cards);
      setReceivables(await getMyReceivables(db).catch(() => []));
    } catch {
      // ignore
    }
    await syncDebtReminders(db).catch(() => {});
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const open = loans.filter((l) => l.duePaise > 0);
  const settled = loans.filter((l) => l.duePaise === 0);
  const lent = open.filter((l) => l.kind === "lent");
  const borrowed = open.filter((l) => l.kind === "borrowed");

  async function handleAdd() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const amount = Number(amountText.replace(/[^0-9.]/g, ""));
      await addLoan(db, {
        person,
        contact,
        kind,
        amount,
        note: note.trim() === "" ? null : note.trim(),
      });
      setPerson("");
      setContact("");
      setAmountText("");
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRepay(loan: LoanCard) {
    const amount = Number(repayText.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a repayment amount above ₹0.");
      return;
    }
    setError(null);
    try {
      await repayLoan(db, loan.id, amount);
      setRepayText("");
      setExpandedId(null);
      await load();
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : "Couldn't save.");
    }
  }

  async function handleDelete(id: string) {
    try {
      await removeLoan(db, id);
      if (expandedId === id) setExpandedId(null);
      await load();
    } catch {
      // ignore
    }
  }

  async function handleNudge(r: Receivable) {
    setNotice(null);
    const text = nudgeMessage(r);
    // Loans carry numbers → SMS straight to them. Trip members have no
    // numbers → WhatsApp picker, else the generic share sheet.
    if (r.contact) {
      if (await openSmsNudge(r.contact, text)) return;
    }
    if (await openWhatsAppNudge(text)) return;
    try {
      const file = new File(Paths.cache, "nudge.txt");
      try {
        if (file.exists) file.delete();
      } catch {
        // fresh
      }
      file.create();
      file.write(text);
      await Sharing.shareAsync(file.uri, {
        dialogTitle: "Nudge",
        mimeType: "text/plain",
      });
    } catch {
      setNotice("Couldn't open share. Copy the message manually.");
    }
  }

  async function handleRemind(r: Receivable) {
    const ok = await remindOnce(db, r);
    setNotice(
      ok
        ? "Reminder set for tomorrow 9 AM."
        : "Allow notifications in Settings to get reminders."
    );
  }

  async function handleAutoToggle(value: boolean) {
    setAutoOn(value);
    try {
      await setDebtRemindersOn(db, value);
      await syncDebtReminders(db);
      if (value) setNotice("Daily 9 AM reminders on for open debts.");
    } catch {
      setAutoOn(!value);
    }
  }

  function loanRow(loan: LoanCard) {
    const expanded = expandedId === loan.id;
    return (
      <View key={loan.id} className="sub-card" style={{ marginBottom: 10 }}>
        <Pressable
          onPress={() => {
            setExpandedId(expanded ? null : loan.id);
            setRepayText("");
            setError(null);
          }}
        >
          <View className="sub-head">
            <View className="sub-main">
              <View className="sub-copy">
                <Text className="sub-title">{loan.person}</Text>
                <Text className="sub-meta" numberOfLines={1}>
                  {loan.kind === "lent" ? "owes you" : "you owe"}
                  {loan.note ? ` · ${loan.note}` : ""}
                  {loan.contact ? ` · ${loan.contact}` : ""}
                </Text>
              </View>
            </View>
            <Text className="sub-price">
              {formatINR(loan.duePaise / 100)}
            </Text>
          </View>
        </Pressable>
        {expanded ? (
          <View style={{ marginTop: 10, gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                className="auth-input"
                style={{ flex: 1 }}
                value={repayText}
                onChangeText={setRepayText}
                placeholder={
                  loan.kind === "lent" ? "Received amount" : "Paid amount"
                }
                placeholderTextColor="rgba(244,241,234,0.35)"
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
              <Pressable
                className="list-action"
                onPress={() => handleRepay(loan)}
              >
                <Text className="list-action-text">Log</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => handleDelete(loan.id)}>
              <Text className="auth-link">Delete entry</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
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
        <Text className="list-title">Loans</Text>
        <Text className="home-empty-state" style={{ marginBottom: 12 }}>
          Money lent or borrowed outside trips. Tap a row to log a
          repayment.
        </Text>

        {receivables.length > 0 ? (
          <View style={{ marginBottom: 16 }}>
            <View className="list-head">
              <Text className="list-title">Owed to you</Text>
            </View>
            {receivables.map((r) => (
              <View
                key={r.key}
                className="auth-card"
                style={{ marginBottom: 10 }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "700",
                        color: "#F4F1EA",
                      }}
                    >
                      {r.person} · {formatINR(r.amount)}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: "rgba(244,241,234,0.6)",
                      }}
                    >
                      {r.context}
                    </Text>
                  </View>
                  <Pressable
                    className="list-action"
                    onPress={() => handleNudge(r)}
                  >
                    <Text className="list-action-text">Nudge</Text>
                  </Pressable>
                  <Pressable
                    className="home-add-icon"
                    style={{
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onPress={() => handleRemind(r)}
                  >
                    <MaterialCommunityIcons
                      name="bell-plus-outline"
                      size={22}
                      color="#F4F1EA"
                    />
                  </Pressable>
                </View>
              </View>
            ))}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 4,
              }}
            >
              <Text
                style={{ fontSize: 13, color: "rgba(244,241,234,0.65)" }}
              >
                Daily 9 AM auto-reminders
              </Text>
              <Switch
                value={autoOn}
                onValueChange={handleAutoToggle}
                trackColor={{ true: "#ff7a45", false: "#3a4358" }}
              />
            </View>
          </View>
        ) : null}

        {notice ? (
          <Text className="auth-helper" style={{ marginBottom: 12 }}>
            {notice}
          </Text>
        ) : null}

        <View className="auth-card" style={{ marginBottom: 16 }}>
          <View className="auth-form">
            <View className="auth-field">
              <Text className="auth-label">Person</Text>
              <TextInput
                className="auth-input"
                value={person}
                onChangeText={setPerson}
                placeholder="e.g. Pondi"
                placeholderTextColor="rgba(244,241,234,0.35)"
                returnKeyType="done"
              />
            </View>
            <View className="auth-field">
              <Text className="auth-label">Phone number (required for SMS)</Text>
              <TextInput
                className="auth-input"
                value={contact}
                onChangeText={setContact}
                placeholder="+91 98765 43210"
                placeholderTextColor="rgba(244,241,234,0.35)"
                keyboardType="phone-pad"
                returnKeyType="done"
              />
            </View>
            <View className="picker-row">
              {(
                [
                  ["lent", "They owe me"],
                  ["borrowed", "I owe them"],
                ] as const
              ).map(([key, label]) => {
                const active = kind === key;
                return (
                  <Pressable
                    key={key}
                    className={`picker-option ${active ? "picker-option-active" : ""}`}
                    onPress={() => setKind(key)}
                  >
                    <Text
                      className={`picker-option-text ${active ? "picker-option-text-active" : ""}`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View className="auth-field">
              <Text className="auth-label">Amount</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 24,
                    fontWeight: "bold",
                    color: "#F4F1EA",
                    marginRight: 4,
                  }}
                >
                  ₹
                </Text>
                <TextInput
                  className="auth-input"
                  style={{
                    flex: 1,
                    fontSize: 26,
                    lineHeight: 34,
                    minHeight: 62,
                    textAlignVertical: "center",
                    color: "#F4F1EA",
                  }}
                  value={amountText}
                  onChangeText={setAmountText}
                  placeholder="500"
                  placeholderTextColor="rgba(244,241,234,0.35)"
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
            </View>
            <View className="auth-field">
              <Text className="auth-label">Note (optional)</Text>
              <TextInput
                className="auth-input"
                value={note}
                onChangeText={setNote}
                placeholder="e.g. concert tickets"
                placeholderTextColor="rgba(244,241,234,0.35)"
                returnKeyType="done"
              />
            </View>
            {error ? <Text className="auth-error">{error}</Text> : null}
            <Pressable className="auth-button" onPress={handleAdd} disabled={busy}>
              <Text className="auth-button-text">
                {busy ? "Saving…" : "Add entry"}
              </Text>
            </Pressable>
          </View>
        </View>

        {lent.length > 0 ? (
          <View style={{ marginBottom: 8 }}>
            <View className="list-head">
              <Text className="list-title">They owe me</Text>
            </View>
            {lent.map(loanRow)}
          </View>
        ) : null}

        {borrowed.length > 0 ? (
          <View style={{ marginBottom: 8 }}>
            <View className="list-head">
              <Text className="list-title">I owe them</Text>
            </View>
            {borrowed.map(loanRow)}
          </View>
        ) : null}

        {open.length === 0 ? (
          <Text className="home-empty-state">
            Nothing outstanding. Add your first entry above.
          </Text>
        ) : null}
        {settled.length > 0 ? (
          <Text className="auth-helper" style={{ marginBottom: 24 }}>
            {settled.length} settled.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
