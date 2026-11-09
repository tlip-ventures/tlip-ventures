import { describe, expect, it } from "vitest";
import { formErrors, parseChoices, productFormSchema, type ProductFormInput } from "./admin-product";

const CAT = "0b6f8f1e-6a7f-4f7e-9a51-6f3e2a1c9d01";

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
  choiceName: "",
  choices: "",
  sku: "",
  inStock: true,
  stockQty: "",
  categoryIds: [CAT],
  images: [{ url: "https://res.cloudinary.com/tlip/image/upload/v1/products/a.jpg", publicId: "products/a", alt: "" }],
};

const errorsOf = (input: ProductFormInput) => {
  const result = productFormSchema.safeParse(input);
  return result.success ? {} : formErrors(result.error);
};

describe("parseChoices", () => {
  it("splits on commas, | or new lines, trims, and keeps each once", () => {
    expect(parseChoices(" Black, red |Grey\nblack,, ")).toEqual(["Black", "red", "Grey"]);
    expect(parseChoices("Bless  This   Kitchen")).toEqual(["Bless This Kitchen"]);
    expect(parseChoices("")).toEqual([]);
  });
});

describe("productFormSchema", () => {
  it("turns typed values into database values", () => {
    const p = productFormSchema.parse({ ...base, compareAtPrice: "1,250.50" });
    expect(p).toMatchObject({
      name: "Blender 1.5L",
      brand: null,
      price: 45000,
      compareAtPrice: 125050,
      choiceName: null,
      choices: [],
      sku: null,
      stockQty: null,
      images: [{ alt: null, publicId: "products/a" }],
    });
  });

  it("only shows a product in the shop once it has a price", () => {
    expect(errorsOf({ ...base, price: "0" })).toMatchObject({ price: "Enter the price before showing this product in the shop." });
    expect(errorsOf({ ...base, price: "0", isActive: false })).toEqual({});
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

  it("keeps colours as a list of choices with one stock number", () => {
    const p = productFormSchema.parse({ ...base, choiceName: "Colour", choices: "Black, Pink", stockQty: "17", sku: "CIC-220" });
    expect(p).toMatchObject({ choiceName: "Colour", choices: ["Black", "Pink"], stockQty: 17, sku: "CIC-220" });
  });

  it("needs the choices once there is a heading, and drops stray choices without one", () => {
    expect(errorsOf({ ...base, choiceName: "Colour", choices: " , " })).toHaveProperty(
      "choices",
      "List the colours, separated by commas.",
    );
    expect(productFormSchema.parse({ ...base, choices: "Black" }).choices).toEqual([]);
  });

  it("limits the choices", () => {
    const many = Array.from({ length: 31 }, (_, i) => `Colour ${i}`).join(",");
    expect(errorsOf({ ...base, choiceName: "Colour", choices: many })).toHaveProperty("choices");
    expect(errorsOf({ ...base, choiceName: "Colour", choices: "x".repeat(61) })).toHaveProperty("choices");
  });

  it("checks stock quantity and images", () => {
    expect(errorsOf({ ...base, stockQty: "-1" })).toHaveProperty("stockQty");
    expect(errorsOf({ ...base, images: [{ url: "https://evil.example/a.jpg", publicId: "", alt: "" }] })).toHaveProperty(
      "images.0.url",
    );
  });
});
