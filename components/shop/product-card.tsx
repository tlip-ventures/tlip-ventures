import Link from "next/link";
import { getNewestProductIds, type ProductCardData } from "@/lib/server/catalogue";
import { CardAddButton } from "./card-add-button";
import { DiscountBadge, Price } from "./price";
import { ProductImage } from "./product-image";

// Grid: 2 columns on phones, 3 from 640px, 4 from 1024px (max-w-6xl container).
const CARD_IMAGE_SIZES = "(min-width: 1152px) 270px, (min-width: 1024px) 23vw, (min-width: 640px) 31vw, 47vw";

type CardProps = {
  product: ProductCardData;
  /** One of the shop's most recently added products: gets a "New" badge. */
  isNew?: boolean;
  sizes?: string;
};

/**
 * Marketplace product card: square photo (or "Photo coming soon"), a discount,
 * "New" or "Out of stock" badge, the name on up to two lines, the price with
 * any old price under it, and an add button: a round "+" on phones, a full
 * button on hover or focus from 768px.
 */
export function ProductCard({ product, isNew = false, sizes = CARD_IMAGE_SIZES }: CardProps) {
  const { pricing } = product;
  const href = `/products/${product.slug}`;
  const cartProduct = { productId: product.id, slug: product.slug, productName: product.name, image: product.image };

  let badge = null;
  if (!pricing.inStock) {
    badge = <span className="rounded-md bg-ink px-1.5 py-0.5 text-xs font-semibold leading-4 text-white md:px-2 md:leading-[18px]">Out of stock</span>;
  } else if (pricing.compareAt !== null) {
    badge = <DiscountBadge pricing={pricing} />;
  } else if (isNew) {
    badge = (
      <span className="rounded-md bg-tint-green px-1.5 py-0.5 text-[11px] font-bold leading-4 text-brand-green md:px-2 md:text-xs md:leading-[18px]">
        New
      </span>
    );
  }

  return (
    <article className="group/card relative flex h-full flex-col rounded-[10px] bg-white md:p-2 md:pb-3 md:transition-shadow md:hover:shadow-[0_8px_24px_rgba(17,17,17,0.08)]">
      <div className="relative">
        {/* The name below is the link for keyboards and screen readers; the photo is a second, larger tap target. */}
        <Link href={href} tabIndex={-1} aria-hidden="true" className="block">
          <ProductImage image={product.image} sizes={sizes} />
        </Link>
        {badge && <div className="absolute left-1.5 top-1.5 md:left-2 md:top-2">{badge}</div>}
      </div>
      <div className="flex flex-1 flex-col gap-1 pt-2 md:px-1 md:pt-2.5">
        <h3 className="font-sans text-[13px] font-normal leading-[18px] md:text-sm md:leading-5">
          <Link href={href} className="line-clamp-2 min-h-9 text-ink no-underline hover:text-ink hover:underline md:min-h-10">
            {product.name}
          </Link>
        </h3>
        <div className="mt-auto flex items-center justify-between gap-1.5">
          <Price pricing={pricing} />
          <CardAddButton action={product.addAction} product={cartProduct} look="round" />
        </div>
      </div>
      <CardAddButton action={product.addAction} product={cartProduct} look="full" />
    </article>
  );
}

type GridProps = {
  products: ProductCardData[];
  sizes?: string;
};

export async function ProductGrid({ products, sizes }: GridProps) {
  const newest = await getNewestProductIds();
  return (
    <ul className="grid grid-cols-2 gap-x-2.5 gap-y-4 sm:grid-cols-3 md:gap-3 lg:grid-cols-4">
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} isNew={newest.has(product.id)} sizes={sizes} />
        </li>
      ))}
    </ul>
  );
}
