import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductListing } from "@/components/shop/product-listing";
import { SearchForm } from "@/components/shop/search-form";
import { parseListingParams, priceFilter } from "@/lib/listing";
import { toPrefixTsQuery } from "@/lib/search";
import { listProducts } from "@/lib/server/catalogue";

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const { q } = parseListingParams(await searchParams);
  return {
    title: q ? `Search: ${q}` : "Search",
    // Search result pages are thin duplicates of category pages.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = parseListingParams(await searchParams);
  const tsquery = toPrefixTsQuery(params.q);
  const result = tsquery ? await listProducts({ search: tsquery, ...priceFilter(params), sort: params.sort, page: params.page }) : null;
  if (tsquery && !result) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-16 pt-6">
      <h1 className="text-3xl font-bold text-brand-green">{params.q ? `Results for “${params.q}”` : "Search"}</h1>
      <div className="max-w-xl">
        <SearchForm id="page-search" defaultValue={params.q} />
      </div>
      {result ? (
        <ProductListing
          basePath="/search"
          params={params}
          result={result}
          empty={
            <>
              <p className="font-semibold">No products match “{params.q}”.</p>
              <p className="mt-2">
                Try a shorter word, or{" "}
                <Link href="/categories" className="inline-flex min-h-11 items-center">
                  browse by category
                </Link>
                .
              </p>
            </>
          }
        />
      ) : (
        <p>Type what you are looking for, for example “blender” or “storage stool”.</p>
      )}
    </div>
  );
}
