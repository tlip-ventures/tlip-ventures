import { describe, expect, it } from "vitest";
import { paidByText, paymentPill, purchaseStatusPill, recordDay, recordPeriodRange, returnStatusPill, riderTerm, saleStatusPill, saleTypeFilter } from "./records";

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
    expect(saleStatusPill("on_hold").label).toBe("On hold");
    expect(saleStatusPill("reserved").label).toBe("Reserved");
    expect(purchaseStatusPill("ordered").label).toBe("Ordered");
    expect(purchaseStatusPill("received").label).toBe("Received");
    expect(returnStatusPill(2, 2).label).toBe("Back on shelf");
    expect(returnStatusPill(2, 0).label).toBe("Not restocked");
    expect(returnStatusPill(3, 1).label).toBe("Part restocked");
  });
});

describe("recordPeriodRange", () => {
  const now = new Date("2026-11-09T13:30:00Z"); // a Monday
  it("today, this week from Monday, this month", () => {
    expect(recordPeriodRange("all", now)).toBeNull();
    expect(recordPeriodRange("today", now)).toEqual({ from: new Date("2026-11-09T00:00:00Z"), to: new Date("2026-11-10T00:00:00Z") });
    expect(recordPeriodRange("week", now)).toEqual({ from: new Date("2026-11-09T00:00:00Z"), to: new Date("2026-11-16T00:00:00Z") });
    expect(recordPeriodRange("week", new Date("2026-11-15T23:00:00Z"))).toEqual({
      from: new Date("2026-11-09T00:00:00Z"),
      to: new Date("2026-11-16T00:00:00Z"),
    });
    expect(recordPeriodRange("month", now)).toEqual({ from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z") });
    expect(recordPeriodRange("month", new Date("2026-12-31T10:00:00Z"))!.to).toEqual(new Date("2027-01-01T00:00:00Z"));
  });
});

describe("riderTerm", () => {
  it("keeps a typed name and drops characters that would act as wildcards", () => {
    expect(riderTerm("  Victor   Atule ")).toBe("Victor Atule");
    expect(riderTerm("Ab%u_*")).toBe("Abu");
    expect(riderTerm(undefined)).toBe("");
  });
});

describe("paidByText", () => {
  it("names the payment methods, or a dash when nothing is paid", () => {
    expect(paidByText("momo")).toBe("Mobile Money");
    expect(paidByText("bank,cash")).toBe("Bank transfer + Cash");
    expect(paidByText(null)).toBe("—");
  });
});

describe("saleTypeFilter", () => {
  it("maps the chips to the database filter", () => {
    expect([saleTypeFilter("all"), saleTypeFilter("retail"), saleTypeFilter("wholesale")]).toEqual([null, false, true]);
  });
});

describe("recordDay", () => {
  const now = new Date("2026-11-14T10:00:00Z");
  it("keeps a real day up to today", () => {
    expect(recordDay("2026-11-10", now)).toBe("2026-11-10");
    expect(recordDay("2026-11-14", now)).toBe("2026-11-14");
  });
  it("drops later days and bad dates", () => {
    expect(recordDay("2026-11-15", now)).toBe("");
    expect(recordDay("2026-02-30", now)).toBe("");
    expect(recordDay("10/11/2026", now)).toBe("");
    expect(recordDay(undefined, now)).toBe("");
  });
});

describe("recordPeriodRange with a day", () => {
  const now = new Date("2026-11-14T10:00:00Z");
  it("covers that whole day, whatever the period", () => {
    const r = recordPeriodRange("month", now, "2026-11-10");
    expect(r?.from.toISOString()).toBe("2026-11-10T00:00:00.000Z");
    expect(r?.to.toISOString()).toBe("2026-11-11T00:00:00.000Z");
  });
  it("falls back to the period without a day", () => {
    expect(recordPeriodRange("all", now, "")).toBeNull();
    expect(recordPeriodRange("today", now)?.from.toISOString()).toBe("2026-11-14T00:00:00.000Z");
  });
});
