import { describe, expect, it } from "vitest";
import { countResult, flowLines, moveText } from "./money";

describe("flowLines", () => {
  it("lists only what moved, money out as negative", () => {
    expect(
      flowLines({ sales_in: 7000, refunds_out: 0, suppliers_out: 0, expenses_out: 2000, moved_in: 0, moved_out: 30000, owner_out: 5000, owner_in: 0 }),
    ).toEqual([
      ["Sales and payments taken", 7000],
      ["Expenses paid", -2000],
      ["Moved out", -30000],
      ["Taken out by you", -5000],
    ]);
  });
});

describe("moveText", () => {
  it("says where the money went", () => {
    expect(moveText("transfer", "cash", "bank")).toBe("Cash → Bank");
    expect(moveText("owner_out", "momo", null)).toBe("Taken out of Mobile Money by you");
    expect(moveText("owner_in", null, "cash")).toBe("Put into Cash by you");
  });
});

describe("countResult", () => {
  it("compares a count with what was expected", () => {
    expect(countResult(100, 100)).toEqual({ kind: "match", amount: 0 });
    expect(countResult(90, 100)).toEqual({ kind: "short", amount: 10 });
    expect(countResult(110, 100)).toEqual({ kind: "over", amount: 10 });
    expect(countResult(100, null)).toEqual({ kind: "first", amount: 0 });
  });
});
