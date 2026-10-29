import type { Metadata } from "next";
import { OrderSentView } from "@/components/shop/order-sent-view";
import { ReplyPromise } from "@/components/shop/reply-promise";
import { getSettings } from "@/lib/server/catalogue";

export const metadata: Metadata = {
  title: "Send your order on WhatsApp",
  robots: { index: false },
};

export default async function OrderSentPage() {
  const settings = await getSettings();
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6">
      <OrderSentView reply={<ReplyPromise settings={settings} />} />
    </div>
  );
}
