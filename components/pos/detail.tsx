import Link from "next/link";
import type { ReactNode } from "react";
import { formatPesewas } from "@/lib/money";
import { formatDayTime } from "@/lib/pos/format";
import { METHOD_LABELS } from "@/lib/pos/records";
import { BackIcon } from "./icons";
import { Card, ScrollTable, TableHead, Th } from "./ui";

// Pieces shared by the sale, purchase and return pages.

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1 self-start text-[13px] font-bold no-underline">
      <BackIcon size={16} />
      {label}
    </Link>
  );
}

/** Label / value pairs in a wrapping grid. */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="m-0 grid gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-pos-muted">{label}</dt>
          <dd className="m-0 text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Total / paid / still owed at the bottom of a record. */
export function MoneySummary({ rows }: { rows: [string, number, ("bold" | "owed" | "plain")?][] }) {
  return (
    <div className="flex flex-col gap-1 border-t border-pos-paper-deep bg-pos-row-hover px-5 py-4 text-sm tabular-nums">
      {rows.map(([label, amount, style = "plain"]) => (
        <div
          key={label}
          className={`flex justify-between gap-3 ${style === "bold" ? "text-base font-bold" : ""} ${style === "owed" && amount > 0 ? "font-bold text-pos-rust" : ""}`}
        >
          <span>{label}</span>
          <span>{formatPesewas(amount)}</span>
        </div>
      ))}
    </div>
  );
}

export type PaymentRow = { method: "cash" | "momo" | "bank"; amount: number; paidAt: string; by: string; note: string | null };

export function PaymentsCard({ title, payments, empty }: { title: string; payments: PaymentRow[]; empty: string }) {
  return (
    <Card label={title}>
      <div className="px-5 py-4">
        <h2 className="m-0 text-lg font-bold leading-6">{title}</h2>
      </div>
      {payments.length === 0 ? (
        <p className="m-0 border-t border-pos-paper-deep px-5 py-6 text-sm text-pos-soft">{empty}</p>
      ) : (
        <ScrollTable minWidth={520}>
          <TableHead>
            <Th>Date</Th>
            <Th>How</Th>
            <Th align="right">Amount</Th>
            <Th>Note</Th>
            <Th>By</Th>
          </TableHead>
          <tbody>
            {payments.map((p, i) => (
              <tr key={i} className="border-t border-pos-paper-deep">
                <td className="whitespace-nowrap py-3 pl-[18px] pr-3 text-pos-soft">{formatDayTime(p.paidAt)}</td>
                <td className="px-3 py-3">{METHOD_LABELS[p.method]}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{formatPesewas(p.amount)}</td>
                <td className="px-3 py-3 text-pos-soft">{p.note ?? "—"}</td>
                <td className="py-3 pl-3 pr-[18px] text-pos-soft">{p.by}</td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
      )}
    </Card>
  );
}
