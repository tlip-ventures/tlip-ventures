"use client";

import { useEffect, useState } from "react";
import type { CompletedSale } from "@/app/pos/(app)/sell/actions";
import { formatPesewas } from "@/lib/money";
import { basketTotals } from "@/lib/pos/basket";
import { useBasket, useBasketHydrated } from "@/lib/pos/basket-store";
import type { SellTile } from "@/lib/server/pos/sell";
import { BasketPanel } from "./basket-panel";
import { ProductPanel } from "./product-panel";
import { SaleDone } from "./sale-done";

/** The point of sale: products on the left, the basket on the right (below on phones). */
export function Register({
  tiles,
  total,
  categories,
  query,
  category,
  canGiveDiscounts,
}: {
  tiles: SellTile[];
  total: number;
  categories: { id: string; name: string }[];
  query: string;
  category: string | null;
  canGiveDiscounts: boolean;
}) {
  const [done, setDone] = useState<(CompletedSale & { method: string }) | null>(null);
  const hydrated = useBasketHydrated();
  const lines = useBasket((s) => s.lines);
  const discount = useBasket((s) => s.discount);
  const totals = basketTotals(hydrated ? lines : [], canGiveDiscounts ? discount : 0);

  // Move focus to "Sale saved." so screen readers announce it.
  useEffect(() => {
    if (done) document.getElementById("pos-done")?.focus();
  }, [done]);

  return (
    <main id="main" className="flex min-w-0 flex-[999_1_560px] flex-wrap items-stretch">
      <ProductPanel tiles={tiles} total={total} categories={categories} query={query} category={category} />

      <aside
        id="basket"
        aria-labelledby={done ? "pos-done" : "pos-basket"}
        className="flex min-w-0 max-w-full flex-[1_1_340px] scroll-mt-4 flex-col border-t border-pos-card-line bg-white pb-20 lg:border-l lg:border-t-0 lg:pb-0"
      >
        {done ? (
          <SaleDone sale={done} onNext={() => setDone(null)} />
        ) : (
          <BasketPanel canGiveDiscounts={canGiveDiscounts} onDone={setDone} />
        )}
      </aside>

      {/* Phones: the basket is below the products, so keep its total in reach. */}
      {!done && totals.items > 0 && (
        <a
          href="#basket"
          className="fixed inset-x-0 bottom-0 z-10 flex min-h-14 items-center justify-between gap-3 bg-pos-forest px-4 text-pos-on-forest no-underline shadow-[0_-8px_24px_rgba(17,17,17,0.12)] hover:text-pos-on-forest lg:hidden"
        >
          <span className="text-sm font-semibold">
            Basket · {totals.items} {totals.items === 1 ? "item" : "items"}
          </span>
          <span className="font-pos-display text-2xl leading-none">{formatPesewas(totals.total)}</span>
        </a>
      )}
    </main>
  );
}
