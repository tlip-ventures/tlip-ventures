import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, WhatsAppButton } from "@/components/shop/content-page";
import { formatGhanaPhone } from "@/lib/phone";
import { getSettings } from "@/lib/server/catalogue";
import { pageMetadata } from "@/lib/seo";
import { whatsappUrl } from "@/lib/whatsapp";

// DRAFT for the owner to review: describes how the site works; no shop policies are invented here.

export const metadata: Metadata = pageMetadata({
  title: "How to order",
  description: "Order from Tlip Ventures in a few taps: pick your items, enter your name and phone, and send the order on WhatsApp.",
  path: "/how-to-order",
});

export default async function HowToOrderPage() {
  const s = await getSettings();
  const phone = formatGhanaPhone(s.whatsapp_number);

  return (
    <ContentPage
      title="How to order"
      path="/how-to-order"
      intro={<p>You order on WhatsApp, so you can ask us anything before you pay. Nothing is paid on this website.</p>}
    >
      <section aria-labelledby="steps">
        <h2 id="steps">Ordering, step by step</h2>
        <ol className="mt-3">
          <li>
            <strong>Pick your items.</strong> <Link href="/products">Browse the shop</Link>, choose a colour or size where
            there is one, and tap <em>Add to cart</em>.
          </li>
          <li>
            <strong>Open your cart</strong> and check the items and quantities.
          </li>
          <li>
            <strong>Enter your name, phone number and location</strong> (your area and a nearby landmark), and a note if
            you like (for example a good time to call).
          </li>
          <li>
            <strong>Tap “Order on WhatsApp”.</strong> We save your order and WhatsApp opens with the order message ready.
            Press send.
          </li>
          <li>
            <strong>We reply on WhatsApp</strong> to confirm the items are available, agree delivery and its fee with you,
            and tell you how to pay.
          </li>
        </ol>
      </section>

      <section aria-labelledby="faq">
        <h2 id="faq">Questions</h2>
        <h3 className="mt-4 font-sans font-semibold">Do you deliver?</h3>
        <p>
          Tell us where you are in the WhatsApp chat and we will agree delivery and its fee with you. Delivery is not
          included in the prices on the website.
        </p>
        {s.shop_address && (
          <>
            <h3 className="mt-4 font-sans font-semibold">Can I collect my order?</h3>
            <p>
              Ask in the chat. Our shop is at {s.shop_address}
              {s.opening_hours ? ` (${s.opening_hours})` : ""}.
            </p>
          </>
        )}
        <h3 className="mt-4 font-sans font-semibold">How do I pay?</h3>
        <p>
          After we confirm your order, we share our payment number or method in the chat. This website never asks for
          card or mobile money details.
        </p>
        <h3 className="mt-4 font-sans font-semibold">WhatsApp did not open. What do I do?</h3>
        <p>
          Your order is still saved. On the next page, tap <em>Copy order</em> and send the message to us on WhatsApp at{" "}
          <strong className="whitespace-nowrap">{phone}</strong>.
        </p>
        <h3 className="mt-4 font-sans font-semibold">Can I change or add to my order?</h3>
        <p>Yes. Message us on WhatsApp and mention your order code (it starts with TV-).</p>
        <h3 className="mt-4 font-sans font-semibold">An item says “Out of stock”.</h3>
        <p>
          It can’t be ordered for now. Ask us on WhatsApp when it will be back, or whether we have something similar.
        </p>
      </section>

      <WhatsAppButton href={whatsappUrl(s.whatsapp_number, `Hi ${s.store_name}, I have a question: `)}>
        Ask us on WhatsApp
      </WhatsAppButton>
    </ContentPage>
  );
}
