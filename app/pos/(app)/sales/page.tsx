import type { Metadata } from "next";
import { ComingSoon } from "@/components/pos/coming-soon";

export const metadata: Metadata = { title: "Sales" };

export default function SalesPage() {
  return <ComingSoon eyebrow="Records" title="Sales" body="Every sale, what was paid and what customers still owe will be listed here." />;
}
