import type { Metadata } from "next";
import Form from "next/form";
import Image from "next/image";
import Link from "next/link";
import { z } from "zod";
import { formatPesewas } from "@/lib/money";
import { pageCount } from "@/lib/pagination";
import { ADMIN_PRODUCTS_PAGE_SIZE, listAdminProducts, PRODUCT_FILTERS, type ProductFilter } from "@/lib/server/admin-products";
import { setVariantStock } from "./actions";

export const metadata: Metadata = { title: "Products" };

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const paramsSchema = z.object({
  filter: z.preprocess(first, z.enum(PRODUCT_FILTERS)).catch("all"),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(10_000)).catch(1),
  q: z.preprocess(first, z.string().trim().max(100)).catch(""),
});

const FILTER_LABELS: Record<ProductFilter, string> = {
  all: "All",
  active: "In the shop",
  hidden: "Hidden",
  "out-of-stock": "Has out of stock",
};

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const params = paramsSchema.parse(await searchParams);
  const { products, total } = await listAdminProducts({ search: params.q, filter: params.filter, page: params.page });
  const pages = pageCount(total, ADMIN_PRODUCTS_PAGE_SIZE);

  const href = (changes: Partial<typeof params>) => {
    const next = { ...params, ...changes };
    const query = new URLSearchParams();
    if (next.filter !== "all") query.set("filter", next.filter);
    if (next.q) query.set("q", next.q);
    if (next.page > 1) query.set("page", String(next.page));
    const s = query.toString();
    return `/admin/products${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-brand-green">Products</h1>
        <Link
          href="/admin/products/new"
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-orange-dark px-5 text-base font-bold text-white no-underline hover:bg-brand-orange-deep"
        >
          Add product
        </Link>
      </div>

      <Form action="/admin/products" className="flex max-w-md gap-2">
        {params.filter !== "all" && <input type="hidden" name="filter" value={params.filter} />}
        <label htmlFor="product-search" className="sr-only">
          Search products
        </label>
        <input
          id="product-search"
          name="q"
          type="search"
          defaultValue={params.q}
          placeholder="Product name"
          className="min-h-11 w-full rounded-lg border border-neutral-400 px-3 text-base"
        />
        <button type="submit" className="min-h-11 rounded-lg bg-brand-green px-4 font-semibold text-white">
          Search
        </button>
      </Form>

      <nav aria-label="Filter products" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2 whitespace-nowrap">
          {PRODUCT_FILTERS.map((filter) => (
            <li key={filter}>
              <Link
                href={href({ filter, page: 1 })}
                aria-current={params.filter === filter ? "true" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold no-underline ${
                  params.filter === filter
                    ? "border-brand-green bg-brand-green text-white"
                    : "border-neutral-300 text-ink hover:border-brand-green"
                }`}
              >
                {FILTER_LABELS[filter]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="text-sm text-neutral-700">
        {total} {total === 1 ? "product" : "products"}. Tap an option to switch it between in stock and out of stock.
      </p>

      {products.length === 0 ? (
        <p className="rounded-lg bg-neutral-50 px-4 py-8 text-center">No products found.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {products.map((product) => (
            <li key={product.id} className="flex gap-3 p-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded bg-neutral-100">
                {product.image && <Image src={product.image} alt="" fill sizes="56px" className="object-contain" />}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link href={`/admin/products/${product.id}`} className="font-semibold">
                    {product.name}
                  </Link>
                  <span className="text-sm">{formatPesewas(product.price)}</span>
                  {!product.isActive && (
                    <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-semibold text-neutral-800">Hidden</span>
                  )}
                  {product.isFeatured && (
                    <span className="rounded-full bg-brand-gold/25 px-2 py-0.5 text-xs font-semibold text-ink">Featured</span>
                  )}
                </div>
                <ul className="flex flex-wrap gap-2" aria-label={`Stock for ${product.name}`}>
                  {product.variants.map((variant) => (
                    <li key={variant.id}>
                      <form action={setVariantStock}>
                        <input type="hidden" name="variantId" value={variant.id} />
                        <input type="hidden" name="inStock" value={String(!variant.inStock)} />
                        <button
                          type="submit"
                          aria-label={`${variant.label ?? "Stock"}: ${variant.inStock ? "in stock" : "out of stock"}. Mark as ${variant.inStock ? "out of stock" : "in stock"}.`}
                          className={`inline-flex min-h-11 items-center gap-1 rounded-lg border px-3 text-sm font-semibold ${
                            variant.inStock
                              ? "border-brand-green bg-brand-green/10 text-brand-green"
                              : "border-dashed border-neutral-400 text-neutral-700"
                          }`}
                        >
                          {variant.label && <span>{variant.label}:</span>}
                          <span>{variant.inStock ? "In stock" : "Out of stock"}</span>
                          {variant.stockQty !== null && <span className="font-normal">({variant.stockQty})</span>}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between pt-4">
          {params.page > 1 ? (
            <Link href={href({ page: params.page - 1 })} className="inline-flex min-h-11 items-center font-semibold">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm">
            Page {params.page} of {pages}
          </span>
          {params.page < pages ? (
            <Link href={href({ page: params.page + 1 })} className="inline-flex min-h-11 items-center font-semibold">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
