import { describe, expect, it } from "vitest";
import { DEFAULT_DELIVERY_PRICING } from "@/lib/delivery";
import {
  addToBasket,
  basketLineKey,
  basketLineName,
  basketQty,
  basketTotals,
  cashOptions,
  changeDue,
  deliveryFeeText,
  deliveryTooBig,
  linePrice,
  momoSplit,
  draftDeliveryFee,
  setBasketQty,
  tileStock,
  type NewBasketLine,
} from "./basket";

const kettle: NewBasketLine = { variantId: "k", name: "Electric kettle", choice: null, sku: "KTL18", unitPrice: 28000, maxQty: 3 };
const pan: NewBasketLine = { variantId: "p", name: "Frying pan", choice: null, sku: "NSF28", unitPrice: 16000, maxQty: 11 };
const matBeige: NewBasketLine = { variantId: "m", name: "Room Door Mat", choice: "Beige", sku: null, unitPrice: 3500, maxQty: 4 };
const matTaupe: NewBasketLine = { ...matBeige, choice: "Taupe" };

describe("basket", () => {
  it("adds and stops at what is on the shelf", () => {
    let lines = addToBasket([], kettle);
    lines = addToBasket(lines, kettle);
    lines = addToBasket(lines, kettle);
    lines = addToBasket(lines, kettle);
    expect(basketQty(lines, "k")).toBe(3);
    expect(lines).toHaveLength(1);
  });

  it("never adds an out-of-stock item", () => {
    expect(addToBasket([], { ...kettle, maxQty: 0 })).toEqual([]);
    expect(addToBasket([], { ...kettle, maxQty: -4 })).toEqual([]);
  });

  it("sets quantities within the shelf and removes at 0", () => {
    const lines = addToBasket(addToBasket([], kettle), pan);
    expect(basketQty(setBasketQty(lines, basketLineKey(kettle), 10), "k")).toBe(3);
    expect(setBasketQty(lines, basketLineKey(kettle), 0).map((l) => l.variantId)).toEqual(["p"]);
  });

  it("keeps colours as separate lines that share one shelf", () => {
    let lines = addToBasket([], matBeige, 3);
    lines = addToBasket(lines, matTaupe, 3);
    expect(lines.map((l) => [basketLineName(l), l.qty])).toEqual([
      ["Room Door Mat (Beige)", 3],
      ["Room Door Mat (Taupe)", 1],
    ]);
    expect(basketQty(lines, "m")).toBe(4);
    // Full: no more of any colour.
    expect(addToBasket(lines, matTaupe)).toEqual(lines);
    expect(setBasketQty(lines, basketLineKey(matTaupe), 5).map((l) => l.qty)).toEqual([3, 1]);
    // Fewer Beige frees room for Taupe.
    lines = setBasketQty(lines, basketLineKey(matBeige), 1);
    expect(setBasketQty(lines, basketLineKey(matTaupe), 5).map((l) => l.qty)).toEqual([1, 3]);
  });

  it("totals in pesewas and caps the discount", () => {
    const lines = addToBasket(addToBasket(addToBasket([], kettle), pan), pan);
    expect(basketTotals(lines)).toEqual({ items: 3, subtotal: 60000, discount: 0, delivery: 0, deliveryIncluded: false, total: 60000 });
    expect(basketTotals(lines, 2050).total).toBe(57950);
    expect(basketTotals(lines, 999999).total).toBe(0);
    // A delivery fee comes on top and the discount never eats into it.
    expect(basketTotals(lines, 2050, 3000)).toEqual({ items: 3, subtotal: 60000, discount: 2050, delivery: 3000, deliveryIncluded: false, total: 60950 });
    expect(basketTotals(lines, 999999, 3000).total).toBe(3000);
  });
});

describe("tileStock", () => {
  it("uses the design's words", () => {
    expect(tileStock(0, 0)).toMatchObject({ text: "Out of stock", canAdd: false });
    expect(tileStock(-4, 0)).toMatchObject({ text: "Out of stock", canAdd: false });
    expect(tileStock(3, 1)).toMatchObject({ text: "Only 2 left", tone: "low" });
    expect(tileStock(14, 1)).toMatchObject({ text: "13 in stock", tone: "ok" });
    expect(tileStock(2, 2)).toMatchObject({ canAdd: false });
  });
});

describe("cash", () => {
  it("offers exact, then the next 50 and 100 cedis", () => {
    expect(cashOptions(44000)).toEqual([44000, 45000, 50000]);
    expect(cashOptions(45000)).toEqual([45000, 50000, 55000]);
    expect(cashOptions(125050)).toEqual([125050, 130000, 135000]);
    expect(cashOptions(50000)).toEqual([50000, 55000, 60000]);
  });

  it("works out change", () => {
    expect(changeDue(44000, 50000)).toBe(6000);
    expect(changeDue(44000, 44000)).toBe(0);
    expect(changeDue(44000, 40000)).toBeNull();
    expect(changeDue(44000, null)).toBe(0);
  });
});

