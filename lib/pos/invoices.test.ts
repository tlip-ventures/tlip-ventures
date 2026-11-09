import { describe, expect, it } from "vitest";
import { buildInvoiceMessage, defaultValidUntil, ghanaToday, invoicePill, isExpired, tillWarnings } from "./invoices";

describe("invoice dates", () => {
  it("defaults to a week from today, in Ghana time", () => {
    expect(defaultValidUntil(new Date("2026-11-09T23:30:00Z"))).toBe("2026-11-16");
    expect(defaultValidUntil(new Date("2026-12-28T08:00:00Z"))).toBe("2027-01-04");
    expect(ghanaToday(new Date("2026-11-09T23:30:00Z"))).toBe("2026-11-09");
  });

  it("expires the day after its date, and only while open", () => {
    expect(isExpired("open", "2026-11-09", "2026-11-09")).toBe(false);
    expect(isExpired("open", "2026-11-08", "2026-11-09")).toBe(true);
    expect(isExpired("sold", "2026-11-01", "2026-11-09")).toBe(false);
    expect(invoicePill("open", "2026-11-08", "2026-11-09").label).toBe("Expired");
    expect(invoicePill("open", "2026-11-10", "2026-11-09").label).toBe("Open");
    expect(invoicePill("cancelled", "2026-11-10", "2026-11-09").label).toBe("Cancelled");
  });
});

describe("buildInvoiceMessage", () => {
  it("lists the items, money and the date the prices hold to", () => {
    const text = buildInvoiceMessage({
      storeName: "Tlip Ventures",
      code: "INV_1001",
      createdAt: "2026-11-09T10:00:00Z",
      validUntil: "2026-11-16",
      lines: [
        { qty: 2, productName: "Frying pan", optionValues: "28 cm", unitPrice: 16000, lineTotal: 32000 },
        { qty: 1, productName: "Kettle", optionValues: null, unitPrice: 25000, lineTotal: 25000 },
      ],
      discount: 2000,
      deliveryFee: 3000,
      deliveryAddress: "Dansoman, near Sharp Curve",
      total: 58000,
    });
    expect(text).toBe(
      [
        "Tlip Ventures invoice",
        "Invoice INV_1001 · 9 Nov 2026",
        "2 x Frying pan (28 cm) - GH₵ 320",
        "1 x Kettle - GH₵ 250",
        "Discount: -GH₵ 20",
        "Delivery: GH₵ 30",
        "Total: GH₵ 580",
        "Deliver to: Dansoman, near Sharp Curve",
        "Prices held until 16 Nov 2026.",
      ].join("\n"),
    );
  });

  it("leaves out discount and delivery when there are none", () => {
    const text = buildInvoiceMessage({
      storeName: "Tlip Ventures",
      code: "INV_1002",
      createdAt: "2026-11-09T10:00:00Z",
      validUntil: "2026-11-16",
      lines: [{ qty: 1, productName: "Kettle", optionValues: null, unitPrice: 25000, lineTotal: 25000 }],
      discount: 0,
      deliveryFee: 0,
      deliveryAddress: null,
      total: 25000,
    });
    expect(text).not.toMatch(/Discount|Delivery|Deliver to/);
  });
});

describe("tillWarnings", () => {
  it("says what changed since the invoice", () => {
    expect(
      tillWarnings([
        { name: "Kettle", invoicePrice: 25000, price: 25000, qty: 1, onHand: 5 },
        { name: "Blender", invoicePrice: 45000, price: 48000, qty: 1, onHand: 5 },
        { name: "Mixer", invoicePrice: 30000, price: null, qty: 1, onHand: 0 },
        { name: "Stool", invoicePrice: 12000, price: 12000, qty: 4, onHand: 2 },
        { name: "Mat", invoicePrice: 5000, price: 4500, qty: 1, onHand: 0 },
      ]),
    ).toEqual([
      "Blender has gone up: GH₵ 450 on the invoice, GH₵ 480 today.",
      "Mixer is no longer sold, so it was left out.",
      "Only 2 of Stool on the shelf (the invoice has 4).",
      "Mat is out of stock, so it was left out.",
      "Mat has gone down: GH₵ 50 on the invoice, GH₵ 45 today.",
    ]);
  });
});
