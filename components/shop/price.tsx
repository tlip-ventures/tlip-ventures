import { formatPesewas } from "@/lib/money";
import { discountPercent, type PriceSummary } from "@/lib/product";

type Props = {
  pricing: PriceSummary;
  /** "card": price with the old price underneath; "lg": product page, old price beside it. */
  size?: "card" | "lg";
};

/** "GH₵ 450", "From GH₵ 90", or a sale price with the old price struck through. */
export function Price({ pricing, size = "card" }: Props) {
  const { min, max, compareAt } = pricing;
  const card = size === "card";
  return (
    <p className={card ? "flex flex-col" : "flex flex-wrap items-baseline gap-x-2"}>
      <span
        className={`font-bold tabular-nums text-ink ${card ? "text-[15px] leading-5 md:text-[17px] md:leading-6" : "text-2xl"}`}
      >
        {min === max ? formatPesewas(min) : `From ${formatPesewas(min)}`}
      </span>
      {compareAt !== null && (
        <span className={`tabular-nums text-ink-muted ${card ? "text-xs leading-4 md:text-[13px] md:leading-[18px]" : "text-sm"}`}>
          <span className="sr-only">Was </span>
          <s>{formatPesewas(compareAt)}</s>
        </span>
      )}
    </p>
  );
}

/**
 * "−16%" badge when there is a "was" price. Worked out from the highest
 * current price, so a product with a price range never overstates the saving.
 */
export function DiscountBadge({ pricing, size = "card" }: Props) {
  const percent = discountPercent(pricing.max, pricing.compareAt);
  if (percent === null) return null;
  return (
    <span
      className={`inline-block rounded-md bg-sale-tint font-bold tabular-nums text-brand-orange-dark ${
        size === "card" ? "px-1.5 py-0.5 text-xs leading-4 md:px-2 md:text-[13px] md:leading-[18px]" : "px-2 py-0.5 text-base"
      }`}
    >
      <span aria-hidden="true">−{percent}%</span>
      <span className="sr-only">{percent}% off</span>
    </span>
  );
}
