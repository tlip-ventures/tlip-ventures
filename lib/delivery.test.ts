import { describe, expect, it } from "vitest";
import {
  coordinatesFromText,
  DEFAULT_DELIVERY_PRICING as P,
  deliveryFeeForKm,
  deliveryQuote,
  formatKm,
  freeDeliveryOff,
  isShortMapsLink,
  matchAreas,
  pricingFromSettings,
  roundKm,
  straightLineKm,
} from "./delivery";

describe("deliveryFeeForKm", () => {
  it.each([
    // The worked examples the owner approved, in pesewas.
    [0.3, 1000], // very close: flat GH₵ 10
    [1, 1000],
    [1.1, 2000], // base fee
    [1.8, 2000],
    [3, 2000],
    [3.6, 2500], // 20 + 3 × 0.6 = 21.80 → 25
    [6, 3000], // 20 + 3 × 3 = 29 → 30
    [6.9, 3500], // 31.70 → 35
    [9.4, 4000], // 39.20 → 40
    [10, 4500], // 41 → 45
    [17.3, 5500], // 20 + 21 + 1.5 × 7.3 = 51.95 → 55
    [22.7, 6500], // 60.05 → 65
    [28.1, 7000], // 68.15 → 70
    [37.9, 8500], // 82.85 → 85
    [62.1, 12000], // 119.15 → 120
    [65, 12500],
  ])("%s km costs %s pesewas", (km, fee) => {
    expect(deliveryFeeForKm(km, P)).toBe(fee);
  });

  it("charges exactly on a round amount without going up a step", () => {
    // 20 + 3 × 5 = 35 exactly.
    expect(deliveryFeeForKm(8, P)).toBe(3500);
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
    expect(deliveryFeeForKm(3.6, p)).toBe(2700); // 25 + 1.80 → 26.80 → 27
  });

  it("copes with the middle band ending before the base", () => {
    const p = { ...P, midEndKm: 2 };
    expect(deliveryFeeForKm(10, p)).toBe(3500); // 20 + 1.5 × 7 = 30.50 → 35
  });

  it("always gives whole pesewas", () => {
    for (let t = 0; t <= 650; t++) {
      const fee = deliveryFeeForKm(t / 10, { ...P, roundTo: 1, farRate: 133 });
      expect(Number.isSafeInteger(fee)).toBe(true);
    }
  });
});

describe("free delivery", () => {
  it("takes GH₵ 40 off orders of GH₵ 1,000 or more", () => {
    expect(freeDeliveryOff(5500, 100000, P)).toBe(4000);
    expect(freeDeliveryOff(5500, 99999, P)).toBe(0);
  });

  it("never takes off more than the fee", () => {
    expect(freeDeliveryOff(3000, 150000, P)).toBe(3000);
  });

  it("is off when there is no free delivery", () => {
    expect(freeDeliveryOff(5500, 500000, { ...P, freeFrom: null })).toBe(0);
    expect(freeDeliveryOff(5500, 500000, { ...P, freeOff: 0 })).toBe(0);
  });

  it("quotes a fee with free delivery taken off", () => {
    expect(deliveryQuote(17.3, 120000, P)).toEqual({ kind: "fee", listFee: 5500, freeOff: 4000, fee: 1500 });
    expect(deliveryQuote(6, 120000, P)).toEqual({ kind: "fee", listFee: 3000, freeOff: 3000, fee: 0 });
    expect(deliveryQuote(17.3, 20000, P)).toEqual({ kind: "fee", listFee: 5500, freeOff: 0, fee: 5500 });
    expect(deliveryQuote(80, 120000, P)).toEqual({ kind: "too_far" });
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
      delivery_base_km: "3.0",
      delivery_mid_rate: 300,
      delivery_mid_end_km: "10.0",
      delivery_far_rate: 150,
      delivery_round_to: 500,
      delivery_close_km: "1.0",
      delivery_close_fee: 1000,
      delivery_max_km: "65.0",
      delivery_free_from: 100000,
      delivery_free_off: 4000,
    } as unknown as Parameters<typeof pricingFromSettings>[0];
    expect(pricingFromSettings(row)).toEqual(P);
    expect(pricingFromSettings({ ...row, delivery_free_from: null }).freeFrom).toBeNull();
  });
});
