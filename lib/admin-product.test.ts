import { describe, expect, it } from "vitest";
import { formErrors, productFormSchema, type ProductFormInput } from "./admin-product";

const CAT = "0b6f8f1e-6a7f-4f7e-9a51-6f3e2a1c9d01";

const variant = (over: Partial<ProductFormInput["variants"][number]> = {}) => ({
  id: null,
  option1Value: "",
  option2Value: "",
  sku: "",
  inStock: true,
  stockQty: "",
  priceOverride: "",
  ...over,
});

const base: ProductFormInput = {
  id: null,
  name: " Blender 1.5L ",
  slug: "blender-1-5l",
  brand: " ",
  description: "Glass jar",
  price: "450",
  compareAtPrice: "",
  isActive: true,
  isFeatured: false,
  option1Name: "",
  option2Name: "",
  variants: [variant()],
  categoryIds: [CAT],
  images: [{ url: "https://res.cloudinary.com/tlip/image/upload/v1/products/a.jpg", publicId: "products/a", alt: "" }],
};

const errorsOf = (input: ProductFormInput) => {
  const result = productFormSchema.safeParse(input);
  return result.success ? {} : formErrors(result.error);
};

describe("productFormSchema", () => {
  it("turns typed values into database values", () => {
    const p = productFormSchema.parse({ ...base, compareAtPrice: "1,250.50" });
    expect(p).toMatchObject({
      name: "Blender 1.5L",
      brand: null,
      price: 45000,
      compareAtPrice: 125050,
      option1Name: null,
      variants: [{ option1Value: null, option2Value: null, sku: null, stockQty: null, priceOverride: null }],
      images: [{ alt: null, publicId: "products/a" }],
    });
  });

  it("only shows a product in the shop once it has a price", () => {
    expect(errorsOf({ ...base, price: "0" })).toMatchObject({ price: "Enter the price before showing this product in the shop." });
    expect(errorsOf({ ...base, price: "0", isActive: false })).toEqual({});
    expect(
      errorsOf({ ...base, price: "0", option1Name: "Colour", variants: [variant({ option1Value: "Pink", priceOverride: "120" })] }),
    ).toEqual({});
    expect(
      errorsOf({
        ...base,
        price: "0",
        option1Name: "Colour",
        variants: [variant({ option1Value: "Pink", priceOverride: "120" }), variant({ option1Value: "Blue" })],
      }),
    ).toMatchObject({ price: expect.any(String) });
  });

  it("accepts a photo kept with the site", () => {
    expect(errorsOf({ ...base, images: [{ url: "/products/electric-kettle-4l.webp", publicId: "", alt: "Kettle" }] })).toEqual({});
  });

  it("needs a name, slug and valid price", () => {
    expect(errorsOf({ ...base, name: " ", slug: "Bad Slug", price: "abc" })).toMatchObject({
      name: "Enter a product name.",
      slug: expect.any(String),
      price: "Enter a price like 450 or 1250.50.",
    });
  });

  it("requires the was-price to be higher", () => {
    expect(errorsOf({ ...base, compareAtPrice: "450" })).toHaveProperty("compareAtPrice");
    expect(errorsOf({ ...base, compareAtPrice: "500" })).toEqual({});
  });

  it("allows exactly one variant without options and clears stray option values", () => {
    expect(errorsOf({ ...base, variants: [variant(), variant()] })).toHaveProperty("variants");
    const p = productFormSchema.parse({ ...base, variants: [variant({ option1Value: "Black" })] });
    expect(p.variants[0].option1Value).toBeNull();
  });

  it("checks option values", () => {
    const withOptions = { ...base, option1Name: "Colour" };
    expect(errorsOf({ ...withOptions, variants: [variant({ option1Value: "Black" }), variant()] })).toHaveProperty(
      "variants.1.option1Value",
      "Enter the Colour.",
    );
    expect(
      errorsOf({ ...withOptions, variants: [variant({ option1Value: "Black" }), variant({ option1Value: "black" })] }),
    ).toHaveProperty("variants.1.option1Value", "This option is listed twice.");
    expect(
      errorsOf({ ...withOptions, option2Name: "Size", variants: [variant({ option1Value: "Black" })] }),
    ).toHaveProperty("variants.0.option2Value");
    expect(errorsOf({ ...base, option2Name: "Size" })).toHaveProperty("option1Name");
  });

  it("reads stock quantity and price override", () => {
    const p = productFormSchema.parse({
      ...base,
      option1Name: "Size",
      variants: [variant({ option1Value: "Large", stockQty: "12", priceOverride: "120", sku: "CP-L" })],
    });
    expect(p.variants[0]).toMatchObject({ option1Value: "Large", stockQty: 12, priceOverride: 12000, sku: "CP-L" });
    expect(errorsOf({ ...base, variants: [variant({ stockQty: "-1" })] })).toHaveProperty("variants.0.stockQty");
  });

  it("rejects duplicate SKUs and non-Cloudinary images", () => {
    expect(
      errorsOf({
        ...base,
        option1Name: "Size",
        variants: [variant({ option1Value: "S", sku: "X" }), variant({ option1Value: "L", sku: "X" })],
      }),
    ).toHaveProperty("variants");
    expect(errorsOf({ ...base, images: [{ url: "https://evil.example/a.jpg", publicId: "", alt: "" }] })).toHaveProperty(
      "images.0.url",
    );
  });
});
