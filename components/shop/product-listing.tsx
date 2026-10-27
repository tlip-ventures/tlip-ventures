import type { ReactNode } from "react";
import type { ListingParams } from "@/lib/listing";
import type { ProductPage } from "@/lib/server/catalogue";
import { Pagination, PriceLinks, SortLinks } from "./listing-controls";
import { ProductGrid } from "./product-grid";

type Props = {
  basePath: string;
  params: ListingParams;
  result: ProductPage;
  /** Shown instead of the grid when there are no products. */
  empty: ReactNode;
};

/** Product count, sort and price links, a page of products and page links. */
export function ProductListing({ basePath, params, result, empty }: Props) {
  const filtered = params.min !== null || params.max !== null;
  if (result.total === 0 && !filtered) {
    return <div className="rounded-lg bg-neutral-50 px-4 py-10 text-center">{empty}</div>;
  }
  return (
    <section aria-labelledby="products-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="products-heading" className="font-sans text-sm font-normal text-neutral-700">
          {result.total} {result.total === 1 ? "product" : "products"}
        </h2>
        <SortLinks basePath={basePath} params={params} />
      </div>
      <PriceLinks basePath={basePath} params={params} />
      {result.total === 0 && (
        <p className="rounded-lg bg-neutral-50 px-4 py-10 text-center font-semibold">
          Nothing in this price range yet. Try another price.
        </p>
      )}
      <ProductGrid products={result.products} />
      <Pagination basePath={basePath} params={params} total={result.total} />
    </section>
  );
}
