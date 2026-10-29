"use client";

import { HeartIcon } from "@/components/ui/icons";
import { useWishlist, useWishlistIds } from "@/lib/saved-store";

type Props = {
  productId: string;
  productName: string;
  /** "card": round heart on the photo; "page": a labelled button on the product page. */
  look: "card" | "page";
};

/** Saves a product to the wishlist on this device, or removes it. */
export function WishlistButton({ productId, productName, look }: Props) {
  const saved = useWishlistIds().includes(productId);
  const toggle = useWishlist((s) => s.toggle);
  const heart = (
    <HeartIcon className={look === "card" ? "h-[18px] w-[18px]" : "h-5 w-5"} fill={saved ? "currentColor" : "none"} />
  );

  if (look === "card") {
    return (
      // A 36px white circle inside a 44px tap target.
      <button
        type="button"
        onClick={() => toggle(productId)}
        aria-label={saved ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`}
        className="group/heart flex h-11 w-11 cursor-pointer items-center justify-center"
      >
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-[0_1px_3px_rgba(17,17,17,0.12)] group-hover/heart:bg-white ${
            saved ? "text-brand-orange-dark" : "text-ink-soft group-hover/heart:text-ink"
          }`}
        >
          {heart}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => toggle(productId)}
      className={`inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 px-5 font-bold sm:w-auto ${
        saved
          ? "border-brand-orange-dark text-brand-orange-dark hover:bg-tint-orange"
          : "border-chip text-ink hover:border-brand-green hover:text-brand-green"
      }`}
    >
      {heart}
      {saved ? "Saved to wishlist" : "Save to wishlist"}
    </button>
  );
}
