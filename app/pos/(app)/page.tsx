import type { Metadata } from "next";
import { ComingSoon } from "@/components/pos/coming-soon";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <ComingSoon
      eyebrow="Overview"
      title="Here is the shop."
      body="Sales, profit, money owed and what to restock will show here once selling is set up. For now, check products and stock or start a stock count."
    />
  );
}
