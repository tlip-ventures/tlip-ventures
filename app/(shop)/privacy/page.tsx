import type { Metadata } from "next";
import { ContentPage } from "@/components/shop/content-page";
import { formatGhanaPhone } from "@/lib/phone";
import { getSettings } from "@/lib/server/catalogue";
import { pageMetadata } from "@/lib/seo";

// DRAFT for the owner to review (ideally with someone who knows Ghana's Data
// Protection Act, 2012). It states only what the website actually does.

export const metadata: Metadata = pageMetadata({
  title: "Privacy",
  description: "What Tlip Ventures collects when you order, why, and how to ask us to see, correct or delete it.",
  path: "/privacy",
});

export default async function PrivacyPage() {
  const s = await getSettings();
  const phone = formatGhanaPhone(s.whatsapp_number);

  return (
    <ContentPage
      title="Privacy"
      path="/privacy"
      intro={<p>We collect as little as we can: only what we need to handle your order.</p>}
    >
      <section aria-labelledby="collect">
        <h2 id="collect">What we collect</h2>
        <p>When you place an order, we save:</p>
        <ul className="mt-2">
          <li>your name and phone number,</li>
          <li>the location you give, so we can arrange delivery,</li>
          <li>the note you add, if any,</li>
          <li>the items, quantities and prices in your order.</li>
        </ul>
        <p>
          We do not ask for card, bank or mobile money details on this website, and we do not use advertising or
          tracking cookies.
        </p>
      </section>

      <section aria-labelledby="why">
        <h2 id="why">Why</h2>
        <p>
          To confirm and deliver your order: we use your name and number to recognise your WhatsApp message and reply to you,
          and your location to arrange delivery and payment. We do not sell or share your details for marketing.
        </p>
      </section>

      <section aria-labelledby="who">
        <h2 id="who">Who can see it</h2>
        <p>
          Only {s.store_name} staff, in our order system. Your order is stored with our database provider (Supabase) and
          the website runs on Cloudflare; they store it on our behalf.
        </p>
        <p>
          The order link in your WhatsApp message shows the items and total only, never your name, phone number or
          location.
        </p>
      </section>

      <section aria-labelledby="device">
        <h2 id="device">On your phone</h2>
        <p>
          Your cart, and the last order you placed, are kept in your browser’s storage on your own device so they survive
          a reload. You can clear them by clearing this website’s data in your browser settings.
        </p>
      </section>

      <section aria-labelledby="rights">
        <h2 id="rights">Your choices</h2>
        <p>
          You can ask us to show you, correct or delete the details we hold about you. Message us on WhatsApp at{" "}
          <strong className="whitespace-nowrap">{phone}</strong>. Under Ghana’s Data Protection Act, 2012 (Act 843) you may
          also complain to the Data Protection Commission.
        </p>
      </section>
    </ContentPage>
  );
}
