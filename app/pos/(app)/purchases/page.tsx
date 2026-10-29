import type { Metadata } from "next";
import { ComingSoon } from "@/components/pos/coming-soon";
import { requireOwner } from "@/lib/server/pos/auth";

export const metadata: Metadata = { title: "Purchases" };

export default async function PurchasesPage() {
  await requireOwner();
  return (
    <ComingSoon
      eyebrow="Records"
      title="Purchases"
      body="Deliveries from suppliers, what you paid and what you still owe them will be recorded here. Receiving a delivery adds it to the shelf count."
    />
  );
}
