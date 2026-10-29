"use client";

import { addSupplierFromForm } from "@/app/pos/(app)/purchases/actions";
import { ActionDialog, dialogInputClass, dialogLabelClass } from "./action-dialog";

export function NewSupplierButton() {
  return (
    <ActionDialog label="New supplier" title="New supplier" kind="primary" size="md" action={addSupplierFromForm} submitLabel="Add supplier">
      <label className={dialogLabelClass}>
        <span>Name</span>
        <input name="name" required maxLength={100} className={dialogInputClass} />
      </label>
      <label className={dialogLabelClass}>
        <span>Phone (optional)</span>
        <input name="phone" type="tel" inputMode="tel" placeholder="024 123 4567" className={dialogInputClass} />
      </label>
    </ActionDialog>
  );
}
