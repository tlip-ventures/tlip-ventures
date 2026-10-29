import { describe, expect, it } from "vitest";
import { adjustSchema, countLineSchema, fieldErrors, posProductSchema, recountSchema, stockChangeSchema } from "./schemas";

const id = "8b6c1f0e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

const product = (changes: Record<string, unknown> = {}) => ({
  id: null,
  name: "Blender 1.5L",
  price: "450",
  onWebsite: false,
  categoryId: null,
  startingStock: "",
  variants: [{ id: null, label: null, sku: "BLD15", barcode: "", reorderLevel: "2", priceOverride: "", cost: "310.50" }],
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
    expect(p.variants[0].cost).toBe(31050);
    expect(p.variants[0].reorderLevel).toBe(2);
    expect(p.variants[0].barcode).toBeNull();
    expect(p.startingStock).toBe(0);
  });

  it("won't show a free product on the website", () => {
    const result = posProductSchema.safeParse(product({ price: "0", onWebsite: true }));
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).price).toMatch(/price/);
  });

  it("refuses repeated codes and barcodes", () => {
    const v = { id, label: "Black", sku: "B1", barcode: "600123", reorderLevel: "2", priceOverride: "", cost: "" };
    const result = posProductSchema.safeParse(product({ id, variants: [v, { ...v, id: null, sku: "b1", barcode: "600124" }] }));
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).variants).toMatch(/code/);
  });

  it("refuses barcodes with spaces", () => {
    const result = posProductSchema.safeParse(
      product({ variants: [{ id: null, label: null, sku: "", barcode: "600 123", reorderLevel: "2", priceOverride: "", cost: "" }] }),
    );
    expect(result.success).toBe(false);
  });
});
