import { describe, expect, it } from "vitest";
import { bannerFormSchema, bannerShapeWarning } from "./banners";

const valid = {
  imageUrl: "https://res.cloudinary.com/jhkoz7yc/image/upload/v1/tlip/banners/christmas.jpg",
  publicId: "tlip/banners/christmas",
  alt: "Christmas in the kitchen: up to 20% off cookware",
  linkUrl: "/deals",
  isActive: true,
};

describe("bannerFormSchema", () => {
  it("accepts a Cloudinary image, a description and a link", () => {
    expect(bannerFormSchema.parse(valid)).toEqual(valid);
  });

  it("treats an empty link as no link and trims text", () => {
    const parsed = bannerFormSchema.parse({ ...valid, alt: "  New arrivals  ", linkUrl: "  " });
    expect(parsed.alt).toBe("New arrivals");
    expect(parsed.linkUrl).toBeNull();
  });

  it("accepts pages on this site and https addresses", () => {
    for (const linkUrl of ["/", "/deals", "/categories/blenders?sort=price-asc", "https://wa.me/233242959396"]) {
      expect(bannerFormSchema.safeParse({ ...valid, linkUrl }).success).toBe(true);
    }
  });

  it("rejects unsafe or odd links", () => {
    for (const linkUrl of ["//evil.example", "javascript:alert(1)", "http://example.com", "deals", "https://"]) {
      expect(bannerFormSchema.safeParse({ ...valid, linkUrl }).success).toBe(false);
    }
  });

  it("needs an https Cloudinary image and a description", () => {
    expect(bannerFormSchema.safeParse({ ...valid, imageUrl: "https://example.com/a.jpg" }).success).toBe(false);
    expect(bannerFormSchema.safeParse({ ...valid, imageUrl: "http://res.cloudinary.com/x/image/upload/a.jpg" }).success).toBe(false);
    expect(bannerFormSchema.safeParse({ ...valid, alt: "   " }).success).toBe(false);
    expect(bannerFormSchema.safeParse({ ...valid, alt: "x".repeat(301) }).success).toBe(false);
  });
});

describe("bannerShapeWarning", () => {
  it("is quiet for 2:1 images that are big enough", () => {
    expect(bannerShapeWarning(1440, 720)).toBeNull();
    expect(bannerShapeWarning(2880, 1440)).toBeNull();
    expect(bannerShapeWarning(1500, 730)).toBeNull(); // within 5%
  });

  it("warns about other shapes and small images", () => {
    expect(bannerShapeWarning(1080, 1080)).toMatch(/cut off/);
    expect(bannerShapeWarning(1920, 1080)).toMatch(/cut off/);
    expect(bannerShapeWarning(600, 300)).toMatch(/blurry/);
  });
});
