"use client";

import Link from "next/link";
import { useWishlistHydrated, useWishlistIds } from "@/lib/saved-store";
import { PRODUCT_GRID_CLASS, ProductCard } from "./product-card";
import { useProductCards } from "./use-product-cards";

/** The products saved with the heart button, with Add to cart on each. */
export function WishlistView() {
  const hydrated = useWishlistHydrated();
  const ids = useWishlistIds();
  const { products, loading, failed } = useProductCards(ids);

  if (!hydrated || (loading && products.length === 0)) {
    return <p className="text-neutral-700">Loading your saved products…</p>;
  }

  if (ids.length === 0) {
    return (
      <div className="rounded-lg bg-neutral-50 px-4 py-10 text-center">
        <p className="font-semibold">Nothing saved yet.</p>
        <p className="mt-2">Tap the heart on any product to keep it here for later.</p>
        <p className="mt-2">
          <Link href="/products" className="inline-flex min-h-11 items-center">
            Browse all products
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-700">
        {products.length} {products.length === 1 ? "product" : "products"} saved on this phone or computer.
      </p>
      {failed && (
        <p role="alert" className="rounded-lg bg-brand-gold/15 px-4 py-3 text-sm">
          We couldn’t load some of your saved products. Check your connection and try again.
        </p>
      )}
      {!failed && products.length === 0 && (
        <p className="rounded-lg bg-neutral-50 px-4 py-10 text-center">
          The products you saved are no longer in the shop.{" "}
          <Link href="/products">Browse all products</Link>.
        </p>
      )}
      <ul className={PRODUCT_GRID_CLASS}>
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} isNew={product.isNew} />
          </li>
        ))}
      </ul>
    </div>
  );
}
