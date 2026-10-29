import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";
import { groupProducts, productsToRows, readImportRows, validateImportProduct, type ExportProduct } from "./products";

const CAT = "0b6f8f1e-6a7f-4f7e-9a51-6f3e2a1c9d01";
const V1 = "5c2d7a90-1b3e-4c8f-a2d6-9e0f1a2b3c4d";
const P1 = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";

const csv = `Name,Slug,Price,Compare at price,Categories,Option1 name,Option1 value,Variant price,In stock,Stock qty,Images
Blender 1.5L,blender-1-5l,450,,Blenders,Colour,Black,,yes,4,https://res.cloudinary.com/t/image/upload/a.jpg | https://res.cloudinary.com/t/image/upload/b.jpg
,blender-1-5l,,,,,White,470,no,,
Mop & Bucket Set,,140,160,cleaning-items-tools,,,,,,
`;

const load = (text: string) => {
  const { rows, errors } = readImportRows(parseCsv(text));
  const grouped = groupProducts(rows);
  return { products: grouped.products, errors: [...errors, ...grouped.errors] };
};

describe("readImportRows and groupProducts", () => {
  it("groups option rows under their product", () => {
    const { products, errors } = load(csv);
    expect(errors).toEqual([]);
    expect(products.map((p) => [p.slug, p.lines])).toEqual([
      ["blender-1-5l", [2, 3]],
      ["mop-and-bucket-set", [4]],
    ]);
    const [blender, mop] = products;
    expect(blender.form).toMatchObject({ name: "Blender 1.5L", price: "450", option1Name: "Colour", isActive: true, isFeatured: false });
    expect(blender.form.variants.map((v) => [v.option1Value, v.priceOverride, v.inStock, v.stockQty])).toEqual([
      ["Black", "", true, "4"],
      ["White", "470", false, ""],
    ]);
    expect(blender.categorySlugs).toEqual(["blenders"]);
    expect(blender.imageSources).toEqual([
      "https://res.cloudinary.com/t/image/upload/a.jpg",
      "https://res.cloudinary.com/t/image/upload/b.jpg",
    ]);
    expect(mop.imageSources).toBeNull();
  });

  it("reports header problems and bad values with line numbers", () => {
    expect(load("Title,Price\nx,1\n").errors).toEqual(
      expect.arrayContaining([
        { line: 1, message: "Unknown column “Title”." },
        { line: 1, message: "Missing the “name” column." },
      ]),
    );
    expect(load("name,price,in_stock\nKettle,180,maybe\n").errors).toEqual([
      { line: 2, message: "in_stock must be yes or no, not “maybe”." },
    ]);
    expect(load("name,price\nKettle,180\nKettle,190\n").errors[0]).toMatchObject({ line: 3 });
    expect(load("name,price\n,180\n").errors[0]).toEqual({ line: 2, message: "Each row needs a slug or a name." });
  });
});

describe("validateImportProduct", () => {
  it("produces database values in pesewas", () => {
    const [blender] = load(csv).products;
    const { form, errors } = validateImportProduct(blender, {
      categoryIds: [CAT],
      images: [{ url: "https://res.cloudinary.com/t/image/upload/a.jpg", publicId: "a", alt: "" }],
      existing: null,
    });
    expect(errors).toEqual([]);
    expect(form).toMatchObject({ id: null, price: 45000, categoryIds: [CAT], variants: [{ priceOverride: null, stockQty: 4 }, { priceOverride: 47000 }] });
  });

  it("keeps ids, categories and photos of an existing product", () => {
    const [blender] = load(csv).products;
    const existing = {
      id: P1,
      variants: [{ id: V1, option1_value: "black", option2_value: null }],
      categoryIds: [CAT],
      images: [{ url: "https://res.cloudinary.com/t/image/upload/old.jpg", publicId: "old", alt: "Old" }],
    };
    const { form } = validateImportProduct(blender, { categoryIds: null, images: null, existing });
    expect(form?.id).toBe(P1);
    expect(form?.variants.map((v) => v.id)).toEqual([V1, null]);
    expect(form?.categoryIds).toEqual([CAT]);
    expect(form?.images[0].url).toContain("old.jpg");
  });

  it("points errors at the right spreadsheet line and column", () => {
    const { products } = load("name,price,option1_name,option1_value,variant_price\nStool,abc,Colour,Grey,\nStool,,,,12x\n");
    const { errors } = validateImportProduct(products[0], { categoryIds: [], images: [], existing: null });
    expect(errors).toEqual(
      expect.arrayContaining([
        { line: 2, message: "price: Enter a price like 450 or 1250.50." },
        expect.objectContaining({ line: 3, message: expect.stringMatching(/^variant_price: /) }),
      ]),
    );
    // Missing option values are checked once the prices are valid.
    const fixed = load("name,price,option1_name,option1_value\nStool,120,Colour,Grey\nStool,,,\n").products[0];
    expect(validateImportProduct(fixed, { categoryIds: [], images: [], existing: null }).errors).toEqual([
      { line: 3, message: "option1_value: Enter the Colour." },
    ]);
  });
});

describe("productsToRows", () => {
  it("exports in the import format, and imports back the same", () => {
    const product: ExportProduct = {
      slug: "coal-pot",
      name: "Coal Pot",
      brand: null,
      description: "Cast iron, \"heavy\"",
      price: 9000,
      compare_at_price: null,
      is_active: true,
      is_featured: false,
      option1_name: "Size",
      option2_name: null,
      categorySlugs: ["coal-pots"],
      imageUrls: [],
      variants: [
        { option1_value: "Medium", option2_value: null, price_override: null, sku: null, in_stock: true, stock_qty: null },
        { option1_value: "Large", option2_value: null, price_override: 12000, sku: "CP-L", in_stock: false, stock_qty: 2 },
      ],
    };
    const { products, errors } = load(toCsv(productsToRows([product])));
    expect(errors).toEqual([]);
    const { form } = validateImportProduct(products[0], { categoryIds: [CAT], images: [], existing: null });
    expect(form).toMatchObject({
      slug: "coal-pot",
      description: 'Cast iron, "heavy"',
      price: 9000,
      option1Name: "Size",
      variants: [
        { option1Value: "Medium", priceOverride: null, inStock: true },
        { option1Value: "Large", priceOverride: 12000, sku: "CP-L", inStock: false, stockQty: 2 },
      ],
    });
  });
});
