import type { Metadata } from "next";
import { CartView } from "@/components/shop/cart-view";
import { ReplyPromise } from "@/components/shop/reply-promise";
import { getSettings } from "@/lib/server/catalogue";

export const metadata: Metadata = {
  title: "Your cart",
  robots: { index: false },
};

export default async function CartPage() {
  const settings = await getSettings();
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 pt-6">
      <h1 className="text-3xl font-bold text-brand-green">Your cart</h1>
      <ReplyPromise settings={settings} />
      <CartView />
    </div>
  );
}
