import Link from "next/link";
import { formatPesewas } from "@/lib/money";
import { DELIVERY_PILLS, deliveryProgress } from "@/lib/pos/deliveries";
import { formatDayTime, phoneText } from "@/lib/pos/format";
import type { DeliveryRow } from "@/lib/server/pos/deliveries";
import { BackToListButton, DeliveredButton, SendOutButton } from "./delivery-actions";
import { ChatIcon } from "./icons";
import { PaymentButton } from "./record-actions";
import { Pill } from "./ui";

/** One row per delivery: where, who to call, what to collect, and the next step. */
export function DeliveryList({ rows }: { rows: DeliveryRow[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {rows.map((d) => {
        const pill = DELIVERY_PILLS[d.status];
        const progress = deliveryProgress(d.status, d.rider);
        const phone = phoneText(d.contactPhone);
        return (
          <li key={d.saleId} className="flex flex-col gap-3 border-t border-pos-paper-deep px-5 py-4 first:border-t-0 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <Link href={`/pos/sales/${d.saleId}`} className="font-bold text-pos-ink no-underline hover:underline">
                  {d.code}
                </Link>
                <Pill className={pill.className}>{d.cancelled ? "Sale cancelled" : pill.label}</Pill>
                <span className="text-[13px] text-pos-muted">{formatDayTime(d.createdAt)}</span>
              </span>
              <span className="text-[15px] font-semibold leading-[21px]">{d.address}</span>
              <span className="text-[13px] text-pos-soft">
                {[d.contactName ?? d.customer, phone].filter(Boolean).join(" · ") || "No phone number"}
                {d.note ? ` · ${d.note}` : ""}
              </span>
              {progress && <span className="text-[13px] font-semibold text-pos-green-ink">{progress}</span>}
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              <span className="text-sm tabular-nums">
                {formatPesewas(d.total)}
                <span className="text-pos-muted"> incl. {formatPesewas(d.fee)} delivery</span>
              </span>
              {d.owed > 0 && !d.cancelled && (
                <span className="text-[13px] font-bold tabular-nums text-pos-rust">Collect {formatPesewas(d.owed)}</span>
              )}
              {!d.cancelled && (
                <span className="flex flex-wrap gap-1.5 md:justify-end">
                  {d.contactPhone && (
                    <a
                      href={`https://wa.me/${d.contactPhone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`WhatsApp ${d.contactName ?? d.customer ?? "the customer"}`}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-pos-line bg-white px-3 text-[13px] font-semibold text-pos-ink no-underline hover:border-pos-muted max-md:min-h-11"
                    >
                      <ChatIcon size={15} />
                      Chat
                    </a>
                  )}
                  {d.status === "to_deliver" && <SendOutButton saleId={d.saleId} code={d.code} rider={d.rider} />}
                  {d.status === "out" && <DeliveredButton saleId={d.saleId} code={d.code} owed={d.owed} />}
                  {d.owed > 0 && <PaymentButton kind="sale" id={d.saleId} owed={d.owed} code={d.code} />}
                  {d.status !== "to_deliver" && <BackToListButton saleId={d.saleId} code={d.code} />}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
