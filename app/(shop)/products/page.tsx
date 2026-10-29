import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/shop/listing-controls";
import { ProductListing } from "@/components/shop/product-listing";
import { parseListingParams, priceFilter } from "@/lib/listing";
import { listProducts } from "@/lib/server/catalogue";
import { listingPath, pageMetadata } from "@/lib/seo";

export async function generateMetadata({ searchParams }: PageProps<"/products">): Promise<Metadata> {
  const { page } = parseListingParams(await searchParams);
  return pageMetadata({
    title: page > 1 ? `All products, page ${page}` : "All products",
    description: "Browse every home and kitchen product at Tlip Ventures, from blenders and kettles to storage and laundry.",
    path: listingPath("/products", page),
  });
}

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const params = parseListingParams(await searchParams);
  const result = await listProducts({ ...priceFilter(params), sort: params.sort, page: params.page });
  if (!result) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-16 pt-4">
      <Breadcrumbs
        trail={[
          { name: "Home", href: "/" },
          { name: "All products", href: "/products" },
        ]}
      />
      <h1 className="text-3xl font-bold text-brand-green">All products</h1>
      <ProductListing
        basePath="/products"
        params={params}
        result={result}
        empty={<p>No products yet. Please check back soon.</p>}
      />
    </div>
  );
}
