import { describe, expect, it } from "vitest";
import { adjustSchema, countLineSchema, fieldErrors, paymentSchema, posProductSchema, recountSchema, stockChangeSchema } from "./schemas";

const id = "8b6c1f0e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

const product = (changes: Record<string, unknown> = {}) => ({
  id: null,
  name: "Blender 1.5L",
  price: "450",
  onWebsite: false,
  categoryId: null,
  startingStock: "",
  choiceName: "",
  choices: "",
  sku: "BLD15",
  barcode: "",
  reorderLevel: "2",
  cost: "310.50",
  ...changes,
});

describe("stock numbers", () => {
  it("reads a recount as a whole number from 0", () => {
    expect(recountSchema.parse({ variantId: id, counted: " 6 " }).counted).toBe(6);
    expect(recountSchema.parse({ variantId: id, counted: "0" }).counted).toBe(0);
    expect(recountSchema.safeParse({ variantId: id, counted: "-1" }).success).toBe(false);
    expect(recountSchema.safeParse({ variantId: id, counted: "2.5" }).success).toBe(false);
  });

  it("reads an adjustment with a sign, never 0", () => {
    expect(stockChangeSchema.parse("+3")).toBe(3);
    expect(stockChangeSchema.parse("-2")).toBe(-2);
    expect(stockChangeSchema.parse("−2")).toBe(-2);
    expect(stockChangeSchema.safeParse("0").success).toBe(false);
    expect(adjustSchema.safeParse({ variantId: id, change: "-1", reason: " " }).success).toBe(false);
  });

  it("clears a count line when left empty", () => {
    expect(countLineSchema.parse({ countId: id, variantId: id, counted: "" }).counted).toBeNull();
    expect(countLineSchema.parse({ countId: id, variantId: id, counted: "12" }).counted).toBe(12);
  });
});

describe("posProductSchema", () => {
  it("turns cedis into pesewas", () => {
    const p = posProductSchema.parse(product());
    expect(p.price).toBe(45000);
    expect(p.cost).toBe(31050);
    expect(p.reorderLevel).toBe(2);
    expect(p.barcode).toBeNull();
    expect(p.startingStock).toBe(0);
    expect(p).toMatchObject({ choiceName: null, choices: [] });
  });

  it("won't show a free product on the website", () => {
    const result = posProductSchema.safeParse(product({ price: "0", onWebsite: true }));
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).price).toMatch(/price/);
  });

  it("keeps colours as choices, under Colour unless named", () => {
    expect(posProductSchema.parse(product({ choices: "Black, Pink, black" }))).toMatchObject({ choiceName: "Colour", choices: ["Black", "Pink"] });
    expect(posProductSchema.parse(product({ choiceName: "Design", choices: "Delicious" }))).toMatchObject({ choiceName: "Design" });
    expect(posProductSchema.parse(product({ choiceName: "Design", choices: "" }))).toMatchObject({ choiceName: null, choices: [] });
  });

  it("refuses barcodes with spaces", () => {
    const result = posProductSchema.safeParse(product({ barcode: "600 123" }));
    expect(result.success).toBe(false);
  });
});

describe("paymentSchema delivery part", () => {
  const base = { kind: "sale", id: "11111111-1111-4111-8111-111111111111", method: "momo", amount: "130", note: "" };
  it("reads the part for delivery in cedis, or none when the box isn't there", () => {
    expect(paymentSchema.parse({ ...base, deliveryAmount: "30" }).deliveryAmount).toBe(3000);
    expect(paymentSchema.parse({ ...base, deliveryAmount: "" }).deliveryAmount).toBe(0);
    expect(paymentSchema.parse({ ...base, deliveryAmount: null }).deliveryAmount).toBeNull();
  });
  it("refuses a delivery part bigger than the amount, or not a number", () => {
    expect(paymentSchema.safeParse({ ...base, deliveryAmount: "140" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...base, deliveryAmount: "abc" }).success).toBe(false);
  });
});
