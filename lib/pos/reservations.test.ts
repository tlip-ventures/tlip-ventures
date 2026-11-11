import { describe, expect, it } from "vitest";
import { reservationDue, reservationDueText, reservationStockText } from "./reservations";

describe("reservationDue", () => {
  it("compares the agreed date with today", () => {
    expect(reservationDue(null, "2026-11-11")).toBe("none");
    expect(reservationDue("2026-11-10", "2026-11-11")).toBe("late");
    expect(reservationDue("2026-11-11", "2026-11-11")).toBe("today");
    expect(reservationDue("2026-11-14", "2026-11-11")).toBe("later");
  });
});

describe("reservationDueText", () => {
  it("says when it is due, for pickups and deliveries", () => {
    expect(reservationDueText(null, "2026-11-11")).toBe("No date agreed");
    expect(reservationDueText("2026-11-11", "2026-11-11")).toBe("Due today");
    expect(reservationDueText("2026-11-11", "2026-11-11", true)).toBe("Deliver today");
    expect(reservationDueText("2026-11-09", "2026-11-11")).toBe("Late: was due 9 Nov 2026");
    expect(reservationDueText("2026-11-14", "2026-11-11")).toBe("By 14 Nov 2026");
    expect(reservationDueText("2026-11-14", "2026-11-11", true)).toBe("Deliver on 14 Nov 2026");
  });
});

describe("reservationStockText", () => {
  it("tells whether the items left the shelf", () => {
    expect(reservationStockText("reserved")).toBe("Still on the shelf");
    expect(reservationStockText("completed")).toBe("Put aside");
    expect(reservationStockText("on_hold")).toBe("Put aside");
  });
});
