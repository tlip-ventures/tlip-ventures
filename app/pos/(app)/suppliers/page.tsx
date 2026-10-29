import type { Metadata } from "next";
import { ComingSoon } from "@/components/pos/coming-soon";
import { requireOwner } from "@/lib/server/pos/auth";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  await requireOwner();
  return <ComingSoon eyebrow="Buy" title="Suppliers" body="Your suppliers and what you owe each of them will be listed here." />;
}
