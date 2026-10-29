import { describe, expect, it } from "vitest";
import { paymentPill, purchaseStatusPill, returnStatusPill, saleStatusPill } from "./records";

describe("record pills", () => {
  it("labels payment like the design", () => {
    expect(paymentPill(500, 0).label).toBe("Paid");
    expect(paymentPill(200, 300).label).toBe("Part paid");
    expect(paymentPill(0, 500).label).toBe("Unpaid");
    expect(paymentPill(0, 0, true).label).toBe("—");
  });

  it("labels statuses", () => {
    expect(saleStatusPill("completed").label).toBe("Completed");
    expect(saleStatusPill("voided").label).toBe("Cancelled");
    expect(purchaseStatusPill("ordered").label).toBe("Ordered");
    expect(purchaseStatusPill("received").label).toBe("Received");
    expect(returnStatusPill(2, 2).label).toBe("Back on shelf");
    expect(returnStatusPill(2, 0).label).toBe("Not restocked");
    expect(returnStatusPill(3, 1).label).toBe("Part restocked");
  });
});
