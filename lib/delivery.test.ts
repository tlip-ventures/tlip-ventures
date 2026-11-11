import { describe, expect, it } from "vitest";
import {
  coordinatesFromText,
  DEFAULT_DELIVERY_PRICING as P,
  areaFee,
  deliveryDiscountOff,
  deliveryFeeForKm,
  deliveryQuote,
  describeDiscount,
  discountLevel,
  formatKm,
  isShortMapsLink,
  matchAreas,
  pricingFromSettings,
  readDiscounts,
  roundKm,
  straightLineKm,
} from "./delivery";

describe("deliveryFeeForKm", () => {
  it.each([
    // The prices the owner approved on 11 November, in pesewas, at the areas' road km.
    [0.3, 2000], // very close (Blue gate): flat GH₵ 20
    [1, 2000],
    [1.8, 2000], // Dansoman Roundabout: base fee covers the first 2 km
    [2, 2000],
    [2.3, 2500], // Odorkor: 20 + 4 × 0.3 = 21.20 → 25
    [3.6, 3000], // Kaneshie: 26.40 → 30
    [6, 4000], // Circle: 20 + 4 × 4 = 36 → 40
    [6.6, 4000], // Lapaz: 38.40 → 40 (her figure: about 40)
    [6.7, 4000], // Tabora: 38.80 → 40 (her figure: about 40)
    [7, 4000], // 20 + 4 × 5 = 40 exactly
    [9.4, 4500], // Kanda: 40 + 1.5 × 2.4 = 43.60 → 45
    [12.6, 5000], // Airport Residential: 48.40 → 50 (her figure: about 50)
    [17.3, 6000], // East Legon: 55.45 → 60
    [22.7, 6500], // Madina: 63.55 → 65
    [28.1, 7500], // Oyarifa: 71.65 → 75
    [37.9, 9000], // Tema Community 1: 86.35 → 90
    [62.1, 12500], // Dodowa: 122.65 → 125
  ])("%s km costs %s pesewas", (km, fee) => {
    expect(deliveryFeeForKm(km, P)).toBe(fee);
  });

  it("charges exactly on a round amount without going up a step", () => {
    expect(deliveryFeeForKm(7, P)).toBe(4000);
    expect(deliveryFeeForKm(65, P)).toBe(13000); // 40 + 1.5 × 58 = 127 → 130
  });

  it("has no price beyond the furthest distance", () => {
    expect(deliveryFeeForKm(65.1, P)).toBeNull();
    expect(deliveryFeeForKm(200, P)).toBeNull();
  });

  it("refuses distances that aren't distances", () => {
    expect(deliveryFeeForKm(-1, P)).toBeNull();
    expect(deliveryFeeForKm(Number.NaN, P)).toBeNull();
  });

  it("follows changed settings", () => {
    const p = { ...P, baseFee: 2500, roundTo: 100, closeKm: 0 };
    expect(deliveryFeeForKm(0.5, p)).toBe(2500);
    expect(deliveryFeeForKm(3.6, p)).toBe(3200); // 25 + 4 × 1.6 = 31.40 → 32
  });

  it("copes with the middle band ending before the base", () => {
    const p = { ...P, midEndKm: 1 };
    expect(deliveryFeeForKm(10, p)).toBe(3500); // 20 + 1.5 × 8 = 32 → 35
  });

  it("always gives whole pesewas", () => {
    for (let t = 0; t <= 650; t++) {
      const fee = deliveryFeeForKm(t / 10, { ...P, roundTo: 1, farRate: 133 });
      expect(Number.isSafeInteger(fee)).toBe(true);
    }
  });
});

