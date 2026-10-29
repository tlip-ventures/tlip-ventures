import { describe, expect, it } from "vitest";
import { buildReceiptMessage, paymentSummary, receiptWhatsappUrl, type Receipt } from "./receipt";

const receipt: Receipt = {
  storeName: "Tlip Ventures",
  code: "SL_1210",
  createdAt: "2026-10-29T14:05:00Z",
  lines: [
    { qty: 2, productName: "Non-stick frying pan, 28 cm", optionValues: null, lineTotal: 32000 },
    { qty: 1, productName: "Blender 1.5L", optionValues: "Black", lineTotal: 45000 },
  ],
  subtotal: 77000,
  discount: 2000,
  total: 75000,
  payments: [{ method: "cash", amount: 75000, cashReceived: 80000, changeGiven: 5000 }],
  owed: 0,
  footer: null,
};

describe("buildReceiptMessage", () => {
  it("lists the sale like the shop's order messages", () => {
    expect(buildReceiptMessage(receipt)).toBe(
      [
        "Tlip Ventures receipt",
        "Sale SL_1210 · 29 Oct 2026, 14:05",
        "2 x Non-stick frying pan, 28 cm - GH₵ 320",
        "1 x Blender 1.5L (Black) - GH₵ 450",
        "Discount: -GH₵ 20",
        "Total: GH₵ 750",
        "Paid by cash: GH₵ 800, change GH₵ 50",
        "Thank you for shopping with us.",
      ].join("\n"),
    );
  });

  it("says what is still owed on a pay-later sale", () => {
    const text = buildReceiptMessage({ ...receipt, discount: 0, total: 77000, payments: [], owed: 77000, footer: "Judges 6:24" });
    expect(text).toContain("Still to pay: GH₵ 770");
    expect(text).not.toContain("Paid by");
    expect(text.endsWith("Judges 6:24")).toBe(true);
  });

  it("names Mobile Money and exact cash simply", () => {
    expect(buildReceiptMessage({ ...receipt, payments: [{ method: "momo", amount: 75000, cashReceived: null, changeGiven: null }] })).toContain(
      "Paid by Mobile Money: GH₵ 750",
    );
    expect(buildReceiptMessage({ ...receipt, payments: [{ method: "cash", amount: 75000, cashReceived: 75000, changeGiven: 0 }] })).toContain(
      "Paid by cash: GH₵ 750",
    );
  });
});

describe("paymentSummary", () => {
  it("sums up how a sale was paid", () => {
    expect(paymentSummary([], 500)).toBe("Unpaid");
    expect(paymentSummary([{ method: "momo", amount: 500, cashReceived: null, changeGiven: null }], 0)).toBe("Mobile Money");
    expect(paymentSummary([{ method: "cash", amount: 200, cashReceived: 200, changeGiven: 0 }], 300)).toBe("Part paid");
  });
});

describe("receiptWhatsappUrl", () => {
  it("goes to the customer, or lets WhatsApp ask", () => {
    expect(receiptWhatsappUrl("233241234567", "Hi & bye")).toBe("https://wa.me/233241234567?text=Hi%20%26%20bye");
    expect(receiptWhatsappUrl(null, "Hi")).toBe("https://wa.me/?text=Hi");
    expect(receiptWhatsappUrl("0241234567", "Hi")).toBe("https://wa.me/?text=Hi");
  });
});
