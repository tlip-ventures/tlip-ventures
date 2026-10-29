import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { BackLink } from "@/components/pos/detail";
import { FindSaleForm, ReturnForm, type ReturnSale } from "@/components/pos/return-form";
import { Card, Notice, PageHeader, PageShell } from "@/components/pos/ui";
import { lineName } from "@/lib/pos/receipt";
import { requirePosUser } from "@/lib/server/pos/auth";
import { getSaleDetail } from "@/lib/server/pos/records";

export const metadata: Metadata = { title: "New return" };

export default async function NewReturnPage({ searchParams }: PageProps<"/pos/returns/new">) {
  await requirePosUser();
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const saleId = z.uuid().safeParse(one(raw.sale));
  const noReceipt = one(raw.mode) === "no-receipt";
  const detail = saleId.success ? await getSaleDetail(saleId.data) : null;

  let sale: ReturnSale | null = null;
  let problem: string | null = null;
  if (saleId.success && !detail) problem = "That sale wasn't found.";
  if (detail) {
    if (detail.status !== "completed") problem = `${detail.code} isn't a completed sale, so nothing can be returned from it.`;
    else if (!detail.lines.some((l) => l.qty > l.returned)) problem = `Everything on ${detail.code} has already been returned.`;
    else
      sale = {
        id: detail.id,
        code: detail.code,
        customerName: detail.customer?.name ?? null,
        owed: detail.owed,
        lines: detail.lines.map((l) => ({
          saleItemId: l.id,
          name: lineName(l.product_name, l.option_values),
          unitPrice: l.unit_price,
          sold: l.qty,
          left: l.qty - l.returned,
        })),
      };
  }

  return (
    <PageShell>
      <BackLink href={detail ? `/pos/sales/${detail.id}` : "/pos/returns"} label={detail ? detail.code : "Returns"} />
      <PageHeader eyebrow="Records" title="New return." />
      {sale || noReceipt ? (
        <>
          {!sale && (
            <p className="m-0 text-sm text-pos-soft">
              No receipt: refunds use today&apos;s price.{" "}
              <Link href="/pos/returns/new" className="font-bold">
                Find the sale instead
              </Link>
            </p>
          )}
          <ReturnForm key={sale?.id ?? "no-receipt"} sale={sale} />
        </>
      ) : (
        <Card label="Find the sale" className="flex max-w-[640px] flex-col gap-4 p-5">
          <h2 className="m-0 text-lg font-bold leading-6">Find the sale</h2>
          {problem && <Notice tone="bad">{problem}</Notice>}
          <FindSaleForm />
          <p className="m-0 border-t border-pos-paper-deep pt-4 text-sm text-pos-soft">
            Customer has no receipt?{" "}
            <Link href="/pos/returns/new?mode=no-receipt" className="font-bold">
              Return without a receipt
            </Link>
          </p>
        </Card>
      )}
    </PageShell>
  );
}
