"use client";

import { useActionState } from "react";
import { saveReceiptFooter } from "@/app/pos/(app)/settings/actions";
import type { ActionResult } from "@/app/pos/(app)/products/actions";
import { dialogInputClass, dialogLabelClass } from "./action-dialog";
import { buttonClass, Notice } from "./ui";

export function ReceiptFooterForm({ footer }: { footer: string | null }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveReceiptFooter, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className={dialogLabelClass}>
        <span>Line at the bottom of every receipt</span>
        <textarea
          name="footer"
          defaultValue={footer ?? ""}
          maxLength={300}
          rows={2}
          placeholder="Thank you for shopping with us."
          className={`${dialogInputClass} py-2`}
        />
        <span className="text-xs font-normal text-pos-muted">For example your returns rule or MoMo number. Empty: “Thank you for shopping with us.”</span>
      </label>
      {state && <Notice tone={state.ok ? "good" : "bad"}>{state.message}</Notice>}
      <div>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
