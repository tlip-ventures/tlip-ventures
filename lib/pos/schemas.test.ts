import { describe, expect, it } from "vitest";
import {
  adjustSchema,
  countLineSchema,
  deliveryAreaUpdateSchema,
  deliveryPricingSchema,
  fieldErrors,
  newDeliveryAreaSchema,
  paymentSchema,
  posProductSchema,
  recountSchema,
  stockChangeSchema,
} from "./schemas";

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

describe("delivery price list", () => {
  const pricing = {
    baseFee: "20",
    baseKm: "3",
    midRate: "3",
    midEndKm: "10",
    farRate: "1.50",
    roundTo: "5",
    closeKm: "1",
    closeFee: "10",
    maxKm: "65",
    freeFrom: "1,000",
    freeOff: "40",
    shopLocation: "",
  };

  it("reads the formula in pesewas and km", () => {
    expect(deliveryPricingSchema.parse(pricing)).toEqual({
      baseFee: 2000,
      baseKm: 3,
      midRate: 300,
      midEndKm: 10,
      farRate: 150,
      roundTo: 500,
      closeKm: 1,
      closeFee: 1000,
      maxKm: 65,
      freeFrom: 100000,
      freeOff: 4000,
      shopLocation: "",
    });
  });

  it("turns free delivery off when left empty", () => {
    expect(deliveryPricingSchema.parse({ ...pricing, freeFrom: " " }).freeFrom).toBeNull();
  });

  it("refuses bad numbers", () => {
    expect(deliveryPricingSchema.safeParse({ ...pricing, baseKm: "3.25" }).success).toBe(false);
    expect(deliveryPricingSchema.safeParse({ ...pricing, roundTo: "0" }).success).toBe(false);
    expect(deliveryPricingSchema.safeParse({ ...pricing, midRate: "three" }).success).toBe(false);
  });

  it("checks an area", () => {
    expect(newDeliveryAreaSchema.parse({ name: " Kokrobite ", km: "19", lat: 5.49, lng: -0.36 })).toEqual({
      name: "Kokrobite",
      km: 19,
      lat: 5.49,
      lng: -0.36,
    });
    expect(newDeliveryAreaSchema.safeParse({ name: "X", km: "19", lat: 5.49, lng: null }).success).toBe(false);
    expect(newDeliveryAreaSchema.safeParse({ name: "", km: "19", lat: null, lng: null }).success).toBe(false);
    expect(deliveryAreaUpdateSchema.safeParse({ id, name: "Osu", km: "1000", isActive: true }).success).toBe(false);
    expect(deliveryAreaUpdateSchema.parse({ id, name: "Osu", km: "10.6", isActive: false }).km).toBe(10.6);
  });
});
