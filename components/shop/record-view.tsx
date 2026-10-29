"use client";

import { useEffect } from "react";
import { useRecentlyViewed } from "@/lib/saved-store";

/** Adds the product to "Recently viewed" on this device. Renders nothing. */
export function RecordView({ productId }: { productId: string }) {
  const record = useRecentlyViewed((s) => s.record);
  useEffect(() => {
    record(productId);
  }, [productId, record]);
  return null;
}
