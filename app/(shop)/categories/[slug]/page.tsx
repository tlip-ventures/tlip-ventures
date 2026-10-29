import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/shop/listing-controls";
import { ProductListing } from "@/components/shop/product-listing";
import { categoryAndChildIds, categoryPath } from "@/lib/categories";
import { parseListingParams, priceFilter, slugSchema } from "@/lib/listing";
import { getCategories, getCategoryBySlug, listProducts } from "@/lib/server/catalogue";
import { listingPath, pageMetadata } from "@/lib/seo";

async function findCategory(params: PageProps<"/categories/[slug]">["params"]) {
  const slug = slugSchema.safeParse((await params).slug);
  return slug.success ? getCategoryBySlug(slug.data) : null;
}

export async function generateMetadata({ params, searchParams }: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const category = await findCategory(params);
  if (!category) return {};
  const { page } = parseListingParams(await searchParams);
  return pageMetadata({
    title: page > 1 ? `${category.name}, page ${page}` : category.name,
    description: `Shop ${category.name.toLowerCase()} at Tlip Ventures in Ghana. Browse prices online and order on WhatsApp.`,
    path: listingPath(`/categories/${category.slug}`, page),
  });
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/categories/[slug]">) {
  const category = await findCategory(params);
  if (!category) notFound();

  const categories = await getCategories();
  const listing = parseListingParams(await searchParams);
  const result = await listProducts({
    categoryIds: categoryAndChildIds(categories, category),
    ...priceFilter(listing),
    sort: listing.sort,
    page: listing.page,
  });
  if (!result) notFound();

  const path = categoryPath(categories, category);
  const children = categories.filter((c) => c.parent_id === category.id);
  const basePath = `/categories/${category.slug}`;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-16 pt-4">
      <Breadcrumbs
        trail={[{ name: "Home", href: "/" }, ...path.map((c) => ({ name: c.name, href: `/categories/${c.slug}` }))]}
      />
      <h1 className="text-3xl font-bold text-brand-green">{category.name}</h1>

      {children.length > 0 && (
        <nav aria-label={`${category.name} subcategories`} className="-mx-4 overflow-x-auto px-4">
          <ul className="flex gap-2 whitespace-nowrap sm:flex-wrap">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/categories/${child.slug}`}
                  className="inline-flex min-h-11 items-center rounded-lg bg-brand-green/10 px-4 text-sm font-semibold text-brand-green no-underline hover:bg-brand-green hover:text-white"
                >
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <ProductListing
        basePath={basePath}
        params={listing}
        result={result}
        empty={
          <>
            <p className="font-semibold">New products for this category are coming soon.</p>
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