describe("set prices", () => {
  it("uses an area's set price instead of the formula", () => {
    expect(areaFee({ km: 12.6, fixedFee: 4500 }, P)).toBe(4500);
    expect(areaFee({ km: 12.6, fixedFee: null }, P)).toBe(5000);
    expect(areaFee({ km: 12.6 }, P)).toBe(5000);
  });

  it("prices a far area that has a set price", () => {
    expect(areaFee({ km: 90 }, P)).toBeNull();
    expect(areaFee({ km: 90, fixedFee: 15000 }, P)).toBe(15000);
  });

  it("allows a set price of nothing", () => {
    expect(areaFee({ km: 3, fixedFee: 0 }, P)).toBe(0);
  });
});

describe("delivery discounts", () => {
  const levels = { ...P, discounts: [{ from: 50000, off: 1000 }, { from: 100000, off: 2000 }, { from: 200000, off: null }] };

  it("takes GH₵ 40 off orders of GH₵ 1,000 or more by default", () => {
    expect(deliveryDiscountOff(6000, 100000, P)).toBe(4000);
    expect(deliveryDiscountOff(6000, 99999, P)).toBe(0);
  });

  it("uses the highest level the order reaches", () => {
    expect(deliveryDiscountOff(6000, 49999, levels)).toBe(0);
    expect(deliveryDiscountOff(6000, 50000, levels)).toBe(1000);
    expect(deliveryDiscountOff(6000, 150000, levels)).toBe(2000);
    expect(deliveryDiscountOff(6000, 200000, levels)).toBe(6000); // free delivery
  });

  it("finds the level whatever order the levels are in", () => {
    const shuffled = { ...levels, discounts: [levels.discounts[2], levels.discounts[0], levels.discounts[1]] };
    expect(deliveryDiscountOff(6000, 150000, shuffled)).toBe(2000);
    expect(discountLevel(150000, shuffled.discounts)).toEqual({ from: 100000, off: 2000 });
  });

  it("never takes off more than the fee", () => {
    expect(deliveryDiscountOff(3000, 150000, P)).toBe(3000);
  });

  it("is off when there are no levels", () => {
    expect(deliveryDiscountOff(6000, 500000, { ...P, discounts: [] })).toBe(0);
  });

  it("quotes a fee with the discount taken off", () => {
    const level = { from: 100000, off: 4000 };
    expect(deliveryQuote({ km: 17.3 }, 120000, P)).toEqual({ kind: "fee", listFee: 6000, fixed: false, discount: 4000, level, fee: 2000 });
    expect(deliveryQuote({ km: 6 }, 120000, P)).toEqual({ kind: "fee", listFee: 4000, fixed: false, discount: 4000, level, fee: 0 });
    expect(deliveryQuote({ km: 17.3 }, 20000, P)).toEqual({ kind: "fee", listFee: 6000, fixed: false, discount: 0, level: null, fee: 6000 });
    expect(deliveryQuote({ km: 12.6, fixedFee: 4500 }, 20000, P)).toEqual({ kind: "fee", listFee: 4500, fixed: true, discount: 0, level: null, fee: 4500 });
    expect(deliveryQuote({ km: 80 }, 120000, P)).toEqual({ kind: "too_far" });
  });

  it("describes a level", () => {
    expect(describeDiscount({ from: 100000, off: 4000 })).toBe("Orders of GH₵ 1,000 or more: GH₵ 40 off delivery");
    expect(describeDiscount({ from: 200000, off: null })).toBe("Orders of GH₵ 2,000 or more: free delivery");
  });

  it("reads saved levels, dropping bad ones, lowest first", () => {
    expect(readDiscounts([{ from: 200000, off: null }, { from: 100000, off: 4000 }, { from: "x", off: 1 }, { from: 5, off: -1 }, null])).toEqual([
      { from: 100000, off: 4000 },
      { from: 200000, off: null },
    ]);
    expect(readDiscounts({ from: 1 })).toEqual([]);
    expect(readDiscounts(null)).toEqual([]);
  });
});

