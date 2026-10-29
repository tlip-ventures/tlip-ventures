import type { Metadata } from "next";
import { WishlistView } from "@/components/shop/wishlist-view";

export const metadata: Metadata = {
  title: "Your wishlist",
  robots: { index: false },
};

export default function WishlistPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-16 pt-6">
      <h1 className="text-3xl font-bold text-brand-green">Your wishlist</h1>
      <WishlistView />
    </div>
  );
}
