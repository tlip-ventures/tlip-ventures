import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BackLink, Facts, MoneySummary, PaymentsCard } from "@/components/pos/detail";
import { CancelPurchaseButton, PaymentButton, ReceivePurchaseButton } from "@/components/pos/record-actions";
import { Card, PageHeader, PageShell, Pill, ScrollTable, TableHead, Th } from "@/components/pos/ui";
import { formatPesewas } from "@/lib/money";
import { formatDayTime, phoneText } from "@/lib/pos/format";
import { lineName } from "@/lib/pos/receipt";
import { paymentPill, purchaseStatusPill } from "@/lib/pos/records";
import { requireOwner } from "@/lib/server/pos/auth";
import { getPurchaseDetail } from "@/lib/server/pos/records";

export const metadata: Metadata = { title: "Purchase" };

export default async function PurchasePage({ params }: PageProps<"/pos/purchases/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  await requireOwner();
  const p = await getPurchaseDetail(id);
  if (!p) notFound();
  const status = purchaseStatusPill(p.status);
  const pay = paymentPill(p.paid, p.owed, p.status === "cancelled");
  const supplierPhone = phoneText(p.supplier?.phone ?? null);

  return (
    <PageShell>
      <BackLink href="/pos/purchases" label="Purchases" />
      <PageHeader eyebrow="Purchase" title={p.code}>
        {p.status === "ordered" && <ReceivePurchaseButton purchaseId={p.id} code={p.code} />}
        {p.owed > 0 && <PaymentButton kind="purchase" id={p.id} owed={p.owed} code={p.code} buttonKind="outline" size="md" />}
        {p.status === "ordered" && <CancelPurchaseButton purchaseId={p.id} code={p.code} />}
      </PageHeader>

      <Card label="Purchase">
        <Facts
          items={[
            ["Date", formatDayTime(p.createdAt)],
            [
              "Supplier",
              <>
                {p.supplier?.name}
                {supplierPhone && <span className="block text-pos-muted">{supplierPhone}</span>}
              </>,
            ],
            ["Received", p.receivedAt ? `${formatDayTime(p.receivedAt)}${p.receivedBy ? ` by ${p.receivedBy}` : ""}` : "Not yet"],
            [
              "Status",
              <span key="s" className="flex flex-wrap gap-1.5">
                <Pill className={status.className}>{status.label}</Pill>
                <Pill className={pay.className}>{pay.label}</Pill>
              </span>,
            ],
          ]}
        />
        <ScrollTable minWidth={520}>
          <TableHead>
            <Th>Item</Th>
            <Th align="right">Qty</Th>
            <Th align="right">Cost each</Th>
            <Th align="right">Total</Th>
          </TableHead>
          <tbody>
            {p.lines.map((l) => (
              <tr key={l.id} className="border-t border-pos-paper-deep">
                <td className="py-3 pl-[18px] pr-3 font-semibold">{lineName(l.product_name, l.option_values)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{l.qty}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPesewas(l.unit_cost)}</td>
                <td className="whitespace-nowrap py-3 pl-3 pr-[18px] text-right font-semibold tabular-nums">{formatPesewas(l.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
        <MoneySummary
          rows={[
            ["Total", p.total, "bold"],
            ["Paid", p.paid],
            ["You still owe", p.owed, "owed"],
          ]}
        />
        {p.note && <p className="m-0 border-t border-pos-paper-deep px-5 py-3 text-sm text-pos-soft">Note: {p.note}</p>}
      </Card>

      <PaymentsCard title="Payments to the supplier" payments={p.payments} empty="Nothing paid yet." />
    </PageShell>
  );
}