describe("coordinatesFromText", () => {
  it.each([
    ["5.5674903, -0.2566589", { lat: 5.5674903, lng: -0.2566589 }],
    ["https://maps.google.com/?q=5.5674903,-0.2566589&entry=gps", { lat: 5.5674903, lng: -0.2566589 }],
    ["https://www.google.com/maps/place/Dansoman/@5.5448,-0.2680,15z/data=!3d5.5501!4d-0.2601", { lat: 5.5501, lng: -0.2601 }],
    ["https://www.google.com/maps/@5.6354,-0.1617,14z", { lat: 5.6354, lng: -0.1617 }],
    ["https://www.google.com/maps/search/5.6354,+-0.1617", { lat: 5.6354, lng: -0.1617 }],
    ["https://maps.google.com/maps?q=loc:5.60,-0.18", { lat: 5.6, lng: -0.18 }],
    ["https://www.google.com/maps?q=5.6%2C-0.18", { lat: 5.6, lng: -0.18 }],
  ])("reads %s", (text, expected) => {
    expect(coordinatesFromText(text)).toEqual(expected);
  });

  it.each(["East Legon", "https://maps.app.goo.gl/RoziPFUzua9i8bS58", "GA-123-4567", "95.1, 200.5", "100%"])(
    "finds no position in %s",
    (text) => {
      expect(coordinatesFromText(text)).toBeNull();
    },
  );
});

describe("isShortMapsLink", () => {
  it("knows Google's short share links", () => {
    expect(isShortMapsLink("https://maps.app.goo.gl/RoziPFUzua9i8bS58?g_st=ic")).toBe(true);
    expect(isShortMapsLink("https://goo.gl/maps/abc123")).toBe(true);
    expect(isShortMapsLink("https://example.com/maps/abc")).toBe(false);
    expect(isShortMapsLink("East Legon")).toBe(false);
  });
});

describe("distances", () => {
  it("measures a straight line", () => {
    // The shop to Kwame Nkrumah Circle is about 4.5 km in a straight line.
    const km = straightLineKm({ lat: 5.5674903, lng: -0.2566589 }, { lat: 5.5695, lng: -0.2158 });
    expect(km).toBeGreaterThan(4.4);
    expect(km).toBeLessThan(4.6);
  });

  it("rounds and shows km with one decimal", () => {
    expect(roundKm(17.26)).toBe(17.3);
    expect(formatKm(17.26)).toBe("17.3 km");
    expect(formatKm(3)).toBe("3 km");
    expect(formatKm(1234.5)).toBe("1,234.5 km");
  });
});

describe("matchAreas", () => {
  const areas = [{ name: "East Legon" }, { name: "Legon (University of Ghana)" }, { name: "Kaneshie" }, { name: "North Kaneshie" }];

  it("finds areas with every word typed, names starting with it first", () => {
    expect(matchAreas(areas, "legon").map((a) => a.name)).toEqual(["Legon (University of Ghana)", "East Legon"]);
    expect(matchAreas(areas, "kaneshie").map((a) => a.name)).toEqual(["Kaneshie", "North Kaneshie"]);
    expect(matchAreas(areas, "north kan").map((a) => a.name)).toEqual(["North Kaneshie"]);
    expect(matchAreas(areas, "  ")).toEqual([]);
    expect(matchAreas(areas, "Spintex")).toEqual([]);
  });
});

describe("pricingFromSettings", () => {
  it("reads the settings row, numeric columns as numbers", () => {
    const row = {
      delivery_base_fee: 2000,
      delivery_base_km: "2.0",
      delivery_mid_rate: 400,
      delivery_mid_end_km: "7.0",
      delivery_far_rate: 150,
      delivery_round_to: 500,
      delivery_close_km: "1.0",
      delivery_close_fee: 2000,
      delivery_max_km: "65.0",
      delivery_discounts: [{ from: 100000, off: 4000 }],
    } as unknown as Parameters<typeof pricingFromSettings>[0];
    expect(pricingFromSettings(row)).toEqual(P);
    expect(pricingFromSettings({ ...row, delivery_discounts: "bad" }).discounts).toEqual([]);
  });
});
