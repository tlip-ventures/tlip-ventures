import type { Metadata } from "next";
import { ComingSoon } from "@/components/pos/coming-soon";
import { requireOwner } from "@/lib/server/pos/auth";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireOwner();
  return <ComingSoon eyebrow="People" title="Reports" body="Sales and profit by product and by month will show here." />;
}
