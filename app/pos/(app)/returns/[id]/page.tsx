import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BackLink, Facts, MoneySummary, PaymentsCard } from "@/components/pos/detail";
import { PaymentButton } from "@/components/pos/record-actions";
import { Card, PageHeader, PageShell, Pill, ScrollTable, TableHead, Th } from "@/components/pos/ui";
import { formatPesewas } from "@/lib/money";
import { formatDayTime } from "@/lib/pos/format";
import { lineName } from "@/lib/pos/receipt";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getReturnDetail } from "@/lib/server/pos/records";

export const metadata: Metadata = { title: "Return" };

export default async function ReturnPage({ params }: PageProps<"/pos/returns/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  await requirePosUser();
  const r = await getReturnDetail(id);
  if (!r) notFound();
  const value = r.lines.reduce((n, l) => n + l.line_total, 0);

  return (
    <PageShell>
      <BackLink href="/pos/returns" label="Returns" />
      <PageHeader eyebrow="Return" title={r.code}>
        {r.owed > 0 && <PaymentButton kind="refund" id={r.id} owed={r.owed} code={r.code} buttonKind="primary" size="md" />}
      </PageHeader>

      <Card label="Return">
        <Facts
          items={[
            ["Date", formatDayTime(r.createdAt)],
            ["Recorded by", r.createdBy],
            ["Customer", r.customer?.name ?? "Walk-in customer"],
            [
              "From sale",
              r.sale ? (
                <Link key="s" href={`/pos/sales/${r.sale.id}`} className="font-bold">
                  {r.sale.code}
                </Link>
              ) : (
                "No receipt"
              ),
            ],
          ]}
        />
        <ScrollTable minWidth={560}>
          <TableHead>
            <Th>Item</Th>
            <Th align="right">Qty</Th>
            <Th align="right">Price</Th>
            <Th align="right">Value</Th>
            <Th>Shelf</Th>
          </TableHead>
          <tbody>
            {r.lines.map((l) => (
              <tr key={l.id} className="border-t border-pos-paper-deep">
                <td className="py-3 pl-[18px] pr-3 font-semibold">{lineName(l.product_name, l.option_values)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{l.qty}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPesewas(l.unit_price)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{formatPesewas(l.line_total)}</td>
                <td className="py-3 pl-3 pr-[18px]">
                  {l.back_on_shelf ? (
                    <Pill className="bg-pos-tint-green text-pos-green-ink">Back on shelf</Pill>
                  ) : (
                    <Pill className="bg-pos-paper-deep text-pos-soft">Not restocked</Pill>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
        <MoneySummary
          rows={[
            ...(value !== r.refundTotal ? ([["Value of items", value]] as [string, number][]) : []),
            ["Refund", r.refundTotal, "bold"],
            ["Handed back", r.paid],
            ["Still to refund", r.owed, "owed"],
          ]}
        />
        {r.note && <p className="m-0 border-t border-pos-paper-deep px-5 py-3 text-sm text-pos-soft">Note: {r.note}</p>}
      </Card>

      <PaymentsCard title="Refunds handed back" payments={r.payments} empty="Nothing handed back yet." />
    </PageShell>
  );
}
