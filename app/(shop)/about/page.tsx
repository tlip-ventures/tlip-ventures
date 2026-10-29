import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, WhatsAppButton } from "@/components/shop/content-page";
import { socialLabel } from "@/lib/admin-forms";
import { formatGhanaPhone } from "@/lib/phone";
import { getSettings } from "@/lib/server/catalogue";
import { pageMetadata } from "@/lib/seo";
import { whatsappUrl } from "@/lib/whatsapp";

// DRAFT for the owner to review. Contact details come from admin → Settings.

export const metadata: Metadata = pageMetadata({
  title: "About and contact",
  description: "Tlip Ventures sells home and kitchen goods in Ghana. Find our shop, opening hours and WhatsApp number.",
  path: "/about",
});

export default async function AboutPage() {
  const s = await getSettings();
  const socials = Object.entries(s.social_links);

  return (
    <ContentPage
      title="About and contact"
      path="/about"
      intro={
        <p>
          {s.store_name} sells home and kitchen goods in Ghana: kitchen appliances, cooking and baking, storage, home
          organisation, laundry and cleaning, and more.
        </p>
      }
    >
      <section aria-labelledby="contact">
        <h2 id="contact">Talk to us</h2>
        <p>
          The quickest way to reach us is WhatsApp:{" "}
          <strong className="whitespace-nowrap">{formatGhanaPhone(s.whatsapp_number)}</strong>. We answer questions about
          products, availability, delivery and payment there.
        </p>
        {s.contact_email && (
          <p>
            You can also email us at <a href={`mailto:${s.contact_email}`} className="break-all">{s.contact_email}</a>.
          </p>
        )}
        <p className="mt-4">
          <WhatsAppButton href={whatsappUrl(s.whatsapp_number, `Hi ${s.store_name}, `)}>Chat on WhatsApp</WhatsAppButton>
        </p>
      </section>

      {(s.shop_address || s.opening_hours) && (
        <section aria-labelledby="visit">
          <h2 id="visit">Visit the shop</h2>
          {s.shop_address && <p className="whitespace-pre-line">{s.shop_address}</p>}
          {s.opening_hours && <p className="whitespace-pre-line">{s.opening_hours}</p>}
        </section>
      )}

      {socials.length > 0 && (
        <section aria-labelledby="follow">
          <h2 id="follow">Follow us</h2>
          <ul className="mt-2">
            {socials.map(([name, url]) => (
              <li key={name}>
                <a href={url} rel="noopener noreferrer" className="inline-flex min-h-11 items-center">
                  {socialLabel(name)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="ordering">
        <h2 id="ordering">Ordering</h2>
        <p>
          Choose your items on this website and send the order to us on WhatsApp. <Link href="/how-to-order">See how ordering works</Link>.
        </p>
      </section>
    </ContentPage>
  );
}
