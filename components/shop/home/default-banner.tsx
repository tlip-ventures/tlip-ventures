import Image from "next/image";
import Link from "next/link";
import { formatPesewas } from "@/lib/money";
import type { ProductCardData } from "@/lib/server/catalogue";

const priceText = (p: ProductCardData) =>
  p.pricing.min === p.pricing.max ? formatPesewas(p.pricing.min) : `From ${formatPesewas(p.pricing.min)}`;

// Phones: one tile in the right half. From 768px: one large tile and two small ones.
const TILE_SIZES = "(min-width: 1280px) 200px, (min-width: 768px) 25vw, 40vw";

/** A featured product on the green panel: photo, name and price, linking to the product. */
function ProductTile({ product, first }: { product: ProductCardData; first: boolean }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      aria-label={`${product.name}, ${priceText(product)}`}
      className="flex h-full flex-col overflow-hidden rounded-lg bg-white text-ink no-underline shadow-lg hover:text-ink hover:ring-3 hover:ring-brand-gold"
    >
      <span className="relative min-h-0 flex-1 bg-well">
        <Image
          src={product.image!.url}
          alt=""
          fill
          sizes={TILE_SIZES}
          loading={first ? "eager" : "lazy"}
          fetchPriority={first ? "high" : undefined}
          // Multiply blends a photo's white background into the grey well.
          className="object-contain p-1.5 mix-blend-multiply md:p-2"
        />
      </span>
      <span className="space-y-0.5 px-2 pb-1.5 pt-1 md:px-2.5 md:pb-2">
        <span className="block truncate text-[11px] leading-4 md:text-xs">{product.name}</span>
        <span className="block text-xs font-bold leading-4 tabular-nums md:text-sm md:leading-5">{priceText(product)}</span>
      </span>
    </Link>
  );
}

/**
 * The home page's first slide when no promotional banner is switched on: the welcome
 * line on the left and, on the right, up to three of the products ticked
 * "Featured on the home page" in admin (one on phones). With no featured
 * products that have a photo, the shop's round logo shows instead.
 */
export function DefaultBanner({ featured }: { featured: ProductCardData[] }) {
  const tiles = featured.filter((p) => p.image !== null).slice(0, 3);

  return (
    <section
      aria-label="Welcome"
      className={`relative grid h-full w-full overflow-hidden bg-brand-green text-white ${
        tiles.length > 0 ? "grid-cols-[1.1fr_0.9fr] md:grid-cols-2" : "grid-cols-[1.2fr_0.8fr]"
      }`}
    >
      <div className="flex flex-col justify-center gap-2 py-4 pl-4 pr-1 sm:gap-3 md:gap-4 md:py-9 md:pl-10">
        <p className="text-[10px] font-bold uppercase leading-3 tracking-[0.14em] text-white/90 sm:text-xs sm:leading-4">
          Order on WhatsApp
        </p>
        <p className="font-display text-[23px] leading-[0.98] tracking-[-0.01em] sm:text-4xl md:text-[46px] md:tracking-[-0.02em]">
          Quality home and kitchen goods <em>in Ghana.</em>
        </p>
        <Link
          href="/products"
          className="inline-flex min-h-9 items-center self-start rounded-lg bg-white px-3.5 text-[13px] font-bold text-brand-green no-underline hover:bg-tint-green hover:text-brand-green-dark md:min-h-11 md:px-5 md:text-sm"
        >
          Shop now
        </Link>
      </div>

      <div className="relative">
        {/* A darker circle behind, cut off at the right like a shop sign. */}
        <div aria-hidden="true" className="absolute left-[8%] top-1/2 aspect-square w-[118%] -translate-y-1/2 rounded-full bg-brand-green-dark" />
        {tiles.length > 0 ? (
          <ul
            aria-label="Featured products"
            className={`absolute inset-0 grid gap-2.5 py-3 pl-1 pr-3 md:p-5 lg:p-6 ${
              tiles.length === 3
                ? "md:grid-cols-[1.35fr_1fr] md:grid-rows-2"
                : tiles.length === 2
                  ? "md:grid-cols-2"
                  : ""
            }`}
          >
            {tiles.map((product, i) => (
              // Phones show the first product only.
              <li key={product.id} className={`min-h-0 min-w-0 ${i > 0 ? "hidden md:block" : ""} ${i === 0 && tiles.length === 3 ? "md:row-span-2" : ""}`}>
                <ProductTile product={product} first={i === 0} />
              </li>
            ))}
          </ul>
        ) : (
          <div aria-hidden="true" className="absolute left-[20%] top-1/2 aspect-square w-[70%] -translate-y-1/2 rounded-full bg-white p-[4%] shadow-lg">
            <Image src="/brand/logo.png" alt="" width={512} height={512} unoptimized preload className="h-full w-full" />
          </div>
        )}
      </div>
    </section>
  );
}
