"use client";

import { cancelMoneyMove, countMoney, saveMoneyMove } from "@/app/pos/(app)/money/actions";
import { formatPesewas } from "@/lib/money";
import { MONEY_ACCOUNT_LABELS, MONEY_ACCOUNTS, type MoneyAccount, type MoneyMoveKind } from "@/lib/pos/money";
import { ActionDialog, dialogInputClass as inputClass, dialogLabelClass as labelClass } from "./action-dialog";
import type { ButtonKind } from "./ui";

/** Count the money really in one account now; the app compares it with what it expected. */
export function CountMoneyButton({ account, expected, firstCount }: { account: MoneyAccount; expected: number; firstCount: boolean }) {
  const name = MONEY_ACCOUNT_LABELS[account];
  const where = account === "cash" ? "in the drawer and the cash box" : account === "momo" ? "on the shop's MoMo wallet" : "in the bank account";
  return (
    <ActionDialog label={firstCount ? "Count to start" : "Count"} title={`Count ${name}`} kind={firstCount ? "primary" : "outline"} size="sm" action={countMoney} submitLabel="Save count">
      <input type="hidden" name="account" value={account} />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">
        {firstCount
          ? `Enter what is ${where} right now. From then on the app adds every payment, refund and expense to keep track.`
          : `The app expects ${formatPesewas(expected)} ${where}. Enter what is really there; the difference is saved with the count.`}
      </p>
      <label className={labelClass}>
        <span>Amount there now (GH₵)</span>
        <input name="counted" inputMode="decimal" required placeholder="0.00" autoFocus className={inputClass} />
      </label>
      <label className={labelClass}>
        <span>Note (optional)</span>
        <input name="note" maxLength={300} placeholder="End of day, after paying the rider…" className={inputClass} />
      </label>
    </ActionDialog>
  );
}

const MOVE_TEXT: Record<MoneyMoveKind, { title: string; submit: string; help: string }> = {
  transfer: {
    title: "Move money",
    submit: "Move money",
    help: "From one of the shop's accounts to another, like banking the day's cash or cashing out MoMo.",
  },
  owner_out: {
    title: "Take money out",
    submit: "Record it",
    help: "Money you take for yourself (not a shop expense). It doesn't lower the profit; it shows apart as taken out by you.",
  },
  owner_in: {
    title: "Put money in",
    submit: "Record it",
    help: "Your own money put into the shop, like a top-up to pay a supplier. It isn't a sale and doesn't count as profit.",
  },
};

function AccountSelect({ name, label, defaultValue }: { name: string; label: string; defaultValue: MoneyAccount }) {
  return (
    <label className={labelClass}>
      <span>{label}</span>
      <select name={name} required defaultValue={defaultValue} className={inputClass}>
        {MONEY_ACCOUNTS.map((a) => (
          <option key={a} value={a}>
            {MONEY_ACCOUNT_LABELS[a]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Move money between accounts, take some out, or put some in. */
export function MoneyMoveButton({ kind, today, buttonKind = "outline" }: { kind: MoneyMoveKind; today: string; buttonKind?: ButtonKind }) {
  const t = MOVE_TEXT[kind];
  return (
    <ActionDialog label={t.title} title={t.title} kind={buttonKind} size="md" action={saveMoneyMove} submitLabel={t.submit}>
      <input type="hidden" name="kind" value={kind} />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">{t.help}</p>
      {kind === "transfer" ? (
        <div className="grid grid-cols-2 gap-3">
          <AccountSelect name="from" label="From" defaultValue="cash" />
          <AccountSelect name="to" label="To" defaultValue="bank" />
        </div>
      ) : kind === "owner_out" ? (
        <AccountSelect name="from" label="Taken from" defaultValue="cash" />
      ) : (
        <AccountSelect name="to" label="Put into" defaultValue="cash" />
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          <span>Amount (GH₵)</span>
          <input name="amount" inputMode="decimal" required placeholder="0.00" autoFocus className={inputClass} />
        </label>
        <label className={labelClass}>
          <span>Day</span>
          <input name="movedOn" type="date" required max={today} defaultValue={today} className={inputClass} />
        </label>
      </div>
      <label className={labelClass}>
        <span>Note (optional)</span>
        <input name="note" maxLength={300} placeholder={kind === "transfer" ? "Banked at Ecobank Dansoman…" : "School fees, personal…"} className={inputClass} />
      </label>
    </ActionDialog>
  );
}

/** Cancel a wrong money move, with the reason. */
export function CancelMoneyMoveButton({ id }: { id: string }) {
  return (
    <ActionDialog label="Cancel" title="Cancel this?" kind="quiet" size="sm" action={cancelMoneyMove} submitLabel="Cancel it" tone="danger">
      <input type="hidden" name="id" value={id} />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">It stays on the list, crossed out, and no longer counts in the balances.</p>
      <label className={labelClass}>
        <span>Why</span>
        <input name="reason" required maxLength={300} placeholder="Entered twice, wrong account…" autoFocus className={inputClass} />
      </label>
    </ActionDialog>
  );
}
