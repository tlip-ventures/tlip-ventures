import type { Metadata } from "next";
import { ComingSoon } from "@/components/pos/coming-soon";

export const metadata: Metadata = { title: "Point of sale" };

export default function SellPage() {
  return <ComingSoon eyebrow="Point of sale" title="Ring up a sale." body="Selling from this screen is the next part to be set up." />;
}
