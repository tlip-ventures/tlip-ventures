import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/shop/listing-controls";
import { ProductListing } from "@/components/shop/product-listing";
import { parseListingParams } from "@/lib/listing";
import { listProducts } from "@/lib/server/catalogue";
import { listingPath, pageMetadata } from "@/lib/seo";

export async function generateMetadata({ searchParams }: PageProps<"/deals">): Promise<Metadata> {
  const { page } = parseListingParams(await searchParams);
  return pageMetadata({
    title: page > 1 ? `Deals, page ${page}` : "Deals",
    description: "Home and kitchen goods we have marked down at Tlip Ventures in Ghana. Order on WhatsApp.",
    path: listingPath("/deals", page),
  });
}

/** Products with a "was" price, the ones the owner has marked down. */
export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  const params = parseListingParams(await searchParams);
  const result = await listProducts({ deals: true, sort: params.sort, page: params.page });
  if (!result) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-16 pt-4">
      <Breadcrumbs
        trail={[
          { name: "Home", href: "/" },
          { name: "Deals", href: "/deals" },
        ]}
      />
      <h1 className="text-3xl font-bold text-brand-green">Deals</h1>
      <ProductListing
        basePath="/deals"
        params={params}
        result={result}
        empty={
          <>
            <p className="font-semibold">No deals right now. When we mark prices down, you’ll find them here.</p>
            <p className="mt-2">
              <Link href="/products" className="inline-flex min-h-11 items-center">
                Browse all products
              </Link>
            </p>
          </>
        }
      />
    </div>
  );
}
