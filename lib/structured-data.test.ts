import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd, jsonLdString, productJsonLd, storeJsonLd } from "./structured-data";

const product = {
  name: "Coal Pot",
  description: "Cast iron",
  brand: null,
  url: "https://shop.example/products/coal-pot",
  images: ["https://res.cloudinary.com/x/image/upload/a.jpg"],
};

describe("productJsonLd", () => {
  it("uses one Offer when every option costs the same", () => {
    const data = productJsonLd({ ...product, brand: "Silver Crest", variants: [{ sku: "CP-1", price: 9000, inStock: true }] });
    expect(data).toMatchObject({
      "@type": "Product",
      brand: { "@type": "Brand", name: "Silver Crest" },
      sku: "CP-1",
      offers: { "@type": "Offer", price: "90.00", priceCurrency: "GHS", availability: "https://schema.org/InStock" },
    });
  });

  it("uses an AggregateOffer for a price range and marks sold-out products", () => {
    const data = productJsonLd({
      ...product,
      variants: [
        { sku: null, price: 9000, inStock: false },
        { sku: null, price: 12000, inStock: false },
      ],
    });
    expect(data.offers).toMatchObject({
      "@type": "AggregateOffer",
      lowPrice: "90.00",
      highPrice: "120.00",
      offerCount: 2,
      availability: "https://schema.org/OutOfStock",
    });
    expect(data).not.toHaveProperty("brand");
    expect(data).not.toHaveProperty("sku");
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers the trail from 1", () => {
    expect(breadcrumbJsonLd([{ name: "Home", url: "https://s/" }, { name: "Blenders", url: "https://s/categories/blenders" }]).itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://s/" },
      { "@type": "ListItem", position: 2, name: "Blenders", item: "https://s/categories/blenders" },
    ]);
  });
});

describe("storeJsonLd", () => {
  it("includes the phone with + and only the details that are set", () => {
    const data = storeJsonLd({ name: "Tlip Ventures", url: "https://s", logo: "https://s/logo.png", whatsappNumber: "233241234567", email: null, address: null, socialLinks: [] });
    expect(data.telephone).toBe("+233241234567");
    expect(data).not.toHaveProperty("address");
    expect(data).not.toHaveProperty("sameAs");
    expect(data).not.toHaveProperty("email");
  });

  it("adds the email, address and social links when set", () => {
    const data = storeJsonLd({
      name: "Tlip Ventures",
      url: "https://s",
      logo: "https://s/logo.png",
      whatsappNumber: "233241234567",
      email: "tlipventures@gmail.com",
      address: "Dansoman Sharp Curve, Accra",
      socialLinks: ["https://www.tiktok.com/@tlip_ventures"],
    });
    expect(data).toMatchObject({
      email: "tlipventures@gmail.com",
      address: { streetAddress: "Dansoman Sharp Curve, Accra", addressCountry: "GH" },
      sameAs: ["https://www.tiktok.com/@tlip_ventures"],
    });
  });
});

describe("jsonLdString", () => {
  it("escapes < so a product name can't end the script tag", () => {
    expect(jsonLdString({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});
