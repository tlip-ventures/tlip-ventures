import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ChatIcon } from "@/components/pos/icons";
import { PrintButton } from "@/components/pos/print-button";
import { ReceiptView } from "@/components/pos/receipt-view";
import { buttonClass } from "@/components/pos/ui";
import { buildReceiptMessage, receiptWhatsappUrl } from "@/lib/pos/receipt";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getSaleReceipt } from "@/lib/server/pos/sell";

export const metadata: Metadata = { title: "Receipt" };

/**
 * Printable receipt. Narrow (72 mm) so it fits an 80 mm receipt printer; on
 * A4 or "Save as PDF" from a phone it prints as a column at the top.
 */
export default async function ReceiptPage({ params }: PageProps<"/pos/receipt/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  await requirePosUser();
  const r = await getSaleReceipt(id);
  if (!r) notFound();

  const message = buildReceiptMessage({
    storeName: r.shop.name,
    code: r.code,
    createdAt: r.createdAt,
    lines: r.lines,
    subtotal: r.subtotal,
    discount: r.discount,
    total: r.total,
    payments: r.payments,
    owed: r.owed,
    footer: r.shop.footer,
  });

  return (
    <main id="main" className="flex flex-1 flex-col items-center gap-5 px-4 py-6 print:block print:bg-white print:p-0">
      <div className="flex w-full max-w-[72mm] flex-wrap justify-between gap-2 print:hidden">
        <Link href="/pos/sell" className={buttonClass("outline", "sm")}>
          Back to the till
        </Link>
        <span className="flex gap-2">
          <a href={receiptWhatsappUrl(r.customer?.phone ?? null, message)} target="_blank" rel="noopener noreferrer" className={buttonClass("outline", "sm")}>
            <ChatIcon size={16} />
            WhatsApp
          </a>
          <PrintButton />
        </span>
      </div>

      <ReceiptView r={r} />
    </main>
  );
}
