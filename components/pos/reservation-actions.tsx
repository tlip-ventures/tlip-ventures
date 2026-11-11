"use client";

import { markCollected, setReservedUntil } from "@/app/pos/(app)/reserved/actions";
import { formatPesewas } from "@/lib/money";
import { ActionDialog, dialogInputClass as inputClass, dialogLabelClass as labelClass } from "./action-dialog";
import type { ButtonKind } from "./ui";

/** "Collected": the customer took the reserved order away. */
export function CollectedButton({
  saleId,
  code,
  owed,
  onShelf,
  kind = "green",
  size = "sm",
}: {
  saleId: string;
  code: string;
  owed: number;
  /** Not paid in full: the items are still on the shelf. */
  onShelf: boolean;
  kind?: ButtonKind;
  size?: "md" | "sm";
}) {
  return (
    <ActionDialog label="Collected" title={`${code} collected?`} kind={kind} size={size} action={markCollected} submitLabel="Yes, collected">
      <input type="hidden" name="saleId" value={saleId} />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">
        {owed > 0 ? (
          <>
            {formatPesewas(owed)} is still owed. {onShelf ? "The items come off the shelf now and the" : "The"} sale goes On hold until it
            is paid; take what they pay now with Mark paid first.
          </>
        ) : (
          "Paid in full. It leaves the Reserved list."
        )}
      </p>
    </ActionDialog>
  );
}

/** Change or clear the agreed pickup or delivery date. */
export function ReservedDateButton({ saleId, code, until, today }: { saleId: string; code: string; until: string | null; today: string }) {
  return (
    <ActionDialog label={until ? "Change date" : "Add date"} title={`Date for ${code}`} kind="outline" size="sm" action={setReservedUntil} submitLabel="Save">
      <input type="hidden" name="saleId" value={saleId} />
      <label className={labelClass}>
        <span>Pick up or deliver by (leave empty for none)</span>
        <input name="until" type="date" defaultValue={until ?? ""} min={today} className={inputClass} />
      </label>
    </ActionDialog>
  );
}
