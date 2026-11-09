"use client";

import { updateDelivery } from "@/app/pos/(app)/deliveries/actions";
import { formatPesewas } from "@/lib/money";
import { ActionDialog, dialogInputClass, dialogLabelClass } from "./action-dialog";
import type { ButtonKind } from "./ui";

/** "Send out": who is taking it. */
export function SendOutButton({ saleId, code, rider, kind = "primary" }: { saleId: string; code: string; rider: string | null; kind?: ButtonKind }) {
  return (
    <ActionDialog label="Send out" title={`Send out ${code}`} kind={kind} size="sm" action={updateDelivery} submitLabel="Send out">
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="status" value="out" />
      <label className={dialogLabelClass}>
        <span>Rider</span>
        <input name="rider" defaultValue={rider ?? ""} maxLength={60} placeholder="Name of the rider or driver" autoComplete="off" className={dialogInputClass} />
      </label>
    </ActionDialog>
  );
}

/** "Delivered": the customer has it; reminds to settle a pay-on-delivery sale. */
export function DeliveredButton({ saleId, code, owed }: { saleId: string; code: string; owed: number }) {
  return (
    <ActionDialog label="Delivered" title={`${code} delivered?`} kind="green" size="sm" action={updateDelivery} submitLabel="Delivered">
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="status" value="delivered" />
      {owed > 0 && (
        <p className="m-0 rounded-md bg-pos-tint-orange px-3 py-2.5 text-[13px] font-semibold leading-[19px] text-pos-rust">
          {formatPesewas(owed)} is still to pay on this sale. When the rider hands it over, press Mark paid.
        </p>
      )}
      <label className={dialogLabelClass}>
        <span>Note (optional)</span>
        <input name="note" maxLength={300} placeholder="Left with the gateman…" className={dialogInputClass} />
      </label>
    </ActionDialog>
  );
}

/** Undo "out" or "delivered": back on the list to deliver. */
export function BackToListButton({ saleId, code }: { saleId: string; code: string }) {
  return (
    <ActionDialog label="Not delivered" title={`${code} not delivered?`} kind="quiet" size="sm" action={updateDelivery} submitLabel="Put back on the list">
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="status" value="to_deliver" />
      <p className="m-0 text-sm leading-[22px] text-pos-soft">It goes back on the list to deliver, for another try.</p>
    </ActionDialog>
  );
}
