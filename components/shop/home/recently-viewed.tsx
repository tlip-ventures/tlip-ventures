"use client";

import Link from "next/link";
import { formatPesewas } from "@/lib/money";
import { useRecentIds, useRecentlyViewed } from "@/lib/saved-store";
import { ProductImage } from "../product-image";
import { useProductCards } from "../use-product-cards";

/**
 * "Recently viewed" on the home page: the last products opened on this device.
 * Shown only when there is something to show.
 */
export function RecentlyViewed() {
  const ids = useRecentIds();
  const clear = useRecentlyViewed((s) => s.clear);
  const { products } = useProductCards(ids);
  if (ids.length === 0 || products.length === 0) return null;

  return (
    <section id="recently-viewed" aria-labelledby="recently-viewed-heading" className="scroll-mt-4 bg-white md:rounded-xl md:px-5 md:pb-5 md:pt-4">
      <div className="flex items-center justify-between gap-4 px-3 py-2.5 md:px-0 md:py-0 md:pb-3.5">
        <h2 id="recently-viewed-heading" className="text-[17px] font-bold leading-6 text-ink md:text-xl md:leading-7">
          Recently viewed
        </h2>
        <button
          type="button"
          onClick={clear}
          className="inline-flex min-h-11 cursor-pointer items-center text-[13px] font-bold text-brand-green hover:underline md:text-sm"
        >
          Clear<span className="sr-only"> recently viewed</span>
        </button>
      </div>
      <ul className="flex gap-2.5 overflow-x-auto px-3 pb-3.5 [scrollbar-width:none] md:grid md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] md:gap-3 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
        {products.map((product) => (
          <li key={product.id} className="w-[104px] shrink-0 md:w-auto">
            <Link href={`/products/${product.slug}`} className="flex flex-col gap-1 text-ink no-underline hover:text-ink hover:underline">
              <ProductImage image={product.image} sizes="(min-width: 768px) 170px, 104px" />
              <span className="line-clamp-2 pt-0.5 text-xs leading-4 md:text-[13px] md:leading-[18px]">{product.name}</span>
              <span className="text-[13px] font-bold leading-[18px] tabular-nums md:text-sm md:leading-5">
                {product.pricing.min === product.pricing.max
                  ? formatPesewas(product.pricing.min)
                  : `From ${formatPesewas(product.pricing.min)}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
