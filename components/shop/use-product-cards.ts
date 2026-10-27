"use client";

import { useEffect, useMemo, useState } from "react";
import type { SavedProductCard } from "@/lib/server/catalogue";

type Loaded = { requested: Set<string>; products: Map<string, SavedProductCard> };

/**
 * Product cards for saved ids (wishlist, recently viewed), fresh from
 * /api/products, in the order of `ids`. Removing ids needs no new request;
 * only ids not loaded yet are fetched. Hidden or deleted products drop out.
 */
export function useProductCards(ids: readonly string[]): {
  products: SavedProductCard[];
  /** True until the first answer for the current ids arrives. */
  loading: boolean;
  failed: boolean;
} {
  const [loaded, setLoaded] = useState<Loaded>({ requested: new Set(), products: new Map() });
  const [failed, setFailed] = useState(false);
  const missing = ids.filter((id) => !loaded.requested.has(id));
  const missingKey = missing.join(",");

  useEffect(() => {
    if (!missingKey) return;
    const controller = new AbortController();
    fetch(`/api/products?ids=${missingKey}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ products: SavedProductCard[] }>;
      })
      .then(({ products }) => {
        setFailed(false);
        setLoaded((prev) => {
          const next = new Map(prev.products);
          for (const product of products) next.set(product.id, product);
          return { requested: new Set([...prev.requested, ...missingKey.split(",")]), products: next };
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error("Could not load saved products", error);
          setFailed(true);
        }
      });
    return () => controller.abort();
  }, [missingKey]);

  const products = useMemo(
    () => ids.flatMap((id) => (loaded.products.has(id) ? [loaded.products.get(id)!] : [])),
    [ids, loaded],
  );
  return { products, loading: missing.length > 0 && !failed, failed };
}
