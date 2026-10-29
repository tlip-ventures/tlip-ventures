import type { Metadata } from "next";
import { z } from "zod";
import { BackLink } from "@/components/pos/detail";
import { PurchaseForm } from "@/components/pos/purchase-form";
import { PageHeader, PageShell } from "@/components/pos/ui";
import { requireOwner } from "@/lib/server/pos/auth";
import { getPurchaseProduct } from "@/lib/server/pos/records";

export const metadata: Metadata = { title: "New purchase" };

export default async function NewPurchasePage({ searchParams }: PageProps<"/pos/purchases/new">) {
  await requireOwner();
  const { variant } = await searchParams;
  const id = z.uuid().safeParse(Array.isArray(variant) ? variant[0] : variant);
  // Reorder on the stock list opens this with the product already added.
  const start = id.success ? await getPurchaseProduct(id.data) : null;

  return (
    <PageShell>
      <BackLink href="/pos/purchases" label="Purchases" />
      <PageHeader eyebrow="Buy" title="New purchase." />
      <PurchaseForm start={start} />
    </PageShell>
  );
}
