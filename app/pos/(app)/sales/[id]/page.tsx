import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BackLink, Facts, MoneySummary, PaymentsCard } from "@/components/pos/detail";
import { ChatIcon } from "@/components/pos/icons";
import { CancelWebsiteOrderButton, MarkOrderPaidButton, PaymentButton, VoidSaleButton } from "@/components/pos/record-actions";
import { buttonClass, ButtonLink, Card, Notice, PageHeader, PageShell, Pill, ScrollTable, TableHead, Th } from "@/components/pos/ui";
import { formatPesewas } from "@/lib/money";
import { formatDay, formatDayTime, phoneText } from "@/lib/pos/format";
import { buildReceiptMessage, lineName, receiptWhatsappUrl } from "@/lib/pos/receipt";
import { paymentPill, saleStatusPill } from "@/lib/pos/records";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getSaleDetail } from "@/lib/server/pos/records";
import { getSaleReceipt } from "@/lib/server/pos/sell";

export const metadata: Metadata = { title: "Sale" };

export default async function SalePage({ params }: PageProps<"/pos/sales/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requirePosUser();
  const [sale, receipt] = await Promise.all([getSaleDetail(id), getSaleReceipt(id)]);
  if (!sale || !receipt) notFound();

  const status = saleStatusPill(sale.status);
  const pay = paymentPill(sale.paid, sale.owed, sale.cancelled);
  // A basket sent from the website that hasn't been paid yet.
  const waiting = sale.source === "website" && (sale.status === "ordered" || sale.status === "pending");
  const canReturn = sale.status === "completed" && sale.lines.some((l) => l.qty > l.returned);
  const whatsapp = receiptWhatsappUrl(
    receipt.customer?.phone ?? null,
    buildReceiptMessage({
      storeName: receipt.shop.name,
      code: receipt.code,
      createdAt: receipt.createdAt,
      lines: receipt.lines,
      subtotal: receipt.subtotal,
      discount: receipt.discount,
      total: receipt.total,
      payments: receipt.payments,
      owed: receipt.owed,
      footer: receipt.shop.footer,
    }),
  );

  return (
    <PageShell>
      <BackLink href="/pos/sales" label="Sales" />
      <PageHeader eyebrow="Sale" title={sale.code}>
        {waiting && <MarkOrderPaidButton saleId={sale.id} code={sale.code} total={sale.total} buttonKind="primary" size="md" />}
        {waiting && sale.customer?.phone && (
          <a href={`https://wa.me/${sale.customer.phone}`} target="_blank" rel="noopener noreferrer" className={buttonClass("outline")}>
            <ChatIcon size={16} />
            Open chat
          </a>
        )}
        {!waiting && sale.owed > 0 && <PaymentButton kind="sale" id={sale.id} owed={sale.owed} code={sale.code} buttonKind="primary" size="md" />}
        <a href={`/pos/receipt/${sale.id}`} target="_blank" rel="noopener" className={buttonClass("outline")}>
          Print receipt
        </a>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={buttonClass("outline")}>
          <ChatIcon size={16} />
          WhatsApp receipt
        </a>
        {canReturn && (
          <ButtonLink href={`/pos/returns/new?sale=${sale.id}`} kind="outline">
            Return items
          </ButtonLink>
        )}
        {user.isOwner && sale.status === "completed" && sale.returns.length === 0 && (
          <VoidSaleButton saleId={sale.id} code={sale.code} paid={sale.paid} />
        )}
        {waiting && <CancelWebsiteOrderButton saleId={sale.id} code={sale.code} />}
      </PageHeader>

      {waiting && (
        <Notice tone="good">
          Website order waiting on WhatsApp. Its items stay on the shelf count until you mark it paid; confirm the price and delivery with the
          customer first.
        </Notice>
      )}

      {sale.voided && (
        <Notice tone="bad">
          Cancelled {formatDayTime(sale.voided.at)} by {sale.voided.by}: {sale.voided.reason}. Its items went back on the shelf count.
        </Notice>
      )}

      <Card label="Sale">
        <Facts
          items={[
            ["Date", formatDayTime(sale.createdAt)],
            ["Sold by", sale.source === "website" ? "From the website" : sale.source === "import" ? "Imported from the old system" : sale.soldBy],
            [
              "Customer",
              sale.customer ? (
                <>
                  {sale.customer.name}
                  {sale.customer.phone && <span className="block text-pos-muted">{phoneText(sale.customer.phone)}</span>}
                </>
              ) : (
                "Walk-in customer"
              ),
            ],
            [
              "Status",
              <span key="s" className="flex flex-wrap gap-1.5">
                <Pill className={status.className}>{status.label}</Pill>
                <Pill className={pay.className}>{pay.label}</Pill>
              </span>,
            ],
          ]}
        />
        <ScrollTable minWidth={560}>
          <TableHead>
            <Th>Item</Th>
            <Th align="right">Qty</Th>
            <Th align="right">Price</Th>
            <Th align="right">Total</Th>
            <Th>Returned</Th>
          </TableHead>
          <tbody>
            {sale.lines.map((l) => (
              <tr key={l.id} className="border-t border-pos-paper-deep">
                <td className="py-3 pl-[18px] pr-3 font-semibold">{lineName(l.product_name, l.option_values)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{l.qty}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPesewas(l.unit_price)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{formatPesewas(l.line_total)}</td>
                <td className="py-3 pl-3 pr-[18px] text-pos-soft">{l.returned ? `${l.returned} returned` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
        <MoneySummary
          rows={[
            ...(sale.discount > 0
              ? ([
                  ["Subtotal", sale.subtotal],
                  ["Discount", -sale.discount],
                ] as [string, number][])
              : []),
            ["Total", sale.total, "bold"],
            ["Paid", sale.paid],
            ["Still owed", sale.owed, "owed"],
          ]}
        />
        {sale.note && <p className="m-0 border-t border-pos-paper-deep px-5 py-3 text-sm text-pos-soft">Note: {sale.note}</p>}
      </Card>

      <PaymentsCard
        title="Payments"
        payments={sale.payments}
        empty={sale.cancelled ? "No payments." : "Nothing paid yet. Use Mark paid when the customer pays."}
      />

      {sale.returns.length > 0 && (
        <Card label="Returns">
          <div className="px-5 py-4">
            <h2 className="m-0 text-lg font-bold leading-6">Returns</h2>
          </div>
          <ul className="m-0 list-none p-0">
            {sale.returns.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 border-t border-pos-paper-deep px-5 py-3 text-sm">
                <Link href={`/pos/returns/${r.id}`} className="font-bold">
                  {r.code}
                </Link>
                <span className="text-pos-soft">{formatDay(r.created_at)}</span>
                <span className="tabular-nums">Refund {formatPesewas(r.refund_total)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </PageShell>
  );
}
