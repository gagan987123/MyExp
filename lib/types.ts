export type CategoryId =
  | "food"
  | "transport"
  | "petrol"
  | "shopping"
  | "bills"
  | "entertainment"
  | "health"
  | "travel"
  | "salary"
  | "other";

export type EntryKind = "expense" | "income";

export type Expense = {
  id: string;
  amount: number;
  /** Built-in CategoryId or a custom category id. */
  category: string;
  note: string | null;
  /** ISO date string for the entry day */
  date: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** Money direction. Defaults to expense for pre-v2 rows. */
  kind: EntryKind;
};

export type RecurringTemplate = {
  id: string;
  kind: EntryKind;
  amount: number;
  category: string;
  note: string | null;
  /** Day of month, 1–28. */
  dayOfMonth: number;
  startYear: number;
  /** 1–12 */
  startMonth: number;
  /** Total installments, or null for indefinite. */
  totalInstallments: number | null;
  postedCount: number;
  active: boolean;
  createdAt: string;
};

export type CustomCategory = {
  id: string;
  name: string;
  icon: string;
  kind: EntryKind;
  createdAt: string;
};

export type CategoryEntry = {
  id: string;
  name: string;
  icon: string;
  kind: EntryKind;
  builtin: boolean;
};

export type AddExpenseInput = {
  amount: number;
  category: string;
  note?: string | null;
  date?: Date | string;
  kind?: EntryKind;
};

export type UpdateExpenseInput = AddExpenseInput & { id: string };

export type AddRecurringInput = {
  kind: EntryKind;
  amount: number;
  category: string;
  note?: string | null;
  dayOfMonth: number;
  startYear: number;
  startMonth: number;
  totalInstallments?: number | null;
};

export type AddCustomCategoryInput = {
  name: string;
  icon: string;
  kind?: EntryKind;
};

export type MonthlyPoint = {
  year: number;
  /** 1–12 */
  month: number;
  label: string;
  spent: number;
  income: number;
};

export type LoanKind = "lent" | "borrowed";

export type Loan = {
  id: string;
  person: string;
  contact: string | null;
  kind: LoanKind;
  amount: number;
  note: string | null;
  date: string;
  createdAt: string;
};

export type LoanPayment = {
  id: string;
  loanId: string;
  amount: number;
  date: string;
  createdAt: string;
};

export type AddLoanInput = {
  person: string;
  contact?: string | null;
  kind: LoanKind;
  amount: number;
  note?: string | null;
  date?: Date | string;
};

export type Trip = {
  id: string;
  name: string;
  createdAt: string;
  archived: boolean;
};

export type TripMember = {
  id: string;
  tripId: string;
  name: string;
  createdAt: string;
};

export type TripExpense = {
  id: string;
  tripId: string;
  amount: number;
  category: string;
  note: string | null;
  paidBy: string;
  splitBetween: string[];
  /** Member-id → paise. NULL/empty = equal split. */
  splitCustom: Record<string, number> | null;
  date: string;
  createdAt: string;
  personalExpenseId: string | null;
};

export type TripSettlement = {
  id: string;
  tripId: string;
  fromMember: string;
  toMember: string;
  amount: number;
  date: string;
  createdAt: string;
};

export type AddTripExpenseInput = {
  tripId: string;
  amount: number;
  category: string;
  note?: string | null;
  paidBy: string;
  /** Defaults to all current members. */
  splitBetween?: string[];
  /** Member-id → paise. Every split member, each > 0, summing to total. NULL = equal. */
  splitCustomPaise?: Record<string, number> | null;
  date?: Date | string;
  /** When true (and myMemberId is in the split), post my share personally. */
  postPersonal?: boolean;
  myMemberId?: string | null;
};

export type MemberBalance = {
  memberId: string;
  name: string;
  /** Paise paid across trip expenses. */
  paid: number;
  /** Paise owed as shares. */
  share: number;
  /** paid − share − settlementsOut + settlementsIn, in paise. >0 = trip owes them. */
  net: number;
};

export type DebtTransfer = {
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  /** Rupees, exact 2dp. */
  amount: number;
};

export type TripBalances = {
  balances: MemberBalance[];
  /** Minimal transfer set that zeroes everyone out. */
  transfers: DebtTransfer[];
  /** Total trip spend, rupees. */
  spent: number;
};

export type Receivable = {
  /** Stable key for notification identity: loan:<id> / trip:<trip>:<member>. */
  key: string;
  kind: "loan" | "trip";
  tripId?: string;
  loanId?: string;
  person: string;
  /** Phone number when known (loans require it). */
  contact?: string | null;
  /** Rupees still owed to me. */
  amount: number;
  context: string;
};
