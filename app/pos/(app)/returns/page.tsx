import type { Metadata } from "next";
import { ComingSoon } from "@/components/pos/coming-soon";

export const metadata: Metadata = { title: "Returns" };

export default function ReturnsPage() {
  return (
    <ComingSoon
      eyebrow="Records"
      title="Returns"
      body="When a customer brings something back, you'll record it here so the item goes back on the shelf count and any refund is tracked."
    />
  );
}
