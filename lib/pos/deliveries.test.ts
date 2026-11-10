import { describe, expect, it } from "vitest";
import { DELIVERY_FILTERS, DELIVERY_PILLS, deliveryForDb, deliveryProgress } from "./deliveries";

describe("deliveries", () => {
  it("says who has it", () => {
    expect(deliveryProgress("out", "Kofi")).toBe("With Kofi");
    expect(deliveryProgress("out", null)).toBe("Out with the rider");
    expect(deliveryProgress("delivered", "Kofi")).toBe("Delivered by Kofi");
    expect(deliveryProgress("to_deliver", "Kofi")).toBeNull();
  });

  it("has a pill for every status and the open filter first", () => {
    expect(Object.keys(DELIVERY_PILLS)).toEqual(["to_deliver", "out", "delivered"]);
    expect(DELIVERY_FILTERS[0]).toBe("open");
  });
});

describe("deliveryForDb", () => {
  it("stores the phone as 233… and refuses one that isn't a Ghana number", () => {
    expect(deliveryForDb(null)).toBeNull();
    expect(deliveryForDb({ fee: 3000, address: "Dansoman", phone: "024 123 4567", note: "" })).toEqual({
      fee: 3000,
      address: "Dansoman",
      phone: "233241234567",
      included: false,
      note: "",
    });
    expect(deliveryForDb({ fee: 0, address: "Dansoman", phone: "", note: "" })).toMatchObject({ phone: null });
    expect(deliveryForDb({ fee: 0, address: "Dansoman", phone: "12345", note: "" })).toBe("bad phone");
    expect(deliveryForDb({ fee: 2000, address: "Osu", phone: "", note: "", included: true })).toMatchObject({ fee: 2000, included: true });
  });
});
