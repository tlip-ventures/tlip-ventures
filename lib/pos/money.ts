// Money accounts (owner): cash, MoMo and bank. Pure helpers for the screens.

import type { Pesewas } from "@/lib/money";

export const MONEY_ACCOUNTS = ["cash", "momo", "bank"] as const;
export type MoneyAccount = (typeof MONEY_ACCOUNTS)[number];

export const MONEY_ACCOUNT_LABELS: Record<MoneyAccount, string> = { cash: "Cash", momo: "Mobile Money", bank: "Bank" };

export const MONEY_MOVE_KINDS = ["transfer", "owner_out", "owner_in"] as const;
export type MoneyMoveKind = (typeof MONEY_MOVE_KINDS)[number];

/** What came in and went out of one account since its last count (pesewas). */
export type MoneyFlows = {
  sales_in: Pesewas;
  refunds_out: Pesewas;
  suppliers_out: Pesewas;
  expenses_out: Pesewas;
  moved_in: Pesewas;
  moved_out: Pesewas;
  owner_out: Pesewas;
  owner_in: Pesewas;
};

/** The lines of a flows breakdown that aren't zero: [label, signed amount]. */
export function flowLines(f: MoneyFlows): [string, Pesewas][] {
  const lines: [string, Pesewas][] = [
    ["Sales and payments taken", f.sales_in],
    ["Refunds paid", -f.refunds_out],
    ["Paid to suppliers", -f.suppliers_out],
    ["Expenses paid", -f.expenses_out],
    ["Moved in", f.moved_in],
    ["Moved out", -f.moved_out],
    ["Taken out by you", -f.owner_out],
    ["Put in by you", f.owner_in],
  ];
  return lines.filter(([, amount]) => amount !== 0);
}

/** "Cash → Bank", "Taken out of Cash", "Put into Mobile Money". */
export function moveText(kind: MoneyMoveKind, from: MoneyAccount | null, to: MoneyAccount | null): string {
  if (kind === "transfer") return `${from ? MONEY_ACCOUNT_LABELS[from] : "?"} → ${to ? MONEY_ACCOUNT_LABELS[to] : "?"}`;
  if (kind === "owner_out") return `Taken out of ${from ? MONEY_ACCOUNT_LABELS[from] : "?"} by you`;
  return `Put into ${to ? MONEY_ACCOUNT_LABELS[to] : "?"} by you`;
}

/** "Matched", "GH₵ 5 short" or "GH₵ 5 over" for a count against what was expected. */
export function countResult(counted: Pesewas, expected: Pesewas | null): { kind: "match" | "short" | "over" | "first"; amount: Pesewas } {
  if (expected === null) return { kind: "first", amount: 0 };
  const diff = counted - expected;
  return diff === 0 ? { kind: "match", amount: 0 } : diff < 0 ? { kind: "short", amount: -diff } : { kind: "over", amount: diff };
}
