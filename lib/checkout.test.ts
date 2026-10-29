import { describe, expect, it } from "vitest";
import { checkoutSchema, fieldErrors } from "./checkout";

const A = "0b6f8f1e-6a7f-4f7e-9a51-6f3e2a1c9d01";
const B = "5c2d7a90-1b3e-4c8f-a2d6-9e0f1a2b3c4d";

const valid = {
  customerName: "  Ama Mensah ",
  phone: "024 123 4567",
  location: " Dansoman, near Sharp Curve ",
  notes: "",
  items: [{ variantId: A, qty: 1 }],
};

describe("checkoutSchema", () => {
  it("trims the name, normalises the phone and empties the note", () => {
    expect(checkoutSchema.parse(valid)).toEqual({
      customerName: "Ama Mensah",
      phone: "233241234567",
      location: "Dansoman, near Sharp Curve",
      notes: null,
      website: "",
      items: [{ variantId: A, qty: 1 }],
    });
  });

  it("passes the honeypot through for the action to check", () => {
    expect(checkoutSchema.parse({ ...valid, website: "http://spam.example" }).website).toBe("http://spam.example");
  });

  it("keeps a note", () => {
    expect(checkoutSchema.parse({ ...valid, notes: " Call before 5pm " }).notes).toBe("Call before 5pm");
  });

  it("accepts the three phone formats", () => {
    for (const phone of ["0241234567", "+233241234567", "233241234567"]) {
      expect(checkoutSchema.parse({ ...valid, phone }).phone).toBe("233241234567");
    }
  });

  it("merges repeated variants and caps the quantity", () => {
    const parsed = checkoutSchema.parse({
      ...valid,
      items: [
        { variantId: A, qty: 2 },
        { variantId: B, qty: 1 },
        { variantId: A, qty: 98 },
      ],
    });
    expect(parsed.items).toEqual([
      { variantId: A, qty: 99 },
      { variantId: B, qty: 1 },
    ]);
  });

  it("does not accept prices or other extra fields", () => {
    const parsed = checkoutSchema.parse({ ...valid, items: [{ variantId: A, qty: 1, unitPrice: 1 }], total: 1 });
    expect(parsed.items[0]).toEqual({ variantId: A, qty: 1 });
    expect(parsed).not.toHaveProperty("total");
  });

  it("requires a location of at most 200 characters", () => {
    expect(checkoutSchema.safeParse({ ...valid, location: "" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, location: "x".repeat(201) }).success).toBe(false);
    expect(checkoutSchema.parse({ ...valid, location: "Pickup" }).location).toBe("Pickup");
  });

  it("reports one message per field", () => {
    const result = checkoutSchema.safeParse({ customerName: " ", phone: "12345", location: " ", notes: "x".repeat(501), items: [] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error)).toEqual({
      customerName: "Enter your name.",
      phone: "Enter a Ghanaian number, for example 024 123 4567.",
      location: "Enter your location, for example Dansoman, near Sharp Curve.",
      notes: "Note is too long (500 characters at most).",
      items: "Your cart is empty.",
    });
  });

  it("rejects bad items", () => {
    for (const items of [
      [{ variantId: "not-a-uuid", qty: 1 }],
      [{ variantId: A, qty: 0 }],
      [{ variantId: A, qty: 1.5 }],
      [{ variantId: A, qty: 100 }],
      Array.from({ length: 51 }, () => ({ variantId: A, qty: 1 })),
    ]) {
      expect(checkoutSchema.safeParse({ ...valid, items }).success).toBe(false);
    }
  });
});
