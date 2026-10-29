import { pesewasToDecimal, type Pesewas } from "@/lib/money";

// schema.org data for search engines (JSON-LD). Builders are pure so they can be tested.

type ProductInput = {
  name: string;
  description: string | null;
  brand: string | null;
  url: string;
  images: string[];
  variants: { sku: string | null; price: Pesewas; inStock: boolean }[];
};

const availability = (inStock: boolean) => (inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock");

/** Product with one Offer, or an AggregateOffer when the options have different prices. */
export function productJsonLd(p: ProductInput) {
  const prices = p.variants.map((v) => v.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const inStock = p.variants.some((v) => v.inStock);
  const skus = p.variants.map((v) => v.sku).filter((s): s is string => Boolean(s));
  const offer =
    low === high
      ? {
          "@type": "Offer",
          price: pesewasToDecimal(low),
          priceCurrency: "GHS",
          availability: availability(inStock),
          itemCondition: "https://schema.org/NewCondition",
          url: p.url,
        }
      : {
          "@type": "AggregateOffer",
          lowPrice: pesewasToDecimal(low),
          highPrice: pesewasToDecimal(high),
          offerCount: p.variants.length,
          priceCurrency: "GHS",
          availability: availability(inStock),
          url: p.url,
        };
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    ...(p.description ? { description: p.description } : {}),
    ...(p.images.length ? { image: p.images } : {}),
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
    ...(skus.length === 1 && p.variants.length === 1 ? { sku: skus[0] } : {}),
    offers: offer,
  };
}

export function breadcrumbJsonLd(trail: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({ "@type": "ListItem", position: i + 1, name: crumb.name, item: crumb.url })),
  };
}

type StoreInput = {
  name: string;
  url: string;
  logo: string;
  whatsappNumber: string;
  email: string | null;
  address: string | null;
  socialLinks: string[];
};

/** The shop itself, for the home page. */
export function storeJsonLd(s: StoreInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    name: s.name,
    url: s.url,
    logo: s.logo,
    image: s.logo,
    telephone: `+${s.whatsappNumber}`,
    ...(s.email ? { email: s.email } : {}),
    currenciesAccepted: "GHS",
    ...(s.address ? { address: { "@type": "PostalAddress", streetAddress: s.address, addressCountry: "GH" } } : {}),
    ...(s.socialLinks.length ? { sameAs: s.socialLinks } : {}),
  };
}

/** JSON for a <script type="application/ld+json">, with "<" escaped so text can't close the tag. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
