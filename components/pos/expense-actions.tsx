"use client";

import { cancelExpense, saveExpense, saveExpenseCategory } from "@/app/pos/(app)/expenses/actions";
import { pesewasToInput } from "@/lib/money";
import { EXPENSE_METHOD_LABELS, type ExpenseMethod } from "@/lib/pos/expenses";
import { ActionDialog, dialogInputClass as inputClass, dialogLabelClass as labelClass } from "./action-dialog";
import type { ButtonKind } from "./ui";

export type ExpenseFormValue = {
  id: string;
  spentOn: string;
  categoryId: number;
  amount: number;
  method: ExpenseMethod;
  payee: string | null;
  note: string | null;
};

/** "Add expense", or "Edit" on one: the day, the kind, the amount, how it was paid, who to, a note. */
export function ExpenseButton({
  categories,
  today,
  expense,
  label,
  kind = "primary",
  size = "md",
}: {
  categories: { id: number; name: string; isActive: boolean }[];
  today: string;
  expense?: ExpenseFormValue;
  label: string;
  kind?: ButtonKind;
  size?: "md" | "sm";
}) {
  // Hidden kinds aren't offered, except the one an expense already has.
  const choices = categories.filter((c) => c.isActive || c.id === expense?.categoryId);
  return (
    <ActionDialog
      label={label}
      title={expense ? "Change expense" : "Add expense"}
      kind={kind}
      size={size}
      action={saveExpense}
      submitLabel={expense ? "Save" : "Add expense"}
    >
      <input type="hidden" name="id" value={expense?.id ?? ""} />
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          <span>Day paid</span>
          <input name="spentOn" type="date" required max={today} defaultValue={expense?.spentOn ?? today} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span>Amount (GH₵)</span>
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder="0.00"
            defaultValue={expense ? pesewasToInput(expense.amount) : ""}
            autoFocus={!expense}
            className={inputClass}
          />
        </label>
      </div>
      <label className={labelClass}>
        <span>Kind of expense</span>
        <select name="categoryId" required defaultValue={expense?.categoryId ?? ""} className={inputClass}>
          <option value="" disabled>
            Choose…
          </option>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 text-[13px] font-semibold text-pos-soft">Paid by</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(EXPENSE_METHOD_LABELS) as ExpenseMethod[]).map((m) => (
            <label key={m} className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-pos-line bg-white px-2 text-center text-[13px] font-semibold has-[:checked]:border-pos-green has-[:checked]:bg-pos-tint-green has-[:checked]:text-pos-green-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-pos-green has-[:focus-visible]:ring-offset-1">
              <input type="radio" name="method" value={m} required defaultChecked={(expense?.method ?? "cash") === m} className="sr-only" />
              {m === "momo" ? "MoMo" : m === "bank" ? "Bank" : "Cash"}
            </label>
          ))}
        </div>
      </fieldset>
      <label className={labelClass}>
        <span>Paid to (optional)</span>
        <input name="payee" maxLength={100} defaultValue={expense?.payee ?? ""} placeholder="Landlord, ECG, Kofi (rider)…" className={inputClass} />
      </label>
      <label className={labelClass}>
        <span>Note (optional)</span>
        <input name="note" maxLength={300} defaultValue={expense?.note ?? ""} placeholder="November rent, receipt no. 123…" className={inputClass} />
      </label>
    </ActionDialog>
  );
}

/** Cancel a wrong expense, with the reason. */
export function CancelExpenseButton({ id }: { id: string }) {
  return (
    <ActionDialog label="Cancel" title="Cancel this expense?" kind="quiet" size="sm" action={cancelExpense} submitLabel="Cancel expense" tone="danger">
      <input type="hidden" name="id" value={id} />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">It stays on the list, crossed out, and is no longer counted in the totals or the profit.</p>
      <label className={labelClass}>
        <span>Why</span>
        <input name="reason" required maxLength={300} placeholder="Entered twice, wrong amount…" autoFocus className={inputClass} />
      </label>
    </ActionDialog>
  );
}

/** Add a kind of expense, or rename / hide one. */
export function ExpenseCategoryButton({ category }: { category?: { id: number; name: string; isActive: boolean } }) {
  return (
    <ActionDialog
      label={category ? "Edit" : "Add a kind"}
      title={category ? `Edit ${category.name}` : "Add a kind of expense"}
      kind={category ? "quiet" : "outline"}
      size="sm"
      action={saveExpenseCategory}
      submitLabel="Save"
    >
      <input type="hidden" name="id" value={category?.id ?? ""} />
      <label className={labelClass}>
        <span>Name</span>
        <input name="name" required maxLength={40} defaultValue={category?.name ?? ""} placeholder="Security, Cleaning…" autoFocus className={inputClass} />
      </label>
      {category && (
        <label className={labelClass}>
          <span>In the list when adding an expense</span>
          <select name="active" defaultValue={category.isActive ? "yes" : "no"} className={inputClass}>
            <option value="yes">Show</option>
            <option value="no">Hide (past expenses keep it)</option>
          </select>
        </label>
      )}
    </ActionDialog>
  );
}
