import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ChatIcon } from "@/components/pos/icons";
import { CancelInvoiceButton, SellInvoiceButton } from "@/components/pos/invoice-actions";
import { InvoiceView } from "@/components/pos/invoice-view";
import { PrintButton } from "@/components/pos/print-button";
import { buttonClass } from "@/components/pos/ui";
import { buildInvoiceMessage, ghanaToday } from "@/lib/pos/invoices";
import { receiptWhatsappUrl } from "@/lib/pos/receipt";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getInvoice } from "@/lib/server/pos/invoices";

export const metadata: Metadata = { title: "Invoice" };

/**
 * An invoice on an A4 page, with Print (or "Save as PDF") and WhatsApp, and,
 * while it is open, Sell this invoice and Cancel invoice.
 */
export default async function InvoicePage({ params }: PageProps<"/pos/invoice/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  await requirePosUser();
  const inv = await getInvoice(id);
  if (!inv) notFound();

  const message = buildInvoiceMessage({
    storeName: inv.shop.name,
    code: inv.code,
    createdAt: inv.createdAt,
    validUntil: inv.validUntil,
    lines: inv.lines,
    discount: inv.discount,
    deliveryFee: inv.delivery?.fee ?? 0,
    deliveryAddress: inv.delivery?.address ?? null,
    deliveryIncluded: inv.delivery?.included ?? false,
    wholesale: inv.wholesale,
    total: inv.total,
  });

  return (
    <main id="main" className="flex flex-1 flex-col items-center gap-5 px-4 py-6 print:block print:bg-white print:p-0">
      <div className="flex w-full max-w-[210mm] flex-wrap items-start justify-between gap-3 print:hidden">
        <span className="flex flex-col gap-1">
          <Link href="/pos/invoices" className="inline-flex min-h-11 items-center text-[13px] font-bold">
            ← Invoices
          </Link>
          {inv.sale && (
            <span className="text-[13px] text-pos-soft">
              Sold as{" "}
              <Link href={`/pos/sales/${inv.sale.id}`} className="font-bold">
                {inv.sale.code}
              </Link>
            </span>
          )}
          {inv.madeBy && <span className="text-[13px] text-pos-muted">Made by {inv.madeBy}</span>}
        </span>
        <span className="flex flex-wrap items-start gap-2">
          {inv.status === "open" && <CancelInvoiceButton invoiceId={inv.id} code={inv.code} />}
          <a
            href={receiptWhatsappUrl(inv.customer?.phone ?? null, message)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass("outline", "sm")}
          >
            <ChatIcon size={16} />
            WhatsApp
          </a>
          <PrintButton />
          {inv.status === "open" && <SellInvoiceButton invoiceId={inv.id} code={inv.code} />}
        </span>
      </div>
      <p className="m-0 w-full max-w-[210mm] text-[13px] text-pos-muted print:hidden">
        Print it, or choose &ldquo;Save as PDF&rdquo; in the print window to send it as a file.
      </p>

      <InvoiceView inv={inv} today={ghanaToday(new Date())} />
    </main>
  );
}
