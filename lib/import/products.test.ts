import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";
import { groupProducts, productsToRows, readImportRows, validateImportProduct, type ExportProduct } from "./products";

const CAT = "0b6f8f1e-6a7f-4f7e-9a51-6f3e2a1c9d01";
const P1 = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";

const csv = `Name,Slug,Price,Compare at price,Categories,Choice name,Choices,In stock,Stock qty,Images
Blender 1.5L,blender-1-5l,450,,Blenders,Colour,Black|White,yes,4,https://res.cloudinary.com/t/image/upload/a.jpg | https://res.cloudinary.com/t/image/upload/b.jpg
Mop & Bucket Set,,140,160,cleaning-items-tools,,,,,
`;

// The older format: one row per colour.
const legacyCsv = `name,slug,price,option1_name,option1_value,in_stock,stock_qty
Room Door Mat,room-door-mat,35,Colour,Beige,no,2
,room-door-mat,,,Taupe,yes,13
`;

const load = (text: string) => {
  const { rows, errors } = readImportRows(parseCsv(text));
  const grouped = groupProducts(rows);
  return { products: grouped.products, errors: [...errors, ...grouped.errors] };
};

describe("readImportRows and groupProducts", () => {
  it("reads one row per product, with colours as choices", () => {
    const { products, errors } = load(csv);
    expect(errors).toEqual([]);
    expect(products.map((p) => [p.slug, p.lines])).toEqual([
      ["blender-1-5l", [2]],
      ["mop-and-bucket-set", [3]],
    ]);
    const [blender, mop] = products;
    expect(blender.form).toMatchObject({
      name: "Blender 1.5L",
      price: "450",
      choiceName: "Colour",
      choices: "Black|White",
      inStock: true,
      stockQty: "4",
      isActive: true,
      isFeatured: false,
    });
    expect(blender.categorySlugs).toEqual(["blenders"]);
    expect(blender.imageSources).toEqual([
      "https://res.cloudinary.com/t/image/upload/a.jpg",
      "https://res.cloudinary.com/t/image/upload/b.jpg",
    ]);
    expect(mop.imageSources).toBeNull();
  });

  it("still reads the older one-row-per-colour format: colours become choices, stock adds up", () => {
    const { products, errors } = load(legacyCsv);
    expect(errors).toEqual([]);
    expect(products).toHaveLength(1);
    expect(products[0].lines).toEqual([2, 3]);
    expect(products[0].form).toMatchObject({ choiceName: "Colour", choices: "Beige|Taupe", inStock: true, stockQty: "15" });
  });

  it("refuses a colour with its own price", () => {
    expect(load("name,price,option1_name,option1_value,variant_price\nStool,120,Colour,Grey,130\n").errors).toEqual([
      { line: 2, message: "variant_price: colours can't have their own price. Use a separate product." },
    ]);
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
    expect(load("name,price\nKettle,180\nKettle,190\n").errors).toEqual([
      { line: 3, message: "“Kettle” is listed twice. Use one row per product." },
    ]);
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
    expect(form).toMatchObject({ id: null, price: 45000, categoryIds: [CAT], choices: ["Black", "White"], stockQty: 4 });
  });

  it("keeps the id, categories and photos of an existing product", () => {
    const [blender] = load(csv).products;
    const existing = {
      id: P1,
      categoryIds: [CAT],
      images: [{ url: "https://res.cloudinary.com/t/image/upload/old.jpg", publicId: "old", alt: "Old" }],
    };
    const { form } = validateImportProduct(blender, { categoryIds: null, images: null, existing });
    expect(form?.id).toBe(P1);
    expect(form?.categoryIds).toEqual([CAT]);
    expect(form?.images[0].url).toContain("old.jpg");
  });

  it("points errors at the spreadsheet line and column", () => {
    const { products } = load("name,price,choice_name,choices,stock_qty\nStool,abc,Colour,,x\n");
    const { errors } = validateImportProduct(products[0], { categoryIds: [], images: [], existing: null });
    expect(errors).toEqual(
      expect.arrayContaining([
        { line: 2, message: "price: Enter a price like 450 or 1250.50." },
        expect.objectContaining({ line: 2, message: expect.stringMatching(/^stock_qty: /) }),
      ]),
    );
    const fixed = load("name,price,choice_name,choices\nStool,120,Colour,\n").products[0];
    expect(validateImportProduct(fixed, { categoryIds: [], images: [], existing: null }).errors).toEqual([
      { line: 2, message: "choices: List the colours, separated by commas." },
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
      option1_name: "Colour",
      choices: ["Black", "Silver"],
      categorySlugs: ["coal-pots"],
      imageUrls: [],
      stock: { sku: "CP-1", in_stock: false, stock_qty: 2 },
    };
    const { products, errors } = load(toCsv(productsToRows([product])));
    expect(errors).toEqual([]);
    const { form } = validateImportProduct(products[0], { categoryIds: [CAT], images: [], existing: null });
    expect(form).toMatchObject({
      slug: "coal-pot",
      description: 'Cast iron, "heavy"',
      price: 9000,
      choiceName: "Colour",
      choices: ["Black", "Silver"],
      sku: "CP-1",
      inStock: false,
      stockQty: 2,
    });
  });
});
