import { describe, expect, it } from "vitest";
import { DEFAULT_SHARE_IMAGE, listingPath, metaDescription, pageMetadata } from "./seo";

describe("pageMetadata", () => {
  it("sets canonical and a complete Open Graph block", () => {
    const m = pageMetadata({ title: "Blenders", description: "Shop blenders", path: "/categories/blenders" });
    expect(m.alternates?.canonical).toBe("/categories/blenders");
    expect(m.openGraph).toMatchObject({
      siteName: "Tlip Ventures",
      locale: "en_GH",
      url: "/categories/blenders",
      title: "Blenders | Tlip Ventures",
      images: [DEFAULT_SHARE_IMAGE],
    });
  });
});

describe("listingPath", () => {
  it("keeps page numbers after the first", () => {
    expect(listingPath("/products", 1)).toBe("/products");
    expect(listingPath("/products", 3)).toBe("/products?page=3");
  });
});

describe("metaDescription", () => {
  it("collapses whitespace and shortens at a word", () => {
    expect(metaDescription("  Glass\njar  blender ", "x")).toBe("Glass jar blender");
    const long = metaDescription("word ".repeat(60), "x");
    expect(long.length).toBeLessThanOrEqual(158);
    expect(long.endsWith("word…")).toBe(true);
    expect(metaDescription(null, "Fallback")).toBe("Fallback");
  });
});
