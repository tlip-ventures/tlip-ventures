"use client";

import { updateCustomer } from "@/app/pos/(app)/customers/actions";
import { ActionDialog, dialogInputClass as inputClass, dialogLabelClass as labelClass } from "./action-dialog";

/** "Edit" on a customer: name, phone (Ghana) and a note. */
export function EditCustomerButton({
  customerId,
  name,
  phone,
  notes,
}: {
  customerId: string;
  name: string;
  /** As shown, e.g. "024 123 4567"; null when there is none. */
  phone: string | null;
  notes: string | null;
}) {
  return (
    <ActionDialog label="Edit" title={`Edit ${name}`} kind="outline" size="sm" action={updateCustomer} submitLabel="Save" className="px-3">
      <input type="hidden" name="customerId" value={customerId} />
      <label className={labelClass}>
        <span>Name</span>
        <input name="name" defaultValue={name} required maxLength={100} autoComplete="off" className={inputClass} />
      </label>
      <label className={labelClass}>
        <span>Phone (leave empty if none)</span>
        <input name="phone" type="tel" inputMode="tel" defaultValue={phone ?? ""} placeholder="024 123 4567" maxLength={30} className={inputClass} />
      </label>
      <label className={labelClass}>
        <span>Note (optional)</span>
        <textarea
          name="notes"
          defaultValue={notes ?? ""}
          rows={2}
          maxLength={500}
          placeholder="Prefers MoMo, lives near Sharp Curve…"
          className={`${inputClass} py-2`}
        />
      </label>
    </ActionDialog>
  );
}
