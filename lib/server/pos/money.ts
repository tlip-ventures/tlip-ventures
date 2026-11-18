import "server-only";
import { pageRange } from "@/lib/pagination";
import type { MoneyAccount, MoneyFlows, MoneyMoveKind } from "@/lib/pos/money";
import { requireOwner } from "./auth";
import { getPeopleNames } from "./stock";

export type MoneyAccountNow = {
  account: MoneyAccount;
  /** The last count, or null when never counted (then `expected` means nothing yet). */
  counted: number | null;
  countedAt: string | null;
  flows: MoneyFlows;
  expected: number;
};

/** Cash, MoMo and bank now: last count, what moved since, what should be there. Owner only. */
export async function getMoneyOverview(): Promise<MoneyAccountNow[]> {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("pos_money_overview");
  if (error) throw new Error(`Could not load the money accounts: ${error.message}`);
  const raw = data as unknown as { account: MoneyAccount; counted: number | null; counted_at: string | null; flows: MoneyFlows; expected: number }[];
  return raw.map((a) => ({ account: a.account, counted: a.counted, countedAt: a.counted_at, flows: a.flows, expected: a.expected }));
}

export const MONEY_MOVES_PAGE_SIZE = 20;

export type MoneyMoveRow = {
  id: string;
  kind: MoneyMoveKind;
  from: MoneyAccount | null;
  to: MoneyAccount | null;
  amount: number;
  movedOn: string;
  note: string | null;
  by: string;
  cancelled: { at: string; reason: string | null } | null;
};

/** Money moves, newest first. */
export async function listMoneyMoves(page = 1) {
  const { supabase } = await requireOwner();
  const { from, to } = pageRange(page, MONEY_MOVES_PAGE_SIZE);
  const [{ data, count, error }, people] = await Promise.all([
    supabase
      .from("money_moves")
      .select("id, kind, from_account, to_account, amount, moved_on, note, created_by, cancelled_at, cancel_reason", { count: "exact" })
      .order("moved_on", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to),
    getPeopleNames(),
  ]);
  if (error?.code === "PGRST103") return { rows: [] as MoneyMoveRow[], total: count ?? 0 };
  if (error) throw new Error(`Could not load money moves: ${error.message}`);
  const rows: MoneyMoveRow[] = data.map((m) => ({
    id: m.id,
    kind: m.kind as MoneyMoveKind,
    from: m.from_account,
    to: m.to_account,
    amount: m.amount,
    movedOn: m.moved_on,
    note: m.note,
    by: (m.created_by && people.get(m.created_by)) || "Someone no longer here",
    cancelled: m.cancelled_at ? { at: m.cancelled_at, reason: m.cancel_reason } : null,
  }));
  return { rows, total: count ?? 0 };
}

export type MoneyCountRow = { id: string; account: MoneyAccount; counted: number; expected: number | null; note: string | null; at: string; first: boolean };

/** The latest counts, newest first; the first count of each account has nothing to compare with. */
export async function listMoneyCounts(limit = 15): Promise<MoneyCountRow[]> {
  const { supabase } = await requireOwner();
  const [{ data, error }, { data: firsts, error: firstError }] = await Promise.all([
    supabase.from("money_checks").select("id, account, counted, expected, note, created_at").order("created_at", { ascending: false }).limit(limit),
    supabase.from("money_checks").select("id, account, created_at").order("created_at", { ascending: true }),
  ]);
  if (error || firstError) throw new Error(`Could not load money counts: ${(error ?? firstError)!.message}`);
  const firstIds = new Set<string>();
  const seen = new Set<string>();
  for (const c of firsts) if (!seen.has(c.account)) (seen.add(c.account), firstIds.add(c.id));
  return data.map((c) => ({
    id: c.id,
    account: c.account,
    counted: c.counted,
    expected: firstIds.has(c.id) ? null : c.expected,
    note: c.note,
    at: c.created_at,
    first: firstIds.has(c.id),
  }));
}

/** Money the owner took out and put in over a stretch of days. */
export async function getOwnerMoney(from: Date, to: Date): Promise<{ out: number; in: number }> {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("pos_owner_money", { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw new Error(`Could not load the owner's money: ${error.message}`);
  return data as unknown as { out: number; in: number };
}
