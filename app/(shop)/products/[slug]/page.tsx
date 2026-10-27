import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs, type Crumb } from "@/components/shop/listing-controls";
import { DiscountBadge, Price } from "@/components/shop/price";
import { ProductGrid } from "@/components/shop/product-grid";
import { AddToCart } from "@/components/shop/add-to-cart";
import { ProductImage } from "@/components/shop/product-image";
import { RecordView } from "@/components/shop/record-view";
import { WishlistButton } from "@/components/shop/wishlist-button";
import { categoryPath } from "@/lib/categories";
import { slugSchema } from "@/lib/listing";
import { optionLabel, variantPrice } from "@/lib/product";
import { JsonLd } from "@/components/ui/json-ld";
import { cloudinaryShareImage } from "@/lib/cloudinary-share";
import { getCategories, getProductBySlug, listProducts } from "@/lib/server/catalogue";
import { metaDescription, pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/structured-data";

const MAIN_IMAGE_SIZES = "(min-width: 1152px) 560px, (min-width: 768px) 48vw, 100vw";
const EXTRA_IMAGE_SIZES = "(min-width: 1152px) 270px, (min-width: 768px) 23vw, 50vw";

async function findProduct(params: PageProps<"/products/[slug]">["params"]) {
  const slug = slugSchema.safeParse((await params).slug);
  return slug.success ? getProductBySlug(slug.data) : null;
}

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const product = await findProduct(params);
  if (!product) return {};
  const photo = product.images[0];
  const shareImage = photo ? cloudinaryShareImage(photo.url) : null;
  return pageMetadata({
    title: product.brand ? `${product.name} by ${product.brand}` : product.name,
    description: metaDescription(product.description, `${product.name} at Tlip Ventures in Ghana. Order on WhatsApp.`),
    path: `/products/${product.slug}`,
    image: shareImage ? { url: shareImage, width: 1200, height: 630, alt: photo.alt } : null,
  });
}

/** Absolute image URL for structured data. */
const imageUrl = (url: string) => (url.startsWith("/") ? absoluteUrl(url) : url);

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const product = await findProduct(params);
  if (!product) notFound();

  const categories = await getCategories();
  const productCategories = categories.filter((c) => product.categoryIds.includes(c.id));
  // Breadcrumbs follow the product's first subcategory (or category).
  const primary = productCategories.find((c) => c.parent_id !== null) ?? productCategories[0];
  const trail: Crumb[] = [
    { name: "Home", href: "/" },
    ...(primary ? categoryPath(categories, primary).map((c) => ({ name: c.name, href: `/categories/${c.slug}` })) : []),
    { name: product.name, href: `/products/${product.slug}` },
  ];

  const related =
    product.categoryIds.length > 0
      ? await listProducts({ categoryIds: product.categoryIds, excludeId: product.id, pageSize: 4 })
      : null;

  const [mainImage, ...moreImages] = product.images;
  const { pricing } = product;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 pb-16 pt-4">
      <JsonLd
        data={[
          productJsonLd({
            name: product.name,
            description: product.description,
            brand: product.brand,
            url: absoluteUrl(`/products/${product.slug}`),
            images: product.images.map((img) => imageUrl(img.url)),
            variants: product.variants.map((v) => ({ sku: v.sku, price: variantPrice(product, v), inStock: v.in_stock })),
          }),
          breadcrumbJsonLd(trail.map((c) => ({ name: c.name, url: absoluteUrl(c.href) }))),
        ]}
      />
      <div className="space-y-4">
        <Breadcrumbs trail={trail} />

        <div className="grid gap-6 md:grid-cols-2 md:gap-10">
          <div className="space-y-3">
            <ProductImage image={mainImage ?? null} sizes={MAIN_IMAGE_SIZES} eager />
            {moreImages.length > 0 && (
              <ul className="grid grid-cols-2 gap-3" aria-label="More photos">
                {moreImages.map((image) => (
                  <li key={image.url}>
                    <ProductImage image={image} sizes={EXTRA_IMAGE_SIZES} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              {product.brand && (
                <p className="text-sm font-medium uppercase tracking-wide text-neutral-600">{product.brand}</p>
              )}
              <h1 className="text-2xl font-bold text-brand-green sm:text-3xl">{product.name}</h1>
              <div className="flex flex-wrap items-center gap-3">
                <Price pricing={pricing} size="lg" />
                {pricing.inStock && <DiscountBadge pricing={pricing} size="lg" />}
              </div>
              <p className={`font-semibold ${pricing.inStock ? "text-brand-green" : "text-neutral-700"}`}>
                {pricing.inStock ? "In stock" : "Out of stock"}
              </p>
            </div>

            <AddToCart
              product={{
                productId: product.id,
                slug: product.slug,
                productName: product.name,
                image: mainImage ?? null,
              }}
              optionHeading={[product.option1_name, product.option2_name].filter(Boolean).join(" / ") || null}
              variants={product.variants.map((v) => ({
                id: v.id,
                label: optionLabel(v),
                price: variantPrice(product, v),
                inStock: v.in_stock,
              }))}
            />
            <WishlistButton productId={product.id} productName={product.name} look="page" />
            <RecordView productId={product.id} />

            {product.description && (
              <section aria-labelledby="description-heading" className="space-y-2">
                <h2 id="description-heading" className="text-lg font-bold text-brand-green">
                  Description
                </h2>
                <p className="whitespace-pre-line leading-relaxed">{product.description}</p>
              </section>
            )}

            {productCategories.length > 0 && (
              <p className="text-sm">
                <span className="text-neutral-700">Find more in: </span>
                {productCategories.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && ", "}
                    <Link href={`/categories/${c.slug}`} className="inline-flex min-h-11 items-center">
                      {c.name}
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
      </div>

      {related && related.products.length > 0 && (
        <section aria-labelledby="related-heading" className="space-y-4">
          <h2 id="related-heading" className="text-2xl font-bold text-brand-green">
            You may also like
          </h2>
          <ProductGrid products={related.products} />
        </section>
      )}
    </div>
  );
}