describe("draftDeliveryFee", () => {
  it("reads the fee typed at the till", () => {
    expect(draftDeliveryFee("collect", "30")).toBe(0);
    expect(draftDeliveryFee("delivery", "")).toBe(0);
    expect(draftDeliveryFee("delivery", "30")).toBe(3000);
    expect(draftDeliveryFee("delivery", "12.50")).toBe(1250);
    expect(draftDeliveryFee("delivery", "abc")).toBeNull();
  });
});

describe("delivery already in the price", () => {
  const lines = [{ variantId: "a", name: "Hanger", sku: null, unitPrice: 7000, qty: 1, maxQty: 5 }];
  it("keeps the total and makes the fee part of it", () => {
    const t = basketTotals(lines as never, 0, 2000, true);
    expect(t).toMatchObject({ subtotal: 7000, delivery: 2000, deliveryIncluded: true, total: 7000 });
    expect(deliveryTooBig(t)).toBe(false);
  });
  it("says when the fee is more than the total", () => {
    expect(deliveryTooBig(basketTotals(lines as never, 6000, 2000, true))).toBe(true);
  });
  it("ignores the switch when there is no fee", () => {
    expect(basketTotals(lines as never, 0, 0, true).deliveryIncluded).toBe(false);
  });
});

describe("momoSplit", () => {
  it("is a plain MoMo sale when the amount is empty or the whole total", () => {
    expect(momoSplit(7000, "", "cash")).toEqual({ kind: "full" });
    expect(momoSplit(7000, "70", "cash")).toEqual({ kind: "full" });
  });
  it("pays the rest in cash or by bank, or leaves it owed", () => {
    expect(momoSplit(7000, "50", "cash")).toEqual({
      kind: "split",
      momo: 5000,
      rest: 2000,
      restMethod: "cash",
      payments: [
        { method: "momo", amount: 5000 },
        { method: "cash", amount: 2000 },
      ],
      owed: 0,
    });
    expect(momoSplit(7000, "50", "bank")).toMatchObject({ payments: [{ method: "momo" }, { method: "bank", amount: 2000 }] });
    expect(momoSplit(7000, "30", "later")).toMatchObject({ payments: [{ method: "momo", amount: 3000 }], owed: 4000 });
  });
  it("refuses an amount that isn't money, is nothing, or is more than the total", () => {
    expect(momoSplit(7000, "abc", "cash").kind).toBe("error");
    expect(momoSplit(7000, "0", "cash").kind).toBe("error");
    expect(momoSplit(7000, "71", "cash")).toEqual({ kind: "error", message: "The MoMo amount is more than the total." });
  });
});

describe("wholesale prices", () => {
  const lines = [
    { variantId: "a", name: "Hanger", choice: null, sku: null, unitPrice: 7000, wholesalePrice: 5500, qty: 2, maxQty: 9 },
    { variantId: "b", name: "Mat", choice: null, sku: null, unitPrice: 3000, wholesalePrice: null, qty: 1, maxQty: 9 },
  ];
  it("uses the wholesale price only on a wholesale sale, and only where there is one", () => {
    expect(linePrice(lines[0], false)).toBe(7000);
    expect(linePrice(lines[0], true)).toBe(5500);
    expect(linePrice(lines[1], true)).toBe(3000);
    expect(basketTotals(lines, 0, 0, false, false).total).toBe(17000);
    expect(basketTotals(lines, 0, 0, false, true).total).toBe(14000);
  });
});

describe("deliveryFeeText", () => {
  const area = { name: "East Legon", km: 17.3 };
  const circle = { name: "Circle", km: 6 };
  const akosombo = { name: "Akosombo", km: 90 };

  it("follows the price list for the area picked", () => {
    expect(deliveryFeeText({ fee: "", area, auto: true }, DEFAULT_DELIVERY_PRICING, 20000)).toBe("55");
  });

  it("takes free delivery off for big orders", () => {
    expect(deliveryFeeText({ fee: "", area, auto: true }, DEFAULT_DELIVERY_PRICING, 100000)).toBe("15");
    expect(deliveryFeeText({ fee: "", area: circle, auto: true }, DEFAULT_DELIVERY_PRICING, 100000)).toBe("0");
  });

  it("keeps a fee typed by hand", () => {
    expect(deliveryFeeText({ fee: "60", area, auto: false }, DEFAULT_DELIVERY_PRICING, 20000)).toBe("60");
    expect(deliveryFeeText({ fee: "45", area: null, auto: true }, DEFAULT_DELIVERY_PRICING, 20000)).toBe("45");
    expect(deliveryFeeText({ fee: "45", area, auto: true }, null, 20000)).toBe("45");
  });

  it("leaves the typed fee beyond the price list", () => {
    expect(deliveryFeeText({ fee: "150", area: akosombo, auto: true }, DEFAULT_DELIVERY_PRICING, 20000)).toBe("150");
  });
});
