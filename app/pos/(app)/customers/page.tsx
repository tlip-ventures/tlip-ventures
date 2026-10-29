import type { Metadata } from "next";
import { ComingSoon } from "@/components/pos/coming-soon";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return <ComingSoon eyebrow="People" title="Customers" body="Customers, what they bought and what they still owe will be listed here." />;
}
