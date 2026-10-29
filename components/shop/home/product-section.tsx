import Link from "next/link";
import { ChevronRightIcon } from "@/components/ui/icons";
import { getNewestProductIds, type ProductCardData } from "@/lib/server/catalogue";
import { ProductCard } from "../product-card";

type Props = {
  /** Anchor for links like /#deals, and the heading id. */
  id: string;
  title: string;
  subtitle?: string;
  seeAllHref: string;
  products: ProductCardData[];
  /** Phones: "rail" swipes sideways; "grid" is two columns showing the first six. */
  phoneLayout: "rail" | "grid";
  /** "deals": the orange header bar. */
  tone?: "deals" | "plain";
};

// Computers: cards about 176–200px wide. Phones: 140px in a rail, half the screen in the grid.
const RAIL_SIZES = "(min-width: 768px) 200px, 140px";
const GRID_SIZES = "(min-width: 768px) 200px, 47vw";

/** A titled row of product cards on the home page, with "See all". */
export async function ProductSection({ id, title, subtitle, seeAllHref, products, phoneLayout, tone = "plain" }: Props) {
  if (products.length === 0) return null;
  const newest = await getNewestProductIds();
  const deals = tone === "deals";
  const rail = phoneLayout === "rail";

  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-4 overflow-hidden bg-white md:rounded-xl">
      <div
        className={`flex items-center justify-between gap-4 px-3 py-2.5 md:px-5 md:py-3.5 ${deals ? "bg-brand-orange text-ink" : ""}`}
      >
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id={`${id}-heading`} className="text-[17px] font-bold leading-6 text-ink md:text-xl md:leading-7">
            {title}
          </h2>
          {subtitle && (
            <p className={`hidden text-sm leading-5 md:block ${deals ? "text-ink" : "text-ink-soft"}`}>{subtitle}</p>
          )}
        </div>
        <Link
          href={seeAllHref}
          className={`inline-flex min-h-11 shrink-0 items-center gap-1 text-[13px] font-bold no-underline hover:underline md:text-sm ${
            deals ? "text-ink hover:text-ink" : ""
          }`}
        >
          See all
          <span className="sr-only"> {title}</span>
          <ChevronRightIcon className="hidden h-4 w-4 md:block" />
        </Link>
      </div>
      <ul
        className={`md:grid md:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] md:gap-3 md:overflow-visible md:px-3 md:pb-5 md:pt-3 ${
          rail
            ? "flex gap-2.5 overflow-x-auto px-3 pb-3.5 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "grid grid-cols-2 gap-x-2.5 gap-y-4 px-3 pb-3 [&>li:nth-child(n+7)]:hidden md:[&>li:nth-child(n+7)]:block"
        }`}
      >
        {products.map((product) => (
          <li key={product.id} className={rail ? "w-[140px] shrink-0 md:w-auto" : undefined}>
            <ProductCard product={product} isNew={newest.has(product.id)} sizes={rail ? RAIL_SIZES : GRID_SIZES} />
          </li>
        ))}
      </ul>
    </section>
  );
}
