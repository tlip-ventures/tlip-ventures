import { describe, expect, it } from "vitest";
import { DELIVERY_FILTERS, DELIVERY_PILLS, deliveryProgress } from "./deliveries";

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
